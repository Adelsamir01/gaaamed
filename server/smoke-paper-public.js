import WebSocket from 'ws'
import { PAPER_BOT_COUNT } from './paper-arena.js'

const url = process.env.PAPER_SMOKE_URL || 'wss://dedos.adelsamir.com'
const timeoutMs = 12_000
const clients = [
  { name: 'Paper Smoke 1', avatar: '🟪' },
  { name: 'Paper Smoke 2', avatar: '🟦' },
]

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve)
    socket.once('error', reject)
  })
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const sockets = clients.map(() => new WebSocket(url))
const received = clients.map(() => [])
let timedOut = false
const timeout = setTimeout(() => {
  timedOut = true
  console.error('Paper public smoke test timed out.', received.map((messages) => messages.map((message) => message.type)))
  process.exitCode = 1
  for (const socket of sockets) socket.terminate()
}, timeoutMs)

try {
  await Promise.all(sockets.map((socket, index) => {
    socket.on('message', (raw) => received[index].push(JSON.parse(raw.toString())))
    return waitForOpen(socket)
  }))
  sockets.forEach((socket, index) => socket.send(JSON.stringify({ type: 'paper_public_join', ...clients[index] })))

  let controlsSent = false
  let controlsSentAt = 0
  let startingPoint = null
  let verified = false
  while (!timedOut) {
    const joined = received.map((messages) => messages.find((message) => message.type === 'paper_public_joined'))
    const fullSnapshots = received.map((messages) => (
      messages.find((message) => message.type === 'paper_public_snapshot' && Array.isArray(message.ownerRle))
    ))
    if (joined.every(Boolean) && fullSnapshots.every(Boolean)) {
      if (new Set(joined.map((message) => message.arenaId)).size !== 1) {
        throw new Error('Smoke clients joined different territory arenas.')
      }
      const initial = fullSnapshots[0]
      const bots = initial.players.filter((player) => player.isBot)
      if (bots.length < PAPER_BOT_COUNT) throw new Error('The public territory arena is missing bots.')
      if (initial.gridSize !== 72 || initial.ownerRle.length === 0 || initial.speed < 145) {
        throw new Error('The live territory configuration is incomplete.')
      }
      if (!controlsSent) {
        const mine = initial.players.find((player) => player.id === joined[0].playerId)
        startingPoint = mine ? { x: mine.x, y: mine.y } : null
        controlsSentAt = received[0].length
        sockets[0].send(JSON.stringify({ type: 'paper_public_steer', angle: 0.35, sequence: 1 }))
        sockets[1].send(JSON.stringify({ type: 'paper_public_steer', angle: -1.1, sequence: 1 }))
        controlsSent = true
      }
      const moved = startingPoint && received[0].slice(controlsSentAt).some((message) => (
        message.type === 'paper_public_snapshot'
        && message.players?.some((player) => (
          player.id === joined[0].playerId
          && player.alive
          && player.lastInputSeq >= 1
          && Math.hypot(player.x - startingPoint.x, player.y - startingPoint.y) > 5
        ))
      ))
      if (moved) {
        const regular = received[0].slice(controlsSentAt).find((message) => message.type === 'paper_public_snapshot')
        if (regular && 'ownerRle' in regular) throw new Error('Regular snapshots should not resend the full territory grid.')
        console.log(JSON.stringify({
          ok: true,
          arenaId: joined[0].arenaId,
          humans: clients.length,
          bots: bots.length,
          gridSize: initial.gridSize,
          movementPredictionProtocol: true,
          compactSnapshots: true,
        }))
        verified = true
        break
      }
    }
    await wait(50)
  }
  if (!verified) throw new Error('Paper public smoke verification did not complete before timeout.')
} finally {
  clearTimeout(timeout)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'paper_public_leave' }))
    socket.close()
  }
}
