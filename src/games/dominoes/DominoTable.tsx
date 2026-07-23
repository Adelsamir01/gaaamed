import { AnimatePresence, motion } from 'framer-motion'
import { PackageOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DominoTile as DominoTileValue, PlacedDomino } from './engine'
import { DominoTile } from './DominoTile'

type DisplayDomino = Omit<PlacedDomino, 'playedBy'> & { playedBy: number }

export function DominoChain({ board }: { board: DisplayDomino[] }) {
  const rows: DisplayDomino[][] = []
  for (let index = 0; index < board.length; index += 5) rows.push(board.slice(index, index + 5))

  return (
    <div className="flex min-h-[144px] w-full flex-col items-center justify-center gap-1.5 overflow-hidden px-1 py-3" dir="ltr">
      <AnimatePresence initial={false}>
        {rows.map((row, rowIndex) => (
          <motion.div
            layout
            key={`${rowIndex}-${row[0]?.id ?? 'empty'}`}
            className={cn(
              'flex min-h-7 w-full items-center justify-center gap-1',
              rowIndex % 2 === 1 && 'flex-row-reverse',
            )}
          >
            {row.map((tile, tileIndex) => (
              <DominoTile
                key={`${tile.id}-${tileIndex + rowIndex * 5}`}
                compact
                tile={{ id: tile.id, a: tile.left, b: tile.right }}
                vertical={tile.left === tile.right}
                className="pointer-events-none"
              />
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

interface DominoTableProps {
  board: DisplayDomino[]
  boneyardCount: number
  leftEnd: number
  rightEnd: number
  message: string
}

export function DominoTable({ board, boneyardCount, leftEnd, rightEnd, message }: DominoTableProps) {
  return (
    <section className="relative w-full overflow-hidden rounded-[1.8rem] border border-emerald-200/15 bg-[radial-gradient(circle_at_50%_35%,#167655_0%,#0b4a3b_46%,#062d2a_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.13),inset_0_0_55px_rgba(0,0,0,0.36),0_18px_40px_rgba(0,0,0,0.28)]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,#fff_4px,transparent_5px)]" />
      <header className="relative z-10 flex items-center justify-between gap-2 px-3 pt-3">
        <span className="grid min-w-9 place-items-center rounded-full border border-white/15 bg-black/20 px-2 py-1 text-xs font-black text-emerald-100 shadow-inner">
          {leftEnd}
        </span>
        <motion.p
          key={message}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0 flex-1 truncate text-center text-[11px] font-extrabold text-emerald-50/85"
        >
          {message}
        </motion.p>
        <span className="grid min-w-9 place-items-center rounded-full border border-white/15 bg-black/20 px-2 py-1 text-xs font-black text-emerald-100 shadow-inner">
          {rightEnd}
        </span>
      </header>

      <DominoChain board={board} />

      <div className="absolute bottom-2.5 left-3 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[10px] font-bold text-white/75 backdrop-blur-sm">
        <PackageOpen className="h-3.5 w-3.5 text-amber-200" />
        السحب {boneyardCount}
      </div>
    </section>
  )
}

interface DominoHandProps {
  tiles: DominoTileValue[]
  playableIds: Set<string>
  selectedId: string | null
  disabled: boolean
  onTile: (tile: DominoTileValue) => void
}

export function DominoHand({ tiles, playableIds, selectedId, disabled, onTile }: DominoHandProps) {
  return (
    <div className="w-full overflow-x-auto overscroll-x-contain px-1 pb-3 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" dir="ltr">
      <div className="flex min-w-max items-end justify-center gap-2 px-2">
        <AnimatePresence initial={false}>
          {tiles.map((tile) => (
            <DominoTile
              key={tile.id}
              tile={tile}
              vertical
              playable={playableIds.has(tile.id)}
              selected={selectedId === tile.id}
              disabled={disabled || !playableIds.has(tile.id)}
              onClick={() => onTile(tile)}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
