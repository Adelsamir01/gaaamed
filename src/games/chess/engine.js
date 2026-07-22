import { Chess } from 'chess.js'

const PIECE_VALUES = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20_000 }
const PROMOTION_VALUES = { q: 900, r: 500, b: 335, n: 320 }

function movePayload(move) {
  return {
    from: move.from,
    to: move.to,
    san: move.san,
    piece: move.piece,
    captured: move.captured ?? null,
    promotion: move.promotion ?? null,
    color: move.color,
  }
}

function positionalBonus(piece, row, col) {
  const centerDistance = Math.abs(3.5 - row) + Math.abs(3.5 - col)
  const center = Math.max(0, 7 - centerDistance * 2)
  if (piece.type === 'p') {
    const progress = piece.color === 'w' ? 6 - row : row - 1
    return progress * 7 + (col >= 2 && col <= 5 ? 5 : 0)
  }
  if (piece.type === 'n') return center * 6
  if (piece.type === 'b') return center * 3
  if (piece.type === 'r') return center
  if (piece.type === 'q') return center * 1.5
  return 0
}

export function evaluateChessPosition(chess, perspective = 'w') {
  if (chess.isCheckmate()) return chess.turn() === perspective ? -100_000 : 100_000
  if (chess.isDraw()) return 0

  let whiteScore = 0
  const board = chess.board()
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const piece = board[row][col]
      if (!piece) continue
      const value = PIECE_VALUES[piece.type] + positionalBonus(piece, row, col)
      whiteScore += piece.color === 'w' ? value : -value
    }
  }
  if (chess.isCheck()) whiteScore += chess.turn() === 'w' ? -28 : 28
  return perspective === 'w' ? whiteScore : -whiteScore
}

function movePriority(move) {
  let score = 0
  if (move.captured) score += (PIECE_VALUES[move.captured] ?? 0) * 10 - (PIECE_VALUES[move.piece] ?? 0)
  if (move.promotion) score += PROMOTION_VALUES[move.promotion] ?? 0
  if (move.san.includes('#')) score += 100_000
  else if (move.san.includes('+')) score += 120
  if (move.isKingsideCastle() || move.isQueensideCastle()) score += 80
  return score
}

function orderedMoves(chess) {
  return chess.moves({ verbose: true }).sort((first, second) => movePriority(second) - movePriority(first))
}

function search(chess, depth, alpha, beta, perspective, ply) {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return chess.turn() === perspective ? -100_000 + ply : 100_000 - ply
    return 0
  }
  if (depth <= 0) return evaluateChessPosition(chess, perspective)

  const maximizing = chess.turn() === perspective
  let best = maximizing ? -Infinity : Infinity
  for (const move of orderedMoves(chess)) {
    chess.move(move.san)
    const value = search(chess, depth - 1, alpha, beta, perspective, ply + 1)
    chess.undo()
    if (maximizing) {
      best = Math.max(best, value)
      alpha = Math.max(alpha, value)
    } else {
      best = Math.min(best, value)
      beta = Math.min(beta, value)
    }
    if (beta <= alpha) break
  }
  return best
}

export function chooseChessMove(fen, difficulty = 'medium', random = Math.random) {
  const chess = new Chess(fen)
  const moves = orderedMoves(chess)
  if (moves.length === 0) return null

  if (difficulty === 'easy') {
    const tactical = moves.filter((move) => move.captured || move.promotion || move.san.includes('+'))
    const pool = tactical.length > 0 && random() < 0.45 ? tactical : moves
    return movePayload(pool[Math.floor(random() * pool.length)] ?? moves[0])
  }

  const perspective = chess.turn()
  const depth = difficulty === 'hard' ? 3 : 2
  const scored = []
  for (const move of moves) {
    chess.move(move.san)
    const value = search(chess, depth - 1, -Infinity, Infinity, perspective, 1)
    chess.undo()
    const noise = difficulty === 'medium' ? (random() - 0.5) * 38 : (random() - 0.5) * 2
    scored.push({ move, value: value + noise })
  }
  scored.sort((first, second) => second.value - first.value)
  return movePayload(scored[0].move)
}

export function chessEndState(chess) {
  if (!chess.isGameOver()) return { ended: false, winnerColor: null, reason: null }
  if (chess.isCheckmate()) {
    return {
      ended: true,
      winnerColor: chess.turn() === 'w' ? 'b' : 'w',
      reason: 'checkmate',
    }
  }
  let reason = 'draw'
  if (chess.isStalemate()) reason = 'stalemate'
  else if (chess.isInsufficientMaterial()) reason = 'insufficient_material'
  else if (chess.isThreefoldRepetition()) reason = 'threefold_repetition'
  else if (chess.isDrawByFiftyMoves()) reason = 'fifty_move'
  return { ended: true, winnerColor: null, reason }
}

export function capturedPieces(history) {
  return history.filter((move) => move.captured).map((move) => ({
    type: move.captured,
    color: move.color === 'w' ? 'b' : 'w',
  }))
}
