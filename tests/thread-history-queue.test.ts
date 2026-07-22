import assert from 'node:assert/strict'
import test from 'node:test'
import { ThreadHistoryQueue } from '../src/online/threadHistoryQueue.ts'

test('chat history waits for identification before sending', () => {
  const queue = new ThreadHistoryQueue()
  const sent: string[] = []

  queue.request('thread-cold-start', (threadId) => sent.push(threadId))
  assert.deepEqual(sent, [])

  queue.authenticate((threadId) => sent.push(threadId))
  assert.deepEqual(sent, ['thread-cold-start'])
})

test('unacknowledged chat history retries after reconnect and stops after a response', () => {
  const queue = new ThreadHistoryQueue()
  const sent: string[] = []
  const send = (threadId: string) => sent.push(threadId)

  queue.authenticate(send)
  queue.request('thread-notification', send)
  queue.request('thread-notification', send)
  assert.deepEqual(sent, ['thread-notification'])

  queue.connectionChanged()
  queue.authenticate(send)
  assert.deepEqual(sent, ['thread-notification', 'thread-notification'])

  queue.resolve('thread-notification')
  queue.connectionChanged()
  queue.authenticate(send)
  assert.deepEqual(sent, ['thread-notification', 'thread-notification'])
})
