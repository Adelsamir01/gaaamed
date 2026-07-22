const TAU = Math.PI * 2

export const SNAKE_WORLD_SIZE = 5_600
export const SNAKE_ARENA_RADIUS = 2_720
export const SNAKE_MAX_PLAYERS = 18
export const SNAKE_TICK_MS = 50
export const SNAKE_SNAPSHOT_MS = 100

export const SNAKE_BASE_SPEED = 124
export const SNAKE_BOT_COUNT = 5
const TURN_RATE = 6.2
const START_LENGTH = 128
const SPAWN_EDGE_MARGIN = 720
const GROWTH_PER_POINT = 9
const BASE_HEAD_RADIUS = 11
const BASE_BODY_RADIUS = 8.5
const BOT_RESPAWN_MIN_SECONDS = 1.4
const BOT_RESPAWN_VARIANCE_SECONDS = 1.8
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
const BOT_PROFILES = [
  { name: '\u0632\u063A\u0644\u0648\u0644', avatar: '\uD83E\uDD16', hue: 44 },
  { name: '\u0628\u0646\u062F\u0642', avatar: '\uD83D\uDC0D', hue: 132 },
  { name: '\u0644\u0648\u0632', avatar: '\uD83E\uDD16', hue: 188 },
  { name: '\u0641\u0644\u0641\u0644', avatar: '\uD83D\uDC0D', hue: 286 },
  { name: '\u0645\u0634\u0645\u0634', avatar: '\uD83E\uDD16', hue: 338 },
  { name: '\u0633\u0645\u0633\u0645', avatar: '\uD83D\uDC0D', hue: 76 },
]

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angleDifference(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function cleanText(value, fallback, maxLength) {
  const clean = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength)
  return clean || fallback
}

function normaliseHue(value) {
  return ((value % 360) + 360) % 360
}

export function snakeBodyRadius(length = START_LENGTH) {
  const growth = Math.max(0, Number(length) - START_LENGTH)
  return BASE_BODY_RADIUS + Math.min(10.5, Math.sqrt(growth) * 0.32)
}

export function snakeHeadRadius(length = START_LENGTH) {
  return snakeBodyRadius(length) + 2.5
}

function randomPoint(random, size, radius, margin = 0) {
  const availableRadius = Math.max(0, radius - margin)
  const angle = random() * TAU
  const distanceFromCenter = Math.sqrt(random()) * availableRadius
  return {
    x: size / 2 + Math.cos(angle) * distanceFromCenter,
    y: size / 2 + Math.sin(angle) * distanceFromCenter,
  }
}

function projectInsideArena(point, size, radius, margin = 0) {
  const center = size / 2
  const dx = point.x - center
  const dy = point.y - center
  const currentDistance = Math.hypot(dx, dy)
  const maximumDistance = Math.max(0, radius - margin)
  if (currentDistance <= maximumDistance || currentDistance === 0) return point
  const scale = maximumDistance / currentDistance
  return { x: center + dx * scale, y: center + dy * scale }
}

function trimTrail(points, maxLength) {
  if (points.length < 2) return points
  const trimmed = [points[0]]
  let travelled = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const dx = current.x - previous.x
    const dy = current.y - previous.y
    const segmentLength = Math.hypot(dx, dy)
    if (travelled + segmentLength >= maxLength) {
      const remaining = maxLength - travelled
      const ratio = segmentLength > 0 ? remaining / segmentLength : 0
      trimmed.push({ x: previous.x + dx * ratio, y: previous.y + dy * ratio })
      break
    }
    travelled += segmentLength
    trimmed.push(current)
  }

  return trimmed
}

export class SnakeArena {
  constructor(id, { random = Math.random, size = SNAKE_WORLD_SIZE, radius = SNAKE_ARENA_RADIUS, maxPlayers = SNAKE_MAX_PLAYERS } = {}) {
    this.id = id
    this.random = random
    this.size = size
    this.radius = Math.min(radius, size / 2 - BASE_HEAD_RADIUS)
    this.maxPlayers = maxPlayers
    this.players = new Map()
    this.foodVersion = 0
    this.lastBroadcastFoodVersion = -1
    this.foods = Array.from({ length: SNAKE_FOOD_COUNT }, (_, index) => this.createFood(index))
    this.nextFoodId = SNAKE_FOOD_COUNT
  }

  createFood(id) {
    const point = randomPoint(this.random, this.size, this.radius, 24)
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
      const dropped = projectInsideArena({
        x: point.x + (this.random() - 0.5) * 7,
        y: point.y + (this.random() - 0.5) * 7,
      }, this.size, this.radius, 18)
      this.foods.push({
        id: this.nextFoodId,
        x: Math.round(dropped.x * 10) / 10,
        y: Math.round(dropped.y * 10) / 10,
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
    let candidate = randomPoint(this.random, this.size, this.radius, SPAWN_EDGE_MARGIN)
    for (let attempt = 0; attempt < 80; attempt += 1) {
      candidate = randomPoint(this.random, this.size, this.radius, SPAWN_EDGE_MARGIN)
      const safe = [...this.players.values()].every((player) => (
        !player.alive || distance(candidate, player.trail[0]) > 340
      ))
      if (safe) break
    }
    return candidate
  }

  spawnPlayer(player) {
    const head = this.findSpawn()
    const angle = this.random() * TAU
    const trail = Array.from({ length: Math.ceil(START_LENGTH / 4) + 1 }, (_, index) => ({
      x: head.x - Math.cos(angle) * index * 4,
      y: head.y - Math.sin(angle) * index * 4,
    }))
    player.alive = true
    player.score = 0
    player.length = START_LENGTH
    player.angle = angle
    player.targetAngle = angle
    player.trail = trail
    player.deathNotified = false
    player.respawnIn = 0
    player.botThinkIn = 0
    player.botFoodId = null
    return player
  }

  humanPlayerCount() {
    return [...this.players.values()].reduce((total, player) => total + Number(!player.isBot), 0)
  }

  addPlayer({ id, name, avatar, hue, isBot = false }) {
    if (!isBot && this.humanPlayerCount() >= this.maxPlayers) throw new Error('arena_full')
    const player = this.spawnPlayer({
      id,
      name: cleanText(name, 'لاعب', 24),
      avatar: cleanText(avatar, '🎮', 8),
      hue: Number.isFinite(hue) ? normaliseHue(hue) : Math.round(this.random() * 360),
      isBot: Boolean(isBot),
    })
    this.players.set(id, player)
    return player
  }

  addBots(count = SNAKE_BOT_COUNT) {
    const safeCount = clamp(Math.floor(Number(count) || 0), 0, BOT_PROFILES.length)
    for (let index = 0; index < safeCount; index += 1) {
      const profile = BOT_PROFILES[index]
      const id = `bot-${this.id}-${index + 1}`
      if (this.players.has(id)) continue
      this.addPlayer({ id, ...profile, isBot: true })
    }
    return safeCount
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

  updateBotSteering(player, dt, center) {
    player.botThinkIn -= dt
    const head = player.trail[0]
    const wallDistance = this.radius - distance(head, center)

    if (player.botThinkIn <= 0) {
      player.botThinkIn = 0.28 + this.random() * 0.42
      const currentFood = this.foods.find((food) => food.id === player.botFoodId)
      if (!currentFood || distance(head, currentFood) > 760 || this.random() < 0.2) {
        let bestFood = null
        let bestCost = Number.POSITIVE_INFINITY
        for (const food of this.foods) {
          const foodDistance = distance(head, food)
          if (foodDistance > 1_050) continue
          const cost = foodDistance / (1 + (Number(food.value) || 1) * 0.34) + this.random() * 45
          if (cost < bestCost) {
            bestCost = cost
            bestFood = food
          }
        }
        player.botFoodId = bestFood?.id ?? null
      }
    }

    const food = this.foods.find((candidate) => candidate.id === player.botFoodId)
    let desiredAngle = food
      ? Math.atan2(food.y - head.y, food.x - head.x)
      : player.angle + (this.random() - 0.5) * 0.35

    if (wallDistance < 520) {
      const centerAngle = Math.atan2(center.y - head.y, center.x - head.x)
      const wallWeight = clamp((520 - wallDistance) / 360, 0.25, 1)
      desiredAngle = player.angle + angleDifference(player.angle, centerAngle) * wallWeight
      player.botFoodId = null
    }

    const probeDistance = 105 + snakeHeadRadius(player.length) * 2
    const probe = {
      x: head.x + Math.cos(player.angle) * probeDistance,
      y: head.y + Math.sin(player.angle) * probeDistance,
    }
    let nearestThreat = null
    let nearestThreatDistance = Number.POSITIVE_INFINITY
    for (const other of this.players.values()) {
      if (!other.alive || other.id === player.id) continue
      for (let index = 1; index < other.trail.length; index += 3) {
        const threatDistance = distance(probe, other.trail[index])
        if (threatDistance < nearestThreatDistance) {
          nearestThreatDistance = threatDistance
          nearestThreat = other.trail[index]
        }
      }
    }
    if (nearestThreat && nearestThreatDistance < 92 + snakeBodyRadius(player.length)) {
      const awayAngle = Math.atan2(probe.y - nearestThreat.y, probe.x - nearestThreat.x)
      const turnSide = Math.sign(angleDifference(player.angle, awayAngle)) || (this.random() < 0.5 ? -1 : 1)
      desiredAngle = player.angle + turnSide * 1.15
      player.botFoodId = null
    }

    player.targetAngle = Math.atan2(Math.sin(desiredAngle), Math.cos(desiredAngle))
  }

  tick(dtSeconds) {
    const dt = clamp(Number(dtSeconds) || 0, 0, 0.1)
    if (dt <= 0) return []

    const boundaryDeaths = new Set()
    const center = { x: this.size / 2, y: this.size / 2 }
    for (const player of this.players.values()) {
      if (!player.isBot || player.alive) continue
      player.respawnIn -= dt
      if (player.respawnIn <= 0) this.spawnPlayer(player)
    }
    for (const player of this.players.values()) {
      if (player.isBot && player.alive) this.updateBotSteering(player, dt, center)
    }
    for (const player of this.players.values()) {
      if (!player.alive) continue
      const turn = clamp(angleDifference(player.angle, player.targetAngle), -TURN_RATE * dt, TURN_RATE * dt)
      player.angle += turn
      const head = player.trail[0]
      const speed = SNAKE_BASE_SPEED
      const nextHead = {
        x: head.x + Math.cos(player.angle) * speed * dt,
        y: head.y + Math.sin(player.angle) * speed * dt,
      }
      player.trail = trimTrail([nextHead, ...player.trail], player.length)

      const headRadius = snakeHeadRadius(player.length)
      if (distance(nextHead, center) >= this.radius - headRadius) {
        boundaryDeaths.add(player.id)
        continue
      }

      const eatenIndex = this.foods.findIndex((food) => distance(nextHead, food) < headRadius + food.radius + 2)
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

    const deathIds = new Set(boundaryDeaths)
    for (const player of this.players.values()) {
      if (!player.alive) continue
      const head = player.trail[0]
      let collided = false

      for (const other of this.players.values()) {
        if (!other.alive || other.id === player.id) continue
        for (let index = 1; index < other.trail.length; index += 1) {
          if (distance(head, other.trail[index]) < snakeHeadRadius(player.length) + snakeBodyRadius(other.length) - 2) {
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
      if (player.isBot) {
        player.respawnIn = BOT_RESPAWN_MIN_SECONDS + this.random() * BOT_RESPAWN_VARIANCE_SECONDS
      }
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
      worldSize: this.size,
      arenaRadius: this.radius,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        hue: Math.round(player.hue),
        score: player.score,
        length: Math.round(player.length * 10) / 10,
        bodyRadius: Math.round(snakeBodyRadius(player.length) * 100) / 100,
        headRadius: Math.round(snakeHeadRadius(player.length) * 100) / 100,
        isBot: player.isBot,
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
  constructor({ send, random = Math.random, now = Date.now, maxPlayers = SNAKE_MAX_PLAYERS, botCount = SNAKE_BOT_COUNT } = {}) {
    this.send = send
    this.random = random
    this.now = now
    this.maxPlayers = maxPlayers
    this.botCount = botCount
    this.arenas = new Map()
    this.memberships = new WeakMap()
    this.nextArenaId = 1
    this.nextPlayerId = 1
  }

  findArena() {
    const available = [...this.arenas.values()].find((arena) => arena.humanPlayerCount() < arena.maxPlayers)
    if (available) return available
    const arena = new SnakeArena(`public-${this.nextArenaId}`, { random: this.random, maxPlayers: this.maxPlayers })
    arena.addBots(this.botCount)
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
      arenaRadius: arena.radius,
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
    if (arena.humanPlayerCount() === 0) this.arenas.delete(arena.id)
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
