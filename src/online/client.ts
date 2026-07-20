import { Capacitor } from '@capacitor/core'
import { readStoredString, writeStoredString } from '@/lib/persistentStorage'

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export interface ServerMessage {
  type: string
  [key: string]: unknown
}

type MessageHandler = (msg: ServerMessage) => void
type StatusHandler = (status: ConnectionStatus) => void

const STORAGE_KEY = 'gaaamed_server_url'
const DEVICE_KEY = 'gaaamed_device_id'
const MAX_RECONNECT_DELAY_MS = 30_000
let cachedServerUrl: string | null = null
let cachedDeviceId: string | null = null

function legacyString(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

cachedServerUrl = legacyString(STORAGE_KEY)
cachedDeviceId = legacyString(DEVICE_KEY)

/** معرّف الجهاز: يُولّد مرة واحدة ويُخزن محليًا */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId
  const saved = await readStoredString(DEVICE_KEY)
  if (saved) {
    cachedDeviceId = saved
    return saved
  }
  const id = crypto.randomUUID()
  cachedDeviceId = id
  await writeStoredString(DEVICE_KEY, id)
  return id
}

export function getServerUrl(): string {
  if (cachedServerUrl?.startsWith('ws')) return cachedServerUrl
  return Capacitor.isNativePlatform() ? 'wss://dedos.adelsamir.com' : 'ws://localhost:8787'
}

export async function hydrateOnlineClientStorage(): Promise<void> {
  const [serverUrl, deviceId] = await Promise.all([
    readStoredString(STORAGE_KEY),
    readStoredString(DEVICE_KEY),
  ])
  if (serverUrl?.startsWith('ws')) cachedServerUrl = serverUrl
  if (deviceId) cachedDeviceId = deviceId
}

export function saveServerUrl(url: string): void {
  cachedServerUrl = url
  void writeStoredString(STORAGE_KEY, url)
}

class OnlineClient {
  private ws: WebSocket | null = null
  private messageHandlers = new Set<MessageHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private retries = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualSockets = new WeakSet<WebSocket>()
  status: ConnectionStatus = 'offline'

  constructor() {
    if (typeof window === 'undefined') return
    window.addEventListener('online', () => this.reconnect())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.status === 'offline') this.connect()
    })
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.setStatus('connecting')
    let socket: WebSocket
    try {
      socket = new WebSocket(getServerUrl())
      this.ws = socket
    } catch {
      this.setStatus('offline')
      this.scheduleReconnect()
      return
    }
    socket.onopen = () => {
      if (this.ws !== socket) return
      this.retries = 0
      this.setStatus('online')
    }
    socket.onmessage = (ev) => {
      if (this.ws !== socket) return
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage
        this.messageHandlers.forEach((h) => h(msg))
      } catch {
        /* ignore */
      }
    }
    socket.onclose = () => {
      if (this.ws === socket) this.ws = null
      if (this.manualSockets.has(socket)) return
      this.setStatus('offline')
      this.scheduleReconnect()
    }
    socket.onerror = () => {
      /* onclose يتكفل بالباقي */
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    const attempt = this.retries++
    const baseDelay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** Math.min(attempt, 5))
    const delay = Math.round(baseDelay * (1 + Math.random() * 0.3))
    this.setStatus('connecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  reconnect() {
    this.retries = 0
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      const socket = this.ws
      this.manualSockets.add(socket)
      try {
        socket.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.connect()
  }

  private setStatus(s: ConnectionStatus) {
    this.status = s
    this.statusHandlers.forEach((h) => h(s))
  }

  send(obj: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  onMessage(h: MessageHandler) {
    this.messageHandlers.add(h)
    return () => this.messageHandlers.delete(h)
  }

  onStatus(h: StatusHandler) {
    this.statusHandlers.add(h)
    return () => this.statusHandlers.delete(h)
  }
}

export const onlineClient = new OnlineClient()
