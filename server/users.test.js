import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { UserStore } from './users.js'

const testRoot = path.resolve('server', '.tmp-user-tests')

test.beforeEach(() => {
  rmSync(testRoot, { recursive: true, force: true })
  mkdirSync(testRoot, { recursive: true })
})

test.after(() => {
  rmSync(testRoot, { recursive: true, force: true })
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
