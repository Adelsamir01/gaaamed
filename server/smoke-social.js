/**
 * server/smoke-social.js — اختبار شامل للطبقة الاجتماعية (الهوية/الأصدقاء/الدردشات/الدعوات/المباراة السريعة)
 * يشغّل الخادم كعملية فرعية على PORT=8899 مع GAAAMED_DATA_DIR مؤقت، ويتحقق من:
 *  1) identify جديد + عائد (ثبات الهوية بالجهاز)
 *  2) تعارض المعرّفات وصيغتها
 *  3) search_user (مع استبعاد الذات)
 *  4) friend_add ثنائي + حضور online/playing
 *  5) DM: إرسال + history + عدّاد غير المقروء + ثبات عبر إعادة تشغيل الخادم
 *  6) جروب من ٣ أعضاء
 *  7) دعوة لعبة تنشئ غرفة وينضم لها الطرفان (الأول slot=1)
 *  8) quick_match يزاوج عميلين (matched للطرفين)
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
const DATA_DIR = mkdtempSync(join(tmpdir(), 'gaaamed-social-'))

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
    env: { ...process.env, PORT: String(PORT), GAAAMED_DATA_DIR: DATA_DIR },
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
  A.send({ type: 'friend_add', userId: idB.user.userId })
  await A.waitFor((m) => m.type === 'friend_added')
  const updA = await A.waitFor((m) => m.type === 'friends_update' && m.friends.length === 1)
  assert(updA.friends[0].userId === idB.user.userId && updA.friends[0].presence === 'online', 'A: صديق واحد وحضوره online')
  const updB = await B.waitFor((m) => m.type === 'friends_update' && m.friends.length === 1)
  assert(updB.friends[0].userId === idA.user.userId, 'B: العلاقة ثنائية — A ظهر عند B تلقائيًا')

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
  B3.send({ type: 'join', code: invite.roomCode, name: 'بدر', avatar: '🦊' })
  const joinB = await B3.waitFor((m) => m.type === 'joined' && m.code === invite.roomCode)
  assert(joinB.slot === 2 && joinB.opponent?.name === 'آدم', 'B3: ثاني منضم slot=2 ويرى الخصم')
  const oppJoin = await A2.waitFor((m) => m.type === 'opponent_joined')
  assert(oppJoin.opponent?.name === 'بدر', 'A2: وصله opponent_joined')
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
