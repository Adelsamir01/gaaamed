import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { UserStore, publicCard, publicProfile } from './users.js'

const testRoot = path.resolve('server', '.tmp-user-tests')

test.beforeEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  mkdirSync(testRoot, { recursive: true })
})

test.after(() => {
  rmSync(testRoot, { recursive: true, force: true })
})

test('player XP is persisted and included in public leaderboard cards', () => {
  const store = new UserStore(testRoot)
  try {
    const created = store.identify({ deviceId: 'xp-device', name: 'Adel', avatar: 'A', xp: 240 }).user
    assert.equal(publicCard(created).xp, 240)

    const updated = store.identify({ deviceId: 'xp-device', name: 'Adel', avatar: 'A', xp: 515.9 }).user
    assert.equal(publicCard(updated).xp, 515)

    const legacyClient = store.identify({ deviceId: 'xp-device', name: 'Adel', avatar: 'A' }).user
    assert.equal(publicCard(legacyClient).xp, 515, 'older clients must not erase stored XP')
  } finally {
    store.close()
  }
})

test('public profiles persist sanitized per-game statistics and totals', () => {
  const store = new UserStore(testRoot)
  try {
    const user = store.identify({ deviceId: 'stats-device', name: 'Mona', avatar: 'M' }).user
    store.updateStats(user.userId, {
      memory: { played: 18.9, won: 7.8, bestScore: 420.7 },
      chess: { played: 3, won: 99 },
      paper: { played: 4, won: 2, bestScore: 87 },
      unknown: { played: 999, won: 999 },
      snake: { played: 'bad', won: -4, bestScore: Number.NaN },
    })

    assert.deepEqual(publicProfile(user), {
      ...publicCard(user),
      stats: {
        chess: { played: 3, won: 3 },
        memory: { played: 18, won: 7, bestScore: 420 },
        paper: { played: 4, won: 2, bestScore: 87 },
      },
      totals: { played: 25, won: 12, winRate: 48 },
    })
  } finally {
    store.close()
  }
})

test('global and per-game leaderboards rank every registered player by visible metrics', () => {
  const store = new UserStore(testRoot)
  try {
    const adel = store.identify({ deviceId: 'leader-adel', name: 'Adel', avatar: 'A', xp: 300 }).user
    const mona = store.identify({ deviceId: 'leader-mona', name: 'Mona', avatar: 'M', xp: 900 }).user
    const omar = store.identify({ deviceId: 'leader-omar', name: 'Omar', avatar: 'O', xp: 500 }).user
    store.updateStats(adel.userId, { chess: { played: 10, won: 7 } })
    store.updateStats(mona.userId, { chess: { played: 20, won: 7 } })
    store.updateStats(omar.userId, { chess: { played: 8, won: 6 } })

    const global = store.leaderboard({ currentUserId: adel.userId, limit: 2 })
    assert.equal(global.scope, 'global')
    assert.deepEqual(global.entries.map(({ name, points, rank }) => ({ name, points, rank })), [
      { name: 'Mona', points: 900, rank: 1 },
      { name: 'Omar', points: 500, rank: 2 },
    ])
    assert.equal(global.me.rank, 3)

    const chess = store.leaderboard({ gameId: 'chess', currentUserId: omar.userId })
    assert.equal(chess.scope, 'game')
    assert.deepEqual(chess.entries.map(({ name, won, winRate, rank }) => ({ name, won, winRate, rank })), [
      { name: 'Adel', won: 7, winRate: 70, rank: 1 },
      { name: 'Mona', won: 7, winRate: 35, rank: 2 },
      { name: 'Omar', won: 6, winRate: 75, rank: 3 },
    ])
    assert.equal(chess.me.rank, 3)
  } finally {
    store.close()
  }
})

test('retries a queued chat message without creating a duplicate', () => {
  const store = new UserStore(testRoot)
  try {
    const adel = store.identify({ deviceId: 'test-device-adel', name: 'Adel', avatar: 'A' }).user
    const mona = store.identify({ deviceId: 'test-device-mona', name: 'Mona', avatar: 'M' }).user
    const { thread } = store.getOrCreateDm(adel.userId, mona.userId)
    const clientId = 'queued_message_123'

    const first = store.postMessage(thread.id, adel.userId, { text: 'hello', clientId })
    const retried = store.postMessage(thread.id, adel.userId, { text: 'hello', clientId })

    assert.equal(first.message.id, clientId)
    assert.equal(retried.message.id, clientId)
    assert.equal(thread.messages.length, 1)

    const collision = store.postMessage(thread.id, mona.userId, { text: 'different sender', clientId })
    assert.notEqual(collision.message.id, clientId)
    assert.equal(thread.messages.length, 2)
  } finally {
    store.close()
  }
})

test('message hearts toggle, persist, and are limited to thread members', () => {
  const store = new UserStore(testRoot)
  try {
    const adel = store.identify({ deviceId: 'heart-device-adel', name: 'Adel', avatar: 'A' }).user
    const mona = store.identify({ deviceId: 'heart-device-mona', name: 'Mona', avatar: 'M' }).user
    const outsider = store.identify({ deviceId: 'heart-device-outsider', name: 'Noor', avatar: 'N' }).user
    const { thread } = store.getOrCreateDm(adel.userId, mona.userId)
    const { message } = store.postMessage(thread.id, adel.userId, { text: 'hello' })

    store.toggleMessageHeart(thread.id, message.id, mona.userId)
    assert.deepEqual(message.heartUserIds, [mona.userId])
    assert.deepEqual(store.history(thread.id, adel.userId).messages[0].heartUserIds, [mona.userId])

    store.toggleMessageHeart(thread.id, message.id, mona.userId)
    assert.deepEqual(message.heartUserIds, [])
    assert.throws(() => store.toggleMessageHeart(thread.id, message.id, outsider.userId), /المحادثة/)
  } finally {
    store.close()
  }
})

test('friend game results replace an invite action, persist, and cannot be overwritten', () => {
  const store = new UserStore(testRoot)
  try {
    const adel = store.identify({ deviceId: 'result-device-adel', name: 'Adel', avatar: '😎' }).user
    const mona = store.identify({ deviceId: 'result-device-mona', name: 'Mona', avatar: '🦊' }).user
    const outsider = store.identify({ deviceId: 'result-device-outsider', name: 'Noor', avatar: '🌟' }).user
    const { thread } = store.getOrCreateDm(adel.userId, mona.userId)
    const { message } = store.postMessage(thread.id, adel.userId, {
      text: 'دعوة للعب إكس أو',
      kind: 'game_invite',
      invite: { gameId: 'tictactoe', roomCode: '1234', gameName: 'إكس أو', gameEmoji: '⭕' },
    })
    const completedAt = Date.now() + 100

    const pending = store.pendingGameInvite(thread.id, message.id, mona.userId)
    assert.equal(pending.message.invite.roomCode, '1234')
    assert.throws(
      () => store.pendingGameInvite(thread.id, message.id, outsider.userId),
      /المحادثة/,
    )

    const completed = store.completeGameInvite(thread.id, message.id, mona.userId, {
      kind: 'winner',
      winnerId: mona.userId,
      winnerName: mona.name,
      winnerAvatar: mona.avatar,
      completedAt,
    })
    assert.equal(completed.changed, true)
    assert.deepEqual(message.invite.result, {
      kind: 'winner',
      winnerId: mona.userId,
      winnerName: 'Mona',
      winnerAvatar: '🦊',
      completedAt,
    })
    assert.equal(store.threadSummary(thread, adel.userId).updatedAt, completedAt)

    const retried = store.completeGameInvite(thread.id, message.id, adel.userId, {
      kind: 'draw',
      completedAt: completedAt + 1,
    })
    assert.equal(retried.changed, false)
    assert.equal(message.invite.result.kind, 'winner')
    assert.throws(
      () => store.pendingGameInvite(thread.id, message.id, adel.userId),
      /انتهت/,
    )
    assert.throws(
      () => store.completeGameInvite(thread.id, message.id, outsider.userId, { kind: 'draw', completedAt }),
      /المحادثة/,
    )
  } finally {
    store.close()
  }
})
