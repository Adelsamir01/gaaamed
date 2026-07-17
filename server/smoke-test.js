/* اختبار سريع لخادم قييمد: إنشاء → انضمام → تمرير حركة → كشف حجر ورقة مقص → سباق البرق */
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

function client(name) {
  const ws = new WebSocket(URL)
  const inbox = []
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())))
  ws.send2 = (obj) => ws.send(JSON.stringify(obj))
  ws.name = name
  ws.inbox = inbox
  ws.find = (type) => inbox.find((m) => m.type === type)
  ws.last = (type) => [...inbox].reverse().find((m) => m.type === type)
  return ws
}

async function main() {
  log('== dedos server smoke test ==')

  // 1) إنشاء غرفة
  const host = client('host')
  await wait(200)
  host.send2({ type: 'create', gameId: 'tictactoe-online', name: 'أحمد', avatar: '🐯' })
  await wait(250)
  const created = host.find('created')
  assert(created && created.slot === 1, `host received created (slot=1)`)
  const code = created.code
  assert(/^\d{4}$/.test(code), `room code is 4 digits: ${code}`)

  // 2) رمز خاطئ
  const bad = client('bad')
  await wait(200)
  bad.send2({ type: 'join', code: '9999', name: 'سارق', avatar: '👻' })
  await wait(250)
  const err = bad.find('error')
  assert(err && typeof err.message === 'string', `wrong code → Arabic error: "${err && err.message}"`)
  bad.close()

  // 3) انضمام صحيح
  const guest = client('guest')
  await wait(200)
  guest.send2({ type: 'join', code, name: 'سارة', avatar: '🦋' })
  await wait(250)
  const joined = guest.find('joined')
  assert(joined && joined.slot === 2 && joined.opponent && joined.opponent.name === 'أحمد', 'guest joined with opponent info')
  const hostNotif = host.find('opponent_joined')
  assert(hostNotif && hostNotif.opponent.name === 'سارة', 'host notified opponent_joined')

  // 4) تمرير حركة إكس أو من المضيف للضيف
  host.send2({ type: 'action', action: { index: 4 } })
  await wait(250)
  const act = guest.last('action')
  assert(act && act.action.index === 4 && act.from === 1, 'action relayed host→guest {index:4, from:1}')

  // والعكس
  guest.send2({ type: 'action', action: { index: 0 } })
  await wait(250)
  const act2 = host.last('action')
  assert(act2 && act2.action.index === 0 && act2.from === 2, 'action relayed guest→host {index:0, from:2}')

  // 5) حجر ورقة مقص: اختياران ثم الكشف للطرفين
  host.send2({ type: 'rps_choice', choice: 'rock' })
  await wait(200)
  assert(!host.find('rps_reveal') && !guest.find('rps_reveal'), 'no reveal before both choices')
  guest.send2({ type: 'rps_choice', choice: 'scissors' })
  await wait(250)
  const rev1 = host.last('rps_reveal')
  const rev2 = guest.last('rps_reveal')
  assert(rev1 && rev2, 'rps_reveal broadcast to both')
  assert(rev1 && rev1.choices['1'] === 'rock' && rev1.choices['2'] === 'scissors', `reveal choices correct: ${JSON.stringify(rev1 && rev1.choices)}`)

  // 6) سباق البرق: من يضغط أولًا
  host.send2({ type: 'react_tap', ms: 210, foul: false })
  await wait(120)
  guest.send2({ type: 'react_tap', ms: 245, foul: false })
  await wait(250)
  const rr = guest.last('react_result')
  assert(rr && rr.winnerSlot === 1, `react_result winnerSlot=1 (first tap wins), got ${rr && rr.winnerSlot}`)
  assert(rr && rr.times['1'] === 210 && rr.times['2'] === 245, `react times relayed: ${JSON.stringify(rr && rr.times)}`)

  // إنذار
  host.send2({ type: 'react_tap', ms: null, foul: true })
  await wait(120)
  guest.send2({ type: 'react_tap', ms: 300, foul: false })
  await wait(250)
  const rr2 = guest.last('react_result')
  assert(rr2 && rr2.winnerSlot === 2, `foul loses the round (winnerSlot=2)`)

  // 7) إعادة اللعب
  host.send2({ type: 'rematch' })
  await wait(250)
  assert(guest.find('rematch'), 'rematch relayed')

  // 8) المغادرة
  guest.send2({ type: 'leave' })
  await wait(250)
  assert(host.find('opponent_left'), 'host notified opponent_left after leave')

  // 9) غرفة ممتلئة
  host.send2({ type: 'leave' })
  await wait(200)
  const h2 = client('h2')
  const g2 = client('g2')
  const g3 = client('g3')
  await wait(200)
  h2.send2({ type: 'create', gameId: 'connect4', name: 'خالد', avatar: '🦅' })
  await wait(250)
  const c2 = h2.find('created').code
  g2.send2({ type: 'join', code: c2, name: 'نورة', avatar: '🌙' })
  await wait(250)
  g3.send2({ type: 'join', code: c2, name: 'عمر', avatar: '🐺' })
  await wait(250)
  const full = g3.find('error')
  assert(full && full.message === 'الغرفة ممتلئة', `full room → "${full && full.message}"`)

  host.close(); guest.close(); h2.close(); g2.close(); g3.close()
  await wait(200)
  log(failed ? '== SMOKE TEST: SOME CHECKS FAILED ==' : '== SMOKE TEST: ALL CHECKS PASSED ==')
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
