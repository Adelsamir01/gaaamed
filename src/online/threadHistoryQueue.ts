type SendHistoryRequest = (threadId: string) => void

/**
 * Keeps chat-history requests alive across the WebSocket authentication gap.
 * A socket can be open before the server has processed `identify`, so requests
 * are only sent after `authenticate` and remain pending until acknowledged.
 */
export class ThreadHistoryQueue {
  private authenticated = false
  private pending = new Set<string>()
  private sentOnConnection = new Set<string>()

  connectionChanged(): void {
    this.authenticated = false
    this.sentOnConnection.clear()
  }

  authenticate(send: SendHistoryRequest): void {
    this.authenticated = true
    for (const threadId of this.pending) this.sendOnce(threadId, send)
  }

  request(threadId: string, send: SendHistoryRequest): void {
    const cleanThreadId = threadId.trim()
    if (!cleanThreadId) return
    this.pending.add(cleanThreadId)
    if (this.authenticated) this.sendOnce(cleanThreadId, send)
  }

  resolve(threadId: string): void {
    this.pending.delete(threadId)
    this.sentOnConnection.delete(threadId)
  }

  private sendOnce(threadId: string, send: SendHistoryRequest): void {
    if (this.sentOnConnection.has(threadId)) return
    this.sentOnConnection.add(threadId)
    send(threadId)
  }
}
