/**
 * خادم ديدوس للعب الأونلاين — WebSocket relay بسيط
 * الغرف: إنشاء/انضمام برمز من 4 أرقام، تمرير الحركات بين لاعبَين
 * + الذاكرة والأسئلة الثقافية بحالة وتوقيت ونقاط يتحكم فيها الخادم
 * + لعبة شخبطة (حتى 8 لاعبين) عبر محرك server/shakhbata.js
 * + لعبة بنك الحظ (حتى 6 لاعبين) عبر محرك server/bankel7az.js بنفق {type:'bank', msg}
 *   ونقاط HTTP: ‎/health و ‎/api/stats (إحصائيات بنك الحظ)
 * + الهوية/الأصدقاء/الدردشات/المباراة السريعة عبر server/users.js (بيانات دائمة في server/data)
 */
import { createServer } from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import {
  initShakhbata, shakHandleMessage, shakHandleLeave, shakPlayers,
  broadcastPlayers, destroyShakhbata,
} from './shakhbata.js'
import { RoomManager, StatsStore, parseClientMessage, resolveStatsFilePath } from './bankel7az.js'
import { UserStore, resolveDataDir, publicCard, publicProfile } from './users.js'
import { DocumentDatabase, resolveDatabasePath } from './database.js'
import {
  advanceTriviaQuestion,
  applyMemoryFlip,
  createMemoryGame,
  createTriviaGame,
  finishTriviaGame,
  createMatch3Battle,
  finishMatch3Battle,
  match3Snapshot,
  memorySnapshot,
  memoryWinner,
  resolveTriviaQuestion,
  settleMemoryMiss,
  submitTriviaAnswer,
  submitMatch3Swap,
  triviaQuestionSnapshot,
} from './competitive-games.js'
import { SnakeArenaManager, SNAKE_SNAPSHOT_MS, SNAKE_TICK_MS } from './snake-arena.js'
import { PaperArenaManager, PAPER_SNAPSHOT_MS, PAPER_TICK_MS } from './paper-arena.js'
import { applyChessMove, chessClock, chessSnapshot, createChessGame, expireChessClock, resignChessGame } from './chess-game.js'
import { createFirebaseMessaging, PushNotificationService } from './push-notifications.js'
import { activeGameForUser, activeInviteForUser, onlineUserCount, trackPresence, untrackPresence } from './presence.js'

const PORT = Number(process.env.PORT) || 8787
const SHAKHBATA_MAX = 8
const BANK_MAX = 6
const INVITE_ROOM_TTL_MS = 10 * 60 * 1000
// إعدادات الغرف: عدد الجولات المسموح به (أفضل من ٣/٥/٧) والقيمة الافتراضية
const VALID_ROUNDS = new Set([3, 5, 7])
const DEFAULT_ROUNDS = 5
const APP_VERSION = process.env.APP_VERSION || 'dev'
const STARTED_AT = Date.now()
const MAX_WS_PAYLOAD_BYTES = 128 * 1024
const MAX_WS_BUFFERED_BYTES = 512 * 1024
const MESSAGE_RATE_WINDOW_MS = 10_000
const MESSAGE_RATE_LIMIT = 300
const PRIVACY_RATE_WINDOW_MS = 60_000
const PRIVACY_RATE_LIMIT = 10

// بنك الحظ: مخزن الإحصائيات + مدير الغرف (بروتوكول اللعبة الأصلي كما هو)
const dataDir = resolveDataDir()
const database = new DocumentDatabase(resolveDatabasePath(dataDir))
const bankStats = new StatsStore(resolveStatsFilePath(), database)
const bankManager = new RoomManager(bankStats)

// الهوية والأصدقاء والدردشات (ملفات JSON دائمة)
const userStore = new UserStore(dataDir, database)
let firebaseMessaging = null
try {
  firebaseMessaging = createFirebaseMessaging()
} catch (error) {
  log('error', 'push_firebase_initialization_failed', { message: error.message })
}
const pushNotifications = new PushNotificationService({ tokenStore: userStore, messaging: firebaseMessaging, logger: log })

// معلومات الألعاب لدعوات الدردشة
const INVITE_GAMES = {
  tictactoe: { name: 'إكس أو', emoji: '⭕' },
  connect4: { name: 'أربعة تربح', emoji: '🔴' },
  chess: { name: 'شطرنج', emoji: '♟️' },
  rps: { name: 'حجر ورقة مقص', emoji: '✂️' },
  reaction: { name: 'سرعة البرق', emoji: '⚡' },
  memory: { name: 'لعبة الذاكرة', emoji: '🧠' },
  trivia: { name: 'أسئلة ثقافية', emoji: '📚' },
  shakhbata: { name: 'شخبطة', emoji: '🎨' },
  match3: { name: 'حلاوة', emoji: '🍬' },
  'bank-el7az': { name: 'بنك الحظ', emoji: '🏦' },
}

// Includes offline games reported by the foreground app as well as every server-owned game.
const ACTIVITY_GAMES = {
  ...INVITE_GAMES,
  snake: { name: 'الثعبان', emoji: '🐍' },
  paper: { name: 'سيطر', emoji: '🟪' },
  minesweeper: { name: 'كاسحة الألغام', emoji: '💣' },
}

// userId -> Set<ws> (حضور حقيقي عبر السوكيتات المتصلة)
const onlineUsers = new Map()
// gameId -> Array<{ws, userId, name, avatar, at}> (طوابير المباراة السريعة — مصممة لدعم N لاحقًا)
const matchQueues = new Map()
const MATCH_SIZE = 2
const privacyRateLimits = new Map()

function log(level, event, details = {}) {
  const entry = { level, event, time: new Date().toISOString(), ...details }
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else console.log(line)
}

// ===== صفحات الويب العامة (صفحة الهبوط + سياسة الخصوصية + تحميل APK) =====
// ملاحظة: هذا القسم خدمة ملفات ثابتة فقط — لا علاقة له بمنطق WebSocket/الألعاب
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.resolve(SERVER_DIR, 'public')
// ملف الـ APK يعيش في جذر مساحة العمل (الأب المباشر لمجلد server/)
const APK_PATH = path.resolve(SERVER_DIR, '..', 'dedos-release.apk')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
}

function sendJson(res, status, obj) {
  res.setHeader('cache-control', 'no-store')
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

function serviceHealth() {
  const storage = database.health()
  const snakePlayers = [...snakeManager.arenas.values()].reduce((total, arena) => total + arena.players.size, 0)
  const paperPlayers = [...paperManager.arenas.values()].reduce((total, arena) => total + arena.players.size, 0)
  return {
    ok: storage.ok,
    service: 'dedos-server',
    version: APP_VERSION,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    connections: wss?.clients?.size ?? 0,
    onlineUsers: onlineUserCount(onlineUsers),
    rooms: rooms?.size ?? 0,
    snakeArenas: snakeManager.arenas.size,
    snakePlayers,
    paperArenas: paperManager.arenas.size,
    paperPlayers,
    push: {
      configured: pushNotifications.configured,
      registeredDevices: userStore.pushRegistrationCount(),
    },
    storage,
    time: Date.now(),
  }
}

function serviceMetrics() {
  const storage = database.health()
  const queueSize = [...matchQueues.values()].reduce((total, queue) => total + queue.length, 0)
  const snakePlayers = [...snakeManager.arenas.values()].reduce((total, arena) => total + arena.players.size, 0)
  const paperPlayers = [...paperManager.arenas.values()].reduce((total, arena) => total + arena.players.size, 0)
  return [
    '# HELP dedos_up Whether the service and its storage are healthy.',
    '# TYPE dedos_up gauge',
    `dedos_up ${storage.ok ? 1 : 0}`,
    '# HELP dedos_uptime_seconds Process uptime in seconds.',
    '# TYPE dedos_uptime_seconds gauge',
    `dedos_uptime_seconds ${Math.floor((Date.now() - STARTED_AT) / 1000)}`,
    '# HELP dedos_websocket_connections Active WebSocket connections.',
    '# TYPE dedos_websocket_connections gauge',
    `dedos_websocket_connections ${wss.clients.size}`,
    '# HELP dedos_online_users Unique identified users currently connected.',
    '# TYPE dedos_online_users gauge',
    `dedos_online_users ${onlineUserCount(onlineUsers)}`,
    '# HELP dedos_rooms Active game rooms.',
    '# TYPE dedos_rooms gauge',
    `dedos_rooms ${rooms.size}`,
    '# HELP dedos_matchmaking_queue_players Players waiting for a quick match.',
    '# TYPE dedos_matchmaking_queue_players gauge',
    `dedos_matchmaking_queue_players ${queueSize}`,
    '# HELP dedos_snake_arena_players Players currently in public snake arenas.',
    '# TYPE dedos_snake_arena_players gauge',
    `dedos_snake_arena_players ${snakePlayers}`,
    '# HELP dedos_paper_arena_players Players currently in public territory arenas.',
    '# TYPE dedos_paper_arena_players gauge',
    `dedos_paper_arena_players ${paperPlayers}`,
    '# HELP dedos_push_configured Whether Firebase Cloud Messaging credentials are configured.',
    '# TYPE dedos_push_configured gauge',
    `dedos_push_configured ${pushNotifications.configured ? 1 : 0}`,
    '# HELP dedos_push_registered_devices Number of registered Android push destinations.',
    '# TYPE dedos_push_registered_devices gauge',
    `dedos_push_registered_devices ${userStore.pushRegistrationCount()}`,
    '',
  ].join('\n')
}

function applySecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('x-frame-options', 'DENY')
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin')
  res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' wss:")
}

function allowPrivacyRequest(ip) {
  const now = Date.now()
  const current = privacyRateLimits.get(ip)
  if (!current || now - current.startedAt >= PRIVACY_RATE_WINDOW_MS) {
    privacyRateLimits.set(ip, { startedAt: now, count: 1 })
    return true
  }
  current.count += 1
  return current.count <= PRIVACY_RATE_LIMIT
}

function sendFile(req, res, filePath, contentType, { cacheControl = 'no-cache', downloadName } = {}) {
  const stat = fs.statSync(filePath)
  const etag = `W/"${stat.size}-${Math.trunc(stat.mtimeMs)}"`
  const headers = {
    'content-type': contentType,
    'content-length': stat.size,
    'last-modified': stat.mtime.toUTCString(),
    'cache-control': cacheControl,
    etag,
    'x-content-type-options': 'nosniff',
  }
  if (downloadName) headers['content-disposition'] = `attachment; filename="${downloadName}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': cacheControl })
    res.end()
    return
  }
  res.writeHead(200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = fs.createReadStream(filePath)
  stream.on('error', () => {
    if (!res.headersSent) sendJson(res, 404, { error: 'not_found' })
    else res.destroy()
  })
  stream.pipe(res)
}

// خادم HTTP صريح: نقاط صحة/إحصائيات + ملفات ثابتة + ترقية WebSocket
const httpServer = createServer((req, res) => {
  applySecurityHeaders(res)
  const url = (req.url || '/').split('?')[0]
  if (url === '/health') {
    const health = serviceHealth()
    sendJson(res, health.ok ? 200 : 503, health)
    return
  }
  if (url === '/ready') {
    const health = serviceHealth()
    sendJson(res, health.ok ? 200 : 503, { ...health, ready: health.ok })
    return
  }
  if (url === '/metrics') {
    const metrics = serviceMetrics()
    res.writeHead(200, {
      'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(metrics),
    })
    res.end(metrics)
    return
  }
  if (url === '/api/stats') {
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    })
    res.end(JSON.stringify(bankStats.getSnapshot(bankManager.getLiveStats())))
    return
  }

  if (url === '/api/privacy-request' && req.method === 'POST') {
    const ip = req.socket.remoteAddress || 'unknown'
    if (!allowPrivacyRequest(ip)) {
      sendJson(res, 429, { ok: false, message: 'طلبات كثيرة جدًا. حاول مرة أخرى بعد دقيقة.' })
      return
    }
    if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
      sendJson(res, 415, { ok: false, message: 'نوع المحتوى غير مدعوم.' })
      return
    }
    let body = ''
    let tooLarge = false
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      if (tooLarge) return
      body += chunk
      if (body.length > 12_000) {
        tooLarge = true
        sendJson(res, 413, { ok: false, message: 'الطلب أكبر من الحد المسموح.' })
      }
    })
    req.on('end', () => {
      if (tooLarge) return
      try {
        const payload = JSON.parse(body || '{}')
        const requestType = payload.requestType === 'privacy' ? 'privacy' : 'deletion'
        if (requestType === 'privacy') {
          const request = userStore.createPrivacyRequest(payload.handle, payload.message)
          sendJson(res, 202, {
            ok: true,
            requestId: request.id,
            message: `تم استلام طلب الخصوصية. رقم الطلب: ${request.id}`,
          })
          return
        }

        const request = userStore.deleteByHandleVerification(payload.handle, payload.verificationCode)
        const sockets = onlineUsers.get(request.userId)
        if (sockets) {
          for (const socket of sockets) socket.close(1000, 'account_deleted')
          onlineUsers.delete(request.userId)
          broadcastOnlineUserCount()
        }
        sendJson(res, 200, {
          ok: true,
          requestId: request.id,
          message: `تم حذف الحساب وبياناته من خادم ديدوس. رقم العملية: ${request.id}`,
        })
      } catch (error) {
        sendJson(res, 400, { ok: false, message: error?.message || 'تعذر تنفيذ الطلب.' })
      }
    })
    return
  }

  // ‎/dedos.apk ← يقدّم أحدث APK موقّع للإصدار من جذر مساحة العمل إن وُجد
  if (url === '/dedos.apk') {
    if (fs.existsSync(APK_PATH)) {
      sendFile(req, res, APK_PATH, MIME_TYPES['.apk'], {
        cacheControl: 'no-cache',
        downloadName: 'dedos-1.4.0.apk',
      })
    } else {
      sendJson(res, 404, { error: 'apk_not_available', message: 'ملف APK غير متوفر حاليًا — حمّل التطبيق من Google Play.' })
    }
    return
  }

  // ملفات ثابتة من server/public مع حماية صارمة من path traversal
  let pathname
  try {
    pathname = decodeURIComponent(url)
  } catch {
    sendJson(res, 400, { error: 'bad_request' })
    return
  }
  // ارفض البايتات الصفرية والمسارات غير النظيفة مبكرًا
  if (pathname.includes('\0') || pathname.includes('..')) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }
  if (pathname === '/') pathname = '/index.html'
  else if (pathname === '/privacy') pathname = '/privacy.html'
  else if (pathname === '/delete-account') pathname = '/delete-account.html'

  const resolved = path.resolve(PUBLIC_DIR, '.' + pathname)
  // يجب أن يبقى المسار المحلول داخل مجلد public حصرًا
  if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 404, { error: 'not_found' })
    return
  }
  if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    const contentType = MIME_TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream'
    const isHtml = path.extname(resolved).toLowerCase() === '.html'
    sendFile(req, res, resolved, contentType, {
      cacheControl: isHtml ? 'no-cache' : 'public, max-age=86400',
    })
    return
  }

  sendJson(res, 404, { error: 'not_found' })
})

httpServer.requestTimeout = 15_000
httpServer.headersTimeout = 10_000
httpServer.keepAliveTimeout = 5_000

const wss = new WebSocketServer({ server: httpServer, perMessageDeflate: false, maxPayload: MAX_WS_PAYLOAD_BYTES })

// سوكيت افتراضي يمرّر رسائل بروتوكول بنك الحظ عبر نفق {type:'bank', msg}
function ensureBankVws(ws) {
  if (!ws._bankVws) {
    ws._bankVws = {
      readyState: 1,
      send: (raw) => send(ws, { type: 'bank', msg: JSON.parse(raw) }),
    }
    bankManager.register(ws._bankVws)
  }
  return ws._bankVws
}

/** code -> room state: players/names, competitive game state, settings, and optional Shakhbata state. */
const rooms = new Map()

function genCode() {
  let code
  do {
    code = String(Math.floor(1000 + Math.random() * 9000))
  } while (rooms.has(code))
  return code
}

const serializedMessageCache = new WeakMap()

function serialiseMessage(obj) {
  if (!obj || typeof obj !== 'object') return JSON.stringify(obj)
  const cached = serializedMessageCache.get(obj)
  if (cached) return cached
  const payload = JSON.stringify(obj)
  serializedMessageCache.set(obj, payload)
  return payload
}

function send(ws, obj) {
  if (!ws || ws.readyState !== 1) return false
  if (ws.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
    log('warn', 'slow_client_disconnected', { bufferedBytes: ws.bufferedAmount, userId: ws._userId ?? null })
    ws.close(1013, 'slow_client')
    return false
  }
  // Arena snapshots are identical for every member. Cache by object identity
  // so a 100+ KB state is serialized once per arena, not once per socket.
  const payload = serialiseMessage(obj)
  ws.send(payload)
  return true
}

// Public Snake uses its own continuously running, server-authoritative arenas.
// It deliberately does not share the two-player room lifecycle below.
const snakeManager = new SnakeArenaManager({ send })
const paperManager = new PaperArenaManager({ send })

function consumeMessageRate(ws) {
  const now = Date.now()
  if (!ws._messageRate || now - ws._messageRate.startedAt >= MESSAGE_RATE_WINDOW_MS) {
    ws._messageRate = { startedAt: now, count: 1, violations: ws._messageRate?.violations ?? 0 }
    return true
  }
  ws._messageRate.count += 1
  if (ws._messageRate.count <= MESSAGE_RATE_LIMIT) return true
  ws._messageRate.violations += 1
  if (ws._messageRate.violations >= 3) ws.close(1008, 'rate_limit')
  return false
}

function broadcast(room, obj) {
  for (const ws of room.players.values()) send(ws, obj)
}

function clearCompetitiveTimers(room) {
  if (room.memoryTimer) clearTimeout(room.memoryTimer)
  if (room.triviaTimer) clearTimeout(room.triviaTimer)
  if (room.match3Timer) clearTimeout(room.match3Timer)
  if (room.chessTimer) clearTimeout(room.chessTimer)
  room.memoryTimer = null
  room.triviaTimer = null
  room.match3Timer = null
  room.chessTimer = null
}

function memoryEndPayload(room) {
  return {
    type: 'memory_end',
    difficulty: room.memory.difficulty,
    winnerSlot: memoryWinner(room.memory),
    scores: { 1: room.memory.scores.get(1) || 0, 2: room.memory.scores.get(2) || 0 },
    moves: room.memory.moves,
  }
}

function broadcastMemoryState(room, effect = 'sync') {
  if (!room.memory) return
  broadcast(room, { type: 'memory_state', state: memorySnapshot(room.memory), effect })
}

function startMemoryGame(room) {
  clearCompetitiveTimers(room)
  room.trivia = null
  room.match3 = null
  room.memory = createMemoryGame(room.settings?.difficulty)
  broadcastMemoryState(room, 'start')
}

function broadcastTriviaQuestion(room) {
  if (!room.trivia) return
  for (const [slot, ws] of room.players) {
    send(ws, { type: 'trivia_question', ...triviaQuestionSnapshot(room.trivia, slot) })
  }
}

function scheduleTriviaDeadline(room, game) {
  if (room.triviaTimer) clearTimeout(room.triviaTimer)
  const delay = Math.max(0, game.startAt + game.durationMs + 320 - Date.now())
  room.triviaTimer = setTimeout(() => {
    if (room.trivia !== game || game.phase !== 'question') return
    finishTriviaQuestion(room, game)
  }, delay)
}

function finishTriviaQuestion(room, game) {
  if (room.trivia !== game || game.phase !== 'question') return
  if (room.triviaTimer) clearTimeout(room.triviaTimer)
  const result = resolveTriviaQuestion(game)
  broadcast(room, { type: 'trivia_result', ...result })
  room.triviaTimer = setTimeout(() => {
    if (room.trivia !== game || game.phase !== 'result') return
    if (advanceTriviaQuestion(game, Date.now())) {
      broadcastTriviaQuestion(room)
      scheduleTriviaDeadline(room, game)
    } else {
      broadcast(room, { type: 'trivia_end', ...finishTriviaGame(game) })
      room.triviaTimer = null
    }
  }, 2200)
}

function startTriviaGame(room) {
  clearCompetitiveTimers(room)
  room.memory = null
  room.match3 = null
  room.trivia = createTriviaGame()
  broadcastTriviaQuestion(room)
  scheduleTriviaDeadline(room, room.trivia)
}

function sendMatch3State(ws, room, effect = 'sync', move = null) {
  if (!room.match3) return
  send(ws, { type: 'match3_state', ...match3Snapshot(room.match3, ws._slot), effect, move })
}

function broadcastMatch3Scores(room) {
  if (!room.match3) return
  const snapshot = match3Snapshot(room.match3, 1)
  broadcast(room, { type: 'match3_scores', scores: snapshot.scores, endAt: snapshot.endAt, serverTime: snapshot.serverTime })
}

function finishMatch3Room(room, game) {
  if (room.match3 !== game || game.ended) return
  if (room.match3Timer) clearTimeout(room.match3Timer)
  room.match3Timer = null
  broadcast(room, { type: 'match3_end', ...finishMatch3Battle(game) })
}

function startMatch3Game(room) {
  clearCompetitiveTimers(room)
  room.memory = null
  room.trivia = null
  room.match3 = createMatch3Battle()
  for (const ws of room.players.values()) sendMatch3State(ws, room, 'start')
  const game = room.match3
  room.match3Timer = setTimeout(() => finishMatch3Room(room, game), Math.max(0, game.endAt - Date.now() + 40))
}

function broadcastChessState(room, effect = 'sync') {
  if (!room.chess) return
  broadcast(room, { type: 'chess_state', state: chessSnapshot(room.chess), effect })
}

function scheduleChessDeadline(room) {
  if (room.chessTimer) clearTimeout(room.chessTimer)
  room.chessTimer = null
  if (!room.chess || room.chess.ended) return
  const activeSlot = room.chess.chess.turn() === 'w' ? 1 : 2
  const delay = Math.max(0, chessClock(room.chess, activeSlot)) + 30
  const game = room.chess
  room.chessTimer = setTimeout(() => {
    if (room.chess !== game || game.ended || !expireChessClock(game)) return
    room.chessTimer = null
    broadcastChessState(room, 'timeout')
  }, delay)
}

function startChessGame(room) {
  clearCompetitiveTimers(room)
  room.memory = null
  room.trivia = null
  room.match3 = null
  room.chess = createChessGame()
  broadcastChessState(room, 'start')
  scheduleChessDeadline(room)
}

function startCompetitiveGame(room) {
  room.rematchVotes.clear()
  if (room.gameId === 'memory') startMemoryGame(room)
  else if (room.gameId === 'trivia') startTriviaGame(room)
  else if (room.gameId === 'match3') startMatch3Game(room)
  else if (room.gameId === 'chess') startChessGame(room)
}

function sendCompetitiveSync(ws, room) {
  if (room.gameId === 'memory' && room.memory) {
    send(ws, { type: 'memory_state', state: memorySnapshot(room.memory), effect: 'sync' })
    if (room.memory.ended) send(ws, memoryEndPayload(room))
    return
  }
  if (room.gameId === 'match3' && room.match3) {
    sendMatch3State(ws, room)
    if (room.match3.ended) send(ws, { type: 'match3_end', ...finishMatch3Battle(room.match3) })
    return
  }
  if (room.gameId === 'chess' && room.chess) {
    send(ws, { type: 'chess_state', state: chessSnapshot(room.chess), effect: 'sync' })
    return
  }
  if (room.gameId !== 'trivia' || !room.trivia) return
  const game = room.trivia
  if (game.ended) send(ws, { type: 'trivia_end', ...finishTriviaGame(game) })
  else if (game.phase === 'result') send(ws, { type: 'trivia_result', ...game.lastResult })
  else send(ws, { type: 'trivia_question', ...triviaQuestionSnapshot(game, ws._slot) })
}

// تطبيع إعدادات الغرفة: rounds خارج {3,5,7} أو غير موجودة → الافتراضي 5
function normalizeSettings(raw) {
  const rounds = Number(raw && raw.rounds)
  const difficulty = raw?.difficulty === 'medium' || raw?.difficulty === 'hard' ? raw.difficulty : 'easy'
  return {
    rounds: VALID_ROUNDS.has(rounds) ? rounds : DEFAULT_ROUNDS,
    difficulty,
  }
}

// عدد الانتصارات المطلوب لحسم سلسلة "أفضل من N" (أغلبية الجولات)
function seriesWinTarget(room) {
  return Math.floor((room.settings?.rounds ?? DEFAULT_ROUNDS) / 2) + 1
}

const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
function rpsRoundWinner(c1, c2) {
  if (c1 === c2) return 0
  if (RPS_BEATS[c1] === c2) return 1
  if (RPS_BEATS[c2] === c1) return 2
  return 0
}

// تتبّع سلسلة الألعاب الزوجية (حجر ورقة مقص / سرعة البرق): عند بلوغ الهدف يُبث إنهاء السلسلة وتُصفّر النقاط
function bumpSeriesWin(room, table, winnerSlot, endType) {
  const wins = (table.get(winnerSlot) || 0) + 1
  table.set(winnerSlot, wins)
  if (wins >= seriesWinTarget(room)) {
    broadcast(room, {
      type: endType,
      winnerSlot,
      wins: { 1: table.get(1) || 0, 2: table.get(2) || 0 },
      rounds: room.settings.rounds,
    })
    table.clear()
  }
}

// ---------------- الهوية والحضور ----------------
function pushToUser(userId, obj) {
  const sockets = onlineUsers.get(userId)
  if (!sockets) return
  for (const ws of sockets) send(ws, obj)
}

function trackOnline(userId, ws) {
  return trackPresence(onlineUsers, userId, ws)
}

function untrackOnline(userId, ws) {
  return untrackPresence(onlineUsers, userId, ws)
}

function onlineUserCountMessage() {
  return { type: 'online_user_count', count: onlineUserCount(onlineUsers) }
}

function broadcastOnlineUserCount() {
  const message = onlineUserCountMessage()
  for (const client of wss.clients) send(client, message)
}

function gameIdForSocket(ws) {
  const room = rooms.get(ws._room)
  if (room?.players.get(ws._slot) === ws && Object.hasOwn(ACTIVITY_GAMES, room.gameId)) return room.gameId
  if (snakeManager.has(ws)) return 'snake'
  if (paperManager.has(ws)) return 'paper'
  return Object.hasOwn(ACTIVITY_GAMES, ws._activityGameId) ? ws._activityGameId : null
}

function activeGameOf(userId) {
  return activeGameForUser(onlineUsers, userId, gameIdForSocket, ACTIVITY_GAMES)
}

function presenceOf(userId, activeGame = activeGameOf(userId)) {
  const sockets = onlineUsers.get(userId)
  if (!sockets || sockets.size === 0) return 'offline'
  return activeGame ? 'playing' : 'online'
}

function activeInviteOf(userId, viewerUserId) {
  return activeInviteForUser(onlineUsers, rooms, userId, (invite) => (
    userStore.threadById(invite.threadId)?.memberIds.includes(viewerUserId) === true
  ))
}

function friendsListFor(userId) {
  return userStore
    .friendsOf(userId)
    .map((id) => userStore.byId(id))
    .filter(Boolean)
    .map((u) => {
      const activeGame = activeGameOf(u.userId)
      const activeInvite = activeInviteOf(u.userId, userId)
      return {
        ...publicCard(u),
        presence: presenceOf(u.userId, activeGame),
        ...(activeGame ? { activeGame } : {}),
        ...(activeInvite ? { activeInvite } : {}),
      }
    })
}

function friendRequestsFor(userId) {
  const cards = (ids) => ids.map((id) => userStore.byId(id)).filter(Boolean).map(publicCard)
  return {
    incoming: cards(userStore.incomingFriendRequests(userId)),
    outgoing: cards(userStore.outgoingFriendRequests(userId)),
  }
}

function pushFriendRequestsUpdate(userId) {
  pushToUser(userId, { type: 'friend_requests_update', ...friendRequestsFor(userId) })
}

// يُرسل قائمة محدثة للمستخدم ولكل أصدقائه (يُستدعى عند تغيّر الحضور أو العلاقات)
function broadcastFriendsUpdate(userId) {
  pushToUser(userId, { type: 'friends_update', friends: friendsListFor(userId) })
  for (const friendId of userStore.friendsOf(userId)) {
    pushToUser(friendId, { type: 'friends_update', friends: friendsListFor(friendId) })
  }
}

// إنشاء سجل غرفة موحّد (إنشاء عادي / دعوة دردشة / مباراة سريعة)
// settings تُطبيع وتُخزن على السجل قبل تهيئة شخبطة حتى يقرأ المحرك room.settings?.rounds
function createRoomRecord(gameId, drawTime, settings, requestedCode = null) {
  const restoredCode = String(requestedCode || '')
  const code = /^\d{4}$/.test(restoredCode) && !rooms.has(restoredCode) ? restoredCode : genCode()
  const room = {
    code,
    gameId: gameId || 'unknown',
    players: new Map(),
    names: new Map(),
    participants: new Map(),
    rpsChoices: new Map(),
    reactTaps: new Map(),
    rpsWins: new Map(),
    reactWins: new Map(),
    rematchVotes: new Set(),
    memory: null,
    memoryTimer: null,
    trivia: null,
    triviaTimer: null,
    match3: null,
    match3Timer: null,
    chess: null,
    chessTimer: null,
    shak: null,
    settings: normalizeSettings(settings),
    // غرف دعوات المحادثات الفردية تبدأ تلقائيًا عند اكتمال لاعبَين (الجروبات تنتظر المضيف)
    autoStart: false,
    chatInvite: null,
    createdAt: Date.now(),
  }
  if (room.gameId === 'shakhbata') initShakhbata(room, drawTime)
  rooms.set(code, room)
  return room
}

// ---------------- المباراة السريعة ----------------
function removeFromQueues(ws) {
  for (const [gameId, queue] of matchQueues) {
    const next = queue.filter((entry) => entry.ws !== ws)
    if (next.length === 0) matchQueues.delete(gameId)
    else if (next.length !== queue.length) matchQueues.set(gameId, next)
  }
}

function addRoomPlayer(room, slot, ws, profile) {
  const player = {
    name: String(profile?.name || 'لاعب').trim().slice(0, 24) || 'لاعب',
    avatar: String(profile?.avatar || '🎮').slice(0, 8),
  }
  room.players.set(slot, ws)
  room.names.set(slot, player)
  room.participants.set(slot, { ...player, userId: ws._userId ?? null })
}

function resolveReportedFriendGameResult(room, ws, msg) {
  const outcome = ['win', 'loss', 'draw'].includes(msg.outcome) ? msg.outcome : null
  if (!outcome) return null

  let winnerSlot = null
  const requestedSlot = Number(msg.winnerSlot)
  if (Number.isInteger(requestedSlot) && room.participants.has(requestedSlot)) {
    winnerSlot = requestedSlot
  }

  if (winnerSlot == null) {
    const requestedName = String(msg.winnerName || '').trim()
    if (requestedName) {
      winnerSlot = [...room.participants.entries()]
        .find(([, participant]) => participant.name === requestedName)?.[0] ?? null
    }
  }

  if (winnerSlot == null && outcome === 'win' && room.participants.has(ws._slot)) {
    winnerSlot = ws._slot
  }
  if (winnerSlot == null && outcome === 'loss' && room.participants.size === 2) {
    winnerSlot = [...room.participants.keys()].find((slot) => slot !== ws._slot) ?? null
  }
  if (winnerSlot == null && outcome === 'draw') {
    return { kind: 'draw', completedAt: Date.now() }
  }

  const winner = winnerSlot == null ? null : room.participants.get(winnerSlot)
  if (!winner) return null
  return {
    kind: 'winner',
    winnerId: winner.userId,
    winnerName: winner.name,
    winnerAvatar: winner.avatar,
    completedAt: Date.now(),
  }
}

function tryMatch(gameId, queueKey = gameId) {
  const queue = matchQueues.get(queueKey)
  if (!queue) return
  // نخلّي الطابور من المتصلين فقط
  const alive = queue.filter((entry) => entry.ws.readyState === 1)
  while (alive.length >= MATCH_SIZE) {
    const pair = alive.splice(0, MATCH_SIZE)
    // إعدادات أول لاعب في الطابور هي المرجع (المباراة السريعة لا تعرض منتقي جولات → الافتراضي غالبًا)
    const room = createRoomRecord(gameId, undefined, pair[0].settings)
    pair.forEach((entry, index) => {
      const slot = index + 1
      addRoomPlayer(room, slot, entry.ws, { name: entry.name, avatar: entry.avatar })
      entry.ws._room = room.code
      entry.ws._slot = slot
    })
    const [first, second] = pair
    send(first.ws, { type: 'created', code: room.code, slot: 1, settings: room.settings })
    send(second.ws, {
      type: 'joined',
      code: room.code,
      slot: 2,
      gameId: room.gameId,
      players: shakPlayers(room),
      settings: room.settings,
    })
    pair.forEach((entry, index) => {
      const opponent = pair[1 - index]
      send(entry.ws, {
        type: 'matched',
        code: room.code,
        gameId: room.gameId,
        slot: index + 1,
        opponent: { name: opponent.name, avatar: opponent.avatar },
        settings: room.settings,
      })
    })
    broadcastPlayers(room)
    for (const userId of new Set(pair.map((entry) => entry.userId).filter(Boolean))) {
      broadcastFriendsUpdate(userId)
    }
    console.log(`QUICK_MATCH ${room.code} ${gameId} ${first.name} vs ${second.name}`)
  }
  if (alive.length === 0) matchQueues.delete(queueKey)
  else matchQueues.set(queueKey, alive)
}

function otherSlot(slot) {
  return slot === 1 ? 2 : 1
}

function lowestFreeSlot(room, max = SHAKHBATA_MAX) {
  for (let i = 1; i <= max; i++) {
    if (!room.players.has(i)) return i
  }
  return null
}

function cleanupRoom(code) {
  const room = rooms.get(code)
  if (room && room.players.size === 0) {
    clearCompetitiveTimers(room)
    destroyShakhbata(room)
    rooms.delete(code)
    console.log(`ROOM_CLOSED ${code}`)
  }
}

function handleLeave(ws) {
  const code = ws._room
  if (!code) return
  const room = rooms.get(code)
  if (!room) return
  const slot = ws._slot
  room.players.delete(slot)
  ws._room = null
  console.log(`PLAYER_LEFT ${code} slot=${slot}`)
  if (room.gameId === 'shakhbata' && room.shak) {
    shakHandleLeave(room, slot)
    room.names.delete(slot)
    cleanupRoom(code)
    return
  }
  if (room.gameId === 'bank-el7az') {
    // بنك الحظ: فصل اللاعب داخل بروتوكول اللعبة (يبقى قابلًا لإعادة الاتصال بـ playerId)
    if (ws._bankVws) bankManager.handleClose(ws._bankVws)
    room.names.delete(slot)
    broadcastPlayers(room)
    cleanupRoom(code)
    return
  }
  room.names.delete(slot)
  const other = room.players.get(otherSlot(slot))
  if (other) send(other, { type: 'opponent_left' })
  cleanupRoom(code)
}

wss.on('connection', (ws, request) => {
  ws.isAlive = true
  ws._room = null
  ws._slot = null
  ws._activityGameId = null
  ws._ip = request.socket.remoteAddress || 'unknown'
  ws._messageRate = { startedAt: Date.now(), count: 0, violations: 0 }
  snakeManager.track(ws)
  paperManager.track(ws)
  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (raw, isBinary) => {
    if (isBinary) {
      ws.close(1003, 'json_only')
      return
    }
    if (!consumeMessageRate(ws)) {
      send(ws, { type: 'error', message: 'رسائل كثيرة جدًا — انتظر لحظة.' })
      return
    }
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      send(ws, { type: 'error', message: 'صيغة الرسالة غير صحيحة.' })
      return
    }
    if (!msg || Array.isArray(msg) || typeof msg !== 'object' || typeof msg.type !== 'string' || msg.type.length > 40) {
      send(ws, { type: 'error', message: 'صيغة الرسالة غير صحيحة.' })
      return
    }

    switch (msg.type) {
      case 'snake_public_join': {
        handleLeave(ws)
        removeFromQueues(ws)
        paperManager.leave(ws)
        snakeManager.join(ws, { name: msg.name, avatar: msg.avatar, snapshotVersion: msg.snapshotVersion })
        if (ws._userId) broadcastFriendsUpdate(ws._userId)
        break
      }

      case 'snake_public_steer': {
        snakeManager.steer(ws, msg.angle)
        break
      }

      case 'snake_public_respawn': {
        snakeManager.respawn(ws)
        break
      }

      case 'snake_public_leave': {
        const leftSnake = snakeManager.leave(ws)
        if (leftSnake && ws._userId) broadcastFriendsUpdate(ws._userId)
        break
      }

      case 'paper_public_join': {
        handleLeave(ws)
        removeFromQueues(ws)
        snakeManager.leave(ws)
        paperManager.join(ws, { name: msg.name, avatar: msg.avatar })
        if (ws._userId) broadcastFriendsUpdate(ws._userId)
        break
      }

      case 'paper_public_steer': {
        paperManager.steer(ws, msg.angle, msg.sequence)
        break
      }

      case 'paper_public_respawn': {
        paperManager.respawn(ws)
        break
      }

      case 'paper_public_sync': {
        paperManager.sync(ws)
        break
      }

      case 'paper_public_leave': {
        const leftPaper = paperManager.leave(ws)
        if (leftPaper && ws._userId) broadcastFriendsUpdate(ws._userId)
        break
      }

      case 'create': {
        snakeManager.leave(ws)
        paperManager.leave(ws)
        const room = createRoomRecord(msg.gameId || 'unknown', msg.drawTime, msg.settings)
        addRoomPlayer(room, 1, ws, { name: msg.name, avatar: msg.avatar })
        ws._room = room.code
        ws._slot = 1
        send(ws, { type: 'created', code: room.code, slot: 1, settings: room.settings })
        if (room.gameId === 'bank-el7az') ensureBankVws(ws)
        if (ws._userId) broadcastFriendsUpdate(ws._userId)
        console.log(`ROOM_CREATED ${room.code} ${room.gameId} rounds=${room.settings.rounds}`)
        break
      }

      case 'join': {
        snakeManager.leave(ws)
        paperManager.leave(ws)
        const requestedCode = String(msg.code || '')
        let room = rooms.get(requestedCode)
        let inviteRecord = null
        if (msg.threadId || msg.messageId) {
          if (!ws._userId) {
            send(ws, { type: 'error', message: 'سجّل دخولك الأول علشان تفتح الدعوة.' })
            return
          }
          try {
            inviteRecord = userStore.pendingGameInvite(
              String(msg.threadId || ''),
              String(msg.messageId || ''),
              ws._userId,
            )
            if (inviteRecord.message.invite.roomCode !== requestedCode) {
              throw new Error('دعوة اللعبة دي اتغيرت، افتحها من المحادثة تاني.')
            }
          } catch (error) {
            send(ws, { type: 'error', message: error.message })
            return
          }

          const expectedLink = { threadId: inviteRecord.thread.id, messageId: inviteRecord.message.id }
          if (!room) {
            room = createRoomRecord(
              inviteRecord.message.invite.gameId,
              undefined,
              inviteRecord.message.invite.settings,
              requestedCode,
            )
            room.autoStart = inviteRecord.thread.kind === 'dm'
            room.chatInvite = expectedLink
            console.log(`INVITE_ROOM_RESTORED ${room.code} ${room.gameId}`)
          } else if (
            room.chatInvite?.threadId !== expectedLink.threadId ||
            room.chatInvite?.messageId !== expectedLink.messageId
          ) {
            send(ws, { type: 'error', message: 'الغرفة دي مش مرتبطة بالدعوة.' })
            return
          }
        }
        if (!room) {
          send(ws, { type: 'error', message: 'الغرفة غير موجودة، تأكد من الرمز' })
          return
        }
        const me = { name: msg.name || 'لاعب', avatar: msg.avatar || '🎮' }

        // ===== بنك الحظ: حتى 6 لاعبين؛ قبول/رفض الانضمام أثناء اللعب يتم عبر بروتوكول اللعبة نفسه =====
        if (room.gameId === 'bank-el7az') {
          if (room.players.size >= BANK_MAX) {
            send(ws, { type: 'error', message: 'الغرفة ممتلئة' })
            return
          }
          const slot = lowestFreeSlot(room, BANK_MAX)
          addRoomPlayer(room, slot, ws, me)
          ws._room = room.code
          ws._slot = slot
          send(ws, { type: 'joined', code: room.code, slot, gameId: room.gameId, players: shakPlayers(room), autoStart: room.autoStart === true, settings: room.settings })
          broadcastPlayers(room)
          ensureBankVws(ws)
          if (ws._userId) broadcastFriendsUpdate(ws._userId)
          console.log(`PLAYER_JOINED ${room.code} ${me.name} slot=${slot}`)
          return
        }

        // ===== شخبطة: حتى 8 لاعبين =====
        if (room.gameId === 'shakhbata') {
          if (room.players.size >= SHAKHBATA_MAX) {
            send(ws, { type: 'error', message: 'الغرفة ممتلئة' })
            return
          }
          if (room.shak && room.shak.status !== 'lobby') {
            send(ws, { type: 'error', message: 'اللعبة بدأت بالفعل' })
            return
          }
          const slot = lowestFreeSlot(room)
          addRoomPlayer(room, slot, ws, me)
          ws._room = room.code
          ws._slot = slot
          send(ws, { type: 'joined', code: room.code, slot, gameId: room.gameId, players: shakPlayers(room), autoStart: room.autoStart === true, settings: room.settings })
          broadcastPlayers(room)
          if (ws._userId) broadcastFriendsUpdate(ws._userId)
          console.log(`PLAYER_JOINED ${room.code} ${me.name} slot=${slot}`)
          return
        }

        // ===== ألعاب الزوجي (XO/أربعة/حجر ورقة مقص/سرعة البرق): حتى لاعبَين، ويدعم غرف الدعوات الفارغة =====
        if (room.players.size >= 2) {
          send(ws, { type: 'error', message: 'الغرفة ممتلئة' })
          return
        }
        const slot = lowestFreeSlot(room, 2)
        addRoomPlayer(room, slot, ws, me)
        ws._room = room.code
        ws._slot = slot
        const otherSlotNum = otherSlot(slot)
        const other = room.players.get(otherSlotNum)
        send(ws, {
          type: 'joined',
          code: room.code,
          slot,
          gameId: room.gameId,
          opponent: room.names.get(otherSlotNum) ?? undefined,
          autoStart: room.autoStart === true,
          settings: room.settings,
        })
        if (other) send(other, { type: 'opponent_joined', opponent: me, autoStart: room.autoStart === true, settings: room.settings })
        if (ws._userId) broadcastFriendsUpdate(ws._userId)
        console.log(`PLAYER_JOINED ${room.code} ${me.name} slot=${slot}`)
        break
      }

      case 'action': {
        const room = rooms.get(ws._room)
        if (!room) return
        if (msg.action?.kind === 'start' && (room.gameId === 'memory' || room.gameId === 'trivia' || room.gameId === 'match3' || room.gameId === 'chess')) {
          if (ws._slot !== 1 || room.players.size < 2) return
          // start قد يتكرر بسبب إعادة إرسال الشبكة؛ المباراة النشطة لا تُصفّر أبدًا.
          if ((room.memory && !room.memory.ended) || (room.trivia && !room.trivia.ended) || (room.match3 && !room.match3.ended) || (room.chess && !room.chess.ended)) return
          startCompetitiveGame(room)
        }
        const other = room.players.get(otherSlot(ws._slot))
        send(other, { type: 'action', action: msg.action, from: ws._slot })
        break
      }

      case 'game_sync': {
        const room = rooms.get(ws._room)
        if (!room) return
        sendCompetitiveSync(ws, room)
        break
      }

      case 'chess_move': {
        const room = rooms.get(ws._room)
        if (!room || room.gameId !== 'chess' || !room.chess || room.players.size < 2) return
        const outcome = applyChessMove(room.chess, ws._slot, msg.from, msg.to, msg.promotion)
        if (!outcome.accepted) {
          send(ws, { type: 'chess_rejected', reason: outcome.reason, state: chessSnapshot(room.chess) })
          break
        }
        broadcastChessState(room, outcome.ended ? 'end' : 'move')
        scheduleChessDeadline(room)
        break
      }

      case 'chess_resign': {
        const room = rooms.get(ws._room)
        if (!room || room.gameId !== 'chess' || !room.chess || !resignChessGame(room.chess, ws._slot)) return
        if (room.chessTimer) clearTimeout(room.chessTimer)
        room.chessTimer = null
        broadcastChessState(room, 'end')
        break
      }

      case 'memory_flip': {
        const room = rooms.get(ws._room)
        if (!room || room.gameId !== 'memory' || !room.memory || room.players.size < 2) return
        const game = room.memory
        const outcome = applyMemoryFlip(game, ws._slot, msg.index)
        if (!outcome.accepted) return
        broadcastMemoryState(room, outcome.effect)
        if (outcome.ended) {
          broadcast(room, memoryEndPayload(room))
        } else if (outcome.effect === 'miss') {
          room.memoryTimer = setTimeout(() => {
            if (room.memory !== game || !settleMemoryMiss(game)) return
            room.memoryTimer = null
            broadcastMemoryState(room, 'settled')
          }, 900)
        }
        break
      }

      case 'trivia_answer': {
        const room = rooms.get(ws._room)
        if (!room || room.gameId !== 'trivia' || !room.trivia || room.players.size < 2) return
        const game = room.trivia
        if (!submitTriviaAnswer(game, ws._slot, msg.questionIndex, msg.option)) return
        if (game.answers.size === 2) finishTriviaQuestion(room, game)
        else broadcastTriviaQuestion(room)
        break
      }

      case 'match3_swap': {
        const room = rooms.get(ws._room)
        if (!room || room.gameId !== 'match3' || !room.match3 || room.players.size < 2) return
        if (Date.now() >= room.match3.endAt) {
          finishMatch3Room(room, room.match3)
          return
        }
        const result = submitMatch3Swap(room.match3, ws._slot, msg.first, msg.second)
        if (!result.accepted) {
          send(ws, { type: 'match3_rejected', reason: result.reason })
          return
        }
        sendMatch3State(ws, room, 'move', {
          first: Number(msg.first),
          second: Number(msg.second),
          scoreDelta: result.scoreDelta,
          cleared: result.cleared,
          cascades: result.cascades,
          createdSpecial: result.createdSpecial,
          reshuffled: result.reshuffled,
        })
        broadcastMatch3Scores(room)
        break
      }

      case 'rps_choice': {
        const room = rooms.get(ws._room)
        if (!room || room.players.size < 2) return
        room.rpsChoices.set(ws._slot, msg.choice)
        if (room.rpsChoices.size === 2) {
          const c1 = room.rpsChoices.get(1)
          const c2 = room.rpsChoices.get(2)
          broadcast(room, {
            type: 'rps_reveal',
            choices: { 1: c1, 2: c2 },
          })
          room.rpsChoices.clear()
          // سلسلة "أفضل من N" بقيادة الخادم: settings.rounds ∈ {3,5,7} (الافتراضي 5)
          const winnerSlot = rpsRoundWinner(c1, c2)
          if (winnerSlot) bumpSeriesWin(room, room.rpsWins, winnerSlot, 'rps_series_end')
        }
        break
      }

      case 'react_tap': {
        const room = rooms.get(ws._room)
        if (!room || room.players.size < 2) return
        if (room.reactTaps.has(ws._slot)) return
        room.reactTaps.set(ws._slot, { ms: msg.ms ?? null, foul: !!msg.foul, at: Date.now() })
        if (room.reactTaps.size === 2) {
          const t1 = room.reactTaps.get(1)
          const t2 = room.reactTaps.get(2)
          let winnerSlot
          if (t1.foul && t2.foul) winnerSlot = 0
          else if (t1.foul) winnerSlot = 2
          else if (t2.foul) winnerSlot = 1
          else winnerSlot = t1.at <= t2.at ? 1 : 2
          broadcast(room, {
            type: 'react_result',
            winnerSlot,
            times: { 1: t1.ms, 2: t2.ms },
            fouls: { 1: t1.foul, 2: t2.foul },
          })
          room.reactTaps.clear()
          // سلسلة "أفضل من N" بقيادة الخادم (التعادل المزدوج winnerSlot=0 لا يحتسب)
          if (winnerSlot) bumpSeriesWin(room, room.reactWins, winnerSlot, 'react_series_end')
        }
        break
      }

      case 'rematch': {
        const room = rooms.get(ws._room)
        if (!room) return
        if (room.gameId === 'memory' && room.memory && !room.memory.ended) return
        if (room.gameId === 'trivia' && room.trivia && !room.trivia.ended) return
        if (room.gameId === 'match3' && room.match3 && !room.match3.ended) return
        if (room.gameId === 'chess' && room.chess && !room.chess.ended) return
        room.rematchVotes.add(ws._slot)
        const other = room.players.get(otherSlot(ws._slot))
        send(other, { type: 'rematch', from: ws._slot })
        if (room.rematchVotes.size === 2) startCompetitiveGame(room)
        break
      }

      // نفق بنك الحظ: {type:'bank', msg:<رسالة البروتوكول الأصلية كما هي>}
      case 'bank': {
        const room = rooms.get(ws._room)
        if (!room || room.gameId !== 'bank-el7az') return
        const parsed = parseClientMessage(JSON.stringify(msg.msg))
        if (!parsed) return
        const vws = ensureBankVws(ws)
        if (parsed.type === 'CREATE_ROOM') {
          // انحراف موثّق: كود غرفة البنك هو كود قييمد ذو الـ 4 أرقام (بدل كود الـ 5 حروف)
          bankManager.createRoomDirect(vws, parsed.payload.name, room.code)
          return
        }
        bankManager.handleMessage(vws, parsed)
        break
      }

      case 'leave': {
        snakeManager.leave(ws)
        paperManager.leave(ws)
        const room = rooms.get(ws._room)
        if (room && room.gameId === 'bank-el7az' && ws._bankVws) {
          // مغادرة صريحة: تمرير LEAVE_ROOM لبروتوكول البنك ثم الفصل
          bankManager.handleMessage(ws._bankVws, { type: 'LEAVE_ROOM' })
        }
        handleLeave(ws)
        if (ws._userId) broadcastFriendsUpdate(ws._userId)
        break
      }

      // ---------------- الهوية ----------------
      case 'identify': {
        try {
          const { user, created } = userStore.identify({
            deviceId: String(msg.deviceId || ''),
            name: msg.name,
            avatar: msg.avatar,
            handle: msg.handle,
            xp: msg.xp,
          })
          ws._userId = user.userId
          const becameOnline = trackOnline(user.userId, ws)
          send(ws, { type: 'identified', user: { ...publicCard(user), createdAt: user.createdAt }, created })
          send(ws, { type: 'session_state', inRoom: Boolean(ws._room), serverStartedAt: STARTED_AT })
          if (becameOnline) broadcastOnlineUserCount()
          else send(ws, onlineUserCountMessage())
          broadcastFriendsUpdate(user.userId)
          pushFriendRequestsUpdate(user.userId)
          console.log(`IDENTIFY ${user.handle} (${created ? 'جديد' : 'عائد'})`)
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'set_handle': {
        if (!ws._userId) return
        try {
          const user = userStore.setHandle(ws._userId, msg.handle)
          send(ws, { type: 'handle_set', user: publicCard(user) })
        } catch (error) {
          send(ws, { type: 'handle_error', message: error.message })
        }
        break
      }

      case 'search_user': {
        const handle = String(msg.handle || '').trim().toLowerCase().replace(/^@/, '')
        const found = handle ? userStore.byHandle(handle) : null
        send(ws, {
          type: 'search_result',
          handle,
          user: found && found.userId !== ws._userId ? publicCard(found) : null,
        })
        break
      }

      case 'user_profile': {
        if (!ws._userId) return
        const targetUserId = String(msg.userId || '')
        const requestId = String(msg.requestId || '').slice(0, 80)
        const canView = targetUserId === ws._userId || userStore.areFriends(ws._userId, targetUserId)
        const user = canView ? userStore.byId(targetUserId) : null
        const activeGame = user ? activeGameOf(targetUserId) : null
        send(ws, {
          type: 'user_profile',
          requestId,
          profile: user ? {
            ...publicProfile(user),
            presence: presenceOf(targetUserId, activeGame),
            ...(activeGame ? { activeGame } : {}),
          } : null,
        })
        break
      }

      case 'profile_stats': {
        if (!ws._userId) return
        userStore.updateStats(ws._userId, msg.stats)
        break
      }

      // ---------------- الأصدقاء ----------------
      case 'friend_add':
      case 'friend_request': {
        if (!ws._userId) return
        try {
          const recipient = userStore.requestFriend(ws._userId, String(msg.userId || ''))
          pushFriendRequestsUpdate(ws._userId)
          pushFriendRequestsUpdate(recipient.userId)
          send(ws, { type: 'friend_request_sent', user: publicCard(recipient) })
          pushToUser(recipient.userId, {
            type: 'friend_request_received',
            user: publicCard(userStore.byId(ws._userId)),
          })
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'activity': {
        const requestedGameId = String(msg.gameId || '')
        const nextGameId = Object.hasOwn(ACTIVITY_GAMES, requestedGameId) ? requestedGameId : null
        if (ws._activityGameId === nextGameId) return
        ws._activityGameId = nextGameId
        if (ws._userId) broadcastFriendsUpdate(ws._userId)
        break
      }

      case 'push_register': {
        if (!ws._userId) return
        try {
          const registration = userStore.registerPushToken(ws._userId, msg.token, msg.platform)
          send(ws, { type: 'push_registered', platform: registration.platform, configured: pushNotifications.configured })
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'friend_accept': {
        if (!ws._userId) return
        try {
          const requester = userStore.acceptFriend(ws._userId, String(msg.userId || ''))
          const accepter = userStore.byId(ws._userId)
          broadcastFriendsUpdate(ws._userId)
          broadcastFriendsUpdate(requester.userId)
          pushFriendRequestsUpdate(ws._userId)
          pushFriendRequestsUpdate(requester.userId)
          send(ws, { type: 'friend_accepted', user: publicCard(requester) })
          pushToUser(requester.userId, { type: 'friend_accepted', user: publicCard(accepter) })
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'friend_reject': {
        if (!ws._userId) return
        const requesterId = String(msg.userId || '')
        try {
          userStore.rejectFriend(ws._userId, requesterId)
          pushFriendRequestsUpdate(ws._userId)
          if (userStore.byId(requesterId)) pushFriendRequestsUpdate(requesterId)
          send(ws, { type: 'friend_request_rejected', userId: requesterId })
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'friend_request_cancel': {
        if (!ws._userId) return
        const recipientId = String(msg.userId || '')
        try {
          userStore.cancelFriendRequest(ws._userId, recipientId)
          pushFriendRequestsUpdate(ws._userId)
          if (userStore.byId(recipientId)) pushFriendRequestsUpdate(recipientId)
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'friend_remove': {
        if (!ws._userId) return
        const friendId = String(msg.userId || '')
        userStore.removeFriend(ws._userId, friendId)
        broadcastFriendsUpdate(ws._userId)
        if (userStore.byId(friendId)) broadcastFriendsUpdate(friendId)
        pushFriendRequestsUpdate(ws._userId)
        if (userStore.byId(friendId)) pushFriendRequestsUpdate(friendId)
        break
      }

      case 'friends_list': {
        if (!ws._userId) return
        send(ws, { type: 'friends_update', friends: friendsListFor(ws._userId) })
        send(ws, { type: 'friend_requests_update', ...friendRequestsFor(ws._userId) })
        break
      }

      case 'friend_requests_list': {
        if (!ws._userId) return
        send(ws, { type: 'friend_requests_update', ...friendRequestsFor(ws._userId) })
        break
      }

      // ---------------- الدردشات ----------------
      case 'chat_create_dm': {
        if (!ws._userId) return
        const otherId = String(msg.userId || '')
        if (!userStore.byId(otherId)) {
          send(ws, { type: 'error', message: 'المستخدم ده مش موجود.' })
          return
        }
        const { thread, created } = userStore.getOrCreateDm(ws._userId, otherId)
        send(ws, { type: 'chat_thread', thread: userStore.threadSummary(thread, ws._userId) })
        if (created) {
          pushToUser(otherId, { type: 'chat_update', thread: userStore.threadSummary(thread, otherId) })
        }
        break
      }

      case 'chat_create_group': {
        if (!ws._userId) return
        try {
          const memberIds = Array.isArray(msg.memberIds) ? msg.memberIds.map(String) : []
          const thread = userStore.createGroup(msg.name, memberIds, ws._userId)
          for (const memberId of thread.memberIds) {
            pushToUser(memberId, { type: 'chat_update', thread: userStore.threadSummary(thread, memberId) })
          }
          send(ws, { type: 'chat_thread', thread: userStore.threadSummary(thread, ws._userId) })
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'chat_list': {
        if (!ws._userId) return
        send(ws, { type: 'chat_threads', threads: userStore.threadsOf(ws._userId) })
        break
      }

      case 'chat_history': {
        if (!ws._userId) return
        try {
          const thread = userStore.history(String(msg.threadId || ''), ws._userId)
          send(ws, {
            type: 'chat_history',
            threadId: thread.id,
            messages: thread.messages,
            thread: userStore.threadSummary(thread, ws._userId),
          })
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'chat_send': {
        if (!ws._userId) return
        try {
          const threadId = String(msg.threadId || '')
          const kind = msg.kind === 'game_invite' ? 'game_invite' : 'text'
          let invite = null
          let inviteRoom = null
          let text = String(msg.text ?? '')
          if (kind === 'game_invite') {
            const gameId = String(msg.invite?.gameId || '')
            const game = INVITE_GAMES[gameId]
            if (!game) {
              send(ws, { type: 'error', message: 'اللعبة دي مش متاحة للدعوات.' })
              return
            }
            // الخادم ينشئ غرفة الدعوة ويضمّن الكود في الرسالة (مع إعدادات الجولات إن وُجدت)
            const room = createRoomRecord(gameId, undefined, msg.settings)
            inviteRoom = room
            // دعوات المحادثة الفردية (DM) تدخل الطرفين في اللعب مباشرة: تبدأ تلقائيًا عند اكتمال لاعبَين
            const inviteThread = userStore.threadById(threadId)
            room.autoStart = inviteThread?.kind === 'dm'
            invite = { gameId, roomCode: room.code, gameName: game.name, gameEmoji: game.emoji, settings: room.settings }
            text = `دعوة للعب ${game.name}`
            console.log(`INVITE_ROOM ${room.code} ${gameId} rounds=${room.settings.rounds}${room.autoStart ? ' autoStart' : ''}`)
          }
          const clientId = typeof msg.clientId === 'string' ? msg.clientId : null
          const { thread, message, created } = userStore.postMessage(threadId, ws._userId, { text, kind, invite, clientId })
          if (created && inviteRoom) {
            inviteRoom.chatInvite = { threadId: thread.id, messageId: message.id }
          }
          for (const memberId of thread.memberIds) {
            pushToUser(memberId, {
              type: 'chat_message',
              threadId: thread.id,
              message,
              thread: userStore.threadSummary(thread, memberId),
            })
          }
          if (created) void pushNotifications.sendChatNotification({ thread, message, senderId: ws._userId })
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'chat_game_result': {
        if (!ws._userId) return
        const room = rooms.get(ws._room)
        const link = room?.chatInvite
        if (
          !room ||
          !link ||
          String(msg.roomCode || '') !== room.code ||
          String(msg.threadId || '') !== link.threadId ||
          room.participants.get(ws._slot)?.userId !== ws._userId
        ) {
          send(ws, { type: 'error', message: 'تعذر حفظ نتيجة المباراة.' })
          return
        }
        const result = resolveReportedFriendGameResult(room, ws, msg)
        if (!result) {
          send(ws, { type: 'error', message: 'نتيجة المباراة غير مكتملة.' })
          return
        }
        try {
          const { thread, message } = userStore.completeGameInvite(
            link.threadId,
            link.messageId,
            ws._userId,
            result,
          )
          for (const memberId of thread.memberIds) {
            pushToUser(memberId, {
              type: 'chat_game_result',
              threadId: thread.id,
              message,
              thread: userStore.threadSummary(thread, memberId),
            })
          }
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      case 'chat_react': {
        if (!ws._userId) return
        try {
          const { thread, message } = userStore.toggleMessageHeart(
            String(msg.threadId || ''),
            String(msg.messageId || ''),
            ws._userId,
          )
          for (const memberId of thread.memberIds) {
            pushToUser(memberId, {
              type: 'chat_reaction',
              threadId: thread.id,
              messageId: message.id,
              heartUserIds: message.heartUserIds,
            })
          }
        } catch (error) {
          send(ws, { type: 'error', message: error.message })
        }
        break
      }

      // ---------------- المباراة السريعة ----------------
      case 'quick_match': {
        snakeManager.leave(ws)
        paperManager.leave(ws)
        if (ws._room) return
        const gameId = String(msg.gameId || '')
        if (!INVITE_GAMES[gameId]) {
          send(ws, { type: 'error', message: 'اللعبة دي مش متاحة للمباراة السريعة.' })
          return
        }
        removeFromQueues(ws)
        const settings = normalizeSettings(msg.settings)
        const queueKey = gameId === 'memory' ? `${gameId}:${settings.difficulty}` : gameId
        const queue = matchQueues.get(queueKey) ?? []
        queue.push({
          ws,
          userId: ws._userId ?? null,
          name: String(msg.name || 'لاعب'),
          avatar: String(msg.avatar || '🎮'),
          settings,
          at: Date.now(),
        })
        matchQueues.set(queueKey, queue)
        send(ws, { type: 'quick_match_waiting', gameId })
        if (ws._userId) broadcastFriendsUpdate(ws._userId)
        tryMatch(gameId, queueKey)
        break
      }

      case 'quick_match_cancel': {
        removeFromQueues(ws)
        send(ws, { type: 'quick_match_cancelled' })
        break
      }

      // رسائل شخبطة: start / choose_word / draw / guess
      case 'start':
      case 'choose_word':
      case 'draw':
      case 'guess': {
        const room = rooms.get(ws._room)
        if (!room || !room.shak) return
        shakHandleMessage(room, ws, msg)
        break
      }
    }
  })

  ws.on('close', () => {
    handleLeave(ws)
    removeFromQueues(ws)
    snakeManager.untrack(ws)
    paperManager.untrack(ws)
    if (ws._userId) {
      const becameOffline = untrackOnline(ws._userId, ws)
      if (becameOffline) broadcastOnlineUserCount()
      broadcastFriendsUpdate(ws._userId)
    }
  })
  ws.on('error', () => {})
})

// نبضات القلب: قطع الاتصالات الميتة + جمع غرف الدعوات الفارغة المنتهية
const heartbeatTimer = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      handleLeave(ws)
      ws.terminate()
      continue
    }
    ws.isAlive = false
    try {
      ws.ping()
    } catch {
      /* ignore */
    }
  }
  const now = Date.now()
  for (const [code, room] of rooms) {
    if (room.players.size === 0 && now - (room.createdAt ?? 0) > INVITE_ROOM_TTL_MS) {
      destroyShakhbata(room)
      rooms.delete(code)
      console.log(`INVITE_ROOM_EXPIRED ${code}`)
    }
  }
  for (const [ip, rate] of privacyRateLimits) {
    if (now - rate.startedAt > PRIVACY_RATE_WINDOW_MS * 2) privacyRateLimits.delete(ip)
  }
}, 20000)
if (heartbeatTimer.unref) heartbeatTimer.unref()

// تنظيف غرف بنك الحظ المنتهية الصلاحية كل 10 دقائق
const bankCleanupTimer = setInterval(() => bankManager.cleanup(), 10 * 60 * 1000)
if (bankCleanupTimer.unref) bankCleanupTimer.unref()

httpServer.listen(PORT, () => {
  log('info', 'server_started', { port: PORT, version: APP_VERSION })
})

let lastSnakeTickAt = performance.now()
const snakeTickTimer = setInterval(() => {
  const now = performance.now()
  const elapsedSeconds = Math.min(0.15, Math.max(0.001, (now - lastSnakeTickAt) / 1_000))
  lastSnakeTickAt = now
  const maximumStep = SNAKE_TICK_MS / 1_000
  const stepCount = Math.max(1, Math.ceil(elapsedSeconds / maximumStep))
  const stepSeconds = elapsedSeconds / stepCount
  for (let step = 0; step < stepCount; step += 1) snakeManager.tick(stepSeconds)
}, SNAKE_TICK_MS)
if (snakeTickTimer.unref) snakeTickTimer.unref()
const snakeSnapshotTimer = setInterval(() => snakeManager.broadcastSnapshots(), SNAKE_SNAPSHOT_MS)
if (snakeSnapshotTimer.unref) snakeSnapshotTimer.unref()

let lastPaperTickAt = performance.now()
const paperTickTimer = setInterval(() => {
  const now = performance.now()
  const elapsedSeconds = Math.min(0.15, Math.max(0.001, (now - lastPaperTickAt) / 1_000))
  lastPaperTickAt = now
  const maximumStep = PAPER_TICK_MS / 1_000
  const stepCount = Math.max(1, Math.ceil(elapsedSeconds / maximumStep))
  const stepSeconds = elapsedSeconds / stepCount
  for (let step = 0; step < stepCount; step += 1) paperManager.tick(stepSeconds)
}, PAPER_TICK_MS)
if (paperTickTimer.unref) paperTickTimer.unref()
const paperSnapshotTimer = setInterval(() => paperManager.broadcastSnapshots(), PAPER_SNAPSHOT_MS)
if (paperSnapshotTimer.unref) paperSnapshotTimer.unref()

httpServer.on('error', (error) => {
  log('error', 'http_server_error', { message: error.message, code: error.code ?? null })
  if (error.code === 'EADDRINUSE' || error.code === 'EACCES') void shutdown('http_server_error', 1)
})

let shuttingDown = false
async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  log('info', 'server_shutdown_started', { reason, connections: wss.clients.size, rooms: rooms.size })
  clearInterval(heartbeatTimer)
  clearInterval(bankCleanupTimer)
  clearInterval(snakeTickTimer)
  clearInterval(snakeSnapshotTimer)
  clearInterval(paperTickTimer)
  clearInterval(paperSnapshotTimer)

  for (const room of rooms.values()) clearCompetitiveTimers(room)
  for (const ws of wss.clients) {
    send(ws, { type: 'server_shutdown', retry: true })
    try {
      ws.close(1001, 'server_restart')
    } catch {
      ws.terminate()
    }
  }

  const forceTimer = setTimeout(() => {
    for (const ws of wss.clients) ws.terminate()
    httpServer.closeAllConnections?.()
  }, 2_000)
  if (forceTimer.unref) forceTimer.unref()

  await new Promise((resolve) => httpServer.close(resolve))
  clearTimeout(forceTimer)
  try {
    userStore.flushAll()
    bankStats.flush()
    database.close()
    log('info', 'server_shutdown_complete', { reason })
  } catch (error) {
    exitCode = 1
    log('error', 'server_shutdown_storage_error', { message: error.message })
  }
  process.exit(exitCode)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('uncaughtException', (error) => {
  log('error', 'uncaught_exception', { message: error.message, stack: error.stack })
  void shutdown('uncaughtException', 1)
})
process.on('unhandledRejection', (error) => {
  log('error', 'unhandled_rejection', { message: error?.message ?? String(error), stack: error?.stack })
  void shutdown('unhandledRejection', 1)
})
