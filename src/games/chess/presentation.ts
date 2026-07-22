import type { Color, PieceSymbol } from 'chess.js'

const PIECES: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
}

export function pieceGlyph(color: Color, piece: PieceSymbol): string {
  return PIECES[color][piece]
}

export function formatChessClock(milliseconds: number): string {
  const safe = Math.max(0, Math.ceil(milliseconds / 1_000))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function chessReasonLabel(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    checkmate: 'كش مات',
    stalemate: 'تعادل — مفيش نقلات قانونية',
    insufficient_material: 'تعادل — قطع غير كافية',
    threefold_repetition: 'تعادل — تكرار الوضع ٣ مرات',
    fifty_move: 'تعادل — قاعدة الـ٥٠ نقلة',
    timeout: 'الوقت خلص',
    draw: 'تعادل',
    resignation: 'استسلام',
  }
  return labels[reason ?? ''] ?? 'انتهت المباراة'
}
