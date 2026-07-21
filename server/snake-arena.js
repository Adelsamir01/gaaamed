const TAU = Math.PI * 2

export const SNAKE_WORLD_SIZE = 4_800
export const SNAKE_MAX_PLAYERS = 18
export const SNAKE_TICK_MS = 50
export const SNAKE_SNAPSHOT_MS = 100

export const SNAKE_BASE_SPEED = 90
export const SNAKE_BOOST_MULTIPLIER = 1.38
const TURN_RATE = 5.4
const START_LENGTH = 128
const GROWTH_PER_POINT = 9
const HEAD_RADIUS = 11
const BODY_RADIUS = 8.5
export const SNAKE_FOOD_COUNT = 260
const MAX_REMAINS_FOOD = 180
const FOOD_HUES = [38, 52, 94, 162, 188, 280, 332]
const FOOD_VARIANTS = [
  { radius: 4.5, value: 1 },
  { radius: 4.5, value: 1 },
  { radius: 5.5, value: 1 },
  { radius: 5.5, value: 1 },
  { radius: 6.5, value: 2 },
  { radius: 6.5, value: 2 },
  { radius: 7.5, value: 2 },
  { radius: 8.5, value: 3 },
  { radius: 9.5, value: 3 },
  { radius: 11, value: 5 },
]

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
    this.foods = Array.from({ length: SNAKE_FOOD_COUNT }, (_, index) => this.createFood(index))
    this.nextFoodId = SNAKE_FOOD_COUNT
  }

  createFood(id) {
    const point = randomPoint(this.random, this.size)
    const variant = FOOD_VARIANTS[id % FOOD_VARIANTS.length]
    return {
      id,
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
      hue: FOOD_HUES[id % FOOD_HUES.length],
      radius: variant.radius,
      value: variant.value,
      source: 'arena',
    }
  }

  dropPlayerFood(player) {
    const remainsAlreadyInArena = this.foods.reduce((total, food) => total + Number(food.source === 'remains'), 0)
    const available = Math.max(0, MAX_REMAINS_FOOD - remainsAlreadyInArena)
    const dropCount = Math.min(available, clamp(Math.round(player.length / 17), 7, 64))
    if (dropCount <= 0 || player.trail.length === 0) return 0

    for (let index = 0; index < dropCount; index += 1) {
      const trailIndex = Math.min(
        player.trail.length - 1,
        Math.round(((index + 0.5) / dropCount) * (player.trail.length - 1)),
      )
      const point = player.trail[trailIndex]
      const value = 1 + (index % 3)
      this.foods.push({
        id: this.nextFoodId,
        x: Math.round(wrap(point.x + (this.random() - 0.5) * 7, this.size) * 10) / 10,
        y: Math.round(wrap(point.y + (this.random() - 0.5) * 7, this.size) * 10) / 10,
        hue: Math.round(player.hue),
        radius: 5.5 + value * 1.15,
        value,
        source: 'remains',
      })
      this.nextFoodId += 1
    }
    this.foodVersion += 1
    return dropCount
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
    player.boosting = false
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

  boost(id, active) {
    const player = this.players.get(id)
    if (!player?.alive) return false
    player.boosting = active === true
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
      const speed = SNAKE_BASE_SPEED * (player.boosting ? SNAKE_BOOST_MULTIPLIER : 1)
      const nextHead = {
        x: wrap(head.x + Math.cos(player.angle) * speed * dt, this.size),
        y: wrap(head.y + Math.sin(player.angle) * speed * dt, this.size),
      }
      player.trail = trimTrail([nextHead, ...player.trail], player.length, this.size)

      const eatenIndex = this.foods.findIndex((food) => wrappedDistance(nextHead, food, this.size) < HEAD_RADIUS + food.radius + 2)
      if (eatenIndex >= 0) {
        const [eaten] = this.foods.splice(eatenIndex, 1)
        const value = clamp(Math.round(Number(eaten.value) || 1), 1, 5)
        player.score += value
        player.length += GROWTH_PER_POINT * value
        if (eaten.source !== 'remains') {
          this.foods.push(this.createFood(this.nextFoodId))
          this.nextFoodId += 1
        }
        this.foodVersion += 1
      }
    }

    const deathIds = new Set()
    for (const player of this.players.values()) {
      if (!player.alive) continue
      const head = player.trail[0]
      let collided = false

      for (const other of this.players.values()) {
        if (!other.alive || other.id === player.id) continue
        for (let index = 1; index < other.trail.length; index += 1) {
          if (wrappedDistance(head, other.trail[index], this.size) < HEAD_RADIUS + BODY_RADIUS - 2) {
            collided = true
            break
          }
        }
        if (collided) break
      }

      if (collided) {
        deathIds.add(player.id)
      }
    }

    const deaths = []
    for (const id of deathIds) {
      const player = this.players.get(id)
      if (!player?.alive) continue
      player.alive = false
      player.boosting = false
      this.dropPlayerFood(player)
      deaths.push({ id: player.id, score: player.score })
    }
    return deaths
  }

  snapshot(now = Date.now(), includeFoods = true) {
    const snapshot = {
      type: 'snake_public_snapshot',
      arenaId: this.id,
      serverTime: now,
      speed: SNAKE_BASE_SPEED,
      boostMultiplier: SNAKE_BOOST_MULTIPLIER,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        hue: Math.round(player.hue),
        score: player.score,
        alive: player.alive,
        boosting: player.boosting,
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

  boost(socket, active) {
    const membership = this.memberships.get(socket)
    if (!membership) return false
    return this.arenas.get(membership.arenaId)?.boost(membership.playerId, active === true) ?? false
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
