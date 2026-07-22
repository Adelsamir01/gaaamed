import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'

export interface ChessPremove {
  from: Square
  to: Square
  promotion: PieceSymbol
}

function positionWithTurn(fen: string, color: Color): Chess | null {
  const fields = fen.split(' ')
  if (fields.length < 6) return null
  fields[1] = color
  // The en-passant square belongs to the real side to move. It must not leak
  // into the temporary position used only to preview a future move.
  fields[3] = '-'
  try {
    return new Chess(fields.join(' '))
  } catch {
    return null
  }
}

export function premoveOptions(fen: string, square: Square, color: Color): Move[] {
  const position = positionWithTurn(fen, color)
  if (!position || position.get(square)?.color !== color) return []
  return position.moves({ square, verbose: true })
}

export function resolvePremove(fen: string, premove: ChessPremove): ChessPremove | null {
  let position: Chess
  try {
    position = new Chess(fen)
  } catch {
    return null
  }
  const candidate = position.moves({ square: premove.from, verbose: true }).find((move) => (
    move.to === premove.to
    && (!move.promotion || move.promotion === premove.promotion)
  ))
  if (!candidate) return null
  return {
    from: candidate.from,
    to: candidate.to,
    promotion: candidate.promotion ?? premove.promotion,
  }
}
