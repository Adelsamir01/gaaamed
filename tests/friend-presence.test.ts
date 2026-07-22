import assert from 'node:assert/strict'
import test from 'node:test'
import { friendStatusLabel } from '../src/data/friends.ts'

test('friend status names the exact active game', () => {
  assert.equal(friendStatusLabel({
    presence: 'playing',
    activeGame: { gameId: 'chess', name: 'شطرنج', emoji: '♟️' },
  }), '♟️ بيلعب شطرنج')
})

test('friend status falls back safely when no current game is available', () => {
  assert.equal(friendStatusLabel({ presence: 'playing' }), 'يلعب الآن')
  assert.equal(friendStatusLabel({
    presence: 'offline',
    activeGame: { gameId: 'chess', name: 'شطرنج', emoji: '♟️' },
  }), 'غير متصل')
})
