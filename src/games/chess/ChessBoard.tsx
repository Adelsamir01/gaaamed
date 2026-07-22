import { useMemo } from 'react'
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { pieceGlyph } from './presentation'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const

const PIECE_NAMES: Record<PieceSymbol, string> = {
  k: 'ملك', q: 'وزير', r: 'قلعة', b: 'فيل', n: 'حصان', p: 'بيدق',
}

interface Props {
  fen: string
  orientation?: Color
  selected?: Square | null
  legalMoves?: Move[]
  premove?: { from: Square; to: Square } | null
  premoveMode?: boolean
  lastMove?: { from: string; to: string } | null
  disabled?: boolean
  pending?: boolean
  onSquare: (square: Square) => void
}

export default function ChessBoard({
  fen,
  orientation = 'w',
  selected = null,
  legalMoves = [],
  premove = null,
  premoveMode = false,
  lastMove = null,
  disabled = false,
  pending = false,
  onSquare,
}: Props) {
  const chess = useMemo(() => new Chess(fen), [fen])
  const board = useMemo(() => {
    const files = orientation === 'w' ? [...FILES] : [...FILES].reverse()
    const ranks = orientation === 'w' ? [...RANKS].reverse() : [...RANKS]
    return ranks.flatMap((rank) => files.map((file) => `${file}${rank}` as Square))
  }, [orientation])
  const legalTargets = useMemo(() => new Map(legalMoves.map((move) => [move.to, move])), [legalMoves])
  const checkedKing = chess.isCheck()
    ? chess.findPiece({ type: 'k', color: chess.turn() })[0] ?? null
    : null

  return (
    <div
      className={cn(
        'relative grid aspect-square w-full max-w-[390px] grid-cols-8 overflow-hidden rounded-[1.2rem] border-[3px] border-[#583c25] bg-[#583c25]',
        'shadow-[0_18px_45px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)]',
        pending && 'after:pointer-events-none after:absolute after:inset-0 after:z-20 after:bg-white/[0.025]',
      )}
      dir="ltr"
      role="grid"
      aria-label="رقعة الشطرنج"
    >
      {board.map((square, index) => {
        const piece = chess.get(square)
        const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number])
        const rank = Number(square[1])
        const dark = (fileIndex + rank) % 2 === 1
        const legal = legalTargets.get(square)
        const isSelected = selected === square
        const isPremove = premove?.from === square || premove?.to === square
        const isLast = lastMove?.from === square || lastMove?.to === square
        const showFile = index >= 56
        const showRank = index % 8 === 0

        return (
          <button
            key={square}
            type="button"
            role="gridcell"
            onClick={() => onSquare(square)}
            disabled={disabled}
            aria-label={`${square} ${piece ? `${PIECE_NAMES[piece.type]} ${piece.color === 'w' ? 'أبيض' : 'أسود'}` : 'فارغ'}`}
            className={cn(
              'relative grid aspect-square min-h-0 place-items-center overflow-hidden disabled:cursor-default',
              dark ? 'bg-[#769656]' : 'bg-[#eeeed2]',
              isLast && (dark ? 'bg-[#a7b64e]' : 'bg-[#f4f06a]'),
              isPremove && 'z-[8] bg-sky-400/65 ring-[3px] ring-inset ring-sky-200/90',
              isSelected && 'z-10 ring-[3px] ring-inset ring-amber-300 bg-amber-300/70',
              checkedKing === square && 'animate-pulse bg-rose-500 ring-[3px] ring-inset ring-rose-200',
            )}
          >
            {legal && !piece && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  'pointer-events-none absolute z-10 h-[27%] w-[27%] rounded-full shadow-[0_1px_5px_rgba(0,0,0,0.28)] ring-2 ring-white/35',
                  premoveMode ? 'bg-sky-700/75' : 'bg-slate-900/58',
                )}
              />
            )}
            {legal && piece && (
              <motion.span
                initial={{ scale: 0.82, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={cn(
                  'pointer-events-none absolute inset-[5%] z-10 rounded-full border-[5px] shadow-inner',
                  premoveMode ? 'border-sky-600/75' : 'border-slate-900/50',
                )}
              />
            )}
            {piece && (
              <motion.span
                key={`${square}-${piece.color}-${piece.type}`}
                initial={{ scale: 0.7, opacity: 0.35 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                className={cn(
                  'relative z-[5] select-none font-serif text-[clamp(2rem,11vw,3.25rem)] leading-none',
                  piece.color === 'w'
                    ? 'text-[#fffaf0] [text-shadow:0_2px_1px_#4b3621,0_0_2px_#1f2937]'
                    : 'text-[#18251c] [text-shadow:0_1px_0_rgba(255,255,255,0.24)]',
                )}
                aria-hidden="true"
              >
                {pieceGlyph(piece.color, piece.type)}
              </motion.span>
            )}
            {showFile && (
              <span className={cn('pointer-events-none absolute bottom-0.5 right-1 text-[8px] font-black', dark ? 'text-[#eeeed2]/75' : 'text-[#769656]')}>
                {square[0]}
              </span>
            )}
            {showRank && (
              <span className={cn('pointer-events-none absolute left-1 top-0.5 text-[8px] font-black', dark ? 'text-[#eeeed2]/75' : 'text-[#769656]')}>
                {square[1]}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function PromotionPicker({ color, onPick }: { color: Color; onPick: (piece: 'q' | 'r' | 'b' | 'n') => void }) {
  const options: Array<'q' | 'r' | 'b' | 'n'> = ['q', 'r', 'b', 'n']
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/72 px-5 backdrop-blur-sm" dir="rtl">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xs rounded-3xl border border-amber-300/35 bg-[#101b21] p-5 text-center shadow-2xl">
        <h3 className="text-lg font-black text-white">ترقّي البيدق لإيه؟</h3>
        <p className="mt-1 text-xs font-bold text-slate-400">اختار القطعة قبل إتمام النقلة</p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {options.map((piece) => (
            <button
              key={piece}
              type="button"
              onClick={() => onPick(piece)}
              className="aspect-square rounded-2xl border border-white/12 bg-white/7 font-serif text-5xl text-[#fff5d6] shadow-inner active:scale-95"
              aria-label={`ترقية إلى ${PIECE_NAMES[piece]}`}
            >
              {pieceGlyph(color, piece)}
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
