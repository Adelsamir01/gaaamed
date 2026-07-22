/** Track one socket without counting the same user more than once. */
export function trackPresence(onlineUsers, userId, socket) {
  let sockets = onlineUsers.get(userId)
  const wasOnline = Boolean(sockets?.size)
  if (!sockets) {
    sockets = new Set()
    onlineUsers.set(userId, sockets)
  }
  sockets.add(socket)
  return !wasOnline
}

/** Remove one socket and report whether the user became fully offline. */
export function untrackPresence(onlineUsers, userId, socket) {
  const sockets = onlineUsers.get(userId)
  if (!sockets) return false
  sockets.delete(socket)
  if (sockets.size > 0) return false
  onlineUsers.delete(userId)
  return true
}

export function onlineUserCount(onlineUsers) {
  return onlineUsers.size
}

/** Return the chat invitation a user is actively waiting or playing inside. */
export function activeInviteForUser(onlineUsers, rooms, userId, canSee = () => true) {
  const sockets = onlineUsers.get(userId)
  if (!sockets) return null
  for (const socket of sockets) {
    const room = rooms.get(socket._room)
    if (!room?.chatInvite || room.players?.get(socket._slot) !== socket) continue
    const invite = {
      threadId: room.chatInvite.threadId,
      messageId: room.chatInvite.messageId,
      roomCode: room.code,
      gameId: room.gameId,
    }
    if (canSee(invite)) return invite
  }
  return null
}
