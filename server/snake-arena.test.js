import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SnakeArena,
  SnakeArenaManager,
  SNAKE_ARENA_RADIUS,
  SNAKE_BASE_SPEED,
  SNAKE_FOOD_COUNT,
  SNAKE_WORLD_SIZE,
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
  assert.equal([...manager.arenas.values()][0].players.size, 2)
  assert.ok(sent.some(({ socket, message }) => socket === second && message.type === 'snake_public_joined'))
  assert.ok(sent.some(({ message }) => message.type === 'snake_public_count' && message.playerCount === 2))
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
    { x: 1_020, y: 1_000 },
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
