import assert from 'node:assert/strict'
import test from 'node:test'
import { activeGameForUser, activeInviteForUser, onlineUserCount, trackPresence, untrackPresence } from './presence.js'

test('multiple sockets for one user count as one online user', () => {
  const users = new Map()
  const phone = {}
  const browser = {}

  assert.equal(trackPresence(users, 'user-1', phone), true)
  assert.equal(trackPresence(users, 'user-1', browser), false)
  assert.equal(onlineUserCount(users), 1)

  assert.equal(untrackPresence(users, 'user-1', browser), false)
  assert.equal(onlineUserCount(users), 1)
  assert.equal(untrackPresence(users, 'user-1', phone), true)
  assert.equal(onlineUserCount(users), 0)
})

test('different users are counted independently', () => {
  const users = new Map()
  const firstSocket = {}
  const secondSocket = {}

  trackPresence(users, 'user-1', firstSocket)
  trackPresence(users, 'user-2', secondSocket)
  assert.equal(onlineUserCount(users), 2)

  untrackPresence(users, 'user-1', firstSocket)
  assert.equal(onlineUserCount(users), 1)
})

test('active invite presence identifies the exact chat game room', () => {
  const users = new Map()
  const rooms = new Map()
  const socket = { _room: '1234', _slot: 1 }
  trackPresence(users, 'user-1', socket)
  rooms.set('1234', {
    code: '1234',
    gameId: 'memory',
    chatInvite: { threadId: 'thread-1', messageId: 'message-1' },
    players: new Map([[1, socket]]),
  })

  assert.deepEqual(activeInviteForUser(users, rooms, 'user-1'), {
    threadId: 'thread-1',
    messageId: 'message-1',
    roomCode: '1234',
    gameId: 'memory',
  })
  assert.equal(activeInviteForUser(users, rooms, 'user-2'), null)
  assert.equal(activeInviteForUser(users, rooms, 'user-1', (invite) => invite.threadId === 'another-thread'), null)
})

test('stale room pointers are never advertised as active invites', () => {
  const users = new Map()
  const socket = { _room: '1234', _slot: 1 }
  trackPresence(users, 'user-1', socket)
  const rooms = new Map([['1234', {
    code: '1234',
    gameId: 'memory',
    chatInvite: { threadId: 'thread-1', messageId: 'message-1' },
    players: new Map(),
  }]])

  assert.equal(activeInviteForUser(users, rooms, 'user-1'), null)
})

test('active game presence resolves a valid game across multiple sockets', () => {
  const users = new Map()
  const idleSocket = { gameId: null }
  const playingSocket = { gameId: 'chess' }
  trackPresence(users, 'user-1', idleSocket)
  trackPresence(users, 'user-1', playingSocket)

  assert.deepEqual(
    activeGameForUser(users, 'user-1', (socket) => socket.gameId, {
      chess: { name: 'شطرنج', emoji: '♟️' },
    }),
    { gameId: 'chess', name: 'شطرنج', emoji: '♟️' },
  )
  assert.equal(activeGameForUser(users, 'missing-user', () => 'chess', {}), null)
})
