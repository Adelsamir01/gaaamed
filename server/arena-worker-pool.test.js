import assert from 'node:assert/strict'
import test from 'node:test'
import { ArenaWorkerPool } from './arena-worker-pool.js'

function waitFor(predicate, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - startedAt > timeout) {
        clearInterval(timer)
        reject(new Error('Timed out waiting for arena worker output.'))
      }
    }, 10)
  })
}

test('arena worker pool shards full arenas and relays compact snapshots', async () => {
  const sent = []
  const pool = new ArenaWorkerPool({
    count: 2,
    send: (socket, message) => sent.push({ socket, message }),
  })
  const sockets = Array.from({ length: 19 }, () => ({}))
  try {
    for (const [index, socket] of sockets.entries()) {
      pool.snake.join(socket, { name: `Player ${index}`, snapshotVersion: 3 })
    }
    await waitFor(() => sent.filter(({ message }) => message.type === 'snake_public_joined').length === sockets.length)
    await waitFor(() => sent.some(({ message }) => message.type === 'snake_public_snapshot' && message.compact === 3))

    assert.deepEqual(pool.assignedHumans.snake, [18, 1])
    assert.equal(pool.snake.has(sockets[0]), true)

    pool.paper.join(sockets[0], { name: 'Switch', snapshotVersion: 3 })
    await waitFor(() => sent.some(({ socket, message }) => socket === sockets[0] && message.type === 'paper_public_joined'))
    assert.equal(pool.snake.has(sockets[0]), false)
    assert.equal(pool.paper.has(sockets[0]), true)
  } finally {
    await pool.close()
  }
})
