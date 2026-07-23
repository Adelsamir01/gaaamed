import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PAPER_BOT_COUNT,
  PAPER_SPEED,
  PaperArena,
  PaperArenaManager,
  encodeCellRanges,
  encodeOwnershipRle,
} from './paper-arena.js'

test('cell ranges and ownership use compact deterministic encodings', () => {
  assert.deepEqual(encodeCellRanges([8, 3, 4, 5, 8, 12]), [3, 3, 8, 1, 12, 1])
  assert.deepEqual(encodeOwnershipRle(Uint16Array.from([0, 0, 2, 2, 2, 1])), [0, 2, 2, 3, 1, 1])
})

test('public paper arena accepts players, adds bots, and sends one full grid on join', () => {
  const sent = []
  const manager = new PaperArenaManager({
    send: (socket, message) => sent.push({ socket, message }),
    random: () => 0.42,
  })
  const socket = {}
  manager.track(socket)
  manager.join(socket, { name: 'ليلى', avatar: '🎨' })

  const arena = [...manager.arenas.values()][0]
  assert.equal(arena.humanPlayerCount(), 1)
  assert.equal(arena.players.size, 1 + PAPER_BOT_COUNT)
  assert.ok(sent.some(({ message }) => message.type === 'paper_public_joined'))
  const snapshot = sent.find(({ message }) => message.type === 'paper_public_snapshot')?.message
  assert.ok(snapshot.ownerRle.length > 0)
  assert.equal(snapshot.players.length, 1 + PAPER_BOT_COUNT)
})

test('server owns movement, acknowledges inputs, and limits turn speed', () => {
  const arena = new PaperArena('movement', { random: () => 0.3, gridSize: 28, cellSize: 20 })
  const player = arena.addPlayer({ id: 'one', name: 'One' })
  const startX = player.x
  const startY = player.y
  const startAngle = player.angle
  arena.steer(player.id, startAngle + Math.PI, 7)
  arena.tick(0.05)

  assert.ok(Math.hypot(player.x - startX, player.y - startY) > 0)
  assert.ok(Math.abs(player.angle - startAngle) <= 7.4 * 0.05 + 0.0001)
  assert.equal(player.lastInputSeq, 7)
  assert.equal(arena.steer(player.id, Number.NaN), false)
  assert.equal(PAPER_SPEED, 150)
})

test('closing a loop claims its trail and enclosed territory', () => {
  const arena = new PaperArena('capture', { random: () => 0.5, gridSize: 16, cellSize: 10 })
  const player = arena.addPlayer({ id: 'one', name: 'One' })
  arena.owners.fill(0)
  arena.territoryCounts.set(player.slot, 0)

  const boundary = []
  for (let column = 4; column <= 8; column += 1) {
    boundary.push(arena.cellIndex(column, 4), arena.cellIndex(column, 8))
  }
  for (let row = 5; row < 8; row += 1) {
    boundary.push(arena.cellIndex(4, row), arena.cellIndex(8, row))
  }
  arena.setOwner(boundary, player.slot, false)
  player.trail = [
    arena.cellIndex(5, 4),
    arena.cellIndex(6, 4),
    arena.cellIndex(7, 4),
  ]
  player.trailSet = new Set(player.trail)

  const changed = arena.captureLoop(player)

  assert.equal(player.trail.length, 0)
  assert.ok(changed.includes(arena.cellIndex(6, 6)))
  assert.equal(arena.owners[arena.cellIndex(6, 6)], player.slot)
  assert.ok(arena.territoryScore(player) > 0)
})

test('crossing an exposed opponent trail eliminates that opponent', () => {
  const arena = new PaperArena('cut', { random: () => 0.4, gridSize: 32, cellSize: 20 })
  const first = arena.addPlayer({ id: 'first', name: 'First' })
  const second = arena.addPlayer({ id: 'second', name: 'Second' })
  const targetCell = arena.cellIndex(16, 16)
  const targetPoint = arena.cellCenter(targetCell)
  first.trail = [targetCell]
  first.trailSet = new Set(first.trail)
  first.x = targetPoint.x - PAPER_SPEED * 0.05
  first.y = targetPoint.y + 80
  first.angle = 0
  first.targetAngle = 0
  first.lastCell = arena.cellAt(first.x, first.y)
  second.x = targetPoint.x - PAPER_SPEED * 0.05
  second.y = targetPoint.y
  second.angle = 0
  second.targetAngle = 0
  second.lastCell = arena.cellAt(second.x, second.y)

  const deaths = arena.tick(0.05)

  assert.ok(deaths.some(({ id, killerId }) => id === first.id && killerId === second.id))
  assert.equal(first.alive, false)
  assert.equal(second.alive, true)
})

test('regular broadcasts send territory patches instead of the full ownership grid', () => {
  const sent = []
  const manager = new PaperArenaManager({
    send: (socket, message) => sent.push({ socket, message }),
    random: () => 0.37,
    botCount: 0,
  })
  const socket = {}
  manager.track(socket)
  const player = manager.join(socket, { name: 'Player' })
  const arena = [...manager.arenas.values()][0]

  sent.length = 0
  arena.setOwner([arena.cellIndex(10, 10), arena.cellIndex(11, 10)], player.slot)
  manager.broadcastSnapshots()

  const snapshot = sent.find(({ message }) => message.type === 'paper_public_snapshot')?.message
  assert.equal('ownerRle' in snapshot, false)
  assert.ok(snapshot.patches.length > 0)
  assert.ok(JSON.stringify(snapshot).length < 12_000)
})

test('a full 20-character arena remains below the WebSocket payload budget', () => {
  const arena = new PaperArena('capacity', { random: () => 0.43 })
  arena.addBots(6)
  for (let index = 0; index < 14; index += 1) {
    arena.addPlayer({ id: `human-${index}`, name: `Player ${index}` })
  }
  for (const player of arena.players.values()) {
    player.trail = Array.from({ length: 420 }, (_, index) => (player.slot * 431 + index * 17) % arena.owners.length)
  }

  const fullBytes = Buffer.byteLength(JSON.stringify(arena.snapshot(Date.now(), true)))
  const regularBytes = Buffer.byteLength(JSON.stringify(arena.snapshot(Date.now(), false)))

  assert.ok(fullBytes < 128 * 1024, `full snapshot was ${fullBytes} bytes`)
  assert.ok(regularBytes < 96 * 1024, `regular snapshot was ${regularBytes} bytes`)
})

test('snapshot version 3 reduces paper arena payload without losing full ownership state', () => {
  const arena = new PaperArena('compact', { random: () => 0.43 })
  arena.addBots(6)
  for (let index = 0; index < 14; index += 1) {
    const player = arena.addPlayer({ id: `human-${index}`, name: `Player ${index}` })
    player.trail = Array.from({ length: 240 }, (_, cell) => (player.slot * 431 + cell * 17) % arena.owners.length)
  }

  const legacyBytes = Buffer.byteLength(JSON.stringify(arena.snapshot(Date.now(), true)))
  const compact = arena.compactSnapshot(Date.now(), true)
  const compactBytes = Buffer.byteLength(JSON.stringify(compact))

  assert.ok(Array.isArray(compact.o) && compact.o.length > 0)
  assert.ok(compactBytes < legacyBytes * 0.78, `compact=${compactBytes}, legacy=${legacyBytes}`)
})

test('dead players respawn and an empty human arena is destroyed', () => {
  const manager = new PaperArenaManager({ send: () => {}, random: () => 0.31, botCount: 2 })
  const socket = {}
  manager.track(socket)
  const player = manager.join(socket, { name: 'Player' })
  const arena = [...manager.arenas.values()][0]
  arena.killPlayer(player)

  assert.equal(manager.respawn(socket), true)
  assert.equal(player.alive, true)
  assert.equal(manager.leave(socket), true)
  assert.equal(manager.arenas.size, 0)
})
