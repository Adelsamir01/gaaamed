import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameResult } from '../src/types/index.ts'
import { recordGameResult, recordGameStarted } from '../src/store/gameStats.ts'

function result(overrides: Partial<GameResult> = {}): GameResult {
  return {
    gameId: 'shakhbata',
    outcome: 'win',
    coinsEarned: 10,
    xpEarned: 20,
    summary: 'done',
    ...overrides,
  }
}

test('offline sessions are counted on entry and not counted again on completion', () => {
  const started = recordGameStarted({}, 'shakhbata')
  const finished = recordGameResult(started, result({ bestCandidate: 7 }), { countAsPlayed: false })

  assert.deepEqual(finished.shakhbata, { played: 1, won: 1, bestScore: 7 })
})

test('every affected offline game is counted immediately and each replay counts again', () => {
  const affectedGames = ['shakhbata', 'bank-el7az', 'minesweeper', 'reaction', 'tictactoe']
  const once = affectedGames.reduce(recordGameStarted, {})
  const replay = recordGameStarted(once, 'tictactoe')

  for (const gameId of affectedGames) {
    assert.equal(once[gameId]?.played, 1, `${gameId} should be counted on entry`)
  }
  assert.deepEqual(replay.tictactoe, { played: 2, won: 0 })
})

test('online results remain counted when they finish', () => {
  const stats = recordGameResult({}, result({ gameId: 'reaction', outcome: 'draw' }))

  assert.deepEqual(stats.reaction, { played: 1, won: 0, bestScore: undefined })
})

test('lower-is-better records keep the fastest score', () => {
  const initial = { minesweeper: { played: 2, won: 1, bestScore: 48 } }
  const stats = recordGameResult(
    initial,
    result({ gameId: 'minesweeper', bestCandidate: 39, lowerIsBetter: true }),
    { countAsPlayed: false },
  )

  assert.deepEqual(stats.minesweeper, { played: 2, won: 2, bestScore: 39 })
  assert.deepEqual(initial.minesweeper, { played: 2, won: 1, bestScore: 48 })
})
