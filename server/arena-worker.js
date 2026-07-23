import { parentPort, workerData } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import {
  SnakeArenaManager,
  SNAKE_SNAPSHOT_MS,
  SNAKE_TICK_MS,
} from './snake-arena.js'
import {
  PaperArenaManager,
  PAPER_SNAPSHOT_MS,
  PAPER_TICK_MS,
} from './paper-arena.js'

if (!parentPort) throw new Error('arena-worker.js must run inside a Worker thread')

const sockets = new Map()
const metrics = {
  snakeTickMs: 0,
  snakeTickMaxMs: 0,
  snakeSnapshotMs: 0,
  snakeSnapshotMaxMs: 0,
  paperTickMs: 0,
  paperTickMaxMs: 0,
  paperSnapshotMs: 0,
  paperSnapshotMaxMs: 0,
}

function socketFor(clientId) {
  let socket = sockets.get(clientId)
  if (!socket) {
    socket = { clientId }
    sockets.set(clientId, socket)
  }
  return socket
}

function send(socket, payload) {
  parentPort.postMessage({ type: 'send', clientId: socket.clientId, payload })
}

function broadcast(targets, payload) {
  parentPort.postMessage({
    type: 'broadcast',
    clientIds: targets.map((socket) => socket.clientId),
    payload,
  })
}

const snakeManager = new SnakeArenaManager({ send, broadcast })
const paperManager = new PaperArenaManager({ send, broadcast })

function recordDuration(name, maximumName, startedAt) {
  const duration = Math.max(0, performance.now() - startedAt)
  metrics[name] = duration
  metrics[maximumName] = Math.max(metrics[maximumName], duration)
}

function status() {
  parentPort.postMessage({
    type: 'status',
    workerIndex: workerData.workerIndex,
    snakeArenas: snakeManager.arenas.size,
    snakePlayers: [...snakeManager.arenas.values()].reduce((total, arena) => total + arena.players.size, 0),
    snakeHumans: [...snakeManager.arenas.values()].reduce((total, arena) => total + arena.humanPlayerCount(), 0),
    paperArenas: paperManager.arenas.size,
    paperPlayers: [...paperManager.arenas.values()].reduce((total, arena) => total + arena.players.size, 0),
    paperHumans: [...paperManager.arenas.values()].reduce((total, arena) => total + arena.humanPlayerCount(), 0),
    metrics,
  })
}

let lastSnakeTickAt = performance.now()
const snakeTickTimer = setInterval(() => {
  const startedAt = performance.now()
  const now = performance.now()
  const elapsedSeconds = Math.min(0.15, Math.max(0.001, (now - lastSnakeTickAt) / 1_000))
  lastSnakeTickAt = now
  const steps = Math.max(1, Math.ceil(elapsedSeconds / (SNAKE_TICK_MS / 1_000)))
  for (let step = 0; step < steps; step += 1) snakeManager.tick(elapsedSeconds / steps)
  recordDuration('snakeTickMs', 'snakeTickMaxMs', startedAt)
}, SNAKE_TICK_MS)

const snakeSnapshotTimer = setInterval(() => {
  const startedAt = performance.now()
  snakeManager.broadcastSnapshots()
  recordDuration('snakeSnapshotMs', 'snakeSnapshotMaxMs', startedAt)
}, SNAKE_SNAPSHOT_MS)

let lastPaperTickAt = performance.now()
const paperTickTimer = setInterval(() => {
  const startedAt = performance.now()
  const now = performance.now()
  const elapsedSeconds = Math.min(0.15, Math.max(0.001, (now - lastPaperTickAt) / 1_000))
  lastPaperTickAt = now
  const steps = Math.max(1, Math.ceil(elapsedSeconds / (PAPER_TICK_MS / 1_000)))
  for (let step = 0; step < steps; step += 1) paperManager.tick(elapsedSeconds / steps)
  recordDuration('paperTickMs', 'paperTickMaxMs', startedAt)
}, PAPER_TICK_MS)

const paperSnapshotTimer = setInterval(() => {
  const startedAt = performance.now()
  paperManager.broadcastSnapshots()
  recordDuration('paperSnapshotMs', 'paperSnapshotMaxMs', startedAt)
}, PAPER_SNAPSHOT_MS)

const statusTimer = setInterval(status, 1_000)

parentPort.on('message', (message) => {
  const clientId = String(message.clientId ?? '')
  const socket = socketFor(clientId)
  switch (message.type) {
    case 'snake_join':
      paperManager.leave(socket)
      snakeManager.join(socket, message.profile)
      status()
      break
    case 'snake_steer':
      snakeManager.steer(socket, message.angle)
      break
    case 'snake_respawn':
      snakeManager.respawn(socket)
      break
    case 'snake_leave':
      snakeManager.leave(socket)
      status()
      break
    case 'paper_join':
      snakeManager.leave(socket)
      paperManager.join(socket, message.profile)
      status()
      break
    case 'paper_steer':
      paperManager.steer(socket, message.angle, message.sequence)
      break
    case 'paper_respawn':
      paperManager.respawn(socket)
      break
    case 'paper_sync':
      paperManager.sync(socket)
      break
    case 'paper_leave':
      paperManager.leave(socket)
      status()
      break
    case 'disconnect':
      snakeManager.leave(socket)
      paperManager.leave(socket)
      sockets.delete(clientId)
      status()
      break
    case 'shutdown':
      clearInterval(snakeTickTimer)
      clearInterval(snakeSnapshotTimer)
      clearInterval(paperTickTimer)
      clearInterval(paperSnapshotTimer)
      clearInterval(statusTimer)
      parentPort.close()
      break
    default:
      break
  }
})

status()
