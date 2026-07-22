import assert from 'node:assert/strict'
import test from 'node:test'
import { onlineUserCount, trackPresence, untrackPresence } from './presence.js'

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
