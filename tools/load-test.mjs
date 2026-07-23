import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import WebSocket from 'ws'

const scenario = String(process.env.LOAD_SCENARIO || 'idle')
const clientsTarget = Math.max(2, Number(process.env.LOAD_CLIENTS) || 200)
const rampPerSecond = Math.max(1, Number(process.env.LOAD_RAMP_PER_SECOND) || 100)
const holdSeconds = Math.max(1, Number(process.env.LOAD_HOLD_SECONDS) || 10)
const wsUrl = String(process.env.LOAD_WS_URL || 'ws://127.0.0.1:8787')
const healthUrl = String(process.env.LOAD_HEALTH_URL || wsUrl.replace(/^ws/, 'http').replace(/\/?$/, '/health'))
const maximumFailures = Math.max(0, Number(process.env.LOAD_MAX_FAILURES) || 0)
const maximumEventLoopP99Ms = Math.max(1, Number(process.env.LOAD_MAX_EVENT_LOOP_P99_MS) || 100)
const maximumRssBytes = Math.max(64 * 1024 * 1024, Number(process.env.LOAD_MAX_RSS_MB || 1_024) * 1024 * 1024)
const maximumBytesPerSecond = Math.max(0, Number(process.env.LOAD_MAX_BYTES_PER_SECOND) || 0)
const runId = randomUUID().slice(0, 8)

const clients = []
let opened = 0
let identified = 0
let failures = 0
let closed = 0
let messages = 0
let bytes = 0
let joined = 0
let chatDelivered = 0
const threadByClient = new Map()
const userIds = new Map()
const chatStartedAt = new Map()
const chatLatencies = []

function waitFor(predicate, label, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer)
        resolve()
      } else if (Date.now() - startedAt > timeout) {
        clearInterval(timer)
        reject(new Error(`Timed out waiting for ${label}`))
      }
    }, 20)
  })
}

function onMessage(client, raw) {
  messages += 1
  bytes += raw.length
  let message
  try {
    message = JSON.parse(raw.toString())
  } catch {
    failures += 1
    return
  }
  if (message.type === 'identified') {
    identified += 1
    userIds.set(client.index, String(message.user?.userId || ''))
  } else if (message.type === 'snake_public_joined' || message.type === 'paper_public_joined') {
    joined += 1
  } else if (message.type === 'chat_thread') {
    threadByClient.set(client.index, String(message.thread?.id || ''))
  } else if (message.type === 'chat_message') {
    const startedAt = chatStartedAt.get(String(message.message?.id || ''))
    if (startedAt) {
      chatLatencies.push(performance.now() - startedAt)
      chatStartedAt.delete(String(message.message.id))
      chatDelivered += 1
    }
  }
}

function connectClient(index, startedAt) {
  const socket = new WebSocket(wsUrl, { handshakeTimeout: 10_000 })
  const client = { index, socket }
  clients.push(client)
  socket.on('open', () => {
    opened += 1
    socket.send(JSON.stringify({
      type: 'identify',
      deviceId: `load-${runId}-${index}`,
      name: `Load ${index}`,
      avatar: '🎮',
      xp: index % 500,
    }))
  })
  socket.on('message', (raw) => onMessage(client, raw))
  socket.on('close', () => {
    closed += 1
  })
  socket.on('error', () => {
    failures += 1
  })
  const offsetMs = (index / rampPerSecond) * 1_000
  return Math.max(0, startedAt + offsetMs - performance.now())
}

const startedAt = performance.now()
for (let index = 0; index < clientsTarget; index += 1) {
  const delay = (index / rampPerSecond) * 1_000
  setTimeout(() => connectClient(index, startedAt), delay)
}

await waitFor(
  () => identified + failures >= clientsTarget,
  `${clientsTarget} identifications`,
  Math.max(120_000, (clientsTarget / rampPerSecond) * 2_000),
)
const identifiedMs = performance.now() - startedAt

if (scenario === 'snake' || scenario === 'paper') {
  messages = 0
  bytes = 0
  const type = scenario === 'snake' ? 'snake_public_join' : 'paper_public_join'
  for (const client of clients) {
    if (client.socket.readyState !== WebSocket.OPEN) continue
    client.socket.send(JSON.stringify({
      type,
      snapshotVersion: 3,
      name: `Load ${client.index}`,
      avatar: '🎮',
    }))
  }
  await waitFor(() => joined + failures >= clientsTarget, `${clientsTarget} ${scenario} joins`)
  messages = 0
  bytes = 0
}

if (scenario === 'chat') {
  const pairs = Math.floor(clientsTarget / 2)
  for (let index = 0; index < pairs * 2; index += 2) {
    clients[index].socket.send(JSON.stringify({ type: 'chat_create_dm', userId: userIds.get(index + 1) }))
  }
  await waitFor(() => threadByClient.size >= pairs, `${pairs} direct-message threads`)
  messages = 0
  bytes = 0
  for (let index = 0; index < pairs * 2; index += 2) {
    const id = `load_${runId}_${index}`
    chatStartedAt.set(id, performance.now())
    clients[index].socket.send(JSON.stringify({
      type: 'chat_send',
      threadId: threadByClient.get(index),
      text: `capacity message ${index}`,
      clientId: id,
    }))
  }
  await waitFor(() => chatDelivered >= pairs, `${pairs} chat deliveries`)
}

const steadyStartedAt = performance.now()
await new Promise((resolve) => setTimeout(resolve, holdSeconds * 1_000))
const steadySeconds = (performance.now() - steadyStartedAt) / 1_000
const health = await fetch(healthUrl).then((response) => {
  if (!response.ok) throw new Error(`Health returned ${response.status}`)
  return response.json()
})

for (const client of clients) client.socket.close()
await new Promise((resolve) => setTimeout(resolve, 500))

const sortedLatencies = chatLatencies.sort((first, second) => first - second)
const percentile = (values, quantile) => values.length > 0
  ? values[Math.min(values.length - 1, Math.floor(values.length * quantile))]
  : 0
const bytesPerSecond = Math.round(bytes / steadySeconds)
const checks = {
  health: health.ok === true,
  failures: failures <= maximumFailures,
  opened: opened === clientsTarget,
  identified: identified === clientsTarget,
  eventLoop: Number(health.performance?.eventLoopDelayP99Ms) <= maximumEventLoopP99Ms,
  memory: Number(health.memory?.rssBytes) <= maximumRssBytes,
  traffic: maximumBytesPerSecond === 0 || bytesPerSecond <= maximumBytesPerSecond,
  joined: !['snake', 'paper'].includes(scenario) || joined === clientsTarget,
  chat: scenario !== 'chat' || chatDelivered === Math.floor(clientsTarget / 2),
}
const result = {
  ok: Object.values(checks).every(Boolean),
  scenario,
  target: clientsTarget,
  opened,
  identified,
  joined,
  failures,
  closed,
  identifiedMs: Math.round(identifiedMs),
  steadySeconds: Math.round(steadySeconds * 10) / 10,
  messages,
  bytes,
  bytesPerSecond,
  chatDelivered,
  chatLatencyP50Ms: Math.round(percentile(sortedLatencies, 0.5) * 10) / 10,
  chatLatencyP95Ms: Math.round(percentile(sortedLatencies, 0.95) * 10) / 10,
  health,
  checks,
}
console.log(JSON.stringify(result))
if (!result.ok) process.exitCode = 1
