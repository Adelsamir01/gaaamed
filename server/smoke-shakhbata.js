/* اختبار سريع للعبة شخبطة: إنشاء → لاعبين → بدء → ٥ جولات افتراضية (تناوب round-robin) →
   انحدار تسليم word_options (إعادة الإرسال بعد ~750ms + اختيار الكلمة المطلوبة) → رسم → تخمين → تلميح → نهاية
   يشغّل خادمًا فرعيًا معزولًا على PORT=8897 مع DEDOS_DATA_DIR مؤقت (لا يلمس خادم الإنتاج :8787).
   للتشغيل ضد خادم خارجي قائم: SHAK_SMOKE_URL=ws://127.0.0.1:8791 node server/smoke-shakhbata.js */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const EXTERNAL_URL = process.env.SHAK_SMOKE_URL || ''
const PORT = Number(process.env.SHAK_SMOKE_PORT) || 8897
const WS_URL = EXTERNAL_URL || `ws://127.0.0.1:${PORT}`
const SERVER_PATH = fileURLToPath(new URL('./server.js', import.meta.url))
const DATA_DIR = EXTERNAL_URL ? null : mkdtempSync(join(tmpdir(), 'dedos-shak-'))

const log = (...a) => console.log(...a)
let failed = false
const assert = (cond, label) => {
  if (cond) log(`  ✓ ${label}`)
  else {
    failed = true
    log(`  ✗ FAILED: ${label}`)
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, timeout = 10000, step = 100) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const v = fn()
    if (v) return v
    await wait(step)
  }
  return null
}

function client(name) {
  const ws = new WebSocket(WS_URL)
  const inbox = []
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())))
  ws.send2 = (obj) => ws.send(JSON.stringify(obj))
  ws.name = name
  ws.inbox = inbox
  ws.find = (type) => inbox.find((m) => m.type === type)
  ws.last = (type) => [...inbox].reverse().find((m) => m.type === type)
  ws.count = (type) => inbox.filter((m) => m.type === type).length
  return ws
}

// ---------- خادم فرعي معزول (يُتخطى عند SHAK_SMOKE_URL) ----------
let serverProc = null
async function startServer() {
  if (EXTERNAL_URL) return log(`خادم خارجي: ${EXTERNAL_URL}`)
  log(`خادم اختبار فرعي على :${PORT} (بيانات: ${DATA_DIR})`)
  serverProc = spawn(process.execPath, [SERVER_PATH], {
    env: { ...process.env, PORT: String(PORT), DEDOS_DATA_DIR: DATA_DIR },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProc.stderr.on('data', (d) => console.error(`[server:err] ${d}`.trim()))
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
  log('== dedos shakhbata smoke test ==')
  await startServer()

  // 0) غرفة بلاعب واحد: start لا يعمل قبل لاعبَين
  const solo = client('solo')
  await wait(200)
  solo.send2({ type: 'create', gameId: 'shakhbata', drawTime: 35, name: 'سولو', avatar: '🐸' })
  await wait(250)
  assert(solo.find('created')?.slot === 1, 'solo room created')
  solo.send2({ type: 'start' })
  await wait(400)
  assert(!solo.find('round_choosing'), 'start ignored with < 2 players')
  solo.close()

  // 1) المضيف ينشئ غرفة شخبطة (drawTime=35 لتسريع التلميحات)
  const host = client('host')
  await wait(200)
  host.send2({ type: 'create', gameId: 'shakhbata', drawTime: 35, name: 'آدم', avatar: '🎨' })
  await wait(250)
  const created = host.find('created')
  assert(created && created.slot === 1, 'host received created (slot=1)')
  const code = created.code
  assert(/^\d{4}$/.test(code), `room code is 4 digits: ${code}`)

  // 2) انضمام لاعبَين
  const p2 = client('p2')
  const p3 = client('p3')
  await wait(200)
  p2.send2({ type: 'join', code, name: 'بدر', avatar: '🐱' })
  await wait(250)
  p3.send2({ type: 'join', code, name: 'جود', avatar: '🐶' })
  await wait(300)
  const j2 = p2.find('joined')
  const j3 = p3.find('joined')
  assert(j2 && j2.slot === 2 && j2.players.length === 2, 'p2 joined slot=2 with players list')
  assert(j3 && j3.slot === 3 && j3.players.length === 3, 'p3 joined slot=3 with players list')
  const pj = host.last('player_joined')
  assert(pj && pj.players.length === 3, 'player_joined broadcast to host with 3 players')
  const pj3 = p3.last('player_joined')
  assert(pj3 && pj3.players.map((p) => p.slot).join(',') === '1,2,3', 'player_joined slots ordered 1,2,3')
  assert(pj && pj.players[0].name === 'آدم' && pj.players[0].avatar === '🎨', 'player_joined carries name+avatar')

  // 3) غير المضيف لا يستطيع البدء
  p2.send2({ type: 'start' })
  await wait(400)
  assert(!host.find('round_choosing') && !p2.find('round_choosing'), 'start from non-host ignored')

  // 4) المضيف يبدأ → الجولة 1 (الرسام slot 1)
  host.send2({ type: 'start' })
  const rc = await waitFor(() => host.find('round_choosing'))
  assert(rc && rc.round === 1 && rc.totalRounds === 5, `round_choosing round=1 totalRounds=5 (default, not players.size): ${JSON.stringify(rc)}`)
  assert(rc && rc.drawer === 1 && rc.duration === 8, 'round_choosing drawer=slot1, duration=8 (word choice 8s)')
  assert(p2.find('round_choosing') && p3.find('round_choosing'), 'round_choosing broadcast to all')
  const wo = host.find('word_options')
  assert(wo && wo.options.length === 3, `word_options to drawer with 3 options: ${JSON.stringify(wo && wo.options)}`)
  assert(!p2.find('word_options') && !p3.find('word_options'), 'word_options NOT sent to guessers')

  // 4ب) انحدار تسليم word_options: الخادم يعيد الإرسال مرة واحدة بعد ~750ms (للعملاء المتأخرين في التركيب)
  const woResent = await waitFor(() => host.count('word_options') >= 2 && host.last('word_options'), 4000)
  assert(woResent && woResent.options.join('|') === wo.options.join('|'), 'word_options resent once (~750ms) with identical options (delivery regression guard)')
  const rcResent = host.last('round_choosing')
  assert(host.count('round_choosing') === 2 && rcResent && rcResent.round === 1 && rcResent.totalRounds === 5, 'round_choosing rebroadcast idempotently (late-mount recovery)')

  // 5) الرسام يختار الكلمة
  const word1 = wo.options[0]
  host.send2({ type: 'choose_word', word: word1 })
  const r1 = await waitFor(() => p2.find('round'))
  assert(r1 && r1.drawer === 1, 'round broadcast to guessers (drawer=1)')
  const expectLen = word1.replace(/\s+/g, '').length
  assert(r1.wordLength === expectLen, `round wordLength=${expectLen} (got ${r1.wordLength})`)
  assert(r1.wordPattern === word1.replace(/[^\s]/g, '_'), `round wordPattern hides letters: ${r1.wordPattern}`)
  assert(r1.duration === 35, `round duration=35 (drawTime option honored)`)
  const yw = host.find('your_word')
  assert(yw && yw.word === word1, `your_word to drawer only: "${yw && yw.word}"`)
  assert(!p2.find('your_word') && !p3.find('your_word'), 'your_word NOT sent to guessers')

  // 6) الرسم يصل للمخمّنين فقط
  host.send2({ type: 'draw', op: 'stroke', strokeId: 's1', points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }], color: '#ef4444', size: 8, tool: 'pen' })
  await wait(300)
  const dr = p2.last('draw')
  assert(dr && dr.op === 'stroke' && dr.strokeId === 's1' && dr.points.length === 2 && dr.color === '#ef4444', 'draw stroke relayed to guessers with full fields')
  assert(dr && dr.done === false, 'done defaults to false on intermediate batches')
  assert(p3.find('draw'), 'draw relayed to p3 too')
  assert(!host.find('draw'), 'draw NOT echoed back to drawer')

  // 6ب) دفعة نقاط مجمّعة + علامة done تُمرَّر كما هي
  const batch = [
    { x: 0.5, y: 0.5 }, { x: 0.55, y: 0.52 }, { x: 0.6, y: 0.55 }, { x: 0.66, y: 0.6 }, { x: 0.72, y: 0.66 }, { x: 0.8, y: 0.74 },
  ]
  host.send2({ type: 'draw', op: 'stroke', strokeId: 's1', points: batch, color: '#ef4444', size: 8, tool: 'pen', done: true })
  await wait(300)
  const drb = p2.last('draw')
  assert(drb && drb.strokeId === 's1' && drb.points.length === batch.length, `batched points relayed intact (${drb && drb.points.length}/${batch.length})`)
  assert(drb && drb.done === true, 'done=true relayed (receiver completes the curve tail)')
  assert(drb && drb.points[5].x === 0.8 && drb.points[5].y === 0.74, 'batch point order + values preserved')

  // 7) تخمين خاطئ → دردشة عادية للجميع
  p2.send2({ type: 'guess', text: 'تخمين بعيد تماما' })
  await wait(300)
  const wrong = p3.last('chat')
  assert(wrong && wrong.kind === 'message' && wrong.text === 'تخمين بعيد تماما' && wrong.from === 2, 'wrong guess broadcast as chat message to all')
  assert(host.last('chat')?.text === 'تخمين بعيد تماما', 'wrong guess also reached drawer')

  // 7ب) تخمين قريب → تلميح خاص للمخمّن + الرسالة تُبث
  if (word1.length >= 3) {
    const closeText = word1 + 'ا'
    p2.send2({ type: 'guess', text: closeText })
    await wait(300)
    const hintChat = p2.inbox.filter((m) => m.type === 'chat' && m.kind === 'hint').pop()
    assert(hintChat && hintChat.text.includes('قريب'), 'close guess → private "قريب جداً" hint to guesser')
    assert(p3.inbox.some((m) => m.type === 'chat' && m.kind === 'message' && m.text === closeText), 'close guess still broadcast as message')
    assert(!p3.inbox.some((m) => m.type === 'chat' && m.kind === 'hint'), 'close-guess hint NOT sent to others')
  }

  // 8) تخمين صحيح من p2 → لا يُبث النص + نقاط
  p2.send2({ type: 'guess', text: word1 })
  const correctChat = await waitFor(() => p3.inbox.find((m) => m.type === 'chat' && m.kind === 'correct'))
  assert(correctChat && correctChat.name === 'بدر', `correct guess announced as kind=correct: "${correctChat && correctChat.text}"`)
  assert(correctChat && correctChat.points >= 30 && correctChat.points <= 100, `base points within 30..100: ${correctChat && correctChat.points}`)
  assert(!host.inbox.some((m) => m.type === 'chat' && m.kind === 'message' && m.text === word1), 'correct word NOT broadcast as text (to drawer)')
  assert(!p3.inbox.some((m) => m.type === 'chat' && m.kind === 'message' && m.text === word1), 'correct word NOT broadcast as text (to others)')
  const sc1 = p3.last('scores')
  assert(sc1 && sc1.players.find((p) => p.slot === 2)?.score === correctChat.points, 'scores: guesser got base points')
  assert(sc1 && sc1.players.find((p) => p.slot === 1)?.score === 20, 'scores: drawer got +20')
  assert(sc1.players.find((p) => p.slot === 2)?.guessed === true, 'scores: guesser flagged guessed=true')

  // 9) تخمين صحيح من p3 → نهاية الجولة (كل المخمّنين خمّنوا)
  p3.send2({ type: 'guess', text: word1 })
  const re1 = await waitFor(() => host.find('round_end'))
  assert(re1 && re1.word === word1 && re1.reason === 'كل اللاعبين خمنوا!', `round_end reveals word: "${re1 && re1.word}" (${re1 && re1.reason})`)
  assert(re1 && re1.players.find((p) => p.slot === 1)?.score === 40, 'round_end: drawer 40 (20 × 2 guesses)')

  // 10) الجولة 2: الرسام slot 2 — ننتظر التلميح (30% من 35ث ≈ 10.5ث بعد الكشف 2.5ث)
  const rc2 = await waitFor(() => host.last('round_choosing')?.round === 2 && host.last('round_choosing'), 8000)
  assert(rc2 && rc2.drawer === 2, 'round 2: drawer=slot2')
  const wo2 = await waitFor(() => p2.find('word_options'))
  assert(wo2 && wo2.options.length === 3, 'word_options to new drawer (p2)')
  assert(host.count('word_options') === 2 && !p3.find('word_options'), 'word_options still exclusive to drawer (host=2 after round-1 resend)')
  const word2 = wo2.options[1]
  p2.send2({ type: 'choose_word', word: word2 })
  await waitFor(() => host.last('round')?.drawer === 2)
  const hint = await waitFor(() => p3.find('hint'), 16000)
  assert(hint && hint.hints.length === 1, `first hint reached guesser: ${JSON.stringify(hint && hint.hints)}`)
  assert(hint && typeof hint.hints[0].index === 'number' && hint.hints[0].letter === word2[hint.hints[0].index], 'hint letter matches the word at index')
  assert(host.find('hint'), 'hint reached the other guesser too')
  assert(!p2.find('hint'), 'hint NOT sent to drawer')

  // كلا المخمّنين يصيبان → نهاية الجولة 2
  host.send2({ type: 'guess', text: word2 })
  p3.send2({ type: 'guess', text: word2 })
  await waitFor(() => host.last('round_end')?.word === word2)
  log('  ✓ round 2 ended after both guessed')

  // 11) الجولة 3: الرسام slot 3 — ثم جولتان إضافيتان حتى 5 (الافتراضي الجديد)
  const rc3 = await waitFor(() => host.last('round_choosing')?.round === 3 && host.last('round_choosing'), 8000)
  assert(rc3 && rc3.drawer === 3 && rc3.totalRounds === 5, 'round 3: drawer=slot3, totalRounds still 5')
  const wo3 = await waitFor(() => p3.find('word_options'))
  assert(wo3 && wo3.options.length === 3, 'round 3: drawer received 3 word options')
  const word3 = wo3.options[2]
  p3.send2({ type: 'choose_word', word: word3 })
  await waitFor(() => host.last('round')?.drawer === 3)
  assert(p3.find('your_word')?.word === word3, 'round 3: drawing starts with the CHOSEN word (your_word)')
  host.send2({ type: 'guess', text: word3 })
  p2.send2({ type: 'guess', text: word3 })
  await waitFor(() => host.last('round_end')?.word === word3)
  log('  ✓ round 3 ended')

  // 11ب) الجولة 4: التناوب الدائري يعود لـ slot 1
  const rc4 = await waitFor(() => host.last('round_choosing')?.round === 4 && host.last('round_choosing'), 8000)
  assert(rc4 && rc4.drawer === 1, 'round 4: drawer rotates back to slot1 (round-robin beyond players.size)')
  const wo4 = await waitFor(() => host.count('word_options') >= 3 && host.last('word_options'), 4000)
  assert(wo4 && wo4.options.length === 3, 'round 4: drawer received 3 word options')
  const word4 = wo4.options[1]
  host.send2({ type: 'choose_word', word: word4 })
  await waitFor(() => p2.last('round')?.drawer === 1)
  assert(host.last('your_word')?.word === word4, 'round 4: drawing starts with the CHOSEN word')
  p2.send2({ type: 'guess', text: word4 })
  p3.send2({ type: 'guess', text: word4 })
  await waitFor(() => host.last('round_end')?.word === word4)
  log('  ✓ round 4 ended')

  // 11ج) الجولة 5: الرسام slot 2، ثم نهاية اللعبة
  const rc5 = await waitFor(() => host.last('round_choosing')?.round === 5 && host.last('round_choosing'), 8000)
  assert(rc5 && rc5.drawer === 2, 'round 5: drawer=slot2')
  const wo5 = await waitFor(() => p2.last('word_options'), 4000)
  assert(wo5 && wo5.options.length === 3, 'round 5: drawer received 3 word options')
  const word5 = wo5.options[0]
  p2.send2({ type: 'choose_word', word: word5 })
  await waitFor(() => host.last('round')?.drawer === 2)
  host.send2({ type: 'guess', text: word5 })
  p3.send2({ type: 'guess', text: word5 })
  const ended = await waitFor(() => host.find('ended'), 12000)
  assert(ended && ended.leaderboard.length === 3, 'ended with 3-player leaderboard')
  const lb = ended ? ended.leaderboard : []
  assert(lb[0] && lb[0].score >= lb[1].score && lb[1].score >= lb[2].score, `leaderboard sorted desc: ${lb.map((p) => `${p.name}=${p.score}`).join(', ')}`)
  assert(lb.every((p) => typeof p.slot === 'number' && typeof p.score === 'number' && p.name), 'leaderboard entries carry slot/score/name')
  assert(p2.find('ended') && p3.find('ended'), 'ended broadcast to all players')

  // 12) مغادرة لاعب → player_joined محدّث
  p3.send2({ type: 'leave' })
  await wait(400)
  const pjAfter = host.last('player_joined')
  assert(pjAfter && pjAfter.players.length === 2 && !pjAfter.players.some((p) => p.slot === 3), 'player_joined after leave (2 players, slot3 gone)')

  // 13) غرفة بلاعبَين: الافتراضي 5 جولات مع تناوب 1,2,1,2,1 + تسليم word_options كل جولة
  const h2 = client('h2')
  await wait(200)
  h2.send2({ type: 'create', gameId: 'shakhbata', drawTime: 35, name: 'هشام', avatar: '🦁' })
  await wait(250)
  const code2 = h2.find('created')?.code
  assert(/^\d{4}$/.test(code2 || ''), `2p room created: ${code2}`)
  const q2 = client('q2')
  await wait(200)
  q2.send2({ type: 'join', code: code2, name: 'كنان', avatar: '🦊' })
  await wait(300)
  assert(q2.find('joined')?.slot === 2, '2p: second player joined slot=2')
  h2.send2({ type: 'start' })
  const clients2 = { 1: h2, 2: q2 }
  const expectedDrawers = [1, 2, 1, 2, 1]
  let rotationOk = true
  let optionsOk = true
  let chosenOk = true
  for (let r = 1; r <= 5; r += 1) {
    const drawerSlot = expectedDrawers[r - 1]
    const drawer = clients2[drawerSlot]
    const guesser = clients2[drawerSlot === 1 ? 2 : 1]
    const rcB = await waitFor(() => h2.last('round_choosing')?.round === r && h2.last('round_choosing'), 8000)
    if (!(rcB && rcB.drawer === drawerSlot && rcB.totalRounds === 5)) { rotationOk = false; break }
    // عدّادات قبل الاختيار: last() قد يرجع رسائل قديمة من جولة سابقة لنفس الرسام (1,2,1,2,1)
    const woCount = drawer.count('word_options')
    const ywCount = drawer.count('your_word')
    const rCount = guesser.count('round')
    const reCount = h2.count('round_end')
    const woB = await waitFor(() => drawer.count('word_options') > woCount && drawer.last('word_options'), 4000)
    if (!(woB && woB.options.length === 3)) { optionsOk = false; break }
    const pick = woB.options[r % 3]
    drawer.send2({ type: 'choose_word', word: pick })
    const ywB = await waitFor(() => drawer.count('your_word') > ywCount && drawer.last('your_word'), 4000)
    const rB = await waitFor(() => guesser.count('round') > rCount && guesser.last('round'), 4000)
    if (!(ywB && ywB.word === pick && rB && rB.drawer === drawerSlot && rB.wordPattern === pick.replace(/[^\s]/g, '_'))) { chosenOk = false; break }
    guesser.send2({ type: 'guess', text: pick })
    if (r < 5) {
      const reB = await waitFor(() => h2.count('round_end') > reCount && h2.last('round_end'), 8000)
      if (!(reB && reB.word === pick)) { rotationOk = false; break }
    }
  }
  assert(rotationOk, '2p: 5 rounds with round-robin drawer rotation 1,2,1,2,1 and totalRounds=5')
  assert(optionsOk, '2p: drawer received exactly 3 word options every round')
  assert(chosenOk, '2p: choosing an option starts drawing with THAT word (your_word + wordPattern)')
  const ended2 = await waitFor(() => h2.find('ended'), 12000)
  assert(ended2 && ended2.leaderboard.length === 2, '2p: match ended after round 5 with 2-player leaderboard')
  h2.close(); q2.close()

  host.close(); p2.close(); p3.close(); solo.close()
  await wait(200)
  log(failed ? '== SHAKHBATA SMOKE: SOME CHECKS FAILED ==' : '== SHAKHBATA SMOKE: ALL CHECKS PASSED ==')
  process.exit(failed ? 1 : 0)
}

async function run() {
  try {
    await main()
  } catch (e) {
    console.error(e)
    process.exitCode = 1
  } finally {
    await stopServer()
    if (DATA_DIR) rmSync(DATA_DIR, { recursive: true, force: true })
  }
}

run()
