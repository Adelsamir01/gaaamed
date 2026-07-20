const TAU = Math.PI * 2

export const SNAKE_WORLD_SIZE = 4_800
export const SNAKE_MAX_PLAYERS = 18
export const SNAKE_TICK_MS = 50
export const SNAKE_SNAPSHOT_MS = 100

const SPEED = 78
const TURN_RATE = 5.4
const START_LENGTH = 128
const GROWTH_PER_ORB = 18
const HEAD_RADIUS = 11
const BODY_RADIUS = 8.5
const FOOD_COUNT = 180
const FOOD_HUES = [38, 52, 94, 162, 188, 280, 332]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function wrap(value, size = SNAKE_WORLD_SIZE) {
  return ((value % size) + size) % size
}

function wrappedDelta(from, to, size = SNAKE_WORLD_SIZE) {
  let delta = to - from
  if (delta > size / 2) delta -= size
  if (delta < -size / 2) delta += size
  return delta
}

function wrappedDistance(a, b, size = SNAKE_WORLD_SIZE) {
  return Math.hypot(wrappedDelta(a.x, b.x, size), wrappedDelta(a.y, b.y, size))
}

function angleDifference(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function cleanText(value, fallback, maxLength) {
  const clean = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength)
  return clean || fallback
}

function randomPoint(random, size) {
  return { x: random() * size, y: random() * size }
}

function trimTrail(points, maxLength, size) {
  if (points.length < 2) return points
  const trimmed = [points[0]]
  let travelled = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const dx = wrappedDelta(previous.x, current.x, size)
    const dy = wrappedDelta(previous.y, current.y, size)
    const segmentLength = Math.hypot(dx, dy)
    if (travelled + segmentLength >= maxLength) {
      const remaining = maxLength - travelled
      const ratio = segmentLength > 0 ? remaining / segmentLength : 0
      trimmed.push({ x: wrap(previous.x + dx * ratio, size), y: wrap(previous.y + dy * ratio, size) })
      break
    }
    travelled += segmentLength
    trimmed.push(current)
  }

  return trimmed
}

export class SnakeArena {
  constructor(id, { random = Math.random, size = SNAKE_WORLD_SIZE, maxPlayers = SNAKE_MAX_PLAYERS } = {}) {
    this.id = id
    this.random = random
    this.size = size
    this.maxPlayers = maxPlayers
    this.players = new Map()
    this.foodVersion = 0
    this.lastBroadcastFoodVersion = -1
    this.foods = Array.from({ length: FOOD_COUNT }, (_, index) => this.createFood(index))
    this.nextFoodId = FOOD_COUNT
  }

  createFood(id) {
    const point = randomPoint(this.random, this.size)
    return {
      id,
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
      hue: FOOD_HUES[id % FOOD_HUES.length],
      radius: 6 + (id % 3),
    }
  }

  findSpawn() {
    let candidate = randomPoint(this.random, this.size)
    for (let attempt = 0; attempt < 80; attempt += 1) {
      candidate = randomPoint(this.random, this.size)
      const safe = [...this.players.values()].every((player) => (
        !player.alive || wrappedDistance(candidate, player.trail[0], this.size) > 340
      ))
      if (safe) break
    }
    return candidate
  }

  spawnPlayer(player) {
    const head = this.findSpawn()
    const angle = this.random() * TAU
    const trail = Array.from({ length: Math.ceil(START_LENGTH / 4) + 1 }, (_, index) => ({
      x: wrap(head.x - Math.cos(angle) * index * 4, this.size),
      y: wrap(head.y - Math.sin(angle) * index * 4, this.size),
    }))
    player.alive = true
    player.score = 0
    player.length = START_LENGTH
    player.angle = angle
    player.targetAngle = angle
    player.trail = trail
    player.deathNotified = false
    return player
  }

  addPlayer({ id, name, avatar, hue }) {
    if (this.players.size >= this.maxPlayers) throw new Error('arena_full')
    const player = this.spawnPlayer({
      id,
      name: cleanText(name, 'لاعب', 24),
      avatar: cleanText(avatar, '🎮', 8),
      hue: Number.isFinite(hue) ? wrap(hue, 360) : Math.round(this.random() * 360),
    })
    this.players.set(id, player)
    return player
  }

  removePlayer(id) {
    return this.players.delete(id)
  }

  steer(id, angle) {
    const player = this.players.get(id)
    if (!player?.alive || !Number.isFinite(angle)) return false
    player.targetAngle = Math.atan2(Math.sin(angle), Math.cos(angle))
    return true
  }

  respawn(id) {
    const player = this.players.get(id)
    if (!player || player.alive) return null
    return this.spawnPlayer(player)
  }

  tick(dtSeconds) {
    const dt = clamp(Number(dtSeconds) || 0, 0, 0.1)
    if (dt <= 0) return []

    for (const player of this.players.values()) {
      if (!player.alive) continue
      const turn = clamp(angleDifference(player.angle, player.targetAngle), -TURN_RATE * dt, TURN_RATE * dt)
      player.angle += turn
      const head = player.trail[0]
      const nextHead = {
        x: wrap(head.x + Math.cos(player.angle) * SPEED * dt, this.size),
        y: wrap(head.y + Math.sin(player.angle) * SPEED * dt, this.size),
      }
      player.trail = trimTrail([nextHead, ...player.trail], player.length, this.size)

      const eatenIndex = this.foods.findIndex((food) => wrappedDistance(nextHead, food, this.size) < HEAD_RADIUS + food.radius + 2)
      if (eatenIndex >= 0) {
        player.score += 1
        player.length += GROWTH_PER_ORB
        this.foods[eatenIndex] = this.createFood(this.nextFoodId)
        this.nextFoodId += 1
        this.foodVersion += 1
      }
    }

    const deaths = []
    for (const player of this.players.values()) {
      if (!player.alive) continue
      const head = player.trail[0]
      let collided = false

      for (const other of this.players.values()) {
        if (!other.alive) continue
        let bodyDistance = 0
        for (let index = other.id === player.id ? 1 : 0; index < other.trail.length; index += 1) {
          if (other.id === player.id) {
            bodyDistance += wrappedDistance(other.trail[index - 1], other.trail[index], this.size)
            if (bodyDistance < 58) continue
          }
          if (wrappedDistance(head, other.trail[index], this.size) < HEAD_RADIUS + BODY_RADIUS - 2) {
            collided = true
            break
          }
        }
        if (collided) break
      }

      if (collided) {
        player.alive = false
        deaths.push({ id: player.id, score: player.score })
      }
    }
    return deaths
  }

  snapshot(now = Date.now(), includeFoods = true) {
    const snapshot = {
      type: 'snake_public_snapshot',
      arenaId: this.id,
      serverTime: now,
      speed: SPEED,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        hue: Math.round(player.hue),
        score: player.score,
        alive: player.alive,
        angle: Math.round(player.angle * 10_000) / 10_000,
        trail: player.trail.map((point) => ({
          x: Math.round(point.x * 10) / 10,
          y: Math.round(point.y * 10) / 10,
        })),
      })),
    }
    if (includeFoods) snapshot.foods = this.foods
    return snapshot
  }
}

export class SnakeArenaManager {
  constructor({ send, random = Math.random, now = Date.now, maxPlayers = SNAKE_MAX_PLAYERS } = {}) {
    this.send = send
    this.random = random
    this.now = now
    this.maxPlayers = maxPlayers
    this.arenas = new Map()
    this.memberships = new WeakMap()
    this.nextArenaId = 1
    this.nextPlayerId = 1
  }

  findArena() {
    const available = [...this.arenas.values()].find((arena) => arena.players.size < arena.maxPlayers)
    if (available) return available
    const arena = new SnakeArena(`public-${this.nextArenaId}`, { random: this.random, maxPlayers: this.maxPlayers })
    this.nextArenaId += 1
    this.arenas.set(arena.id, arena)
    return arena
  }

  join(socket, profile = {}) {
    this.leave(socket)
    const arena = this.findArena()
    const playerId = `snake-${this.nextPlayerId}`
    this.nextPlayerId += 1
    const player = arena.addPlayer({
      id: playerId,
      name: profile.name,
      avatar: profile.avatar,
      hue: this.random() * 360,
    })
    this.memberships.set(socket, { arenaId: arena.id, playerId })
    this.send(socket, {
      type: 'snake_public_joined',
      arenaId: arena.id,
      playerId,
      worldSize: arena.size,
      playerCount: arena.players.size,
    })
    this.send(socket, arena.snapshot(this.now()))
    this.broadcastCount(arena)
    return player
  }

  steer(socket, angle) {
    const membership = this.memberships.get(socket)
    if (!membership) return false
    return this.arenas.get(membership.arenaId)?.steer(membership.playerId, Number(angle)) ?? false
  }

  respawn(socket) {
    const membership = this.memberships.get(socket)
    if (!membership) return false
    const arena = this.arenas.get(membership.arenaId)
    const player = arena?.respawn(membership.playerId)
    if (!arena || !player) return false
    this.send(socket, { type: 'snake_public_respawned', playerId: player.id })
    this.send(socket, arena.snapshot(this.now()))
    return true
  }

  leave(socket) {
    const membership = this.memberships.get(socket)
    if (!membership) return false
    this.memberships.delete(socket)
    const arena = this.arenas.get(membership.arenaId)
    if (!arena) return false
    arena.removePlayer(membership.playerId)
    if (arena.players.size === 0) this.arenas.delete(arena.id)
    else this.broadcastCount(arena)
    return true
  }

  tick(dtSeconds = SNAKE_TICK_MS / 1000) {
    for (const arena of this.arenas.values()) {
      const deaths = arena.tick(dtSeconds)
      for (const death of deaths) {
        for (const [socket, membership] of this.members(arena.id)) {
          if (membership.playerId === death.id) {
            this.send(socket, { type: 'snake_public_dead', score: death.score })
            break
          }
        }
      }
    }
  }

  broadcastSnapshots() {
    const now = this.now()
    for (const arena of this.arenas.values()) {
      const includeFoods = arena.lastBroadcastFoodVersion !== arena.foodVersion
      const snapshot = arena.snapshot(now, includeFoods)
      arena.lastBroadcastFoodVersion = arena.foodVersion
      for (const [socket] of this.members(arena.id)) this.send(socket, snapshot)
    }
  }

  broadcastCount(arena) {
    const message = { type: 'snake_public_count', arenaId: arena.id, playerCount: arena.players.size }
    for (const [socket] of this.members(arena.id)) this.send(socket, message)
  }

  *members(arenaId) {
    // WeakMap is intentionally not enumerable, so the manager only walks the
    // sockets that the arena already owns through this lightweight side set.
    for (const socket of this.sockets ?? []) {
      const membership = this.memberships.get(socket)
      if (membership?.arenaId === arenaId) yield [socket, membership]
    }
  }

  track(socket) {
    if (!this.sockets) this.sockets = new Set()
    this.sockets.add(socket)
  }

  untrack(socket) {
    this.leave(socket)
    this.sockets?.delete(socket)
  }
}
