import type { Chess, Color, Move, PieceSymbol, Square } from 'chess.js'
import type { Difficulty } from '@/types'

export interface ChessMovePayload {
  from: Square
  to: Square
  san: string
  piece: PieceSymbol
  captured: PieceSymbol | null
  promotion: PieceSymbol | null
  color: Color
}

export interface ChessEndState {
  ended: boolean
  winnerColor: Color | null
  reason: 'checkmate' | 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move' | 'draw' | null
}

export function evaluateChessPosition(chess: Chess, perspective?: Color): number
export function chooseChessMove(fen: string, difficulty?: Difficulty, random?: () => number): ChessMovePayload | null
export function chessEndState(chess: Chess): ChessEndState
export function capturedPieces(history: Move[]): Array<{ type: PieceSymbol; color: Color }>
