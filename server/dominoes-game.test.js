import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDominoGame,
  createDominoSet,
  dominoSnapshot,
  drawDomino,
  passDomino,
  playDomino,
} from './dominoes-game.js'

test('online dominoes uses a complete double-six set and hides the opponent hand', () => {
  assert.equal(createDominoSet().length, 28)
  const game = createDominoGame(() => 0.41)
  const snapshot = dominoSnapshot(game, 1)
  assert.equal(snapshot.hand.length, game.hands[1].length)
  assert.equal(Object.hasOwn(snapshot, 'hands'), false)
  assert.equal(snapshot.handCounts[2], game.hands[2].length)
  assert.equal(snapshot.board.length, 1)
  assert.equal(snapshot.boneyardCount, 14)
})

test('server dominoes enforces turns and legal endpoints', () => {
  const game = createDominoGame(() => 0.35)
  const active = game.currentSlot
  const inactive = active === 1 ? 2 : 1
  assert.equal(playDomino(game, inactive, game.hands[inactive][0].id, 'left').reason, 'not_your_turn')

  const playable = game.hands[active].find((tile) => {
    const left = game.board[0].left
    const right = game.board.at(-1).right
    return tile.a === left || tile.b === left || tile.a === right || tile.b === right
  })
  if (playable) {
    const left = game.board[0].left
    const side = playable.a === left || playable.b === left ? 'left' : 'right'
    assert.equal(playDomino(game, active, playable.id, side).accepted, true)
    assert.equal(game.currentSlot, inactive)
  } else {
    assert.equal(drawDomino(game, active).accepted, true)
  }
})

test('server dominoes settles a blocked table after both players pass', () => {
  const game = {
    hands: {
      1: [{ id: '0-1', a: 0, b: 1 }],
      2: [{ id: '5-6', a: 5, b: 6 }],
    },
    boneyard: [],
    board: [{ id: '3-4', a: 3, b: 4, left: 3, right: 4, playedBy: 2 }],
    currentSlot: 1,
    ended: false,
    winnerSlot: null,
    reason: null,
    points: 0,
    consecutivePasses: 0,
    turn: 2,
    lastAction: { kind: 'opening', slot: 2, tileId: '3-4' },
  }
  assert.equal(passDomino(game, 1).accepted, true)
  assert.equal(passDomino(game, 2).accepted, true)
  assert.equal(game.ended, true)
  assert.equal(game.winnerSlot, 1)
  assert.equal(game.points, 10)
})
