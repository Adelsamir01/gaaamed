/**
 * خادم قييمد للعب الأونلاين — WebSocket relay بسيط
 * الغرف: إنشاء/انضمام برمز من 4 أرقام، تمرير الحركات بين لاعبَين
 * + لعبة شخبطة (حتى 8 لاعبين) عبر محرك server/shakhbata.js
 */
import { WebSocketServer } from 'ws'
import {
  initShakhbata, shakHandleMessage, shakHandleLeave, shakPlayers,
  broadcastPlayers, destroyShakhbata,
} from './shakhbata.js'

const PORT = 8787
const wss = new WebSocketServer({ port: PORT })
const SHAKHBATA_MAX = 8

/** code -> { code, gameId, players: Map<slot, ws>, names: Map<slot, {name, avatar}>, rpsChoices: Map, reactTaps: Map, shak? } */
const rooms = new Map()

function genCode() {
  let code
  do {
    code = String(Math.floor(1000 + Math.random() * 9000))
  } while (rooms.has(code))
  return code
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj))
}

function broadcast(room, obj) {
  for (const ws of room.players.values()) send(ws, obj)
}

function otherSlot(slot) {
  return slot === 1 ? 2 : 1
}

function lowestFreeSlot(room) {
  for (let i = 1; i <= SHAKHBATA_MAX; i++) {
    if (!room.players.has(i)) return i
  }
  return null
}

function cleanupRoom(code) {
  const room = rooms.get(code)
  if (room && room.players.size === 0) {
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
  room.names.delete(slot)
  const other = room.players.get(otherSlot(slot))
  if (other) send(other, { type: 'opponent_left' })
  cleanupRoom(code)
}

wss.on('connection', (ws) => {
  ws.isAlive = true
  ws._room = null
  ws._slot = null
  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    switch (msg.type) {
      case 'create': {
        const code = genCode()
        const room = {
          code,
          gameId: msg.gameId || 'unknown',
          players: new Map(),
          names: new Map(),
          rpsChoices: new Map(),
          reactTaps: new Map(),
          shak: null,
        }
        if (room.gameId === 'shakhbata') initShakhbata(room, msg.drawTime)
        room.players.set(1, ws)
        room.names.set(1, { name: msg.name || 'لاعب', avatar: msg.avatar || '🎮' })
        rooms.set(code, room)
        ws._room = code
        ws._slot = 1
        send(ws, { type: 'created', code, slot: 1 })
        console.log(`ROOM_CREATED ${code} ${room.gameId}`)
        break
      }

      case 'join': {
        const room = rooms.get(String(msg.code || ''))
        if (!room) {
          send(ws, { type: 'error', message: 'الغرفة غير موجودة، تأكد من الرمز' })
          return
        }
        const me = { name: msg.name || 'لاعب', avatar: msg.avatar || '🎮' }

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
          room.players.set(slot, ws)
          room.names.set(slot, me)
          ws._room = room.code
          ws._slot = slot
          send(ws, { type: 'joined', code: room.code, slot, gameId: room.gameId, players: shakPlayers(room) })
          broadcastPlayers(room)
          console.log(`PLAYER_JOINED ${room.code} ${me.name} slot=${slot}`)
          return
        }

        if (room.players.size >= 2) {
          send(ws, { type: 'error', message: 'الغرفة ممتلئة' })
          return
        }
        room.players.set(2, ws)
        room.names.set(2, me)
        ws._room = room.code
        ws._slot = 2
        send(ws, { type: 'joined', code: room.code, slot: 2, gameId: room.gameId, opponent: room.names.get(1) })
        const host = room.players.get(1)
        send(host, { type: 'opponent_joined', opponent: me })
        console.log(`PLAYER_JOINED ${room.code} ${me.name}`)
        break
      }

      case 'action': {
        const room = rooms.get(ws._room)
        if (!room) return
        const other = room.players.get(otherSlot(ws._slot))
        send(other, { type: 'action', action: msg.action, from: ws._slot })
        break
      }

      case 'rps_choice': {
        const room = rooms.get(ws._room)
        if (!room || room.players.size < 2) return
        room.rpsChoices.set(ws._slot, msg.choice)
        if (room.rpsChoices.size === 2) {
          broadcast(room, {
            type: 'rps_reveal',
            choices: { 1: room.rpsChoices.get(1), 2: room.rpsChoices.get(2) },
          })
          room.rpsChoices.clear()
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
        }
        break
      }

      case 'rematch': {
        const room = rooms.get(ws._room)
        if (!room) return
        const other = room.players.get(otherSlot(ws._slot))
        send(other, { type: 'rematch', from: ws._slot })
        break
      }

      case 'leave': {
        handleLeave(ws)
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

  ws.on('close', () => handleLeave(ws))
  ws.on('error', () => {})
})

// نبضات القلب: قطع الاتصالات الميتة
setInterval(() => {
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
}, 20000)

console.log(`GAAMED_SERVER listening on ws://0.0.0.0:${PORT}`)
