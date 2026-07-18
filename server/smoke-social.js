/**
 * server/smoke-social.js — اختبار شامل للطبقة الاجتماعية (الهوية/الأصدقاء/الدردشات/الدعوات/المباراة السريعة)
 * يشغّل الخادم كعملية فرعية على PORT=8899 مع DEDOS_DATA_DIR مؤقت، ويتحقق من:
 *  1) identify جديد + عائد (ثبات الهوية بالجهاز)
 *  2) تعارض المعرّفات وصيغتها
 *  3) search_user (مع استبعاد الذات)
 *  4) طلب صداقة يحتاج قبول الطرف الآخر + حضور online/playing بعد القبول
 *  5) DM: إرسال + history + عدّاد غير المقروء + ثبات عبر إعادة تشغيل الخادم
 *  6) جروب من ٣ أعضاء
 *  7) دعوة لعبة تنشئ غرفة وينضم لها الطرفان (الأول slot=1)
 *  8) quick_match يزاوج عميلين (matched للطرفين)
 *  9) settings.rounds: نقلها عبر created/joined/opponent_joined/matched ورسالة الدعوة،
 *     الافتراضي 5 والتحقق من {3,5,7}، وسلسلة RPS "أفضل من ٣" تنتهي بعد فوزين (rps_series_end)
 * التشغيل: node server/smoke-social.js
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const PORT = 8899
const WS_URL = `ws://127.0.0.1:${PORT}`
const SERVER_PATH = fileURLToPath(new URL('./server.js', import.meta.url))
const DATA_DIR = mkdtempSync(join(tmpdir(), 'dedos-social-'))

let passed = 0
let failed = 0
function assert(cond, label) {
  if (cond) {
    passed += 1
    console.log(`  ✅ ${label}`)
  } else {
    failed += 1
    console.error(`  ❌ ${label}`)
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- عميل مساعد ----------
function client(tag) {
  const ws = new WebSocket(WS_URL)
  const inbox = []
  const waiters = []
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    inbox.push(msg)
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].pred(msg)) {
        clearTimeout(waiters[i].timer)
        waiters[i].resolve(msg)
        waiters.splice(i, 1)
      }
    }
  })
  return {
    ws,
    tag,
    inbox,
    send: (obj) => ws.send(JSON.stringify(obj)),
    find: (type) => inbox.find((m) => m.type === type),
    findAll: (type) => inbox.filter((m) => m.type === type),
    last: (type) => [...inbox].reverse().find((m) => m.type === type),
    waitFor: (pred, timeout = 4000) =>
      new Promise((resolve, reject) => {
        const hit = inbox.find(pred)
        if (hit) return resolve(hit)
        const timer = setTimeout(() => reject(new Error(`[${tag}] timeout waiting for message`)), timeout)
        waiters.push({ pred, resolve, timer })
      }),
    opened: new Promise((r) => ws.on('open', r)),
    close: () => ws.close(),
  }
}

// ---------- إدارة الخادم الفرعي ----------
let serverProc = null
async function startServer() {
  serverProc = spawn(process.execPath, [SERVER_PATH], {
    env: { ...process.env, PORT: String(PORT), DEDOS_DATA_DIR: DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProc.stderr.on('data', (d) => console.error(`[server:err] ${d}`.trim()))
  // انتظر /health
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`)
      if (res.ok) return
    } catch { /* لسه */ }
    await wait(120)
  }
  throw new Error('الخادم لم يقلع على المنفذ ' + PORT)
}
async function stopServer() {
  if (!serverProc) return
  serverProc.kill()
  serverProc = null
  await wait(400)
}

async function main() {
  console.log(`بيانات الاختبار: ${DATA_DIR}`)
  await startServer()
  console.log('الخادم يعمل — بدء السيناريوهات\n')

  // ===== 1+2) identify جديد لثلاثة مستخدمين =====
  console.log('== الهوية: تسجيل جديد وعودة ==')
  const A = client('A')
  await A.opened
  A.send({ type: 'identify', deviceId: 'dev-a-1', name: 'آدم', avatar: '😎', handle: 'adel_test' })
  const idA = await A.waitFor((m) => m.type === 'identified')
  assert(idA.created === true, 'A: مستخدم جديد created=true')
  assert(idA.user.handle === 'adel_test', `A: حصل على المعرّف المطلوب (${idA.user.handle})`)

  const B = client('B')
  await B.opened
  B.send({ type: 'identify', deviceId: 'dev-b-1', name: 'بدر', avatar: '🦊' })
  const idB = await B.waitFor((m) => m.type === 'identified')
  assert(idB.created === true, 'B: مستخدم جديد created=true')
  assert(/^user_[a-z0-9]+$/.test(idB.user.handle), `B: معرّف مولّد تلقائيًا (${idB.user.handle})`)

  const C = client('C')
  await C.opened
  C.send({ type: 'identify', deviceId: 'dev-c-1', name: 'كريم', avatar: '🐼', handle: 'karim_test' })
  const idC = await C.waitFor((m) => m.type === 'identified')
  assert(idC.created === true && idC.user.handle === 'karim_test', 'C: مستخدم جديد بمعرّف مطلوب')

  // عودة B بنفس الجهاز → نفس الهوية
  const B2 = client('B2')
  await B2.opened
  B2.send({ type: 'identify', deviceId: 'dev-b-1', name: 'بدر المحترف', avatar: '🦊' })
  const idB2 = await B2.waitFor((m) => m.type === 'identified')
  assert(idB2.created === false, 'B2: عودة بنفس الجهاز created=false')
  assert(idB2.user.userId === idB.user.userId, 'B2: نفس userId عبر الجهاز')
  assert(idB2.user.name === 'بدر المحترف', 'B2: الاسم يُحدَّث عند العودة')
  B2.close()

  // ===== 2) المعرّفات: تغيير + تعارض + صيغة =====
  console.log('== المعرّفات: set_handle وتعارض ==')
  B.send({ type: 'set_handle', handle: 'badr_test' })
  const hB = await B.waitFor((m) => m.type === 'handle_set')
  assert(hB.user.handle === 'badr_test', 'B: set_handle ناجح')

  A.send({ type: 'set_handle', handle: 'badr_test' })
  const hConflict = await A.waitFor((m) => m.type === 'handle_error')
  assert(/محجوز/.test(hConflict.message), 'A: تعارض المعرّف مرفوض برسالة واضحة')

  A.send({ type: 'set_handle', handle: '!!!' })
  const hInvalid = await A.waitFor((m) => m.type === 'handle_error' && /٣ لـ ١٥|15/.test(m.message))
  assert(!!hInvalid, 'A: صيغة معرّف غير صالحة مرفوضة')

  // ===== 3) البحث =====
  console.log('== البحث بالمعرّف ==')
  A.send({ type: 'search_user', handle: 'badr_test' })
  const sFound = await A.waitFor((m) => m.type === 'search_result' && m.handle === 'badr_test')
  assert(sFound.user && sFound.user.userId === idB.user.userId, 'A: وجد B بالمعرّف')
  A.send({ type: 'search_user', handle: 'adel_test' })
  const sSelf = await A.waitFor((m) => m.type === 'search_result' && m.handle === 'adel_test')
  assert(sSelf.user === null, 'A: البحث عن النفس يُستبعد (user=null)')
  A.send({ type: 'search_user', handle: 'ghost_404' })
  const sNone = await A.waitFor((m) => m.type === 'search_result' && m.handle === 'ghost_404')
  assert(sNone.user === null, 'A: معرّف غير موجود → user=null')

  // ===== 4) الأصدقاء + الحضور =====
  console.log('== الأصدقاء والحضور ==')
  A.send({ type: 'friend_request', userId: idB.user.userId })
  await A.waitFor((m) => m.type === 'friend_request_sent')
  const pendingAtA = await A.waitFor((m) => m.type === 'friend_requests_update' && m.outgoing?.length === 1)
  const pendingAtB = await B.waitFor((m) => m.type === 'friend_requests_update' && m.incoming?.length === 1)
  assert(pendingAtA.outgoing[0].userId === idB.user.userId, 'A: الطلب ظاهر كطلب صداقة مرسل')
  assert(pendingAtB.incoming[0].userId === idA.user.userId, 'B: استلم طلب الصداقة من A')
  assert(A.last('friends_update').friends.length === 0 && B.last('friends_update').friends.length === 0, 'لا تنشأ الصداقة قبل موافقة B')

  B.send({ type: 'friend_accept', userId: idA.user.userId })
  await B.waitFor((m) => m.type === 'friend_accepted' && m.user.userId === idA.user.userId)
  await A.waitFor((m) => m.type === 'friend_accepted' && m.user.userId === idB.user.userId)
  const updA = await A.waitFor((m) => m.type === 'friends_update' && m.friends.length === 1)
  assert(updA.friends[0].userId === idB.user.userId && updA.friends[0].presence === 'online', 'A: صديق واحد وحضوره online')
  const updB = await B.waitFor((m) => m.type === 'friends_update' && m.friends.length === 1)
  assert(updB.friends[0].userId === idA.user.userId, 'B: العلاقة ثنائية بعد موافقته على الطلب')

  C.send({ type: 'friend_request', userId: idA.user.userId })
  await C.waitFor((m) => m.type === 'friend_request_sent' && m.user.userId === idA.user.userId)
  await A.waitFor((m) => m.type === 'friend_requests_update' && m.incoming?.some((u) => u.userId === idC.user.userId))
  A.send({ type: 'friend_reject', userId: idC.user.userId })
  await A.waitFor((m) => m.type === 'friend_request_rejected' && m.userId === idC.user.userId)
  await wait(60)
  assert(!C.last('friend_requests_update').outgoing.some((u) => u.userId === idA.user.userId), 'A: رفض الطلب يزيله عند C بدون إنشاء صداقة')

  C.send({ type: 'friend_request', userId: idA.user.userId })
  await C.waitFor((m) => m.type === 'friend_requests_update' && m.outgoing?.some((u) => u.userId === idA.user.userId))
  C.send({ type: 'friend_request_cancel', userId: idA.user.userId })
  await wait(60)
  assert(!A.last('friend_requests_update').incoming.some((u) => u.userId === idC.user.userId), 'C: إلغاء الطلب المرسل يزيله عند A')

  // A ينشئ غرفة → حضوره playing عند B
  A.send({ type: 'create', gameId: 'tictactoe', name: 'آدم', avatar: '😎' })
  const createdA = await A.waitFor((m) => m.type === 'created')
  assert(/^\d{4}$/.test(createdA.code), `A: أنشأ غرفة ${createdA.code}`)
  const updPlaying = await B.waitFor((m) => m.type === 'friends_update' && m.friends[0]?.presence === 'playing')
  assert(!!updPlaying, 'B: حضور A تحوّل إلى playing بعد إنشاء الغرفة')
  A.send({ type: 'leave' })
  await B.waitFor((m) => m.type === 'friends_update' && m.friends[0]?.presence === 'online')
  assert(true, 'B: حضور A عاد إلى online بعد المغادرة')

  // ===== 5) DM + غير المقروء =====
  console.log('== الدردشة الفردية ==')
  A.send({ type: 'chat_create_dm', userId: idB.user.userId })
  const dmThread = await A.waitFor((m) => m.type === 'chat_thread')
  assert(dmThread.thread.kind === 'dm' && dmThread.thread.memberIds.length === 2, 'A: أنشأ DM بعضوين')
  const threadId = dmThread.thread.id

  A.send({ type: 'chat_send', threadId, text: 'أهلا بدر 👋' })
  const msgAtB = await B.waitFor((m) => m.type === 'chat_message' && m.threadId === threadId)
  assert(msgAtB.message.text === 'أهلا بدر 👋' && msgAtB.message.senderName === 'آدم', 'B: استلم الرسالة باسم المرسل')
  assert(msgAtB.thread.unread === 1, 'B: عدّاد غير المقروء = 1')
  const echoAtA = await A.waitFor((m) => m.type === 'chat_message' && m.threadId === threadId)
  assert(echoAtA.thread.unread === 0, 'A: الرسالة مقروءة عند مرسلها')

  B.send({ type: 'chat_history', threadId })
  const hist = await B.waitFor((m) => m.type === 'chat_history' && m.threadId === threadId)
  assert(hist.messages.length === 1 && hist.messages[0].text === 'أهلا بدر 👋', 'B: التاريخ يحوي الرسالة')
  assert(hist.thread.unread === 0, 'B: قراءة التاريخ صفّرت العدّاد')

  // ===== 6) الثبات عبر إعادة تشغيل الخادم =====
  console.log('== الثبات: قتل وإعادة تشغيل ==')
  await wait(800) // أطول من debounce (500ms) لضمان الكتابة
  const threadIdPersist = threadId
  await stopServer()
  // سوكيتات A/B/C القديمة ماتت مع الخادم — نغلقها ونعيد الاتصال بعملاء جدد
  A.close()
  B.close()
  C.close()
  await startServer()

  const B3 = client('B3')
  await B3.opened
  B3.send({ type: 'identify', deviceId: 'dev-b-1', name: 'بدر', avatar: '🦊' })
  const idB3 = await B3.waitFor((m) => m.type === 'identified')
  assert(idB3.user.userId === idB.user.userId && idB3.user.handle === 'badr_test', 'B3: الهوية والمعرّف ثابتان بعد إعادة التشغيل')
  B3.send({ type: 'friends_list' })
  const fuB3 = await B3.waitFor((m) => m.type === 'friends_update' && m.friends.length === 1)
  assert(fuB3.friends[0].userId === idA.user.userId, 'B3: الصداقة ثابتة بعد إعادة التشغيل')
  B3.send({ type: 'chat_history', threadId: threadIdPersist })
  const histB3 = await B3.waitFor((m) => m.type === 'chat_history' && m.threadId === threadIdPersist)
  assert(histB3.messages.length === 1, 'B3: الرسالة ثابتة بعد إعادة التشغيل')

  // عملاء جدد لـ A و C على الخادم المعاد تشغيله
  const A2 = client('A2')
  await A2.opened
  A2.send({ type: 'identify', deviceId: 'dev-a-1', name: 'آدم', avatar: '😎' })
  const idA2 = await A2.waitFor((m) => m.type === 'identified')
  assert(idA2.user.userId === idA.user.userId && idA2.user.handle === 'adel_test', 'A2: هوية A ثابتة بعد إعادة التشغيل')
  const C2 = client('C2')
  await C2.opened
  C2.send({ type: 'identify', deviceId: 'dev-c-1', name: 'كريم', avatar: '🐼' })
  await C2.waitFor((m) => m.type === 'identified')

  // ===== 7) الجروب =====
  console.log('== الجروب ==')
  A2.send({ type: 'chat_create_group', name: 'جروب الاختبار', memberIds: [idB.user.userId, idC.user.userId] })
  const grp = await A2.waitFor((m) => m.type === 'chat_thread' && m.thread.kind === 'group')
  assert(grp.thread.memberIds.length === 3 && grp.thread.name === 'جروب الاختبار', 'A2: جروب من ٣ أعضاء')
  const grpAtC = await C2.waitFor((m) => m.type === 'chat_update' && m.thread.id === grp.thread.id)
  assert(!!grpAtC, 'C2: وصله تحديث الجروب')
  C2.send({ type: 'chat_send', threadId: grp.thread.id, text: 'أهلا بالجميع 🎉' })
  const grpMsgAtB = await B3.waitFor((m) => m.type === 'chat_message' && m.threadId === grp.thread.id)
  assert(grpMsgAtB.message.senderName === 'كريم', 'B3: رسالة الجروب تحمل اسم كريم')

  // ===== 8) دعوة لعبة + انضمام للغرفة الفارغة =====
  console.log('== دعوة اللعبة ==')
  A2.send({ type: 'chat_send', threadId: threadIdPersist, kind: 'game_invite', invite: { gameId: 'tictactoe' } })
  const inviteAtB = await B3.waitFor((m) => m.type === 'chat_message' && m.message.kind === 'game_invite')
  const invite = inviteAtB.message.invite
  assert(invite && invite.gameId === 'tictactoe' && /^\d{4}$/.test(invite.roomCode), `B3: دعوة بكود غرفة ${invite?.roomCode}`)
  assert(invite.gameName === 'إكس أو' && invite.gameEmoji === '⭕', 'B3: الدعوة تحمل اسم اللعبة ورمزها')

  // A ينضم أولًا لغرفة الدعوة الفارغة → slot 1
  A2.send({ type: 'join', code: invite.roomCode, name: 'آدم', avatar: '😎' })
  const joinA = await A2.waitFor((m) => m.type === 'joined' && m.code === invite.roomCode)
  assert(joinA.slot === 1, 'A2: أول منضم لغرفة الدعوة يأخذ slot=1')
  assert(joinA.autoStart === true, 'A2: غرفة دعوة DM موسومة autoStart=true')
  B3.send({ type: 'join', code: invite.roomCode, name: 'بدر', avatar: '🦊' })
  const joinB = await B3.waitFor((m) => m.type === 'joined' && m.code === invite.roomCode)
  assert(joinB.slot === 2 && joinB.opponent?.name === 'آدم', 'B3: ثاني منضم slot=2 ويرى الخصم')
  assert(joinB.autoStart === true, 'B3: المنضم الثاني يرى autoStart=true أيضًا')
  const oppJoin = await A2.waitFor((m) => m.type === 'opponent_joined')
  assert(oppJoin.opponent?.name === 'بدر', 'A2: وصله opponent_joined')
  assert(oppJoin.autoStart === true, 'A2: opponent_joined يحمل autoStart=true (زناد البدء التلقائي)')
  A2.send({ type: 'leave' })
  B3.send({ type: 'leave' })
  await wait(200)

  // ===== 9) المباراة السريعة =====
  console.log('== المباراة السريعة ==')
  A2.send({ type: 'quick_match', gameId: 'rps', name: 'آدم', avatar: '😎' })
  await A2.waitFor((m) => m.type === 'quick_match_waiting')
  assert(true, 'A2: دخل طابور الانتظار')
  B3.send({ type: 'quick_match', gameId: 'rps', name: 'بدر', avatar: '🦊' })
  const matchA = await A2.waitFor((m) => m.type === 'matched')
  const matchB = await B3.waitFor((m) => m.type === 'matched')
  assert(matchA.code === matchB.code && matchA.gameId === 'rps', `تطابق الطرفان في غرفة ${matchA.code}`)
  assert(matchA.slot === 1 && matchB.slot === 2, 'A2 مضيف (slot=1) وB3 ضيف (slot=2)')
  assert(matchA.opponent?.name === 'بدر' && matchB.opponent?.name === 'آدم', 'كل طرف يرى اسم خصمه')

  // إلغاء الطابور
  C2.send({ type: 'quick_match', gameId: 'reaction', name: 'كريم', avatar: '🐼' })
  await C2.waitFor((m) => m.type === 'quick_match_waiting')
  C2.send({ type: 'quick_match_cancel' })
  await C2.waitFor((m) => m.type === 'quick_match_cancelled')
  assert(true, 'C2: إلغاء البحث يعمل')

  // ===== 10) دعوة الجروب تبقى يدوية البدء (autoStart=false) =====
  console.log('== دعوة الجروب: بدون بدء تلقائي ==')
  C2.send({ type: 'chat_send', threadId: grp.thread.id, kind: 'game_invite', invite: { gameId: 'shakhbata' } })
  const grpInviteAtA = await A2.waitFor((m) => m.type === 'chat_message' && m.threadId === grp.thread.id && m.message.kind === 'game_invite')
  const grpCode = grpInviteAtA.message.invite.roomCode
  assert(/^\d{4}$/.test(grpCode), `C2: دعوة جروب بكود غرفة ${grpCode}`)
  C2.send({ type: 'join', code: grpCode, name: 'كريم', avatar: '🐼' })
  const grpJoin = await C2.waitFor((m) => m.type === 'joined' && m.code === grpCode)
  assert(grpJoin.autoStart === false, 'C2: غرفة دعوة الجروب autoStart=false (تنتظر المضيف)')
  C2.send({ type: 'leave' })
  await wait(200)

  // ===== 11) المعرّف المتفائل: الخادم يصدّ clientId كما هو =====
  console.log('== الرسائل المتفائلة (clientId) ==')
  A2.send({ type: 'chat_send', threadId: threadIdPersist, text: 'رسالة بمعرّف متفائل ⚡', clientId: 'c_test_opt_1' })
  const echoOptA = await A2.waitFor((m) => m.type === 'chat_message' && m.threadId === threadIdPersist && m.message.text === 'رسالة بمعرّف متفائل ⚡')
  assert(echoOptA.message.id === 'c_test_opt_1', 'A2: صدى الرسالة يحمل clientId نفسه (يزيل التكرار المتفائل)')
  const echoOptB = await B3.waitFor((m) => m.type === 'chat_message' && m.threadId === threadIdPersist && m.message.text === 'رسالة بمعرّف متفائل ⚡')
  assert(echoOptB.message.id === 'c_test_opt_1', 'B3: الطرف الآخر يستلم نفس المعرّف')
  // clientId غير صالح → الخادم يولّد معرّفًا عاديًا
  A2.send({ type: 'chat_send', threadId: threadIdPersist, text: 'رسالة بمعرّف معطوب', clientId: '!!!' })
  const echoBad = await A2.waitFor((m) => m.type === 'chat_message' && m.threadId === threadIdPersist && m.message.text === 'رسالة بمعرّف معطوب')
  assert(/^m_/.test(echoBad.message.id), 'A2: clientId غير الصالح يُستبدل بمعرّف خادم')

  // ===== 12) إعدادات الغرفة (settings.rounds): النقل + سلسلة RPS =====
  console.log('== إعدادات الغرفة (settings.rounds) ==')
  // A2/B3 ما زالا داخل غرفة المباراة السريعة من القسم 9 — أخرجهما ونظّف صناديق الرسائل المتراكمة
  A2.send({ type: 'leave' })
  B3.send({ type: 'leave' })
  await wait(250)
  const drain = (...cs) => cs.forEach((c) => { c.inbox.length = 0 })
  drain(A2, B3)

  // إنشاء مع rounds=7 → created + joined + opponent_joined تحملها
  A2.send({ type: 'create', gameId: 'rps', name: 'آدم', avatar: '😎', settings: { rounds: 7 } })
  const createdS = await A2.waitFor((m) => m.type === 'created' && m.settings)
  assert(createdS.settings?.rounds === 7, 'A2: created يحمل settings.rounds=7')
  B3.send({ type: 'join', code: createdS.code, name: 'بدر', avatar: '🦊' })
  const joinedS = await B3.waitFor((m) => m.type === 'joined' && m.code === createdS.code)
  assert(joinedS.settings?.rounds === 7, 'B3: joined يحمل settings.rounds=7')
  const oppS = await A2.waitFor((m) => m.type === 'opponent_joined' && m.settings)
  assert(oppS.settings?.rounds === 7, 'A2: opponent_joined يحمل settings.rounds=7')
  A2.send({ type: 'leave' })
  B3.send({ type: 'leave' })
  await wait(200)
  drain(A2, B3)

  // الافتراضي: بدون settings → rounds=5
  A2.send({ type: 'create', gameId: 'reaction', name: 'آدم', avatar: '😎' })
  const createdD = await A2.waitFor((m) => m.type === 'created' && m.settings)
  assert(createdD.settings?.rounds === 5, 'A2: غرفة بلا إعدادات → rounds=5 افتراضيًا')
  A2.send({ type: 'leave' })
  await wait(200)
  drain(A2, B3)

  // قيمة غير صالحة → تُطوَّع للافتراضي
  A2.send({ type: 'create', gameId: 'rps', name: 'آدم', avatar: '😎', settings: { rounds: 99 } })
  const createdBad = await A2.waitFor((m) => m.type === 'created' && m.settings)
  assert(createdBad.settings?.rounds === 5, 'A2: rounds=99 غير صالحة → 5')
  A2.send({ type: 'leave' })
  await wait(200)
  drain(A2, B3)

  // سلسلة حجر ورقة مقص "أفضل من ٣": تنتهي بعد فوزين لنفس اللاعب
  A2.send({ type: 'create', gameId: 'rps', name: 'آدم', avatar: '😎', settings: { rounds: 3 } })
  const createdBo3 = await A2.waitFor((m) => m.type === 'created' && m.settings)
  assert(createdBo3.settings?.rounds === 3, 'A2: غرفة bo3 أُنشئت بـ rounds=3')
  B3.send({ type: 'join', code: createdBo3.code, name: 'بدر', avatar: '🦊' })
  await B3.waitFor((m) => m.type === 'joined' && m.code === createdBo3.code)
  // الجولة ١: A يفوز (حجر يكسر مقص) — لا نهاية للسلسلة بعد
  A2.send({ type: 'rps_choice', choice: 'rock' })
  B3.send({ type: 'rps_choice', choice: 'scissors' })
  await A2.waitFor((m) => m.type === 'rps_reveal')
  await wait(150)
  assert(!A2.find('rps_series_end'), 'bo3: لا rps_series_end بعد فوز واحد')
  // الجولة ٢: A يفوز مجددًا (ورقة تغلف حجر) → نهاية السلسلة
  A2.send({ type: 'rps_choice', choice: 'paper' })
  B3.send({ type: 'rps_choice', choice: 'rock' })
  const seriesEnd = await A2.waitFor((m) => m.type === 'rps_series_end')
  assert(seriesEnd.winnerSlot === 1 && seriesEnd.wins?.[1] === 2, `bo3: السلسلة انتهت بعد فوزين (winnerSlot=1, wins=${JSON.stringify(seriesEnd.wins)})`)
  assert(seriesEnd.rounds === 3, 'bo3: rps_series_end يحمل rounds=3')
  const seriesEndB = await B3.waitFor((m) => m.type === 'rps_series_end')
  assert(!!seriesEndB, 'B3: rps_series_end وصل للطرفين')
  A2.send({ type: 'leave' })
  B3.send({ type: 'leave' })
  await wait(200)
  drain(A2, B3)

  // دعوة دردشة مع settings → الرسالة + joined يحملانها
  A2.send({ type: 'chat_send', threadId: threadIdPersist, kind: 'game_invite', invite: { gameId: 'rps' }, settings: { rounds: 3 } })
  const invS = await B3.waitFor((m) => m.type === 'chat_message' && m.message.kind === 'game_invite' && m.message.invite?.gameId === 'rps')
  assert(invS.message.invite.settings?.rounds === 3, 'B3: رسالة الدعوة تحمل invite.settings.rounds=3')
  B3.send({ type: 'join', code: invS.message.invite.roomCode, name: 'بدر', avatar: '🦊' })
  const joinInvS = await B3.waitFor((m) => m.type === 'joined' && m.code === invS.message.invite.roomCode)
  assert(joinInvS.settings?.rounds === 3, 'B3: joined لغرفة الدعوة يحمل settings.rounds=3')
  B3.send({ type: 'leave' })
  await wait(200)
  drain(A2, B3)

  // المباراة السريعة: matched يحمل الإعدادات (مرجعها إعدادات أول لاعب في الطابور)
  A2.send({ type: 'quick_match', gameId: 'reaction', name: 'آدم', avatar: '😎', settings: { rounds: 7 } })
  await A2.waitFor((m) => m.type === 'quick_match_waiting')
  B3.send({ type: 'quick_match', gameId: 'reaction', name: 'بدر', avatar: '🦊' })
  const matchSA = await A2.waitFor((m) => m.type === 'matched' && m.gameId === 'reaction')
  const matchSB = await B3.waitFor((m) => m.type === 'matched' && m.gameId === 'reaction')
  assert(matchSA.settings?.rounds === 7 && matchSB.settings?.rounds === 7, 'quick_match: matched يحمل settings.rounds=7 للطرفين')
  A2.send({ type: 'leave' })
  B3.send({ type: 'leave' })
  await wait(200)

  // ===== الختام =====
  A2.close()
  B3.close()
  C2.close()
  await stopServer()
  console.log(`\nالنتيجة: ${passed} ناجح / ${failed} فاشل`)
  rmSync(DATA_DIR, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error('فشل الاختبار:', error)
  await stopServer()
  rmSync(DATA_DIR, { recursive: true, force: true })
  process.exit(1)
})
