import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLeaderboard } from '../src/lib/leaderboard.ts'

test('leaderboard ranks friends and the current player by the points it displays', () => {
  const entries = buildLeaderboard(
    { userId: 'me', handle: 'adel', name: 'Adel', avatar: '😎', xp: 240, coins: 0 },
    [
      { userId: 'low', handle: 'mona', name: 'Mona', avatar: '🦊', xp: 120, presence: 'online' },
      { userId: 'top', handle: 'omar', name: 'Omar', avatar: '🐍', xp: 510, presence: 'playing' },
    ],
  )

  assert.deepEqual(entries.map(({ userId, points }) => ({ userId, points })), [
    { userId: 'top', points: 510 },
    { userId: 'me', points: 240 },
    { userId: 'low', points: 120 },
  ])
})

test('leaderboard normalizes invalid points and keeps the current player first in a tie', () => {
  const entries = buildLeaderboard(
    { userId: 'me', name: 'Me', avatar: '😎', xp: 0, coins: 0 },
    [{ userId: 'friend', handle: 'friend', name: 'Friend', avatar: '🎮', xp: Number.NaN, presence: 'offline' }],
  )

  assert.equal(entries[0]?.userId, 'me')
  assert.deepEqual(entries.map((entry) => entry.points), [0, 0])
})
