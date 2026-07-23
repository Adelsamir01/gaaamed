import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SnakeArena,
  SnakeArenaManager,
  SNAKE_ARENA_RADIUS,
  SNAKE_BASE_SPEED,
  SNAKE_BOT_COUNT,
  SNAKE_FOOD_COUNT,
  SNAKE_WORLD_SIZE,
  snakeBodyRadius,
  snakeHeadRadius,
} from './snake-arena.js'

function sequenceRandom(values) {
  let index = 0
  return () => values[index++ % values.length]
}

test('public arena accepts random players and broadcasts their shared player count', () => {
  const sent = []
  const manager = new SnakeArenaManager({ send: (socket, message) => sent.push({ socket, message }), random: () => 0.4 })
  const first = {}
  const second = {}
  manager.track(first)
  manager.track(second)
  manager.join(first, { name: 'أحمد', avatar: '😎' })
  manager.join(second, { name: 'سارة', avatar: '🎮' })

  assert.equal(manager.arenas.size, 1)
  assert.equal([...manager.arenas.values()][0].humanPlayerCount(), 2)
  assert.equal([...manager.arenas.values()][0].players.size, 2 + SNAKE_BOT_COUNT)
  assert.ok(sent.some(({ socket, message }) => socket === second && message.type === 'snake_public_joined'))
  assert.ok(sent.some(({ message }) => message.type === 'snake_public_count' && message.playerCount === 2 + SNAKE_BOT_COUNT))
})

test('bot snakes populate every public arena without consuming human slots', () => {
  const manager = new SnakeArenaManager({ send: () => {}, random: () => 0.4, maxPlayers: 1, botCount: 3 })
  const first = {}
  const second = {}
  manager.track(first)
  manager.track(second)
  manager.join(first, { name: 'First' })
  manager.join(second, { name: 'Second' })

  assert.equal(manager.arenas.size, 2)
  for (const arena of manager.arenas.values()) {
    assert.equal(arena.humanPlayerCount(), 1)
    assert.equal([...arena.players.values()].filter((player) => player.isBot).length, 3)
    assert.equal(arena.snapshot().players.filter((player) => player.isBot).length, 3)
  }
})

test('server owns movement and limits steering turn speed', () => {
  const arena = new SnakeArena('test', { random: () => 0.5 })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🎮', hue: 100 })
  const start = { ...player.trail[0] }
  const startAngle = player.angle
  arena.steer('p1', startAngle + Math.PI)
  arena.tick(0.05)

  assert.notDeepEqual(player.trail[0], start)
  assert.ok(Math.abs(player.angle - startAngle) <= 6.2 * 0.05 + 0.0001)
  assert.equal(arena.steer('p1', Number.NaN), false)
})

test('food collection awards points and growth based on food size', () => {
  const arena = new SnakeArena('test', { random: sequenceRandom([0.5, 0.5, 0.25, 0.75]) })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🎮', hue: 100 })
  const head = player.trail[0]
  arena.foods = [{ id: 0, x: head.x, y: head.y, hue: 40, radius: 11, value: 5, source: 'arena' }]
  const startLength = player.length
  arena.tick(0.01)

  assert.equal(player.score, 5)
  assert.equal(player.length, startLength + 45)
  assert.equal(arena.foods.length, 1)
  assert.ok(snakeBodyRadius(player.length) > snakeBodyRadius(startLength))
  assert.ok(snakeHeadRadius(player.length) > snakeHeadRadius(startLength))
  const snapshotPlayer = arena.snapshot().players.find(({ id }) => id === player.id)
  assert.equal(snapshotPlayer.length, player.length)
  assert.ok(snapshotPlayer.bodyRadius > 8.5)
})

test('bot snakes steer toward food, move, and automatically respawn after a crash', () => {
  const arena = new SnakeArena('bots', { random: () => 0.5 })
  arena.addBots(1)
  const bot = [...arena.players.values()][0]
  const head = { ...bot.trail[0] }
  arena.foods = [{ id: 99, x: head.x, y: head.y + 200, hue: 40, radius: 8, value: 3, source: 'arena' }]
  bot.botThinkIn = 0
  arena.tick(0.05)

  assert.notDeepEqual(bot.trail[0], head)
  assert.notEqual(bot.targetAngle, bot.angle)

  bot.alive = false
  bot.respawnIn = 0.01
  arena.tick(0.05)
  assert.equal(bot.alive, true)
  assert.equal(bot.score, 0)
})

test('arena has more food with visibly different sizes and point values', () => {
  const arena = new SnakeArena('test', { random: () => 0.25 })
  assert.equal(arena.foods.length, SNAKE_FOOD_COUNT)
  assert.ok(new Set(arena.foods.map((food) => food.radius)).size >= 5)
  assert.deepEqual([...new Set(arena.foods.map((food) => food.value))].sort(), [1, 2, 3, 5])
  const center = { x: SNAKE_WORLD_SIZE / 2, y: SNAKE_WORLD_SIZE / 2 }
  assert.ok(arena.foods.every((food) => Math.hypot(food.x - center.x, food.y - center.y) < SNAKE_ARENA_RADIUS))
})

test('the permanent movement speed is fast without a boost state', () => {
  const arena = new SnakeArena('test', { random: () => 0.5 })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🎮', hue: 100 })
  arena.foods = []
  player.angle = 0
  player.targetAngle = 0
  const startX = player.trail[0].x
  arena.tick(0.05)

  assert.ok(SNAKE_BASE_SPEED >= 120)
  assert.ok(Math.abs((player.trail[0].x - startX) - SNAKE_BASE_SPEED * 0.05) < 0.001)
  assert.equal('boosting' in player, false)
})

test('fast snakes spawn deep enough inside the arena to react before reaching the wall', () => {
  const arena = new SnakeArena('test', { random: sequenceRandom([0, 0.999_999]) })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🎮', hue: 100 })
  const center = { x: SNAKE_WORLD_SIZE / 2, y: SNAKE_WORLD_SIZE / 2 }
  const distanceFromWall = SNAKE_ARENA_RADIUS - Math.hypot(player.trail[0].x - center.x, player.trail[0].y - center.y)

  assert.ok(distanceFromWall >= 719)
  assert.ok(distanceFromWall / SNAKE_BASE_SPEED > 5.5)
})

test('a snake can cross its own body without dying', () => {
  const arena = new SnakeArena('test', { random: () => 0.5 })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🐍', hue: 100 })
  arena.foods = []
  player.angle = 0
  player.targetAngle = 0
  player.length = 180
  player.trail = [
    { x: 1_000, y: 1_000 },
    { x: 995, y: 1_000 },
    { x: 990, y: 1_000 },
    { x: 985, y: 1_000 },
    { x: 980, y: 1_000 },
    { x: 975, y: 1_000 },
    { x: 970, y: 1_000 },
    { x: 965, y: 1_000 },
    { x: 960, y: 1_000 },
    { x: 955, y: 1_000 },
    { x: 950, y: 1_000 },
    { x: 945, y: 1_000 },
    { x: 940, y: 1_000 },
    { x: 1_004.5, y: 1_000 },
  ]

  assert.deepEqual(arena.tick(0.05), [])
  assert.equal(player.alive, true)
})

test('a snake dies on another snake body and becomes food', () => {
  const arena = new SnakeArena('test', { random: () => 0.5 })
  const first = arena.addPlayer({ id: 'p1', name: 'First', avatar: '🐍', hue: 100 })
  const second = arena.addPlayer({ id: 'p2', name: 'Second', avatar: '🎮', hue: 220 })
  arena.foods = []

  first.angle = 0
  first.targetAngle = 0
  first.length = 180
  first.trail = [
    { x: 1_000, y: 1_000 },
    { x: 995, y: 1_000 },
    { x: 1_004.5, y: 1_000 },
    { x: 970, y: 1_000 },
  ]
  second.angle = 0
  second.targetAngle = 0
  second.length = 240
  second.trail = [
    { x: 1_028, y: 1_000 },
    { x: 1_004.5, y: 1_000 },
    { x: 990, y: 1_000 },
  ]

  const deaths = arena.tick(0.05)

  assert.equal(first.alive, false)
  assert.equal(second.alive, true)
  assert.deepEqual(deaths.map((death) => death.id), ['p1'])
  assert.ok(arena.foods.length >= 7)
  assert.ok(arena.foods.every((food) => food.source === 'remains'))
  assert.ok(arena.foods.every((food) => food.hue === 100))
})

test('dead players can respawn and leaving removes them from the arena', () => {
  const sent = []
  const manager = new SnakeArenaManager({ send: (socket, message) => sent.push({ socket, message }), random: () => 0.5 })
  const socket = {}
  manager.track(socket)
  const player = manager.join(socket, { name: 'Player', avatar: '🎮' })
  player.alive = false
  player.score = 9

  assert.equal(manager.respawn(socket), true)
  assert.equal(player.alive, true)
  assert.equal(player.score, 0)
  assert.equal(manager.leave(socket), true)
  assert.equal(manager.arenas.size, 0)
})

test('the massive circular arena has a lethal outer boundary instead of wrapping', () => {
  const arena = new SnakeArena('test', { random: () => 0.5 })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🎮', hue: 100 })
  const center = SNAKE_WORLD_SIZE / 2
  player.trail = [
    { x: center + SNAKE_ARENA_RADIUS - 12, y: center },
    { x: center + SNAKE_ARENA_RADIUS - 17, y: center },
  ]
  player.angle = 0
  player.targetAngle = 0
  const deaths = arena.tick(0.05)

  assert.deepEqual(deaths.map((death) => death.id), ['p1'])
  assert.equal(player.alive, false)
  assert.ok(player.trail[0].x > center + SNAKE_ARENA_RADIUS - 12)
})

test('regular arena broadcasts send compact food patches after the initial full state', () => {
  const sent = []
  const manager = new SnakeArenaManager({
    send: (socket, message) => sent.push({ socket, message }),
    random: () => 0.5,
    botCount: 0,
  })
  const socket = {}
  const legacySocket = {}
  manager.track(socket)
  manager.track(legacySocket)
  const player = manager.join(socket, { name: 'Player', snapshotVersion: 2 })
  const arena = [...manager.arenas.values()][0]
  const legacyMembership = { arenaId: arena.id, playerId: 'legacy-observer', snapshotVersion: 1 }
  manager.memberships.set(legacySocket, legacyMembership)
  manager.arenaMembers.get(arena.id).set(legacySocket, legacyMembership)

  sent.length = 0
  manager.broadcastSnapshots()
  const full = sent.find(({ socket: target, message }) => target === socket && message.type === 'snake_public_snapshot')?.message
  assert.equal(full.foods.length, SNAKE_FOOD_COUNT)
  const legacyFull = sent.find(({ socket: target, message }) => target === legacySocket && message.type === 'snake_public_snapshot')?.message
  assert.equal(legacyFull.foods.length, SNAKE_FOOD_COUNT)

  sent.length = 0
  player.angle = 0
  player.targetAngle = 0
  const eaten = arena.foods[0]
  eaten.x = player.trail[0].x + SNAKE_BASE_SPEED * 0.05
  eaten.y = player.trail[0].y
  arena.tick(0.05)
  manager.broadcastSnapshots()

  const patch = sent.find(({ socket: target, message }) => target === socket && message.type === 'snake_public_snapshot')?.message
  assert.equal('foods' in patch, false)
  assert.deepEqual(patch.foodRemovedIds, [eaten.id])
  assert.equal(patch.foodUpserts.length, 1)
  const legacyUpdate = sent.find(({ socket: target, message }) => target === legacySocket && message.type === 'snake_public_snapshot')?.message
  assert.equal(legacyUpdate.foods.length, SNAKE_FOOD_COUNT)
  assert.equal('foodUpserts' in legacyUpdate, false)
})

test('long trails are bounded in network snapshots while preserving both ends', () => {
  const arena = new SnakeArena('snapshot', { random: () => 0.5 })
  const player = arena.addPlayer({ id: 'long', name: 'Long' })
  player.length = 3_000
  player.trail = Array.from({ length: 500 }, (_, index) => ({ x: 2_000 - index * 6, y: 2_000 }))

  const trail = arena.snapshot().players[0].trail
  assert.ok(trail.length <= 82)
  assert.deepEqual(trail[0], player.trail[0])
  assert.deepEqual(trail.at(-1), player.trail.at(-1))
})

test('snapshot version 3 is materially smaller while version 2 stays compatible', () => {
  const arena = new SnakeArena('compact', { random: () => 0.41 })
  arena.addBots(5)
  for (let index = 0; index < 18; index += 1) {
    const player = arena.addPlayer({ id: `human-${index}`, name: `Player ${index}` })
    player.length = 1_200
    player.trail = Array.from({ length: 180 }, (_, point) => ({
      x: 2_800 + index * 2 - point * 5.25,
      y: 2_800 + Math.sin(point / 8) * 40,
    }))
  }

  const legacyBytes = Buffer.byteLength(JSON.stringify(arena.snapshot(Date.now(), false)))
  const compactBytes = Buffer.byteLength(JSON.stringify(arena.compactSnapshot(Date.now(), false)))

  assert.ok(compactBytes < legacyBytes * 0.58, `compact=${compactBytes}, legacy=${legacyBytes}`)
})
