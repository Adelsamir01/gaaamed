import { Capacitor } from '@capacitor/core'
import { PushNotifications, type ActionPerformed } from '@capacitor/push-notifications'

export const OPEN_NOTIFICATION_CHAT_EVENT = 'dedos:open-notification-chat'

type TokenListener = (token: string) => void

const tokenListeners = new Set<TokenListener>()
let currentToken: string | null = null
let pendingThreadId: string | null = null
let initialization: Promise<void> | null = null

function cleanThreadId(value: unknown): string | null {
  const threadId = String(value ?? '').trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(threadId) ? threadId : null
}

export function openNotificationThread(value: unknown): boolean {
  const threadId = cleanThreadId(value)
  if (!threadId) return false
  pendingThreadId = threadId
  window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATION_CHAT_EVENT, { detail: { threadId } }))
  return true
}

function openNotificationChat(action: ActionPerformed): void {
  openNotificationThread(action.notification.data?.threadId)
}

export function consumePendingNotificationThread(): string | null {
  const threadId = pendingThreadId
  pendingThreadId = null
  return threadId
}

export function getCurrentPushToken(): string | null {
  return currentToken
}

export function onPushToken(listener: TokenListener): () => void {
  tokenListeners.add(listener)
  if (currentToken) listener(currentToken)
  return () => tokenListeners.delete(listener)
}

export function initializePushNotifications(): Promise<void> {
  if (initialization) return initialization
  if (!Capacitor.isNativePlatform()) return Promise.resolve()

  initialization = (async () => {
    await PushNotifications.addListener('registration', ({ value }) => {
      const token = value.trim()
      if (!token) return
      currentToken = token
      tokenListeners.forEach((listener) => listener(token))
    })
    await PushNotifications.addListener('registrationError', ({ error }) => {
      console.warn('[notifications] Android push registration failed:', error)
    })
    await PushNotifications.addListener('pushNotificationActionPerformed', openNotificationChat)

    let permission = await PushNotifications.checkPermissions()
    if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
      permission = await PushNotifications.requestPermissions()
    }
    if (permission.receive === 'granted') await PushNotifications.register()
  })().catch((error: unknown) => {
    initialization = null
    console.warn('[notifications] Could not initialise push notifications:', error)
  })

  return initialization
}
