const TAU = Math.PI * 2

export const PAPER_GRID_SIZE = 72
export const PAPER_CELL_SIZE = 28
export const PAPER_WORLD_SIZE = PAPER_GRID_SIZE * PAPER_CELL_SIZE
export const PAPER_MAX_PLAYERS = 14
export const PAPER_BOT_COUNT = 6
export const PAPER_TICK_MS = 50
export const PAPER_SNAPSHOT_MS = 150
export const PAPER_SPEED = 150
export const PAPER_TURN_RATE = 7.4

const SPAWN_RADIUS_CELLS = 3
const SPAWN_EDGE_MARGIN_CELLS = 8
const MAX_TRAIL_CELLS = 420
const BOT_RESPAWN_MIN_SECONDS = 1.2
const BOT_RESPAWN_VARIANCE_SECONDS = 1.6
const PLAYER_COLORS = [
  '#22c55e', '#38bdf8', '#f97316', '#e879f9', '#facc15', '#fb7185',
  '#2dd4bf', '#a78bfa', '#84cc16', '#f472b6', '#60a5fa', '#f59e0b',
  '#14b8a6', '#c084fc', '#4ade80', '#f43f5e', '#06b6d4', '#eab308',
]
const BOT_PROFILES = [
  { name: 'فستق', avatar: '🟩' },
  { name: 'مانجا', avatar: '🟧' },
  { name: 'توتة', avatar: '🟪' },
  { name: 'لولي', avatar: '🟦' },
  { name: 'بسبوس', avatar: '🟨' },
  { name: 'مرمر', avatar: '🟥' },
  { name: 'نعناع', avatar: '🌿' },
  { name: 'سكر', avatar: '✨' },
]

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function angleDifference(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function cleanText(value, fallback, maxLength) {
  const clean = String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength)
  return clean || fallback
}

function distanceSquared(first, second) {
  const dx = first.x - second.x
  const dy = first.y - second.y
  return dx * dx + dy * dy
}

export function encodeCellRanges(cells) {
  if (!cells?.length) return []
  const ordered = [...new Set(cells)].sort((first, second) => first - second)
  const ranges = []
  let start = ordered[0]
  let previous = start
  for (let index = 1; index < ordered.length; index += 1) {
    const cell = ordered[index]
    if (cell === previous + 1) {
      previous = cell
      continue
    }
    ranges.push(start, previous - start + 1)
    start = cell
    previous = cell
  }
  ranges.push(start, previous - start + 1)
  return ranges
}

export function encodeOwnershipRle(owners) {
  if (owners.length === 0) return []
  const encoded = []
  let value = owners[0]
  let count = 1
  for (let index = 1; index < owners.length; index += 1) {
    if (owners[index] === value) {
      count += 1
      continue
    }
    encoded.push(value, count)
    value = owners[index]
    count = 1
  }
  encoded.push(value, count)
  return encoded
}

export class PaperArena {
  constructor(id, {
    random = Math.random,
    gridSize = PAPER_GRID_SIZE,
    cellSize = PAPER_CELL_SIZE,
    maxPlayers = PAPER_MAX_PLAYERS,
  } = {}) {
    this.id = id
    this.random = random
    this.gridSize = gridSize
    this.cellSize = cellSize
    this.worldSize = gridSize * cellSize
    this.maxPlayers = maxPlayers
    this.owners = new Uint16Array(gridSize * gridSize)
    this.territoryCounts = new Map()
    this.players = new Map()
    this.nextSlot = 1
    this.revision = 0
    this.pendingPatches = []
  }

  humanPlayerCount() {
    let count = 0
    for (const player of this.players.values()) {
      if (!player.isBot) count += 1
    }
    return count
  }

  cellIndex(column, row) {
    if (column < 0 || row < 0 || column >= this.gridSize || row >= this.gridSize) return -1
    return row * this.gridSize + column
  }

  cellAt(x, y) {
    return this.cellIndex(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize))
  }

  cellCenter(index) {
    return {
      x: (index % this.gridSize + 0.5) * this.cellSize,
      y: (Math.floor(index / this.gridSize) + 0.5) * this.cellSize,
    }
  }

  notePatch(owner, cells) {
    const ranges = encodeCellRanges(cells)
    if (ranges.length === 0) return
    this.revision += 1
    this.pendingPatches.push({ revision: this.revision, owner, ranges })
  }

  takePatches() {
    const patches = this.pendingPatches
    this.pendingPatches = []
    return patches
  }

  setOwner(cells, owner, record = true) {
    const changed = []
    for (const cell of cells) {
      if (cell < 0 || cell >= this.owners.length) continue
      const previous = this.owners[cell]
      if (previous === owner) continue
      if (previous > 0) {
        this.territoryCounts.set(previous, Math.max(0, (this.territoryCounts.get(previous) ?? 0) - 1))
      }
      this.owners[cell] = owner
      if (owner > 0) this.territoryCounts.set(owner, (this.territoryCounts.get(owner) ?? 0) + 1)
      changed.push(cell)
    }
    if (record) this.notePatch(owner, changed)
    return changed
  }

  clearTerritory(slot, record = true) {
    const cells = []
    for (let index = 0; index < this.owners.length; index += 1) {
      if (this.owners[index] === slot) cells.push(index)
    }
    this.setOwner(cells, 0, record)
    this.territoryCounts.set(slot, 0)
    return cells
  }

  territoryScore(player) {
    const cells = this.territoryCounts.get(player.slot) ?? 0
    return Math.round((cells / this.owners.length) * 1_000) / 10
  }

  spawnIsSafe(cell, playerId) {
    if (cell < 0 || this.owners[cell] !== 0) return false
    const point = this.cellCenter(cell)
    const minimumDistanceSquared = (this.cellSize * 10) ** 2
    return [...this.players.values()].every((player) => (
      player.id === playerId || !player.alive || distanceSquared(point, player) >= minimumDistanceSquared
    ))
  }

  findSpawn(player) {
    const available = this.gridSize - SPAWN_EDGE_MARGIN_CELLS * 2
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const column = SPAWN_EDGE_MARGIN_CELLS + Math.floor(this.random() * available)
      const row = SPAWN_EDGE_MARGIN_CELLS + Math.floor(this.random() * available)
      const cell = this.cellIndex(column, row)
      if (this.spawnIsSafe(cell, player.id)) return cell
    }

    const searchOffset = player.slot * 17
    for (let offset = 0; offset < this.owners.length; offset += 1) {
      const cell = (searchOffset + offset * 37) % this.owners.length
      const column = cell % this.gridSize
      const row = Math.floor(cell / this.gridSize)
      if (
        column >= SPAWN_EDGE_MARGIN_CELLS
        && row >= SPAWN_EDGE_MARGIN_CELLS
        && column < this.gridSize - SPAWN_EDGE_MARGIN_CELLS
        && row < this.gridSize - SPAWN_EDGE_MARGIN_CELLS
        && this.spawnIsSafe(cell, player.id)
      ) return cell
    }
    return this.cellIndex(Math.floor(this.gridSize / 2), Math.floor(this.gridSize / 2))
  }

  baseCells(centerCell) {
    const centerColumn = centerCell % this.gridSize
    const centerRow = Math.floor(centerCell / this.gridSize)
    const cells = []
    for (let y = -SPAWN_RADIUS_CELLS; y <= SPAWN_RADIUS_CELLS; y += 1) {
      for (let x = -SPAWN_RADIUS_CELLS; x <= SPAWN_RADIUS_CELLS; x += 1) {
        if (x * x + y * y > (SPAWN_RADIUS_CELLS + 0.25) ** 2) continue
        const cell = this.cellIndex(centerColumn + x, centerRow + y)
        if (cell >= 0) cells.push(cell)
      }
    }
    return cells
  }

  spawnPlayer(player) {
    this.clearTerritory(player.slot)
    const spawnCell = this.findSpawn(player)
    const point = this.cellCenter(spawnCell)
    this.setOwner(this.baseCells(spawnCell), player.slot)
    player.x = point.x
    player.y = point.y
    player.angle = this.random() * TAU
    player.targetAngle = player.angle
    player.alive = true
    player.trail = []
    player.trailSet = new Set()
    player.lastCell = spawnCell
    player.kills = 0
    player.respawnIn = 0
    player.botThinkIn = 0
    player.botTargetTrail = 8
    return player
  }

  addPlayer({ id, name, avatar, color, isBot = false }) {
    const existing = this.players.get(id)
    if (existing) return existing
    const slot = this.nextSlot
    this.nextSlot += 1
    const player = {
      id,
      slot,
      name: cleanText(name, 'لاعب', 24),
      avatar: cleanText(avatar, '🎮', 8),
      color: color || PLAYER_COLORS[(slot - 1) % PLAYER_COLORS.length],
      isBot: Boolean(isBot),
      alive: false,
      x: 0,
      y: 0,
      angle: 0,
      targetAngle: 0,
      trail: [],
      trailSet: new Set(),
      lastCell: -1,
      kills: 0,
      lastInputSeq: 0,
      respawnIn: 0,
      botThinkIn: 0,
      botTargetTrail: 8,
    }
    this.players.set(id, player)
    return this.spawnPlayer(player)
  }

  addBots(count = PAPER_BOT_COUNT) {
    const safeCount = clamp(Math.floor(Number(count) || 0), 0, BOT_PROFILES.length)
    for (let index = 0; index < safeCount; index += 1) {
      const profile = BOT_PROFILES[index]
      const id = `paper-bot-${this.id}-${index + 1}`
      if (!this.players.has(id)) this.addPlayer({ id, ...profile, isBot: true })
    }
    return safeCount
  }

  removePlayer(id) {
    const player = this.players.get(id)
    if (!player) return false
    this.clearTerritory(player.slot)
    this.players.delete(id)
    return true
  }

  steer(id, angle, sequence = 0) {
    const player = this.players.get(id)
    if (!player?.alive || !Number.isFinite(angle)) return false
    player.targetAngle = Math.atan2(Math.sin(angle), Math.cos(angle))
    const numericSequence = Number(sequence)
    if (Number.isFinite(numericSequence)) player.lastInputSeq = Math.max(player.lastInputSeq, Math.floor(numericSequence))
    return true
  }

  respawn(id) {
    const player = this.players.get(id)
    if (!player || player.alive) return null
    return this.spawnPlayer(player)
  }

  nearestOwnedCell(player) {
    let closest = -1
    let closestDistance = Number.POSITIVE_INFINITY
    for (let cell = 0; cell < this.owners.length; cell += 1) {
      if (this.owners[cell] !== player.slot) continue
      const point = this.cellCenter(cell)
      const candidate = distanceSquared(player, point)
      if (candidate < closestDistance) {
        closestDistance = candidate
        closest = cell
      }
    }
    return closest
  }

  updateBotSteering(player, dt) {
    player.botThinkIn -= dt
    if (player.botThinkIn > 0) return
    player.botThinkIn = 0.22 + this.random() * 0.28

    const cell = this.cellAt(player.x, player.y)
    const inside = cell >= 0 && this.owners[cell] === player.slot
    const edgeMargin = this.cellSize * 5
    if (
      player.x < edgeMargin
      || player.y < edgeMargin
      || player.x > this.worldSize - edgeMargin
      || player.y > this.worldSize - edgeMargin
    ) {
      player.targetAngle = Math.atan2(this.worldSize / 2 - player.y, this.worldSize / 2 - player.x)
      return
    }

    if (!inside && player.trail.length >= player.botTargetTrail) {
      const home = this.nearestOwnedCell(player)
      if (home >= 0) {
        const point = this.cellCenter(home)
        player.targetAngle = Math.atan2(point.y - player.y, point.x - player.x)
        return
      }
    }

    if (inside && player.trail.length === 0) {
      player.botTargetTrail = 7 + Math.floor(this.random() * 18)
      player.targetAngle += (this.random() - 0.5) * 1.7
      return
    }

    if (this.random() < 0.28) player.targetAngle += (this.random() - 0.5) * 0.7
  }

  captureLoop(player) {
    if (player.trail.length === 0) return []
    const blocked = new Uint8Array(this.owners.length)
    for (let index = 0; index < this.owners.length; index += 1) {
      if (this.owners[index] === player.slot) blocked[index] = 1
    }
    for (const cell of player.trail) blocked[cell] = 1

    const reachable = new Uint8Array(this.owners.length)
    const queue = new Int32Array(this.owners.length)
    let head = 0
    let tail = 0
    const enqueue = (cell) => {
      if (cell < 0 || blocked[cell] || reachable[cell]) return
      reachable[cell] = 1
      queue[tail] = cell
      tail += 1
    }

    for (let column = 0; column < this.gridSize; column += 1) {
      enqueue(this.cellIndex(column, 0))
      enqueue(this.cellIndex(column, this.gridSize - 1))
    }
    for (let row = 1; row < this.gridSize - 1; row += 1) {
      enqueue(this.cellIndex(0, row))
      enqueue(this.cellIndex(this.gridSize - 1, row))
    }

    while (head < tail) {
      const cell = queue[head]
      head += 1
      const column = cell % this.gridSize
      const row = Math.floor(cell / this.gridSize)
      if (column > 0) enqueue(cell - 1)
      if (column + 1 < this.gridSize) enqueue(cell + 1)
      if (row > 0) enqueue(cell - this.gridSize)
      if (row + 1 < this.gridSize) enqueue(cell + this.gridSize)
    }

    const captured = [...player.trail]
    for (let cell = 0; cell < this.owners.length; cell += 1) {
      if (!blocked[cell] && !reachable[cell]) captured.push(cell)
    }
    const changed = this.setOwner(captured, player.slot)
    player.trail = []
    player.trailSet.clear()
    return changed
  }

  killPlayer(player, killerId = null) {
    if (!player.alive) return null
    const score = this.territoryScore(player)
    player.alive = false
    player.trail = []
    player.trailSet.clear()
    this.clearTerritory(player.slot)
    if (player.isBot) {
      player.respawnIn = BOT_RESPAWN_MIN_SECONDS + this.random() * BOT_RESPAWN_VARIANCE_SECONDS
    }
    const killer = killerId ? this.players.get(killerId) : null
    if (killer?.alive && killer.id !== player.id) killer.kills += 1
    return { id: player.id, score, killerId }
  }

  tick(dtSeconds) {
    const dt = clamp(Number(dtSeconds) || 0, 0, 0.1)
    if (dt <= 0) return []
    const alivePlayers = [...this.players.values()]
    for (const player of alivePlayers) {
      if (!player.isBot || player.alive) continue
      player.respawnIn -= dt
      if (player.respawnIn <= 0) this.spawnPlayer(player)
    }

    const selfDeaths = new Set()
    const boundaryDeaths = new Set()
    const captureCandidates = new Set()
    for (const player of this.players.values()) {
      if (!player.alive) continue
      if (player.isBot) this.updateBotSteering(player, dt)
      const turn = clamp(angleDifference(player.angle, player.targetAngle), -PAPER_TURN_RATE * dt, PAPER_TURN_RATE * dt)
      player.angle += turn
      player.x += Math.cos(player.angle) * PAPER_SPEED * dt
      player.y += Math.sin(player.angle) * PAPER_SPEED * dt

      const cell = this.cellAt(player.x, player.y)
      if (cell < 0) {
        boundaryDeaths.add(player.id)
        continue
      }
      if (cell === player.lastCell) continue
      player.lastCell = cell

      if (this.owners[cell] === player.slot) {
        if (player.trail.length > 0) captureCandidates.add(player.id)
        continue
      }
      if (player.trailSet.has(cell)) {
        selfDeaths.add(player.id)
        continue
      }
      player.trail.push(cell)
      player.trailSet.add(cell)
      if (player.trail.length > MAX_TRAIL_CELLS) selfDeaths.add(player.id)
    }

    const cutters = new Map()
    const trailOwners = new Map()
    const headOwners = new Map()
    for (const player of this.players.values()) {
      if (!player.alive) continue
      for (const cell of player.trail) {
        const owners = trailOwners.get(cell)
        if (owners) owners.push(player.id)
        else trailOwners.set(cell, [player.id])
      }
      const headCell = this.cellAt(player.x, player.y)
      if (headCell >= 0) {
        const heads = headOwners.get(headCell)
        if (heads) heads.push(player.id)
        else headOwners.set(headCell, [player.id])
      }
    }

    for (const player of this.players.values()) {
      if (!player.alive) continue
      const headCell = this.cellAt(player.x, player.y)
      for (const ownerId of trailOwners.get(headCell) ?? []) {
        if (ownerId !== player.id) cutters.set(ownerId, player.id)
      }
    }
    for (const ids of headOwners.values()) {
      if (ids.length < 2) continue
      for (const id of ids) selfDeaths.add(id)
    }

    const deaths = []
    const deathIds = new Set([...boundaryDeaths, ...selfDeaths, ...cutters.keys()])
    for (const id of deathIds) {
      const player = this.players.get(id)
      const death = player ? this.killPlayer(player, cutters.get(id) ?? null) : null
      if (death) deaths.push(death)
    }

    for (const id of captureCandidates) {
      const player = this.players.get(id)
      if (player?.alive) this.captureLoop(player)
    }
    return deaths
  }

  snapshot(now = Date.now(), includeOwnership = false, patches = []) {
    const snapshot = {
      type: 'paper_public_snapshot',
      arenaId: this.id,
      serverTime: now,
      gridSize: this.gridSize,
      cellSize: this.cellSize,
      worldSize: this.worldSize,
      speed: PAPER_SPEED,
      turnRate: PAPER_TURN_RATE,
      revision: this.revision,
      players: [...this.players.values()].map((player) => ({
        id: player.id,
        slot: player.slot,
        name: player.name,
        avatar: player.avatar,
        color: player.color,
        isBot: player.isBot,
        alive: player.alive,
        x: Math.round(player.x * 10) / 10,
        y: Math.round(player.y * 10) / 10,
        angle: Math.round(player.angle * 10_000) / 10_000,
        targetAngle: Math.round(player.targetAngle * 10_000) / 10_000,
        trail: player.trail,
        score: this.territoryScore(player),
        territoryCells: this.territoryCounts.get(player.slot) ?? 0,
        kills: player.kills,
        lastInputSeq: player.lastInputSeq,
      })),
    }
    if (includeOwnership) snapshot.ownerRle = encodeOwnershipRle(this.owners)
    if (patches.length > 0) snapshot.patches = patches
    return snapshot
  }
}

export class PaperArenaManager {
  constructor({
    send,
    random = Math.random,
    now = Date.now,
    maxPlayers = PAPER_MAX_PLAYERS,
    botCount = PAPER_BOT_COUNT,
  } = {}) {
    this.send = send
    this.random = random
    this.now = now
    this.maxPlayers = maxPlayers
    this.botCount = botCount
    this.arenas = new Map()
    this.memberships = new WeakMap()
    this.sockets = new Set()
    this.nextArenaId = 1
    this.nextPlayerId = 1
  }

  findArena() {
    const available = [...this.arenas.values()].find((arena) => arena.humanPlayerCount() < arena.maxPlayers)
    if (available) return available
    const arena = new PaperArena(`public-${this.nextArenaId}`, {
      random: this.random,
      maxPlayers: this.maxPlayers,
    })
    arena.addBots(this.botCount)
    this.nextArenaId += 1
    this.arenas.set(arena.id, arena)
    return arena
  }

  join(socket, profile = {}) {
    this.leave(socket)
    const arena = this.findArena()
    const playerId = `paper-${this.nextPlayerId}`
    this.nextPlayerId += 1
    const player = arena.addPlayer({
      id: playerId,
      name: profile.name,
      avatar: profile.avatar,
    })
    this.memberships.set(socket, { arenaId: arena.id, playerId })
    this.send(socket, {
      type: 'paper_public_joined',
      arenaId: arena.id,
      playerId,
      worldSize: arena.worldSize,
      gridSize: arena.gridSize,
      cellSize: arena.cellSize,
      playerCount: arena.players.size,
    })
    this.send(socket, arena.snapshot(this.now(), true))
    this.broadcastCount(arena)
    return player
  }

  steer(socket, angle, sequence) {
    const membership = this.memberships.get(socket)
    if (!membership) return false
    return this.arenas.get(membership.arenaId)?.steer(membership.playerId, Number(angle), sequence) ?? false
  }

  respawn(socket) {
    const membership = this.memberships.get(socket)
    if (!membership) return false
    const arena = this.arenas.get(membership.arenaId)
    const player = arena?.respawn(membership.playerId)
    if (!arena || !player) return false
    this.send(socket, { type: 'paper_public_respawned', playerId: player.id })
    this.send(socket, arena.snapshot(this.now(), true))
    return true
  }

  sync(socket) {
    const membership = this.memberships.get(socket)
    if (!membership) return false
    const arena = this.arenas.get(membership.arenaId)
    if (!arena) return false
    this.send(socket, arena.snapshot(this.now(), true))
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

  has(socket) {
    return this.memberships.has(socket)
  }

  tick(dtSeconds = PAPER_TICK_MS / 1_000) {
    for (const arena of this.arenas.values()) {
      const deaths = arena.tick(dtSeconds)
      for (const death of deaths) {
        for (const [socket, membership] of this.members(arena.id)) {
          if (membership.playerId !== death.id) continue
          this.send(socket, {
            type: 'paper_public_dead',
            score: death.score,
            killerId: death.killerId,
          })
          break
        }
      }
    }
  }

  broadcastSnapshots() {
    const now = this.now()
    for (const arena of this.arenas.values()) {
      const members = [...this.members(arena.id)]
      if (members.length === 0) continue
      const snapshot = arena.snapshot(now, false, arena.takePatches())
      for (const [socket] of members) this.send(socket, snapshot)
    }
  }

  broadcastCount(arena) {
    const message = { type: 'paper_public_count', arenaId: arena.id, playerCount: arena.players.size }
    for (const [socket] of this.members(arena.id)) this.send(socket, message)
  }

  *members(arenaId) {
    for (const socket of this.sockets) {
      const membership = this.memberships.get(socket)
      if (membership?.arenaId === arenaId) yield [socket, membership]
    }
  }

  track(socket) {
    this.sockets.add(socket)
  }

  untrack(socket) {
    this.leave(socket)
    this.sockets.delete(socket)
  }
}
