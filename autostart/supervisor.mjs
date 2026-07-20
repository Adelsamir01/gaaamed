import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const autostartDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.dirname(autostartDir)
const mode = process.argv[2]
const logDir = path.join(workspaceRoot, 'server', 'logs')
const maxLogBytes = 10 * 1024 * 1024
let child = null
let stopping = false

if (mode !== 'server' && mode !== 'tunnel') throw new Error('Usage: supervisor.mjs <server|tunnel>')
mkdirSync(logDir, { recursive: true })

function rotate(filePath) {
  if (!existsSync(filePath) || statSync(filePath).size < maxLogBytes) return
  const archive = `${filePath}.1`
  rmSync(archive, { force: true })
  renameSync(filePath, archive)
}

function log(filePath, message) {
  appendFileSync(filePath, `[${new Date().toISOString()}] ${message}\n`, 'utf8')
}

function specification() {
  if (mode === 'server') {
    return {
      executable: process.execPath,
      args: [path.join(workspaceRoot, 'server', 'server.js')],
      outLog: path.join(logDir, 'server.out.log'),
      errLog: path.join(logDir, 'server.err.log'),
    }
  }

  const executable = path.join(workspaceRoot, 'sdk-installer', 'cloudflared.exe')
  const tokenFile = path.join(workspaceRoot, 'sdk-installer', 'tunnel-token.txt')
  if (!existsSync(executable)) throw new Error(`cloudflared is missing: ${executable}`)
  if (!existsSync(tokenFile)) throw new Error(`Tunnel token is missing: ${tokenFile}`)
  return {
    executable,
    args: ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--edge-ip-version', '4', '--loglevel', 'info', 'run', '--token-file', tokenFile],
    outLog: path.join(logDir, 'tunnel.out.log'),
    errLog: path.join(logDir, 'tunnel.err.log'),
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function runOnce(spec) {
  rotate(spec.outLog)
  rotate(spec.errLog)
  const startedAt = Date.now()
  await new Promise((resolve) => {
    child = spawn(spec.executable, spec.args, {
      cwd: workspaceRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', (data) => appendFileSync(spec.outLog, data))
    child.stderr.on('data', (data) => appendFileSync(spec.errLog, data))
    child.once('error', (error) => {
      log(spec.errLog, `spawn error: ${error.message}`)
      resolve()
    })
    child.once('exit', (code, signal) => {
      log(spec.errLog, `${mode} stopped after ${Math.round((Date.now() - startedAt) / 1000)}s code=${code} signal=${signal}`)
      child = null
      resolve()
    })
  })
}

function stop(signal) {
  if (stopping) return
  stopping = true
  if (child && !child.killed) child.kill(signal)
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

const spec = specification()
while (!stopping) {
  await runOnce(spec)
  if (!stopping) await wait(5_000)
}
