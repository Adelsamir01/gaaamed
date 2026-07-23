import assert from 'node:assert/strict'
import test from 'node:test'
import {
  chooseBotMove,
  createDominoGame,
  createDominoSet,
  drawDomino,
  legalSides,
  passDomino,
  playDomino,
  takeBotTurn,
  type DominoState,
  type DominoTile,
} from '../src/games/dominoes/engine.ts'

function tile(a: number, b: number): DominoTile {
  return { id: `${Math.min(a, b)}-${Math.max(a, b)}`, a: Math.min(a, b), b: Math.max(a, b) }
}

function state(overrides: Partial<DominoState> = {}): DominoState {
  return {
    hands: [[tile(1, 4)], [tile(2, 5)]],
    boneyard: [],
    board: [{ ...tile(3, 4), left: 3, right: 4, playedBy: 1 }],
    currentPlayer: 0,
    status: 'playing',
    winner: null,
    endReason: null,
    points: 0,
    consecutivePasses: 0,
    turn: 2,
    lastAction: { kind: 'opening', player: 1, tileId: '3-4' },
    ...overrides,
  }
}

test('double-six domino set contains 28 unique canonical tiles', () => {
  const set = createDominoSet()
  assert.equal(set.length, 28)
  assert.equal(new Set(set.map(({ id }) => id)).size, 28)
  assert.ok(set.every(({ a, b }) => a <= b && a >= 0 && b <= 6))
})

test('a fresh game deals both hands and opens with the strongest tile', () => {
  const game = createDominoGame(() => 0.37)
  assert.equal(game.hands[0].length + game.hands[1].length, 13)
  assert.equal(game.boneyard.length, 14)
  assert.equal(game.board.length, 1)
  assert.equal(game.status, 'playing')
})

test('tiles orient correctly on either end and emptying a hand wins', () => {
  const current = state()
  assert.deepEqual(legalSides(current, tile(1, 4)), ['right'])

  const result = playDomino(current, 0, '1-4', 'right')
  assert.equal(result.accepted, true)
  assert.equal(result.state.board.at(-1)?.left, 4)
  assert.equal(result.state.board.at(-1)?.right, 1)
  assert.equal(result.state.winner, 0)
  assert.equal(result.state.points, 7)
})

test('drawing is allowed only when no legal move exists', () => {
  const blocked = state({
    hands: [[tile(0, 0)], [tile(2, 5)]],
    boneyard: [tile(3, 6)],
  })
  const drawn = drawDomino(blocked, 0)
  assert.equal(drawn.accepted, true)
  assert.equal(drawn.state.hands[0].length, 2)
  assert.equal(drawn.state.boneyard.length, 0)

  assert.equal(drawDomino(state({ boneyard: [tile(3, 6)] }), 0).reason, 'has-move')
})

test('two passes settle a blocked round by the lowest pip total', () => {
  const blocked = state({
    hands: [[tile(0, 1)], [tile(5, 6)]],
    boneyard: [],
  })
  const first = passDomino(blocked, 0)
  const second = passDomino(first.state, 1)
  assert.equal(second.state.status, 'ended')
  assert.equal(second.state.winner, 0)
  assert.equal(second.state.endReason, 'blocked')
  assert.equal(second.state.points, 10)
})

test('hard bot always chooses a legal move and completes forced draws', () => {
  const strategic = state({
    hands: [[tile(0, 0)], [tile(2, 4), tile(4, 6), tile(1, 3)]],
    currentPlayer: 1,
  })
  const move = chooseBotMove(strategic, 1, 'hard', () => 0)
  assert.ok(move)
  assert.ok(legalSides(strategic, move.tile).includes(move.side))

  const drawing = state({
    hands: [[tile(0, 0)], [tile(1, 2)]],
    boneyard: [tile(4, 5)],
    currentPlayer: 1,
  })
  const resolved = takeBotTurn(drawing, 1, 'hard', () => 0)
  assert.equal(resolved.status, 'playing')
  assert.equal(resolved.currentPlayer, 0)
  assert.equal(resolved.board.at(-1)?.right, 5)
  assert.deepEqual(resolved.hands[1], [tile(1, 2)])
})
