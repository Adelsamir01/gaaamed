/* End-to-end smoke test for server-authoritative Memory, Trivia, and Match-Three rooms. */
import WebSocket from 'ws'
import { TRIVIA_ANSWER_KEY } from './competitive-games.js'
import { findMatch3Move } from '../src/games/match3/engine.js'

const URL = process.env.TEST_WS_URL || 'ws://localhost:8787'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL)
    ws.inbox = []
    ws.on('message', (raw) => ws.inbox.push(JSON.parse(raw.toString())))
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function send(ws, message) {
  ws.send(JSON.stringify(message))
}

async function next(ws, type, after = 0, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const message = ws.inbox.slice(after).find((item) => item.type === type)
    if (message) return message
    await wait(20)
  }
  throw new Error(`Timed out waiting for ${type}`)
}

async function createPair(gameId) {
  const host = await connect()
  const guest = await connect()
  send(host, { type: 'create', gameId, name: 'مضيف', avatar: '🐯' })
  const created = await next(host, 'created')
  send(guest, { type: 'join', code: created.code, name: 'ضيف', avatar: '🦋' })
  await next(guest, 'joined')
  await next(host, 'opponent_joined')
  return { host, guest }
}

async function testMemory() {
  const { host, guest } = await createPair('memory')
  send(host, { type: 'action', action: { kind: 'start' } })
  send(host, { type: 'action', action: { kind: 'start' } })
  const stateMessage = await next(host, 'memory_state')
  await wait(80)
  if (host.inbox.filter((message) => message.type === 'memory_state' && message.effect === 'start').length !== 1) throw new Error('Memory accepted a duplicate start')
  const active = stateMessage.state.activeSlot === 1 ? host : guest
  const inactive = active === host ? guest : host
  const beforeActive = active.inbox.length
  const beforeInactive = inactive.inbox.length
  send(active, { type: 'memory_flip', index: 0 })
  const flipped = await next(active, 'memory_state', beforeActive)
  if (flipped.state.selected.length !== 1 || flipped.state.cards[0].emoji === null) throw new Error('Memory first flip was not synchronized')
  send(inactive, { type: 'memory_flip', index: 1 })
  await wait(150)
  if (inactive.inbox.slice(beforeInactive).filter((message) => message.type === 'memory_state').length > 1) throw new Error('Memory accepted an out-of-turn flip')
  host.close()
  guest.close()
}

async function testTrivia() {
  const { host, guest } = await createPair('trivia')
  send(host, { type: 'action', action: { kind: 'start' } })
  send(host, { type: 'action', action: { kind: 'start' } })
  const question = await next(host, 'trivia_question')
  await wait(80)
  if (host.inbox.filter((message) => message.type === 'trivia_question').length !== 1) throw new Error('Trivia accepted a duplicate start')
  await next(guest, 'trivia_question')
  await wait(Math.max(0, question.startAt - Date.now() + 30))
  const option = TRIVIA_ANSWER_KEY[question.questionId]
  send(host, { type: 'trivia_answer', questionIndex: question.index, option })
  await wait(90)
  send(guest, { type: 'trivia_answer', questionIndex: question.index, option })
  const hostResult = await next(host, 'trivia_result')
  const guestResult = await next(guest, 'trivia_result')
  if (hostResult.winnerSlot !== 1 || guestResult.winnerSlot !== 1) throw new Error('Trivia did not award the faster correct answer')
  if (!hostResult.answers['1'].correct || !hostResult.answers['2'].correct) throw new Error('Trivia correct answers were not recorded')
  host.close()
  guest.close()
}

async function testMatch3() {
  const { host, guest } = await createPair('match3')
  send(host, { type: 'action', action: { kind: 'start' } })
  send(host, { type: 'action', action: { kind: 'start' } })
  const hostState = await next(host, 'match3_state')
  const guestState = await next(guest, 'match3_state')
  if (JSON.stringify(hostState.state) !== JSON.stringify(guestState.state)) throw new Error('Match-three starting boards were not equal')
  await wait(80)
  if (host.inbox.filter((message) => message.type === 'match3_state' && message.effect === 'start').length !== 1) throw new Error('Match-three accepted a duplicate start')

  const move = findMatch3Move(hostState.state.board)
  if (!move) throw new Error('Match-three board had no legal move')
  await wait(Math.max(0, hostState.startAt - Date.now() + 30))
  const afterHost = host.inbox.length
  const afterGuest = guest.inbox.length
  send(host, { type: 'match3_swap', first: move[0], second: move[1] })
  const moved = await next(host, 'match3_state', afterHost)
  const scores = await next(guest, 'match3_scores', afterGuest)
  if (moved.effect !== 'move' || moved.state.score <= 0) throw new Error('Match-three move was not authoritatively resolved')
  if (scores.scores['1'] !== moved.state.score) throw new Error('Match-three rival score was not synchronized')
  host.close()
  guest.close()
}

await testMemory()
await testTrivia()
await testMatch3()
console.log('✓ competitive multiplayer smoke test passed')
