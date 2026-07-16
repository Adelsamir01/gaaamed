import { Capacitor } from '@capacitor/core'

export type ConnectionStatus = 'connecting' | 'online' | 'offline'

export interface ServerMessage {
  type: string
  [key: string]: unknown
}

type MessageHandler = (msg: ServerMessage) => void
type StatusHandler = (status: ConnectionStatus) => void

const STORAGE_KEY = 'gaaamed_server_url'
const MAX_RETRIES = 3

export function getServerUrl(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved.startsWith('ws')) return saved
  } catch {
    /* ignore */
  }
  return Capacitor.isNativePlatform() ? 'wss://gaaamed.adelsamir.com' : 'ws://localhost:8787'
}

export function saveServerUrl(url: string) {
  try {
    localStorage.setItem(STORAGE_KEY, url)
  } catch {
    /* ignore */
  }
}

class OnlineClient {
  private ws: WebSocket | null = null
  private messageHandlers = new Set<MessageHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private retries = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private manualClose = false
  status: ConnectionStatus = 'offline'

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    this.manualClose = false
    this.setStatus('connecting')
    try {
      this.ws = new WebSocket(getServerUrl())
    } catch {
      this.setStatus('offline')
      this.scheduleReconnect()
      return
    }
    this.ws.onopen = () => {
      this.retries = 0
      this.setStatus('online')
    }
    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage
        this.messageHandlers.forEach((h) => h(msg))
      } catch {
        /* ignore */
      }
    }
    this.ws.onclose = () => {
      this.ws = null
      this.setStatus('offline')
      if (!this.manualClose) this.scheduleReconnect()
    }
    this.ws.onerror = () => {
      /* onclose يتكفل بالباقي */
    }
  }

  private scheduleReconnect() {
    if (this.retries >= MAX_RETRIES || this.reconnectTimer) return
    this.retries++
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 1500 * this.retries)
  }

  reconnect() {
    this.retries = 0
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.manualClose = true
      try {
        this.ws.close()
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
