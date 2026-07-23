import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { DominoTile as DominoTileValue } from './engine'

const PIP_POSITIONS: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

function DominoHalf({ value, compact }: { value: number; compact: boolean }) {
  return (
    <span className={cn('grid flex-1 grid-cols-3 grid-rows-3 place-items-center p-[13%]', compact && 'p-[11%]')}>
      {Array.from({ length: 9 }, (_, position) => (
        <span
          key={position}
          className={cn(
            'aspect-square w-[54%] rounded-full bg-transparent',
            PIP_POSITIONS[value]?.includes(position)
              && 'bg-[#18222a] shadow-[inset_0_1px_1px_rgba(255,255,255,0.18),0_1px_1px_rgba(0,0,0,0.35)]',
          )}
        />
      ))}
    </span>
  )
}

interface DominoTileProps {
  tile?: Pick<DominoTileValue, 'id' | 'a' | 'b'>
  hidden?: boolean
  compact?: boolean
  vertical?: boolean
  playable?: boolean
  selected?: boolean
  disabled?: boolean
  className?: string
  onClick?: () => void
  label?: string
}

export function DominoTile({
  tile,
  hidden = false,
  compact = false,
  vertical = false,
  playable = false,
  selected = false,
  disabled = false,
  className,
  onClick,
  label,
}: DominoTileProps) {
  const interactive = !!onClick && !disabled
  return (
    <motion.button
      layout
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={label ?? (hidden ? 'حجر مخفي' : `دومينو ${tile?.a ?? 0} و${tile?.b ?? 0}`)}
      whileTap={interactive ? { scale: 0.94, y: 1 } : undefined}
      animate={selected ? { y: -8, scale: 1.04 } : { y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 390, damping: 27 }}
      className={cn(
        'relative isolate flex shrink-0 overflow-hidden border border-[#c9b994] text-[#18222a]',
        vertical ? 'flex-col' : 'flex-row',
        compact
          ? vertical ? 'h-[52px] w-[28px] rounded-[7px]' : 'h-[28px] w-[52px] rounded-[7px]'
          : vertical ? 'h-[82px] w-[44px] rounded-[11px]' : 'h-[44px] w-[82px] rounded-[11px]',
        hidden
          ? 'border-emerald-200/25 bg-gradient-to-br from-emerald-700 via-emerald-900 to-slate-950 shadow-[inset_0_0_0_3px_rgba(255,255,255,0.08),0_5px_12px_rgba(0,0,0,0.3)]'
          : 'bg-gradient-to-br from-[#fffdf3] via-[#f4ead2] to-[#d5c5a2] shadow-[inset_1px_1px_2px_rgba(255,255,255,0.95),inset_-1px_-1px_2px_rgba(86,63,28,0.18),0_5px_12px_rgba(0,0,0,0.3)]',
        playable && interactive && 'ring-2 ring-emerald-300/80 shadow-[0_0_20px_rgba(52,211,153,0.45)]',
        selected && 'ring-2 ring-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.52)]',
        disabled && !hidden && 'opacity-55 saturate-50',
        className,
      )}
    >
      {hidden ? (
        <>
          <span className="absolute inset-[5px] rounded-[5px] border border-emerald-200/20" />
          <span className="m-auto h-2.5 w-2.5 rotate-45 rounded-[2px] border border-emerald-200/35 bg-emerald-300/10" />
        </>
      ) : tile ? (
        <>
          <DominoHalf value={tile.a} compact={compact} />
          <span
            className={cn(
              'z-10 shrink-0 bg-[#8e7a50]/60 shadow-[0_1px_0_rgba(255,255,255,0.75)]',
              vertical ? 'h-px w-full' : 'h-full w-px',
            )}
          />
          <DominoHalf value={tile.b} compact={compact} />
        </>
      ) : null}
    </motion.button>
  )
}
