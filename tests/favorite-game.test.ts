import assert from 'node:assert/strict'
import test from 'node:test'
import { selectFavoriteGame } from '../src/lib/favoriteGame.ts'

const games = [
  { id: 'tictactoe', name: 'XO' },
  { id: 'memory', name: 'Memory' },
  { id: 'chess', name: 'Chess' },
]

test('favorite game appears only after more than ten plays', () => {
  assert.equal(selectFavoriteGame(games, { memory: { played: 10, won: 4 } }), null)
  assert.deepEqual(
    selectFavoriteGame(games, { memory: { played: 11, won: 4 } }),
    { game: games[1], played: 11 },
  )
})

test('favorite game is personal and selects the highest local play count', () => {
  assert.deepEqual(
    selectFavoriteGame(games, {
      tictactoe: { played: 12, won: 3 },
      memory: { played: 27, won: 8 },
      chess: { played: 16, won: 5 },
    }),
    { game: games[1], played: 27 },
  )
})

test('favorite selection is stable for ties and ignores unregistered games', () => {
  assert.deepEqual(
    selectFavoriteGame(games, {
      memory: { played: 15, won: 2 },
      chess: { played: 15, won: 2 },
      unknown: { played: 999, won: 999 },
    }),
    { game: games[1], played: 15 },
  )
})
