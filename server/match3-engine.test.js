import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MATCH3_SIZE,
  applyMatch3Swap,
  createMatch3Game,
  findMatch3Groups,
  findMatch3Move,
} from '../src/games/match3/engine.js'

test('match-three boards are deterministic, playable, and start without free matches', () => {
  const first = createMatch3Game(42, { moves: 30 })
  const second = createMatch3Game(42, { moves: 30 })
  assert.deepEqual(first, second)
  assert.equal(first.board.length, MATCH3_SIZE * MATCH3_SIZE)
  assert.equal(findMatch3Groups(first.board).length, 0)
  assert.notEqual(findMatch3Move(first.board), null)
})

test('a valid move resolves cascades without mutating the supplied state', () => {
  const game = createMatch3Game(9_021, { moves: 30 })
  const original = structuredClone(game)
  const move = findMatch3Move(game.board)
  assert.ok(move)
  const result = applyMatch3Swap(game, move[0], move[1])
  assert.equal(result.accepted, true)
  assert.equal(result.state.movesRemaining, 29)
  assert.ok(result.scoreDelta >= 270)
  assert.ok(result.cleared >= 3)
  assert.equal(findMatch3Groups(result.state.board).length, 0)
  assert.equal(result.frames[0].phase, 'swap')
  const clearFrame = result.frames.find((frame) => frame.phase === 'clear')
  const burstFrame = result.frames.find((frame) => frame.phase === 'burst')
  assert.ok(clearFrame?.cleared.length >= 3)
  assert.ok(clearFrame.cleared.every((index) => clearFrame.state.board[index] !== null))
  assert.ok(clearFrame.cleared.every((index) => burstFrame.state.board[index] === null))
  assert.deepEqual(result.frames.at(-1).state, result.state)
  assert.deepEqual(game, original)
})

test('invalid swaps are rejected and a rainbow clears every matching colour', () => {
  const base = createMatch3Game(517, { moves: 12 })
  const invalid = applyMatch3Swap(base, 0, 63)
  assert.equal(invalid.accepted, false)
  assert.equal(invalid.state, base)

  const state = structuredClone(base)
  state.board[0] = { ...state.board[0], type: -1, special: 'rainbow' }
  state.board[1] = { ...state.board[1], type: 2, special: 'none' }
  const greenBefore = state.board.filter((cell) => cell?.type === 2).length
  const rainbow = applyMatch3Swap(state, 0, 1)
  assert.equal(rainbow.accepted, true)
  assert.ok(rainbow.cleared >= greenBefore + 1)
  assert.ok(rainbow.scoreDelta > 0)
})
