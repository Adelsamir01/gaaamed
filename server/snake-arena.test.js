import assert from 'node:assert/strict'
import test from 'node:test'
import { SnakeArena, SnakeArenaManager, SNAKE_WORLD_SIZE } from './snake-arena.js'

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
  assert.ok(Math.abs(player.angle - startAngle) <= 5.4 * 0.05 + 0.0001)
  assert.equal(arena.steer('p1', Number.NaN), false)
})

test('food collection grows the server-side snake and increments score', () => {
  const arena = new SnakeArena('test', { random: sequenceRandom([0.5, 0.5, 0.25, 0.75]) })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🎮', hue: 100 })
  const head = player.trail[0]
  arena.foods[0] = { id: 0, x: head.x, y: head.y, hue: 40, radius: 8 }
  const startLength = player.length
  arena.tick(0.01)

  assert.equal(player.score, 1)
  assert.ok(player.length > startLength)
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

test('world positions wrap without exposing a visible arena border', () => {
  const arena = new SnakeArena('test', { random: () => 0.5 })
  const player = arena.addPlayer({ id: 'p1', name: 'Player', avatar: '🎮', hue: 100 })
  player.trail = [{ x: SNAKE_WORLD_SIZE - 1, y: 500 }, { x: SNAKE_WORLD_SIZE - 5, y: 500 }]
  player.angle = 0
  player.targetAngle = 0
  arena.tick(0.05)

  assert.ok(player.trail[0].x < 10)
  assert.equal(player.alive, true)
})
