import WebSocket from 'ws'

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
const timeout = setTimeout(() => {
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
  while (true) {
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
      if (foodValues.size < 4 || Number(foodSnapshot.speed) <= 78) {
        throw new Error('The upgraded speed or varied food values are missing from the live snapshot.')
      }
      if (!controlsSent) {
        sockets[0].send(JSON.stringify({ type: 'snake_public_steer', angle: 0.6 }))
        sockets[0].send(JSON.stringify({ type: 'snake_public_boost', active: true }))
        sockets[1].send(JSON.stringify({ type: 'snake_public_steer', angle: -0.8 }))
        controlsSent = true
      }
      const boosted = received[0].some((message) => (
        message.type === 'snake_public_snapshot'
        && message.players?.some((player) => player.id === joined[0].playerId && player.boosting === true)
      ))
      if (boosted) {
        console.log(JSON.stringify({
          ok: true,
          arenaId: joined[0].arenaId,
          players: clients.length,
          foodCount: foodSnapshot.foods.length,
          baseSpeed: foodSnapshot.speed,
          boostVerified: true,
        }))
        break
      }
    }
    await wait(50)
  }

  if (holdMs > 0) await wait(holdMs)
} finally {
  clearTimeout(timeout)
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'snake_public_leave' }))
    socket.close()
  }
}
