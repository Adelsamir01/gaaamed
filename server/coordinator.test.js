import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { RedisCoordinator } from './coordinator.js'

const redisUrl = process.env.TEST_REDIS_URL

test('Redis shares presence counts and targeted events between instances', {
  skip: !redisUrl && 'Set TEST_REDIS_URL to exercise the Redis coordinator.',
}, async () => {
  const prefix = `dedos-test-${randomUUID()}`
  const first = await RedisCoordinator.open(redisUrl, { DEDOS_REDIS_PREFIX: prefix, DEDOS_INSTANCE_ID: 'first' })
  const second = await RedisCoordinator.open(redisUrl, { DEDOS_REDIS_PREFIX: prefix, DEDOS_INSTANCE_ID: 'second' })
  try {
    const received = new Promise((resolve) => second.once('user-event', resolve))
    first.setLocalUsers(['user-a', 'user-b'])
    await first.refreshPresence()
    second.setLocalUsers(['user-b', 'user-c'])
    await second.refreshPresence()
    await first.refreshPresence()

    assert.equal(first.onlineCount, 3)
    await first.publishUserEvent('user-c', { type: 'chat_update', id: 'message-1' })
    assert.deepEqual(await received, {
      userId: 'user-c',
      payload: { type: 'chat_update', id: 'message-1' },
    })

    first.setLocalUsers([])
    await first.refreshPresence()
    assert.equal(first.onlineCount, 2, 'disconnecting one instance keeps a shared user online')

    second.setLocalUsers([])
    await second.refreshPresence()
    assert.equal(second.onlineCount, 0, 'disconnected users disappear without waiting for the TTL')
  } finally {
    await Promise.all([first.close(), second.close()])
  }
})
