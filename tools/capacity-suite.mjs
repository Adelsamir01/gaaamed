import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const dataDir = await mkdtemp(path.join(tmpdir(), 'dedos-capacity-suite-'))
const port = String(process.env.CAPACITY_PORT || 8896)
const scale = String(process.env.CAPACITY_SCALE || 'smoke')
const scenarios = scale === 'full'
  ? [
      { name: 'idle', clients: 1_000, ramp: 100, hold: 5, maxBytesPerSecond: 500_000 },
      { name: 'reconnect', clients: 1_000, ramp: 1_000, hold: 5, maxBytesPerSecond: 1_000_000 },
      { name: 'chat', clients: 200, ramp: 100, hold: 3, maxBytesPerSecond: 1_000_000 },
      { name: 'snake', clients: 500, ramp: 100, hold: 10, maxBytesPerSecond: 35_000_000 },
      { name: 'paper', clients: 280, ramp: 100, hold: 10, maxBytesPerSecond: 10_000_000 },
    ]
  : [
      { name: 'idle', clients: 100, ramp: 100, hold: 2, maxBytesPerSecond: 100_000 },
      { name: 'chat', clients: 20, ramp: 50, hold: 2, maxBytesPerSecond: 100_000 },
      { name: 'snake', clients: 36, ramp: 50, hold: 3, maxBytesPerSecond: 3_000_000 },
      { name: 'paper', clients: 28, ramp: 50, hold: 3, maxBytesPerSecond: 1_000_000 },
    ]

function run(command, args, environment, stdio = 'inherit') {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: environment, stdio, windowsHide: true })
    child.on('error', reject)
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code ?? signal}`)))
  })
}

const environment = {
  ...process.env,
  PORT: port,
  DEDOS_DATA_DIR: dataDir,
  DEDOS_DB_PATH: path.join(dataDir, 'dedos.sqlite'),
  DEDOS_ARENA_WORKERS: process.env.DEDOS_ARENA_WORKERS || '2',
}
const server = spawn(process.execPath, ['server/server.js'], {
  cwd: root,
  env: environment,
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
let serverExited = false
server.once('exit', () => {
  serverExited = true
})
server.stdout.on('data', () => {})
server.stderr.on('data', (chunk) => process.stderr.write(chunk))

try {
  let ready = false
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/ready`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error('Capacity-suite server did not become ready.')

  for (const item of scenarios) {
    await run(process.execPath, ['tools/load-test.mjs'], {
      ...environment,
      LOAD_SCENARIO: item.name === 'reconnect' ? 'idle' : item.name,
      LOAD_CLIENTS: String(item.clients),
      LOAD_RAMP_PER_SECOND: String(item.ramp),
      LOAD_HOLD_SECONDS: String(item.hold),
      LOAD_WS_URL: `ws://127.0.0.1:${port}`,
      LOAD_HEALTH_URL: `http://127.0.0.1:${port}/health`,
      LOAD_MAX_EVENT_LOOP_P99_MS: item.name === 'reconnect' ? '150' : '100',
      LOAD_MAX_RSS_MB: '1536',
      LOAD_MAX_BYTES_PER_SECOND: String(item.maxBytesPerSecond),
    })
  }
} finally {
  server.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000)
    server.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  if (!serverExited) server.kill('SIGKILL')
  await rm(dataDir, { recursive: true, force: true })
}
