import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeCompactPaperPlayers,
  decodeCompactSnakeFoods,
  decodeCompactSnakePlayers,
  decodeCompactTerritoryPatches,
} from '../src/games/online/realtimeProtocol.ts'

test('compact snake snapshots restore precise player and food fields', () => {
  const players = decodeCompactSnakePlayers([
    ['snake-1', 'Nour', '🐍', 213, 9, 1735, 1025, 1275, 0, 1, 31416, [120, 240, 115, 238]],
  ])
  const foods = decodeCompactSnakeFoods([
    [4, 510, 720, 38, 65, 2, 1],
  ])

  assert.deepEqual(players[0], {
    id: 'snake-1',
    name: 'Nour',
    avatar: '🐍',
    hue: 213,
    score: 9,
    length: 173.5,
    bodyRadius: 10.25,
    headRadius: 12.75,
    isBot: false,
    alive: true,
    angle: 3.1416,
    trail: [{ x: 120, y: 240 }, { x: 115, y: 238 }],
  })
  assert.equal(foods[0].source, 'remains')
  assert.equal(foods[0].radius, 6.5)
})

test('compact paper snapshots restore players and territory patches', () => {
  const players = decodeCompactPaperPlayers([
    ['paper-2', 2, 'Mona', '🟪', '#a855f7', 1, 1, 2255, 3105, 15708, 16200, [45, 1], 33, 27, 4, 18],
  ])
  const patches = decodeCompactTerritoryPatches([
    [8, 2, [45, 2, 61, 3]],
  ])

  assert.equal(players[0].x, 225.5)
  assert.equal(players[0].angle, 1.5708)
  assert.deepEqual(players[0].trail, [45, 46])
  assert.deepEqual(patches[0], { revision: 8, owner: 2, ranges: [45, 2, 61, 3] })
})

test('compact decoders safely ignore malformed rows', () => {
  assert.deepEqual(decodeCompactSnakePlayers([null, ['short']]), [])
  assert.deepEqual(decodeCompactSnakeFoods('bad'), [])
  assert.deepEqual(decodeCompactPaperPlayers([{}]), [])
  assert.deepEqual(decodeCompactTerritoryPatches(undefined), [])
})
