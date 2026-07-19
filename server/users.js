/**
 * server/users.js — هوية المستخدمين والأصدقاء والدردشات (بيانات دائمة على الخادم)
 * - users.json:   { version, users: {userId: {userId, deviceId, handle, name, avatar, createdAt, lastSeen}}, handles: {handle: userId}, devices: {deviceId: userId} }
 * - friends.json: { version, friends: {userId: [userId…]}, requests: {recipientId: [requesterId…]} }
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
    this.friendsFile = new JsonFile(join(dir, 'friends.json'), { version: 2, friends: {}, requests: {} })
    this.friendsFile.data.friends ??= {}
    this.friendsFile.data.requests ??= {}
    if ((this.friendsFile.data.version ?? 1) < 2) {
      this.friendsFile.data.version = 2
      this.friendsFile.scheduleSave()
    }
    this.chatsFile = new JsonFile(join(dir, 'chats.json'), { version: 1, threads: {}, dmByPair: {} })
    this.privacyRequestsFile = new JsonFile(join(dir, 'privacy-requests.json'), { version: 1, requests: [] })
    this.privacyRequestsFile.data.requests ??= []
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

  incomingFriendRequests(userId) {
    return this.friendsFile.data.requests[userId] ?? []
  }

  outgoingFriendRequests(userId) {
    return Object.entries(this.friendsFile.data.requests)
      .filter(([, requesterIds]) => requesterIds.includes(userId))
      .map(([recipientId]) => recipientId)
  }

  requestFriend(userId, friendId) {
    if (userId === friendId) throw new Error('مينفعش تضيف نفسك صديق.')
    const friend = this.byId(friendId)
    if (!friend) throw new Error('المستخدم ده مش موجود.')
    if (this.areFriends(userId, friendId)) throw new Error('المستخدم ده صديقك بالفعل.')

    const db = this.friendsFile.data
    db.requests[friendId] ??= []
    if (!db.requests[friendId].includes(userId)) {
      db.requests[friendId].push(userId)
      this.friendsFile.scheduleSave()
    }
    return friend
  }

  acceptFriend(userId, requesterId) {
    const requester = this.byId(requesterId)
    if (!requester) throw new Error('صاحب الطلب مش موجود.')
    const incoming = this.incomingFriendRequests(userId)
    if (!incoming.includes(requesterId)) throw new Error('طلب الصداقة ده مش موجود.')

    this.friendsFile.data.requests[userId] = incoming.filter((id) => id !== requesterId)
    this.linkFriends(userId, requesterId)
    return requester
  }

  rejectFriend(userId, requesterId) {
    const incoming = this.incomingFriendRequests(userId)
    if (!incoming.includes(requesterId)) throw new Error('طلب الصداقة ده مش موجود.')
    this.friendsFile.data.requests[userId] = incoming.filter((id) => id !== requesterId)
    this.friendsFile.scheduleSave()
  }

  cancelFriendRequest(userId, recipientId) {
    const outgoing = this.outgoingFriendRequests(userId)
    if (!outgoing.includes(recipientId)) throw new Error('طلب الصداقة ده مش موجود.')
    this.friendsFile.data.requests[recipientId] = this.incomingFriendRequests(recipientId).filter((id) => id !== userId)
    this.friendsFile.scheduleSave()
  }

  linkFriends(userId, friendId) {
    const db = this.friendsFile.data
    db.friends[userId] ??= []
    db.friends[friendId] ??= []
    if (!db.friends[userId].includes(friendId)) db.friends[userId].push(friendId)
    if (!db.friends[friendId].includes(userId)) db.friends[friendId].push(userId)
    db.requests[userId] = (db.requests[userId] ?? []).filter((id) => id !== friendId)
    db.requests[friendId] = (db.requests[friendId] ?? []).filter((id) => id !== userId)
    this.friendsFile.scheduleSave()
  }

  removeFriend(userId, friendId) {
    const db = this.friendsFile.data
    db.friends[userId] = (db.friends[userId] ?? []).filter((id) => id !== friendId)
    db.friends[friendId] = (db.friends[friendId] ?? []).filter((id) => id !== userId)
    db.requests[userId] = (db.requests[userId] ?? []).filter((id) => id !== friendId)
    db.requests[friendId] = (db.requests[friendId] ?? []).filter((id) => id !== userId)
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

  // ---------------- الخصوصية وحذف الحساب ----------------
  createPrivacyRequest(rawHandle, rawMessage) {
    const handle = String(rawHandle || '').trim().toLowerCase().replace(/^@/, '')
    if (!HANDLE_RE.test(handle)) throw new Error('اكتب معرّف ديدوس صحيحًا.')
    const user = this.byHandle(handle)
    if (!user) throw new Error('تعذر العثور على الحساب بهذا المعرّف.')
    const request = {
      id: `privacy_${randomUUID().slice(0, 12)}`,
      type: 'privacy',
      userId: user.userId,
      handle,
      message: String(rawMessage || '').trim().slice(0, 800),
      status: 'received',
      createdAt: Date.now(),
    }
    this.privacyRequestsFile.data.requests.push(request)
    this.privacyRequestsFile.saveSync()
    return request
  }

  deleteByHandleVerification(rawHandle, rawCode) {
    const handle = String(rawHandle || '').trim().toLowerCase().replace(/^@/, '')
    const code = String(rawCode || '').trim()
    if (!HANDLE_RE.test(handle) || !/^\d{6}$/.test(code)) {
      throw new Error('المعرّف أو رمز التحقق غير صحيح.')
    }

    const user = this.byHandle(handle)
    const expectedName = `DELETE-${code}`
    if (!user || String(user.name || '').trim().toUpperCase() !== expectedName) {
      throw new Error(`غيّر اسمك داخل ديدوس إلى ${expectedName} ثم أغلق التطبيق وحاول مرة أخرى.`)
    }

    const userId = user.userId
    const users = this.usersFile.data
    delete users.users[userId]
    if (user.handle) delete users.handles[user.handle]
    if (user.deviceId) delete users.devices[user.deviceId]

    const social = this.friendsFile.data
    delete social.friends[userId]
    delete social.requests[userId]
    for (const [id, friendIds] of Object.entries(social.friends)) {
      social.friends[id] = friendIds.filter((candidate) => candidate !== userId)
    }
    for (const [id, requesterIds] of Object.entries(social.requests)) {
      social.requests[id] = requesterIds.filter((candidate) => candidate !== userId)
    }

    const chats = this.chatsFile.data
    for (const [threadId, thread] of Object.entries(chats.threads)) {
      if (!thread.memberIds.includes(userId)) continue
      if (thread.kind === 'dm') {
        delete chats.threads[threadId]
        continue
      }
      thread.memberIds = thread.memberIds.filter((candidate) => candidate !== userId)
      thread.messages = thread.messages.filter((message) => message.senderId !== userId)
      delete thread.reads[userId]
      if (thread.memberIds.length < 2) delete chats.threads[threadId]
    }
    for (const [pair, threadId] of Object.entries(chats.dmByPair)) {
      if (pair.split('|').includes(userId) || !chats.threads[threadId]) delete chats.dmByPair[pair]
    }

    const request = {
      id: `deletion_${randomUUID().slice(0, 12)}`,
      type: 'deletion',
      status: 'completed',
      createdAt: Date.now(),
      completedAt: Date.now(),
    }
    this.privacyRequestsFile.data.requests.push(request)
    this.usersFile.saveSync()
    this.friendsFile.saveSync()
    this.chatsFile.saveSync()
    this.privacyRequestsFile.saveSync()
    return { ...request, userId }
  }

  /** طرد أي بيانات معلّقة للكتابة فورًا (يُستخدم عند الإغلاق النظيف) */
  flushAll() {
    this.usersFile.saveSync()
    this.friendsFile.saveSync()
    this.chatsFile.saveSync()
    this.privacyRequestsFile.saveSync()
  }
}
