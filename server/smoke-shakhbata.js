/* اختبار سريع للعبة شخبطة: إنشاء → 3 لاعبين → بدء → اختيار كلمة → رسم → تخمين → تلميح → نهاية */
import WebSocket from 'ws'

const URL = 'ws://localhost:8787'
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
  const ws = new WebSocket(URL)
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

async function main() {
  log('== gaaamed shakhbata smoke test ==')

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
  assert(rc && rc.round === 1 && rc.totalRounds === 3, `round_choosing round=1 totalRounds=3: ${JSON.stringify(rc)}`)
  assert(rc && rc.drawer === 1 && rc.duration === 12, 'round_choosing drawer=slot1, duration=12')
  assert(p2.find('round_choosing') && p3.find('round_choosing'), 'round_choosing broadcast to all')
  const wo = host.find('word_options')
  assert(wo && wo.options.length === 3, `word_options to drawer with 3 options: ${JSON.stringify(wo && wo.options)}`)
  assert(!p2.find('word_options') && !p3.find('word_options'), 'word_options NOT sent to guessers')

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
  assert(p3.find('draw'), 'draw relayed to p3 too')
  assert(!host.find('draw'), 'draw NOT echoed back to drawer')

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

  // 10) الجولة 2: الرسام slot 2 — ننتظر التلميح (35% من 35ث ≈ 12.25ث)
  const rc2 = await waitFor(() => host.last('round_choosing')?.round === 2 && host.last('round_choosing'), 8000)
  assert(rc2 && rc2.drawer === 2, 'round 2: drawer=slot2')
  const wo2 = await waitFor(() => p2.find('word_options'))
  assert(wo2 && wo2.options.length === 3, 'word_options to new drawer (p2)')
  assert(host.count('word_options') === 1 && !p3.find('word_options'), 'word_options still exclusive to drawer')
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

  // 11) الجولة 3: الرسام slot 3، ثم نهاية اللعبة
  const rc3 = await waitFor(() => host.last('round_choosing')?.round === 3 && host.last('round_choosing'), 8000)
  assert(rc3 && rc3.drawer === 3, 'round 3: drawer=slot3')
  const wo3 = await waitFor(() => p3.find('word_options'))
  const word3 = wo3.options[2]
  p3.send2({ type: 'choose_word', word: word3 })
  await waitFor(() => host.last('round')?.drawer === 3)
  host.send2({ type: 'guess', text: word3 })
  p2.send2({ type: 'guess', text: word3 })
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

  host.close(); p2.close(); p3.close(); solo.close()
  await wait(200)
  log(failed ? '== SHAKHBATA SMOKE: SOME CHECKS FAILED ==' : '== SHAKHBATA SMOKE: ALL CHECKS PASSED ==')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
