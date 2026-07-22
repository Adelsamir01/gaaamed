import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CHESS_CLOCK_MS,
  applyChessMove,
  chessSnapshot,
  createChessGame,
  expireChessClock,
  resignChessGame,
} from './chess-game.js'

test('online chess enforces turns and rejects illegal moves', () => {
  const game = createChessGame(1_000)
  assert.equal(applyChessMove(game, 2, 'e7', 'e5', 'q', 1_100).reason, 'not_your_turn')
  assert.equal(applyChessMove(game, 1, 'e2', 'e5', 'q', 1_100).reason, 'illegal_move')
  assert.equal(applyChessMove(game, 1, 'e2', 'e4', 'q', 1_200).accepted, true)
  assert.equal(applyChessMove(game, 2, 'e7', 'e5', 'q', 1_500).accepted, true)
  const snapshot = chessSnapshot(game, 1_500)
  assert.equal(snapshot.turnSlot, 1)
  assert.equal(snapshot.history.length, 2)
  assert.equal(snapshot.lastMove.san, 'e5')
  assert.equal(snapshot.clocks[1], CHESS_CLOCK_MS - 200)
  assert.equal(snapshot.clocks[2], CHESS_CLOCK_MS - 300)
})

test('online chess detects checkmate and records the winning slot', () => {
  const game = createChessGame(0)
  applyChessMove(game, 1, 'f2', 'f3', 'q', 100)
  applyChessMove(game, 2, 'e7', 'e5', 'q', 200)
  applyChessMove(game, 1, 'g2', 'g4', 'q', 300)
  const mate = applyChessMove(game, 2, 'd8', 'h4', 'q', 400)

  assert.equal(mate.accepted, true)
  assert.equal(game.ended, true)
  assert.equal(game.winnerSlot, 2)
  assert.equal(game.reason, 'checkmate')
  assert.equal(chessSnapshot(game, 500).check, true)
})

test('online chess clock is server authoritative and awards timeout wins', () => {
  const game = createChessGame(5_000)
  assert.equal(expireChessClock(game, 5_000 + CHESS_CLOCK_MS - 1), false)
  assert.equal(expireChessClock(game, 5_000 + CHESS_CLOCK_MS), true)
  const snapshot = chessSnapshot(game, 5_000 + CHESS_CLOCK_MS)
  assert.equal(snapshot.ended, true)
  assert.equal(snapshot.winnerSlot, 2)
  assert.equal(snapshot.reason, 'timeout')
  assert.equal(snapshot.clocks[1], 0)
})

test('online chess resignation awards the game to the opponent', () => {
  const game = createChessGame(0)
  assert.equal(resignChessGame(game, 2), true)
  assert.equal(game.ended, true)
  assert.equal(game.winnerSlot, 1)
  assert.equal(game.reason, 'resignation')
  assert.equal(resignChessGame(game, 2), false)
})
