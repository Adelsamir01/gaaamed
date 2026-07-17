/**
 * server/users.js — هوية المستخدمين والأصدقاء والدردشات (بيانات دائمة على الخادم)
 * - users.json:   { version, users: {userId: {userId, deviceId, handle, name, avatar, createdAt, lastSeen}}, handles: {handle: userId}, devices: {deviceId: userId} }
 * - friends.json: { version, friends: {userId: [userId…]} } (علاقة ثنائية متماثلة)
 * - chats.json:   { version, threads: {threadId: {id, kind, name, memberIds, messages, reads, createdAt, updatedAt}}, dmByPair: {"a|b": threadId} }
 * الكتابة ذرّية (tmp + rename) مع تجميع التغييرات كل ~500ms.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HANDLE_RE = /^[a-z0-9_]{3,15}$/
// معرّفات الرسائل المتفائلة: يولّدها العميل ويصدّها الخادم كما هي ليتعرف العميل على الصدى ويزيل التكرار
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{6,64}$/
const MAX_MESSAGES_PER_THREAD = 200
const FLUSH_DEBOUNCE_MS = 500
const HANDLE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function resolveDataDir() {
  const fromEnv = process.env.DEDOS_DATA_DIR
  if (fromEnv && fromEnv.trim()) return resolve(fromEnv.trim())
  return fileURLToPath(new URL('./data/', import.meta.url))
}

class JsonFile {
  constructor(path, fallback) {
    this.path = path
    this.timer = null
    this.data = fallback
    try {
      if (existsSync(path)) {
        const parsed = JSON.parse(readFileSync(path, 'utf8'))
        if (parsed && typeof parsed === 'object') this.data = { ...fallback, ...parsed }
      } else {
        this.saveSync()
      }
    } catch (error) {
      console.error(`[users] تعذّر تحميل ${path} — البدء ببيانات فارغة`, error)
      this.data = fallback
    }
  }

  scheduleSave() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.saveSync()
    }, FLUSH_DEBOUNCE_MS)
    if (this.timer.unref) this.timer.unref()
  }

  saveSync() {
    try {
      mkdirSync(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.tmp`
      writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8')
      renameSync(tmp, this.path)
    } catch (error) {
      console.error(`[users] تعذّر حفظ ${this.path}`, error)
    }
  }
}

export function publicCard(user) {
  return user
    ? { userId: user.userId, handle: user.handle, name: user.name, avatar: user.avatar }
    : null
}

export class UserStore {
  constructor(dir = resolveDataDir()) {
    this.dir = dir
    this.usersFile = new JsonFile(join(dir, 'users.json'), { version: 1, users: {}, handles: {}, devices: {} })
    this.friendsFile = new JsonFile(join(dir, 'friends.json'), { version: 1, friends: {} })
    this.chatsFile = new JsonFile(join(dir, 'chats.json'), { version: 1, threads: {}, dmByPair: {} })
  }

  // ---------------- الهوية ----------------
  identify({ deviceId, name, avatar, handle }) {
    if (!deviceId || typeof deviceId !== 'string') throw new Error('معرّف الجهاز مفقود.')
    const db = this.usersFile.data
    const cleanName = String(name || '').trim().slice(0, 24) || 'لاعب'
    const cleanAvatar = String(avatar || '🎮').slice(0, 8)
    let userId = db.devices[deviceId]
    let user = userId ? db.users[userId] : null
    let created = false

    if (!user) {
      userId = randomUUID()
      // انتبه: لا تُعِد تسمية assigned إلى handle — فهو يحجب وسيط الدالة المُفكَّك
      let assigned = null
      const wanted = String(handle || '').trim().toLowerCase()
      if (wanted && HANDLE_RE.test(wanted) && !db.handles[wanted]) {
        assigned = wanted
      }
      if (!assigned) assigned = this.generateHandle()
      user = {
        userId,
        deviceId,
        handle: assigned,
        name: cleanName,
        avatar: cleanAvatar,
        createdAt: Date.now(),
        lastSeen: Date.now(),
      }
      db.users[userId] = user
      db.handles[assigned] = userId
      db.devices[deviceId] = userId
      created = true
    } else {
      user.name = cleanName
      user.avatar = cleanAvatar
      user.lastSeen = Date.now()
      // تعيين المعرف المطلوب عند أول identify إن لم يكن للمستخدم معرف بعد (حالة نادرة)
      if (handle && !user.handle) {
        const wanted = String(handle).trim().toLowerCase()
        if (HANDLE_RE.test(wanted) && !db.handles[wanted]) {
          db.handles[wanted] = userId
          user.handle = wanted
        }
      }
    }
    this.usersFile.scheduleSave()
    return { user, created }
  }

  generateHandle() {
    const db = this.usersFile.data
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const suffix = Array.from(randomBytes(4), (b) => HANDLE_ALPHABET[b % HANDLE_ALPHABET.length]).join('')
      const handle = `user_${suffix}`
      if (!db.handles[handle]) {
        return handle
      }
    }
    return `user_${Date.now().toString(36)}`
  }

  setHandle(userId, rawHandle) {
    const db = this.usersFile.data
    const user = db.users[userId]
    if (!user) throw new Error('الحساب غير موجود.')
    const handle = String(rawHandle || '').trim().toLowerCase()
    if (!HANDLE_RE.test(handle)) {
      throw new Error('المعرّف لازم يكون من ٣ لـ ١٥ حرف إنجليزي صغير أو رقم أو _')
    }
    const existing = db.handles[handle]
    if (existing && existing !== userId) {
      throw new Error('المعرّف ده محجوز، جرّب معرّف تاني.')
    }
    if (user.handle) delete db.handles[user.handle]
    db.handles[handle] = userId
    user.handle = handle
    this.usersFile.scheduleSave()
    return user
  }

  byId(userId) {
    return this.usersFile.data.users[userId] ?? null
  }

  byHandle(rawHandle) {
    const handle = String(rawHandle || '').trim().toLowerCase().replace(/^@/, '')
    const userId = this.usersFile.data.handles[handle]
    return userId ? this.usersFile.data.users[userId] ?? null : null
  }

  // ---------------- الأصدقاء ----------------
  friendsOf(userId) {
    return this.friendsFile.data.friends[userId] ?? []
  }

  areFriends(a, b) {
    return this.friendsOf(a).includes(b)
  }

  addFriend(userId, friendId) {
    if (userId === friendId) throw new Error('مينفعش تضيف نفسك صديق.')
    const friend = this.byId(friendId)
    if (!friend) throw new Error('المستخدم ده مش موجود.')
    const db = this.friendsFile.data
    db.friends[userId] ??= []
    db.friends[friendId] ??= []
    if (!db.friends[userId].includes(friendId)) db.friends[userId].push(friendId)
    if (!db.friends[friendId].includes(userId)) db.friends[friendId].push(userId)
    this.friendsFile.scheduleSave()
    return friend
  }

  removeFriend(userId, friendId) {
    const db = this.friendsFile.data
    db.friends[userId] = (db.friends[userId] ?? []).filter((id) => id !== friendId)
    db.friends[friendId] = (db.friends[friendId] ?? []).filter((id) => id !== userId)
    this.friendsFile.scheduleSave()
  }

  // ---------------- الدردشات ----------------
  dmKey(a, b) {
    return [a, b].sort().join('|')
  }

  getOrCreateDm(a, b) {
    const db = this.chatsFile.data
    const key = this.dmKey(a, b)
    const existing = db.dmByPair[key]
    if (existing && db.threads[existing]) return { thread: db.threads[existing], created: false }
    const thread = {
      id: `dm_${randomUUID().slice(0, 8)}`,
      kind: 'dm',
      name: null,
      memberIds: [a, b],
      messages: [],
      reads: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    db.threads[thread.id] = thread
    db.dmByPair[key] = thread.id
    this.chatsFile.scheduleSave()
    return { thread, created: true }
  }

  createGroup(name, memberIds, creatorId) {
    const db = this.chatsFile.data
    const members = [...new Set([creatorId, ...memberIds])].filter((id) => this.byId(id))
    if (members.length < 3) throw new Error('الجروب لازم يكون فيه ٣ أعضاء على الأقل (انت + ٢).')
    const thread = {
      id: `grp_${randomUUID().slice(0, 8)}`,
      kind: 'group',
      name: String(name || '').trim().slice(0, 32) || 'جروب جديد',
      memberIds: members,
      messages: [],
      reads: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    db.threads[thread.id] = thread
    this.chatsFile.scheduleSave()
    return thread
  }

  threadById(threadId) {
    return this.chatsFile.data.threads[threadId] ?? null
  }

  isMember(thread, userId) {
    return !!thread && thread.memberIds.includes(userId)
  }

  threadsOf(userId) {
    const db = this.chatsFile.data
    return Object.values(db.threads)
      .filter((t) => t.memberIds.includes(userId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((t) => this.threadSummary(t, userId))
  }

  threadSummary(thread, userId) {
    const last = thread.messages[thread.messages.length - 1] ?? null
    const readAt = thread.reads[userId] ?? 0
    return {
      id: thread.id,
      kind: thread.kind,
      name: thread.kind === 'group' ? thread.name : this.dmName(thread, userId),
      avatar: thread.kind === 'group' ? '👥' : this.byId(this.dmOther(thread, userId))?.avatar ?? '💬',
      memberIds: thread.memberIds,
      members: thread.memberIds.length,
      lastMessage: last,
      unread: thread.messages.filter((m) => m.time > readAt && m.senderId !== userId).length,
      updatedAt: thread.updatedAt,
    }
  }

  dmOther(thread, userId) {
    return thread.memberIds.find((id) => id !== userId) ?? userId
  }

  dmName(thread, userId) {
    const other = this.byId(this.dmOther(thread, userId))
    return other?.name ?? 'محادثة'
  }

  history(threadId, userId) {
    const thread = this.threadById(threadId)
    if (!this.isMember(thread, userId)) throw new Error('المحادثة دي مش موجودة.')
    thread.reads[userId] = Date.now()
    this.chatsFile.scheduleSave()
    return thread
  }

  postMessage(threadId, senderId, { text, kind = 'text', invite = null, clientId = null }) {
    const thread = this.threadById(threadId)
    if (!this.isMember(thread, senderId)) throw new Error('المحادثة دي مش موجودة.')
    const sender = this.byId(senderId)
    // صدّ معرّف العميل إن كان صالحًا وغير مكرر داخل المحادثة (إلغاء تكرار الرسائل المتفائلة)
    let id = `m_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
    if (
      typeof clientId === 'string' &&
      CLIENT_ID_RE.test(clientId) &&
      !thread.messages.some((m) => m.id === clientId)
    ) {
      id = clientId
    }
    const message = {
      id,
      senderId,
      senderName: sender?.name ?? 'لاعب',
      senderAvatar: sender?.avatar ?? '🎮',
      text: String(text ?? '').slice(0, 1000),
      kind,
      invite,
      time: Date.now(),
    }
    thread.messages.push(message)
    if (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
      thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD)
    }
    thread.updatedAt = message.time
    thread.reads[senderId] = message.time
    this.chatsFile.scheduleSave()
    return { thread, message }
  }

  markRead(threadId, userId) {
    const thread = this.threadById(threadId)
    if (!this.isMember(thread, userId)) return
    thread.reads[userId] = Date.now()
    this.chatsFile.scheduleSave()
  }

  /** طرد أي بيانات معلّقة للكتابة فورًا (يُستخدم عند الإغلاق النظيف) */
  flushAll() {
    this.usersFile.saveSync()
    this.friendsFile.saveSync()
    this.chatsFile.saveSync()
  }
}
