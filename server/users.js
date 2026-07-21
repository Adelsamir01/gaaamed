/**
 * server/users.js — هوية المستخدمين والأصدقاء والدردشات (بيانات دائمة على الخادم)
 * مستندات users/friends/chats/privacy محفوظة ذريًا في SQLite، مع استيراد ملفات JSON القديمة مرة واحدة.
 * تُجمّع التغييرات المتقاربة لمدة 500ms لتقليل الكتابات مع flush إجباري عند إيقاف الخادم.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DocumentDatabase, resolveDatabasePath } from './database.js'

export const HANDLE_RE = /^[a-z0-9_]{3,15}$/
export const PUSH_TOKEN_RE = /^[A-Za-z0-9_:.-]{32,4096}$/
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

class JsonDocument {
  constructor(database, name, legacyPath, fallback) {
    this.database = database
    this.name = name
    this.path = legacyPath
    this.timer = null
    this.data = database.loadDocument(name, fallback, legacyPath)
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
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.database.saveDocument(this.name, this.data)
  }
}

export function publicCard(user) {
  return user
    ? { userId: user.userId, handle: user.handle, name: user.name, avatar: user.avatar }
    : null
}

export class UserStore {
  constructor(dir = resolveDataDir(), database = null) {
    this.dir = dir
    this.database = database ?? new DocumentDatabase(resolveDatabasePath(dir))
    this.ownsDatabase = database === null
    this.usersFile = new JsonDocument(this.database, 'users', join(dir, 'users.json'), { version: 1, users: {}, handles: {}, devices: {} })
    this.friendsFile = new JsonDocument(this.database, 'friends', join(dir, 'friends.json'), { version: 2, friends: {}, requests: {} })
    this.friendsFile.data.friends ??= {}
    this.friendsFile.data.requests ??= {}
    if ((this.friendsFile.data.version ?? 1) < 2) {
      this.friendsFile.data.version = 2
      this.friendsFile.scheduleSave()
    }
    this.chatsFile = new JsonDocument(this.database, 'chats', join(dir, 'chats.json'), { version: 1, threads: {}, dmByPair: {} })
    this.pushTokensFile = new JsonDocument(this.database, 'push-tokens', join(dir, 'push-tokens.json'), { version: 1, byUser: {} })
    this.pushTokensFile.data.byUser ??= {}
    this.privacyRequestsFile = new JsonDocument(this.database, 'privacy-requests', join(dir, 'privacy-requests.json'), { version: 1, requests: [] })
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

  // ---------------- إشعارات الهاتف ----------------
  registerPushToken(userId, rawToken, platform = 'android') {
    if (!this.byId(userId)) throw new Error('الحساب غير موجود.')
    const token = String(rawToken || '').trim()
    if (!PUSH_TOKEN_RE.test(token)) throw new Error('رمز إشعارات الهاتف غير صالح.')
    const byUser = this.pushTokensFile.data.byUser

    // The same Firebase token must never target two accounts after a logout,
    // reinstall, or identity recovery on the same phone.
    for (const [ownerId, registrations] of Object.entries(byUser)) {
      byUser[ownerId] = registrations.filter((registration) => registration.token !== token)
      if (byUser[ownerId].length === 0) delete byUser[ownerId]
    }

    const registrations = byUser[userId] ?? []
    registrations.push({ token, platform: platform === 'android' ? 'android' : 'unknown', updatedAt: Date.now() })
    byUser[userId] = registrations.slice(-5)
    this.pushTokensFile.saveSync()
    return { token, platform: platform === 'android' ? 'android' : 'unknown' }
  }

  registrationsForUsers(userIds) {
    const seen = new Set()
    const registrations = []
    for (const userId of userIds) {
      for (const registration of this.pushTokensFile.data.byUser[userId] ?? []) {
        if (seen.has(registration.token)) continue
        seen.add(registration.token)
        registrations.push({ userId, ...registration })
      }
    }
    return registrations
  }

  removePushTokens(tokens) {
    const removing = new Set(tokens)
    if (removing.size === 0) return 0
    let removed = 0
    const byUser = this.pushTokensFile.data.byUser
    for (const [userId, registrations] of Object.entries(byUser)) {
      const next = registrations.filter((registration) => {
        if (!removing.has(registration.token)) return true
        removed += 1
        return false
      })
      if (next.length > 0) byUser[userId] = next
      else delete byUser[userId]
    }
    if (removed > 0) this.pushTokensFile.saveSync()
    return removed
  }

  deletePushTokensForUser(userId) {
    const registrations = this.pushTokensFile.data.byUser[userId] ?? []
    delete this.pushTokensFile.data.byUser[userId]
    if (registrations.length > 0) this.pushTokensFile.saveSync()
    return registrations.length
  }

  pushRegistrationCount() {
    return Object.values(this.pushTokensFile.data.byUser).reduce((total, registrations) => total + registrations.length, 0)
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
    // إعادة إرسال نفس الرسالة بعد انقطاع الشبكة يجب أن تكون آمنة تمامًا.
    const validClientId = typeof clientId === 'string' && CLIENT_ID_RE.test(clientId)
    const existing = validClientId ? thread.messages.find((message) => message.id === clientId) : null
    if (existing?.senderId === senderId) return { thread, message: existing, created: false }
    // صدّ معرّف العميل إن كان صالحًا (يسمح للعميل باستبدال النسخة المعلّقة).
    let id = `m_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
    if (
      validClientId &&
      !existing
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
      heartUserIds: [],
      time: Date.now(),
    }
    thread.messages.push(message)
    if (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
      thread.messages = thread.messages.slice(-MAX_MESSAGES_PER_THREAD)
    }
    thread.updatedAt = message.time
    thread.reads[senderId] = message.time
    this.chatsFile.scheduleSave()
    return { thread, message, created: true }
  }

  toggleMessageHeart(threadId, messageId, userId) {
    const thread = this.threadById(threadId)
    if (!this.isMember(thread, userId)) throw new Error('المحادثة دي مش موجودة.')
    const message = thread.messages.find((candidate) => candidate.id === messageId)
    if (!message) throw new Error('الرسالة دي مش موجودة.')
    const hearts = new Set(
      Array.isArray(message.heartUserIds)
        ? message.heartUserIds.filter((candidate) => thread.memberIds.includes(candidate))
        : [],
    )
    if (hearts.has(userId)) hearts.delete(userId)
    else hearts.add(userId)
    message.heartUserIds = [...hearts]
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
    this.deletePushTokensForUser(userId)
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
    this.pushTokensFile.saveSync()
    this.privacyRequestsFile.saveSync()
    return { ...request, userId }
  }

  /** طرد أي بيانات معلّقة للكتابة فورًا (يُستخدم عند الإغلاق النظيف) */
  flushAll() {
    this.usersFile.saveSync()
    this.friendsFile.saveSync()
    this.chatsFile.saveSync()
    this.pushTokensFile.saveSync()
    this.privacyRequestsFile.saveSync()
  }

  close() {
    this.flushAll()
    if (this.ownsDatabase) this.database.close()
  }
}
