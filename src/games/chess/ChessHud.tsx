import type { Color, Move } from 'chess.js'
import { Clock3 } from 'lucide-react'
import { AvatarCircle } from '@/sections/components'
import { cn } from '@/lib/utils'
import { capturedPieces } from './engine.js'
import { formatChessClock, pieceGlyph } from './presentation'

export function ChessPlayerCard({
  name,
  avatar,
  color,
  active,
  clock,
  compact = false,
}: {
  name: string
  avatar: string
  color: Color
  active: boolean
  clock?: number
  compact?: boolean
}) {
  return (
    <div className={cn(
      'flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 transition-all',
      active
        ? 'border-emerald-300/55 bg-emerald-400/12 shadow-[0_0_18px_rgba(52,211,153,0.12)]'
        : 'border-white/8 bg-white/[0.045]',
    )}>
      <AvatarCircle emoji={avatar} size="sm" glow={active} />
      <div className="min-w-0 flex-1" dir="rtl">
        <p className={cn('truncate font-extrabold text-white', compact ? 'text-[11px]' : 'text-xs')}>{name}</p>
        <p className="text-[9px] font-bold text-slate-400">{color === 'w' ? 'الأبيض' : 'الأسود'} {pieceGlyph(color, 'k')}</p>
      </div>
      {clock != null && (
        <div className={cn(
          'flex shrink-0 items-center gap-1 rounded-xl px-2 py-1 font-black tabular-nums',
          active ? 'bg-emerald-300 text-emerald-950' : 'bg-slate-900/80 text-slate-300',
          clock <= 30_000 && 'bg-rose-400 text-rose-950 animate-pulse',
        )} dir="ltr">
          <Clock3 className="h-3 w-3" />
          {formatChessClock(clock)}
        </div>
      )}
    </div>
  )
}

export function CapturedPieces({ history, capturedColor }: { history: Move[]; capturedColor: Color }) {
  const pieces = capturedPieces(history).filter((piece) => piece.color === capturedColor)
  if (pieces.length === 0) return <span className="text-[10px] font-bold text-slate-600">لا قطع مأخوذة</span>
  return (
    <div className="flex min-h-5 flex-wrap items-center" dir="ltr">
      {pieces.map((piece, index) => (
        <span key={`${piece.type}-${index}`} className="-mr-0.5 font-serif text-xl leading-none text-slate-300/85">
          {pieceGlyph(piece.color, piece.type)}
        </span>
      ))}
    </div>
  )
}

export function MoveStrip({ history }: { history: Move[] }) {
  const recent = history.slice(-8)
  if (recent.length === 0) {
    return <p className="text-center text-[10px] font-bold text-slate-500">سجل النقلات هيظهر هنا</p>
  }
  const startIndex = history.length - recent.length
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-[10px] font-black text-slate-300" dir="ltr">
      {recent.map((move, index) => (
        <span key={`${startIndex + index}-${move.san}`} className={cn('shrink-0 rounded-lg px-2 py-1', move.color === 'w' ? 'bg-white/10' : 'bg-slate-950/75')}>
          {move.color === 'w' && <b className="mr-1 text-slate-500">{Math.floor((startIndex + index) / 2) + 1}.</b>}
          {move.san}
        </span>
      ))}
    </div>
  )
}
