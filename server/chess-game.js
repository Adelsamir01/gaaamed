import { Chess } from 'chess.js'
import { chessEndState } from '../src/games/chess/engine.js'

export const CHESS_CLOCK_MS = 10 * 60 * 1000

function slotForColor(color) {
  return color === 'w' ? 1 : 2
}

function colorForSlot(slot) {
  return slot === 1 ? 'w' : 'b'
}

function cleanSquare(value) {
  const square = String(value || '').toLowerCase()
  return /^[a-h][1-8]$/.test(square) ? square : null
}

function cleanPromotion(value) {
  const promotion = String(value || 'q').toLowerCase()
  return ['q', 'r', 'b', 'n'].includes(promotion) ? promotion : 'q'
}

function historyPayload(chess) {
  return chess.history({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    san: move.san,
    color: move.color,
    piece: move.piece,
    captured: move.captured ?? null,
    promotion: move.promotion ?? null,
  }))
}

export function createChessGame(now = Date.now()) {
  return {
    chess: new Chess(),
    clocks: { 1: CHESS_CLOCK_MS, 2: CHESS_CLOCK_MS },
    turnStartedAt: now,
    ended: false,
    winnerSlot: null,
    reason: null,
    lastMove: null,
  }
}

export function chessClock(game, slot, now = Date.now()) {
  const stored = Math.max(0, Number(game.clocks[slot]) || 0)
  if (game.ended || slotForColor(game.chess.turn()) !== slot) return stored
  return Math.max(0, stored - Math.max(0, now - game.turnStartedAt))
}

export function expireChessClock(game, now = Date.now()) {
  if (game.ended) return false
  const activeSlot = slotForColor(game.chess.turn())
  const remaining = chessClock(game, activeSlot, now)
  if (remaining > 0) return false
  game.clocks[activeSlot] = 0
  game.ended = true
  game.winnerSlot = activeSlot === 1 ? 2 : 1
  game.reason = 'timeout'
  return true
}

export function chessSnapshot(game, now = Date.now()) {
  expireChessClock(game, now)
  return {
    fen: game.chess.fen(),
    turnSlot: slotForColor(game.chess.turn()),
    clocks: {
      1: Math.round(chessClock(game, 1, now)),
      2: Math.round(chessClock(game, 2, now)),
    },
    serverTime: now,
    check: game.chess.isCheck(),
    ended: game.ended,
    winnerSlot: game.winnerSlot,
    reason: game.reason,
    lastMove: game.lastMove,
    history: historyPayload(game.chess),
  }
}

export function applyChessMove(game, slot, fromValue, toValue, promotionValue, now = Date.now()) {
  if (game.ended || expireChessClock(game, now)) return { accepted: false, reason: 'ended' }
  if (slotForColor(game.chess.turn()) !== slot) return { accepted: false, reason: 'not_your_turn' }
  const from = cleanSquare(fromValue)
  const to = cleanSquare(toValue)
  if (!from || !to) return { accepted: false, reason: 'invalid_square' }
  const piece = game.chess.get(from)
  if (!piece || piece.color !== colorForSlot(slot)) return { accepted: false, reason: 'invalid_piece' }
  const remainingClock = chessClock(game, slot, now)

  let move
  try {
    move = game.chess.move({ from, to, promotion: cleanPromotion(promotionValue) })
  } catch {
    return { accepted: false, reason: 'illegal_move' }
  }

  game.clocks[slot] = remainingClock
  game.turnStartedAt = now
  game.lastMove = {
    from: move.from,
    to: move.to,
    san: move.san,
    color: move.color,
    piece: move.piece,
    captured: move.captured ?? null,
    promotion: move.promotion ?? null,
  }

  const end = chessEndState(game.chess)
  if (end.ended) {
    game.ended = true
    game.winnerSlot = end.winnerColor ? slotForColor(end.winnerColor) : 0
    game.reason = end.reason
  }
  return { accepted: true, move: game.lastMove, ended: game.ended }
}

export function resignChessGame(game, slot) {
  if (game.ended || (slot !== 1 && slot !== 2)) return false
  game.ended = true
  game.winnerSlot = slot === 1 ? 2 : 1
  game.reason = 'resignation'
  return true
}
