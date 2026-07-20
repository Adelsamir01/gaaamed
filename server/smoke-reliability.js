import assert from 'node:assert/strict'
import WebSocket from 'ws'

const httpBase = process.env.DEDOS_HTTP_URL || 'http://127.0.0.1:8787'
const wsUrl = process.env.DEDOS_WS_URL || httpBase.replace(/^http/, 'ws')

async function health(path = '/ready') {
  const response = await fetch(`${httpBase}${path}`)
  assert.equal(response.ok, true, `${path} returned ${response.status}`)
  return response
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl)
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

function waitForClose(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket close')), 5_000)
    socket.once('close', (code, reason) => {
      clearTimeout(timer)
      resolve({ code, reason: reason.toString() })
    })
    socket.once('error', () => {
      // Protocol-limit errors are followed by the close event, which is the assertion target.
    })
  })
}

await health()

const oversized = await openSocket()
const oversizedClose = waitForClose(oversized)
oversized.send(JSON.stringify({ type: 'oversized', value: 'x'.repeat(129 * 1024) }))
assert.equal((await oversizedClose).code, 1009)

const flood = await openSocket()
const floodClose = waitForClose(flood)
for (let index = 0; index < 320; index += 1) flood.send(JSON.stringify({ type: 'noop', index }))
assert.equal((await floodClose).code, 1008)

const metrics = await (await health('/metrics')).text()
assert.match(metrics, /dedos_up 1/)
assert.match(metrics, /dedos_websocket_connections 0/)
console.log(JSON.stringify({ ok: true, oversizedClose: 1009, rateLimitClose: 1008 }))
