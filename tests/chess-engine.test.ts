import assert from 'node:assert/strict'
import test from 'node:test'
import { Chess } from 'chess.js'
import { chessEndState, chooseChessMove, evaluateChessPosition } from '../src/games/chess/engine.js'

test('chess computer always returns a legal move at every difficulty', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const chess = new Chess()
    const move = chooseChessMove(chess.fen(), difficulty, () => 0.42)
    assert.ok(move)
    assert.doesNotThrow(() => chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' }))
  }
})

test('hard chess computer finds an immediate checkmate', () => {
  const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1')
  const move = chooseChessMove(chess.fen(), 'hard', () => 0.5)
  assert.ok(move)
  chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? 'q' })
  assert.equal(chess.isCheckmate(), true)
  assert.deepEqual(chessEndState(chess), { ended: true, winnerColor: 'w', reason: 'checkmate' })
})

test('position evaluation values material from the requested side', () => {
  const chess = new Chess('4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1')
  assert.ok(evaluateChessPosition(chess, 'w') > 800)
  assert.ok(evaluateChessPosition(chess, 'b') < -800)
})
