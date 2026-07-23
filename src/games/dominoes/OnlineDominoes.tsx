import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Hand, PackageOpen, Sparkles } from 'lucide-react'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from '@/sections/components'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { DominoSide, DominoTile, PlacedDomino } from './engine'
import { DominoHand, DominoTable } from './DominoTable'
import { DominoTile as DominoPiece } from './DominoTile'

interface OnlineDominoState {
  board: Array<Omit<PlacedDomino, 'playedBy'> & { playedBy: number }>
  hand: DominoTile[]
  handCounts: Record<number, number>
  boneyardCount: number
  currentSlot: number
  ended: boolean
  winnerSlot: number | null
  reason: 'empty-hand' | 'blocked' | null
  points: number
  consecutivePasses: number
  turn: number
  lastAction: {
    kind: 'opening' | 'play' | 'draw' | 'pass'
    slot: number
    tileId?: string
    side?: DominoSide
  }
}

function endpoints(game: OnlineDominoState | null) {
  return {
    left: game?.board[0]?.left ?? -1,
    right: game?.board.at(-1)?.right ?? -1,
  }
}

function sidesFor(game: OnlineDominoState, tile: DominoTile): DominoSide[] {
  const ends = endpoints(game)
  const sides: DominoSide[] = []
  if (tile.a === ends.left || tile.b === ends.left) sides.push('left')
  if (tile.a === ends.right || tile.b === ends.right) sides.push('right')
  return sides
}

export default function OnlineDominoes({ onFinish }: GameProps) {
  const { slot, opponent, subscribe, sendRaw, requestGameSync } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const theirSlot = mySlot === 1 ? 2 : 1
  const [game, setGame] = useState<OnlineDominoState | null>(null)
  const [selected, setSelected] = useState<DominoTile | null>(null)
  const [notice, setNotice] = useState('بنرصّ الحجارة…')
  const finishedRef = useRef(false)
  const finishTimerRef = useRef<number | null>(null)

  const finish = useCallback((state: OnlineDominoState) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const outcome = state.winnerSlot === 0 ? 'draw' : state.winnerSlot === mySlot ? 'win' : 'loss'
    const winnerName = state.winnerSlot === mySlot
      ? profile.name
      : state.winnerSlot === theirSlot
        ? opponent?.name ?? 'الخصم'
        : undefined
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    setNotice(outcome === 'win' ? 'كسبت الجولة! 🏆' : outcome === 'draw' ? 'قفلة وتعادل! 🤝' : `${winnerName} كسب الجولة`)
    finishTimerRef.current = window.setTimeout(() => {
      onFinish({
        gameId: 'dominoes',
        outcome,
        winnerName,
        winnerSlot: state.winnerSlot || undefined,
        score: state.points,
        bestCandidate: outcome === 'win' ? state.points : undefined,
        coinsEarned: outcome === 'win' ? 40 : outcome === 'draw' ? 14 : 6,
        xpEarned: outcome === 'win' ? 50 : outcome === 'draw' ? 20 : 9,
        summary: outcome === 'draw'
          ? `الجولة اتقفلت بالتعادل مع ${opponent?.name ?? 'الخصم'}`
          : `${winnerName} خلّص حجاره${state.points ? ` وكسب ${state.points} نقطة` : ''}`,
        detail: state.reason === 'blocked' ? 'الجولة اتقفلت؛ أقل مجموع نقط كسب.' : 'أول لاعب خلّص كل حجاره كسب الجولة.',
      })
    }, 1_450)
  }, [mySlot, onFinish, opponent?.name, profile.name, theirSlot])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'dominoes') return
      if (event.msg.type === 'domino_state') {
        const next = event.msg.state as unknown as OnlineDominoState
        const effect = String(event.msg.effect || 'sync')
        setGame(next)
        setSelected(null)
        if (effect === 'play') {
          sounds.pop()
          setNotice(next.ended ? 'الجولة خلصت' : next.currentSlot === mySlot ? 'دورك — اختار حجر مناسب' : `دور ${opponent?.name ?? 'الخصم'}…`)
        } else if (effect === 'draw') {
          sounds.flip()
          setNotice(next.currentSlot === mySlot ? 'شوف الحجر الجديد أو اسحب تاني' : `${opponent?.name ?? 'الخصم'} سحب حجر`)
        } else if (effect === 'pass') {
          sounds.tick()
          setNotice(next.currentSlot === mySlot ? 'الخصم عدّى — دورك' : 'عدّيت الدور')
        } else if (effect === 'start') {
          setNotice(next.currentSlot === mySlot ? 'دورك — اختار حجر مناسب' : `دور ${opponent?.name ?? 'الخصم'}…`)
        }
        if (next.ended) finish(next)
      } else if (event.msg.type === 'domino_rejected') {
        if (event.msg.state) setGame(event.msg.state as unknown as OnlineDominoState)
        setNotice('الحركة دي مش متاحة دلوقتي')
        sounds.wrong()
      }
    })
    requestGameSync()
    return () => {
      unsubscribe()
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current)
    }
  }, [finish, mySlot, opponent?.name, requestGameSync, subscribe])

  const ends = endpoints(game)
  const playableIds = useMemo(() => new Set(
    game?.hand.filter((tile) => sidesFor(game, tile).length > 0).map((tile) => tile.id) ?? [],
  ), [game])
  const myTurn = !!game && !game.ended && game.currentSlot === mySlot
  const selectedSides = game && selected ? sidesFor(game, selected) : []

  const play = (tile: DominoTile, side: DominoSide) => {
    if (!myTurn) return
    sendRaw({ type: 'domino_play', tileId: tile.id, side })
    setNotice('بنثبت الحجر…')
  }

  const chooseTile = (tile: DominoTile) => {
    if (!game || !myTurn) return
    const sides = sidesFor(game, tile)
    if (sides.length === 1) {
      play(tile, sides[0])
      return
    }
    setSelected((current) => current?.id === tile.id ? null : tile)
    setNotice('اختار الطرف اللي عايز تلعب عليه')
    sounds.tick()
  }

  if (!game) {
    return (
      <div className="flex min-h-[430px] items-center justify-center">
        <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 1.1, repeat: Infinity }} className="text-center">
          <div className="text-5xl">🁫</div>
          <p className="mt-3 text-sm font-black text-white/65">بنخلط الحجارة…</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-2.5 py-2" dir="rtl">
      <div className="grid w-full grid-cols-2 gap-2">
        <PlayerCard active={myTurn} avatar={profile.avatar} name="أنت" count={game.handCounts[mySlot] ?? game.hand.length} accent="emerald" />
        <PlayerCard active={!myTurn && !game.ended} avatar={opponent?.avatar ?? '🎮'} name={opponent?.name ?? 'الخصم'} count={game.handCounts[theirSlot] ?? 0} accent="amber" />
      </div>

      <DominoTable board={game.board} boneyardCount={game.boneyardCount} leftEnd={ends.left} rightEnd={ends.right} message={notice} />

      <div className="flex min-h-11 w-full items-center justify-center gap-2">
        <AnimatePresence mode="popLayout">
          {selected && selectedSides.length === 2 ? (
            <motion.div key="side-picker" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="flex items-center gap-2">
              <button type="button" onClick={() => play(selected, 'left')} className="flex min-h-11 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-400/15 px-4 text-xs font-black text-emerald-100">
                <ArrowRight className="h-4 w-4" /> طرف {ends.left}
              </button>
              <DominoPiece compact tile={selected} className="pointer-events-none" />
              <button type="button" onClick={() => play(selected, 'right')} className="flex min-h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/15 px-4 text-xs font-black text-amber-100">
                طرف {ends.right} <ArrowLeft className="h-4 w-4" />
              </button>
            </motion.div>
          ) : myTurn && playableIds.size === 0 ? (
            <motion.button
              key="draw"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              type="button"
              onClick={() => sendRaw({ type: game.boneyardCount > 0 ? 'domino_draw' : 'domino_pass' })}
              className="flex min-h-11 items-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/35"
            >
              {game.boneyardCount > 0 ? <PackageOpen className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
              {game.boneyardCount > 0 ? 'اسحب حجر' : 'عدّي الدور'}
            </motion.button>
          ) : (
            <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-xs font-bold text-white/55">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              {game.ended ? notice : myTurn ? `${playableIds.size} حجر ينفع يتلعب` : `استنى دور ${opponent?.name ?? 'الخصم'}…`}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full rounded-[1.6rem] border border-white/10 bg-white/[0.035] px-1 pt-1">
        <div className="flex items-center justify-between px-3 pt-1 text-[11px] font-bold text-white/55">
          <span>حجارة إيدك</span>
          <span>{game.hand.length} حجر</span>
        </div>
        <DominoHand tiles={game.hand} playableIds={playableIds} selectedId={selected?.id ?? null} disabled={!myTurn} onTile={chooseTile} />
      </div>
    </div>
  )
}

function PlayerCard({
  active,
  avatar,
  name,
  count,
  accent,
}: {
  active: boolean
  avatar: string
  name: string
  count: number
  accent: 'emerald' | 'amber'
}) {
  return (
    <motion.div
      layout
      className={cn(
        'glass flex min-h-16 items-center justify-center gap-2 rounded-2xl px-2 py-2 transition-all',
        active && accent === 'emerald' && 'border-emerald-400/60 glow-emerald',
        active && accent === 'amber' && 'border-amber-400/60 glow-amber',
      )}
    >
      <AvatarCircle emoji={avatar} size="sm" />
      <div className="min-w-0">
        <p className="max-w-24 truncate text-[11px] font-bold">{name}</p>
        <p className={cn('text-base font-black tabular-nums', accent === 'emerald' ? 'text-emerald-300' : 'text-amber-300')}>{count} حجر</p>
      </div>
    </motion.div>
  )
}
