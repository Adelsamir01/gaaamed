import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { createClient } from 'redis'

const PRESENCE_HEARTBEAT_MS = 10_000
const PRESENCE_TTL_MS = 35_000
const REFRESH_DEBOUNCE_MS = 250
const MAX_EVENT_BYTES = 128 * 1024
const PRESENCE_ADD_SCRIPT = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
  redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
  redis.call('PEXPIRE', KEYS[1], ARGV[4])
  redis.call('ZADD', KEYS[2], 'GT', ARGV[2], ARGV[5])
  return 1
`
const PRESENCE_REMOVE_SCRIPT = `
  redis.call('ZREM', KEYS[1], ARGV[1])
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[2])
  local latest = redis.call('ZRANGE', KEYS[1], -1, -1, 'WITHSCORES')
  if #latest == 0 then
    redis.call('DEL', KEYS[1])
    redis.call('ZREM', KEYS[2], ARGV[3])
  else
    redis.call('ZADD', KEYS[2], latest[2], ARGV[3])
  end
  return 1
`

function enabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

export class RedisCoordinator extends EventEmitter {
  static async open(url, environment = process.env) {
    const coordinator = new RedisCoordinator(url, environment)
    await coordinator.connect()
    return coordinator
  }

  constructor(url, environment = process.env) {
    super()
    this.instanceId = String(environment.DEDOS_INSTANCE_ID || randomUUID())
    this.prefix = String(environment.DEDOS_REDIS_PREFIX || 'dedos').replace(/:+$/, '')
    this.command = createClient({ url })
    this.subscriber = this.command.duplicate()
    this.localUsers = new Set()
    this.publishedUsers = new Set()
    this.onlineCount = 0
    this.lastError = null
    this.closed = false
    this.refreshTimer = null
    this.heartbeatTimer = null
    this.refreshChain = Promise.resolve()
    this.command.on('error', (error) => {
      this.lastError = error
    })
    this.subscriber.on('error', (error) => {
      this.lastError = error
    })
  }

  get presenceKey() {
    return `${this.prefix}:presence`
  }

  get userEventChannel() {
    return `${this.prefix}:user-events`
  }

  get onlineCountChannel() {
    return `${this.prefix}:online-count`
  }

  async connect() {
    await Promise.all([this.command.connect(), this.subscriber.connect()])
    await this.subscriber.subscribe(this.userEventChannel, (raw) => {
      try {
        const event = JSON.parse(raw)
        if (event.source === this.instanceId || typeof event.userId !== 'string') return
        this.emit('user-event', { userId: event.userId, payload: event.payload })
      } catch {
        // Ignore malformed events from another publisher.
      }
    })
    await this.subscriber.subscribe(this.onlineCountChannel, (raw) => {
      const count = Math.max(0, Math.floor(Number(raw) || 0))
      if (count === this.onlineCount) return
      this.onlineCount = count
      this.emit('online-count', count)
    })
    await this.refreshPresence()
    this.heartbeatTimer = setInterval(() => void this.refreshPresence(true), PRESENCE_HEARTBEAT_MS)
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref()
  }

  setLocalUsers(userIds) {
    this.localUsers = new Set(userIds)
    if (this.refreshTimer || this.closed) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      void this.refreshPresence()
    }, REFRESH_DEBOUNCE_MS)
    if (this.refreshTimer.unref) this.refreshTimer.unref()
  }

  presenceUserKey(userId) {
    return `${this.prefix}:presence-user:${encodeURIComponent(userId)}`
  }

  refreshPresence(heartbeat = false) {
    if (this.closed) return Promise.resolve(this.onlineCount)
    this.refreshChain = this.refreshChain.then(() => this.performPresenceRefresh(heartbeat))
    return this.refreshChain
  }

  async performPresenceRefresh(heartbeat) {
    try {
      const now = Date.now()
      const expiresAt = now + PRESENCE_TTL_MS
      const currentUsers = new Set(this.localUsers)
      const additions = heartbeat
        ? [...currentUsers]
        : [...currentUsers].filter((userId) => !this.publishedUsers.has(userId))
      const removals = [...this.publishedUsers].filter((userId) => !currentUsers.has(userId))
      await Promise.all([
        ...additions.map((userId) => this.command.eval(PRESENCE_ADD_SCRIPT, {
          keys: [this.presenceUserKey(userId), this.presenceKey],
          arguments: [
            String(now),
            String(expiresAt),
            this.instanceId,
            String(PRESENCE_TTL_MS + 5_000),
            userId,
          ],
        })),
        ...removals.map((userId) => this.command.eval(PRESENCE_REMOVE_SCRIPT, {
          keys: [this.presenceUserKey(userId), this.presenceKey],
          arguments: [this.instanceId, String(now), userId],
        })),
      ])
      this.publishedUsers = currentUsers
      const results = await this.command.multi()
        .zRemRangeByScore(this.presenceKey, 0, now)
        .zCard(this.presenceKey)
        .exec()
      const count = Number(results[1]) || 0
      const changed = count !== this.onlineCount
      this.onlineCount = count
      this.lastError = null
      if (changed) {
        this.emit('online-count', count)
        await this.command.publish(this.onlineCountChannel, String(count))
      }
      return count
    } catch (error) {
      this.lastError = error
      return this.onlineCount
    }
  }

  async publishUserEvent(userId, payload) {
    if (this.closed) return false
    const event = JSON.stringify({ source: this.instanceId, userId, payload })
    if (Buffer.byteLength(event) > MAX_EVENT_BYTES) return false
    try {
      await this.command.publish(this.userEventChannel, event)
      this.lastError = null
      return true
    } catch (error) {
      this.lastError = error
      return false
    }
  }

  health() {
    return {
      ok: !this.closed && !this.lastError,
      engine: 'redis',
      instanceId: this.instanceId,
      ...(this.lastError ? { error: this.lastError.message } : {}),
    }
  }

  async close() {
    if (this.closed) return
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.localUsers.clear()
    await this.refreshPresence()
    this.closed = true
    await Promise.allSettled([this.subscriber.close(), this.command.close()])
  }
}

export async function openCoordinator(environment = process.env, logger = () => {}) {
  const url = String(environment.DEDOS_REDIS_URL ?? '').trim()
  if (!url) return null
  try {
    return await RedisCoordinator.open(url, environment)
  } catch (error) {
    if (enabled(environment.DEDOS_REDIS_REQUIRED)) throw error
    logger('warn', 'redis_coordinator_unavailable', { message: error.message })
    return null
  }
}
