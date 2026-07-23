import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'
import { SNAKE_MAX_PLAYERS } from './snake-arena.js'
import { PAPER_MAX_PLAYERS } from './paper-arena.js'

function workerCount(environment) {
  const requested = Math.floor(Number(environment.DEDOS_ARENA_WORKERS) || 0)
  return Math.max(0, Math.min(requested, Math.max(1, availableParallelism() - 1), 16))
}

export class ArenaWorkerPool {
  constructor({ count, send, logger = () => {}, onPerformance = () => {} }) {
    this.count = count
    this.send = send
    this.logger = logger
    this.onPerformance = onPerformance
    this.workers = []
    this.states = []
    this.clients = new Map()
    this.clientIds = new WeakMap()
    this.assignments = new Map()
    this.assignedHumans = {
      snake: Array.from({ length: count }, () => 0),
      paper: Array.from({ length: count }, () => 0),
    }
    this.nextClientId = 1
    this.closing = false
    for (let index = 0; index < count; index += 1) this.spawn(index)
    this.snake = this.facade('snake')
    this.paper = this.facade('paper')
  }

  spawn(index) {
    const worker = new Worker(new URL('./arena-worker.js', import.meta.url), {
      workerData: { workerIndex: index },
    })
    worker.on('message', (message) => this.handleWorkerMessage(index, message))
    worker.on('error', (error) => this.logger('error', 'arena_worker_error', { worker: index, message: error.message }))
    worker.on('exit', (code) => this.handleWorkerExit(index, code))
    this.workers[index] = worker
    this.states[index] = {
      snakeArenas: 0,
      snakePlayers: 0,
      snakeHumans: 0,
      paperArenas: 0,
      paperPlayers: 0,
      paperHumans: 0,
      metrics: {},
    }
  }

  facade(game) {
    return {
      track: () => {},
      untrack: (socket) => this.leave(socket, game),
      join: (socket, profile) => this.join(socket, game, profile),
      leave: (socket) => this.leave(socket, game),
      has: (socket) => this.has(socket, game),
      steer: (socket, angle, sequence) => this.command(socket, game, `${game}_steer`, { angle, sequence }),
      respawn: (socket) => this.command(socket, game, `${game}_respawn`),
      sync: (socket) => this.command(socket, game, `${game}_sync`),
      get arenaCount() {
        return 0
      },
    }
  }

  register(socket) {
    let clientId = this.clientIds.get(socket)
    if (clientId) return clientId
    clientId = `arena-client-${this.nextClientId}`
    this.nextClientId += 1
    this.clientIds.set(socket, clientId)
    this.clients.set(clientId, socket)
    return clientId
  }

  chooseWorker(game) {
    const maximum = game === 'snake' ? SNAKE_MAX_PLAYERS : PAPER_MAX_PLAYERS
    const counts = this.assignedHumans[game]
    const partial = counts
      .map((count, index) => ({ count, index, remainder: count % maximum }))
      .filter(({ remainder }) => remainder > 0)
      .sort((first, second) => second.remainder - first.remainder || first.count - second.count)
    if (partial.length > 0) return partial[0].index
    return counts
      .map((count, index) => ({ count, index }))
      .sort((first, second) => first.count - second.count || first.index - second.index)[0].index
  }

  join(socket, game, profile = {}) {
    this.disconnectAssignment(socket)
    const clientId = this.register(socket)
    const workerIndex = this.chooseWorker(game)
    this.assignments.set(clientId, { workerIndex, game })
    this.assignedHumans[game][workerIndex] += 1
    this.workers[workerIndex].postMessage({ type: `${game}_join`, clientId, profile })
    return true
  }

  command(socket, game, type, details = {}) {
    const clientId = this.clientIds.get(socket)
    const assignment = clientId ? this.assignments.get(clientId) : null
    if (!assignment || assignment.game !== game) return false
    this.workers[assignment.workerIndex].postMessage({ type, clientId, ...details })
    return true
  }

  leave(socket, game) {
    const clientId = this.clientIds.get(socket)
    const assignment = clientId ? this.assignments.get(clientId) : null
    if (!assignment || assignment.game !== game) return false
    this.assignments.delete(clientId)
    this.assignedHumans[game][assignment.workerIndex] = Math.max(
      0,
      this.assignedHumans[game][assignment.workerIndex] - 1,
    )
    this.workers[assignment.workerIndex].postMessage({ type: `${game}_leave`, clientId })
    return true
  }

  has(socket, game) {
    const clientId = this.clientIds.get(socket)
    return this.assignments.get(clientId)?.game === game
  }

  disconnectAssignment(socket) {
    const clientId = this.clientIds.get(socket)
    const assignment = clientId ? this.assignments.get(clientId) : null
    if (!assignment) return
    this.leave(socket, assignment.game)
  }

  disconnect(socket) {
    this.disconnectAssignment(socket)
    const clientId = this.clientIds.get(socket)
    if (!clientId) return
    for (const worker of this.workers) worker.postMessage({ type: 'disconnect', clientId })
    this.assignments.delete(clientId)
    this.clients.delete(clientId)
    this.clientIds.delete(socket)
  }

  handleWorkerMessage(workerIndex, message) {
    if (message.type === 'status') {
      this.states[workerIndex] = message
      this.onPerformance(this.performance())
      return
    }
    if (message.type === 'send') {
      this.sendToClient(workerIndex, message.clientId, message.payload)
      return
    }
    if (message.type === 'broadcast') {
      for (const clientId of message.clientIds) this.sendToClient(workerIndex, clientId, message.payload)
    }
  }

  sendToClient(workerIndex, clientId, payload) {
    const assignment = this.assignments.get(clientId)
    const game = String(payload?.type ?? '').startsWith('snake_') ? 'snake'
      : String(payload?.type ?? '').startsWith('paper_') ? 'paper'
        : null
    if (!assignment || assignment.workerIndex !== workerIndex || (game && assignment.game !== game)) return
    const socket = this.clients.get(clientId)
    if (socket) this.send(socket, payload)
  }

  handleWorkerExit(workerIndex, code) {
    if (this.closing) return
    this.logger('error', 'arena_worker_exit', { worker: workerIndex, code })
    for (const [clientId, assignment] of this.assignments) {
      if (assignment.workerIndex !== workerIndex) continue
      const socket = this.clients.get(clientId)
      this.assignments.delete(clientId)
      this.assignedHumans[assignment.game][workerIndex] = Math.max(
        0,
        this.assignedHumans[assignment.game][workerIndex] - 1,
      )
      socket?.close?.(1012, 'arena_worker_restart')
    }
    this.spawn(workerIndex)
  }

  performance() {
    const keys = [
      'snakeTickMs',
      'snakeTickMaxMs',
      'snakeSnapshotMs',
      'snakeSnapshotMaxMs',
      'paperTickMs',
      'paperTickMaxMs',
      'paperSnapshotMs',
      'paperSnapshotMaxMs',
    ]
    return Object.fromEntries(keys.map((key) => [
      key,
      Math.max(0, ...this.states.map((state) => Number(state.metrics?.[key]) || 0)),
    ]))
  }

  stats(game) {
    const prefix = game === 'snake' ? 'snake' : 'paper'
    return this.states.reduce(
      (result, state) => ({
        arenas: result.arenas + (Number(state[`${prefix}Arenas`]) || 0),
        players: result.players + (Number(state[`${prefix}Players`]) || 0),
        humans: result.humans + (Number(state[`${prefix}Humans`]) || 0),
      }),
      { arenas: 0, players: 0, humans: 0 },
    )
  }

  health() {
    return {
      ok: this.workers.length === this.count && this.workers.every((worker) => worker.threadId > 0),
      engine: 'worker_threads',
      workers: this.count,
    }
  }

  async close() {
    if (this.closing) return
    this.closing = true
    for (const worker of this.workers) worker.postMessage({ type: 'shutdown' })
    await Promise.allSettled(this.workers.map((worker) => worker.terminate()))
  }
}

export function createArenaWorkerPool(options, environment = process.env) {
  const count = workerCount(environment)
  return count > 0 ? new ArenaWorkerPool({ ...options, count }) : null
}
