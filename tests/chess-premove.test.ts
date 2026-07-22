import assert from 'node:assert/strict'
import test from 'node:test'
import { Chess } from 'chess.js'
import { premoveOptions, resolvePremove } from '../src/games/chess/premove.ts'

test('premove options expose the player pieces while the opponent has the turn', () => {
  const chess = new Chess()
  chess.move('e4')
  assert.equal(chess.turn(), 'b')

  const targets = premoveOptions(chess.fen(), 'g1', 'w').map((move) => move.to)
  assert.deepEqual(targets.sort(), ['e2', 'f3', 'h3'])
})

test('a queued premove resolves after an opponent move when it remains legal', () => {
  const chess = new Chess()
  chess.move('e4')
  chess.move('e5')

  assert.deepEqual(resolvePremove(chess.fen(), { from: 'g1', to: 'f3', promotion: 'q' }), {
    from: 'g1',
    to: 'f3',
    promotion: 'q',
  })
})

test('a queued premove is rejected when the opponent removes its source piece', () => {
  const chess = new Chess('4k3/8/8/2b5/8/N7/8/4K3 b - - 0 1')
  assert.ok(premoveOptions(chess.fen(), 'a3', 'w').some((move) => move.to === 'b5'))
  chess.move({ from: 'c5', to: 'a3' })

  assert.equal(resolvePremove(chess.fen(), { from: 'a3', to: 'b5', promotion: 'q' }), null)
})
