import WebSocket from 'ws'
import { SNAKE_BOT_COUNT } from './snake-arena.js'

const url = process.env.SNAKE_SMOKE_URL || 'wss://dedos.adelsamir.com'
const holdMs = Math.max(0, Number(process.env.SNAKE_SMOKE_HOLD_MS) || 0)
const timeoutMs = 12_000
const clients = [
  { name: 'Snake Smoke 1', avatar: '🐍' },
  { name: 'Snake Smoke 2', avatar: '🎮' },
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
  console.error('Snake public smoke test timed out.', received.map((messages) => messages.map((message) => message.type)))
  process.exitCode = 1
  for (const socket of sockets) socket.terminate()
}, timeoutMs)

try {
  await Promise.all(sockets.map((socket, index) => {
    socket.on('message', (raw) => received[index].push(JSON.parse(raw.toString())))
    return waitForOpen(socket)
  }))

  sockets.forEach((socket, index) => socket.send(JSON.stringify({ type: 'snake_public_join', ...clients[index] })))

  let controlsSent = false
  let controlsSentAt = 0
  let startingHead = null
  let verified = false
  while (!timedOut) {
    const joined = received.map((messages) => messages.find((message) => message.type === 'snake_public_joined'))
    const sharedSnapshots = received.map((messages) => (
      messages.find((message) => message.type === 'snake_public_snapshot' && message.players?.length >= clients.length)
    ))
    if (joined.every(Boolean) && sharedSnapshots.every(Boolean)) {
      const arenaIds = new Set(joined.map((message) => message.arenaId))
      if (arenaIds.size !== 1) throw new Error('Smoke clients joined different arenas.')
      if (!received.every((messages) => messages.some((message) => message.foods?.length >= 260))) {
        throw new Error('A smoke client did not receive the shared food state.')
      }
      const foodSnapshot = received[0].find((message) => message.foods?.length >= 260)
      const foodValues = new Set(foodSnapshot.foods.map((food) => food.value))
      if (foodValues.size < 4 || Number(foodSnapshot.speed) < 120) {
        throw new Error('The upgraded speed or varied food values are missing from the live snapshot.')
      }
      const worldSize = Number(foodSnapshot.worldSize)
      const arenaRadius = Number(foodSnapshot.arenaRadius)
      const center = worldSize / 2
      if (!(arenaRadius > worldSize * 0.4 && arenaRadius <= worldSize / 2)) {
        throw new Error('The massive circular arena dimensions are missing from the live snapshot.')
      }
      if (!foodSnapshot.foods.every((food) => Math.hypot(food.x - center, food.y - center) < arenaRadius)) {
        throw new Error('Live food exists outside the circular arena.')
      }
      if (foodSnapshot.players?.some((player) => 'boosting' in player)) {
        throw new Error('The removed boost state is still present in the live snapshot.')
      }
      const bots = foodSnapshot.players?.filter((player) => player.isBot) ?? []
      if (bots.length < SNAKE_BOT_COUNT) {
        throw new Error('The public arena is missing its bot snakes.')
      }
      if (foodSnapshot.players?.some((player) => !Number.isFinite(player.length)
        || !Number.isFinite(player.bodyRadius) || !Number.isFinite(player.headRadius))) {
        throw new Error('Snake growth dimensions are missing from the live snapshot.')
      }
      if (!controlsSent) {
        startingHead = sharedSnapshots[0].players.find((player) => player.id === joined[0].playerId)?.trail?.[0]
        controlsSentAt = received[0].length
        sockets[0].send(JSON.stringify({ type: 'snake_public_steer', angle: 0.6 }))
        sockets[1].send(JSON.stringify({ type: 'snake_public_steer', angle: -0.8 }))
        controlsSent = true
      }
      const movedSmoothly = startingHead && received[0].slice(controlsSentAt).some((message) => (
        message.type === 'snake_public_snapshot'
        && message.players?.some((player) => {
          if (player.id !== joined[0].playerId || !player.alive || !player.trail?.[0]) return false
          return Math.hypot(player.trail[0].x - startingHead.x, player.trail[0].y - startingHead.y) > 2
        })
      ))
      if (movedSmoothly) {
        console.log(JSON.stringify({
          ok: true,
          arenaId: joined[0].arenaId,
          players: clients.length,
          bots: bots.length,
          foodCount: foodSnapshot.foods.length,
          baseSpeed: foodSnapshot.speed,
          arenaRadius,
          steeringVerified: true,
        }))
        verified = true
        break
      }
    }
    await wait(50)
  }

  if (!verified) throw new Error('Snake public smoke verification did not complete before the timeout.')
  clearTimeout(timeout)
  if (holdMs > 0) await wait(holdMs)
} finally {
  clearTimeout(timeout)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'snake_public_leave' }))
    socket.close()
  }
}
