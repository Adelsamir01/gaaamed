import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

const MODULE_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SERVICE_ACCOUNT_PATH = resolve(MODULE_DIR, 'firebase-service-account.json')
const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-argument',
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

function parseServiceAccount(raw, source) {
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) throw new Error('required fields are missing')
    return parsed
  } catch (error) {
    throw new Error(`Invalid Firebase service account from ${source}: ${error.message}`)
  }
}

function configuredCredential(environment) {
  if (environment.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const raw = Buffer.from(environment.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
    const account = parseServiceAccount(raw, 'FIREBASE_SERVICE_ACCOUNT_BASE64')
    return { credential: cert(account), projectId: environment.FIREBASE_PROJECT_ID || account.project_id }
  }
  if (environment.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const account = parseServiceAccount(environment.FIREBASE_SERVICE_ACCOUNT_JSON, 'FIREBASE_SERVICE_ACCOUNT_JSON')
    return { credential: cert(account), projectId: environment.FIREBASE_PROJECT_ID || account.project_id }
  }

  const configuredPath = String(environment.FIREBASE_SERVICE_ACCOUNT_FILE || '').trim()
  const serviceAccountPath = configuredPath ? resolve(configuredPath) : DEFAULT_SERVICE_ACCOUNT_PATH
  if (existsSync(serviceAccountPath)) {
    const account = parseServiceAccount(readFileSync(serviceAccountPath, 'utf8'), serviceAccountPath)
    return { credential: cert(account), projectId: environment.FIREBASE_PROJECT_ID || account.project_id }
  }

  if (environment.GOOGLE_APPLICATION_CREDENTIALS || environment.FIREBASE_PROJECT_ID) {
    return { credential: applicationDefault(), projectId: environment.FIREBASE_PROJECT_ID || undefined }
  }
  return null
}

export function createFirebaseMessaging(environment = process.env) {
  const configured = configuredCredential(environment)
  if (!configured) return null
  const existing = getApps().find((app) => app.name === 'dedos-push')
  const app = existing ?? initializeApp(configured, 'dedos-push')
  return getMessaging(app)
}

function notificationText(message) {
  if (message.kind === 'game_invite') {
    const gameName = String(message.invite?.gameName || 'لعبة').trim().slice(0, 48)
    const gameEmoji = String(message.invite?.gameEmoji || '🎮').trim().slice(0, 8)
    return `${gameEmoji} عازمك تلعب ${gameName}`
  }
  return String(message.text || 'رسالة جديدة').replace(/\s+/g, ' ').trim().slice(0, 160) || 'رسالة جديدة'
}

export class PushNotificationService {
  constructor({ tokenStore, messaging = null, logger = () => {} }) {
    this.tokenStore = tokenStore
    this.messaging = messaging
    this.logger = logger
  }

  get configured() {
    return Boolean(this.messaging)
  }

  async sendChatNotification({ thread, message, senderId }) {
    const recipientIds = thread.memberIds.filter((userId) => userId !== senderId)
    const registrations = this.tokenStore.registrationsForUsers(recipientIds)
    if (registrations.length === 0) return { sent: 0, failed: 0, skipped: 'no_registered_devices' }
    if (!this.messaging) return { sent: 0, failed: 0, skipped: 'firebase_not_configured' }

    const tokens = registrations.map(({ token }) => token)
    try {
      const result = await this.messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: String(message.senderName || 'ديدوس').trim().slice(0, 64),
          body: notificationText(message),
        },
        data: {
          type: 'chat',
          threadId: String(thread.id),
          messageId: String(message.id),
          messageKind: message.kind === 'game_invite' ? 'game_invite' : 'text',
          senderId: String(senderId),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'dedos-social',
            icon: 'ic_stat_dedos',
            color: '#10B981',
            sound: 'default',
            tag: `chat-${thread.id}`,
            visibility: 'public',
          },
        },
      })

      const invalidTokens = []
      result.responses.forEach((response, index) => {
        if (!response.success && INVALID_TOKEN_CODES.has(response.error?.code)) invalidTokens.push(tokens[index])
      })
      if (invalidTokens.length > 0) this.tokenStore.removePushTokens(invalidTokens)
      this.logger('info', 'push_chat_delivery', {
        threadId: thread.id,
        kind: message.kind,
        sent: result.successCount,
        failed: result.failureCount,
        invalidTokensRemoved: invalidTokens.length,
      })
      return { sent: result.successCount, failed: result.failureCount }
    } catch (error) {
      this.logger('error', 'push_chat_delivery_error', {
        threadId: thread.id,
        message: error?.message || String(error),
      })
      return { sent: 0, failed: registrations.length, error: error?.message || String(error) }
    }
  }
}
