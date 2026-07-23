import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Hand, PackageOpen, Sparkles } from 'lucide-react'
import type { GameProps } from '@/games'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from '@/sections/components'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  boardEnds,
  createDominoGame,
  drawDomino,
  handPipTotal,
  legalMoves,
  legalSides,
  passDomino,
  playDomino,
  takeBotTurn,
  type DominoActionResult,
  type DominoPlayer,
  type DominoSide,
  type DominoState,
  type DominoTile,
} from './engine'
import { DominoHand, DominoTable } from './DominoTable'
import { DominoTile as DominoPiece } from './DominoTile'

export default function DominoesGame({ config, onFinish }: GameProps) {
  const { profile } = useApp()
  const againstBot = config.mode !== 'twoPlayer'
  const [game, setGame] = useState<DominoState>(() => createDominoGame())
  const [selected, setSelected] = useState<DominoTile | null>(null)
  const [handoff, setHandoff] = useState<DominoPlayer | null>(() => config.mode === 'twoPlayer' ? game.currentPlayer : null)
  const [notice, setNotice] = useState('نزّل الحجر على واحد من الطرفين')
  const finishedRef = useRef(false)

  const finish = useCallback((state: DominoState) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const outcome = state.winner === null ? 'draw' : state.winner === 0 ? 'win' : 'loss'
    const playerTwoName = againstBot ? 'الكمبيوتر' : 'اللاعب ٢'
    const winnerName = state.winner === 0 ? (againstBot ? profile.name : 'اللاعب ١') : state.winner === 1 ? playerTwoName : undefined
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    setNotice(state.winner === null ? 'قفلة وتعادل! 🤝' : `${winnerName} كسب الجولة! 🏆`)
    window.setTimeout(() => {
      onFinish({
        gameId: 'dominoes',
        outcome,
        winnerName,
        winnerSlot: state.winner === null ? undefined : state.winner + 1,
        score: state.points,
        bestCandidate: state.winner === 0 ? state.points : undefined,
        coinsEarned: outcome === 'win' ? 35 : outcome === 'draw' ? 12 : 5,
        xpEarned: outcome === 'win' ? 45 : outcome === 'draw' ? 18 : 8,
        summary: state.winner === null
          ? 'الحجارة اتقفلت ومجموع النقط متساوي'
          : `${winnerName} خلّص حجاره${state.points ? ` وكسب ${state.points} نقطة` : ''}`,
        detail: state.endReason === 'blocked' ? 'الجولة اتقفلت؛ أقل مجموع نقط هو اللي كسب.' : 'أول لاعب خلّص كل حجاره كسب الجولة.',
      })
    }, 1_350)
  }, [againstBot, onFinish, profile.name])

  useEffect(() => {
    if (!againstBot || game.status !== 'playing' || game.currentPlayer !== 1) return
    const timer = window.setTimeout(() => {
      const next = takeBotTurn(game, 1, config.difficulty)
      setGame(next)
      setNotice('دورك — اختار حجر مناسب')
      sounds.tick()
      if (next.status === 'ended') finish(next)
    }, config.difficulty === 'hard' ? 620 : 480)
    return () => window.clearTimeout(timer)
  }, [againstBot, config.difficulty, finish, game])

  const ends = boardEnds(game)
  const moves = useMemo(() => legalMoves(game, game.currentPlayer), [game])
  const playableIds = useMemo(() => new Set(moves.map((move) => move.tile.id)), [moves])
  const humanCanAct = game.status === 'playing' && !handoff && (!againstBot || game.currentPlayer === 0)

  const acceptResult = (result: DominoActionResult) => {
    if (!result.accepted) return
    const changedPlayer = result.state.currentPlayer !== game.currentPlayer
    setSelected(null)
    setGame(result.state)
    if (result.state.status === 'ended') finish(result.state)
    if (result.state.lastAction.kind === 'draw') {
      setNotice(legalMoves(result.state, game.currentPlayer).length > 0 ? 'الحجر الجديد ينفع — العب بيه' : 'اسحب حجر تاني')
      sounds.flip()
    } else {
      sounds.pop()
      if (!againstBot && changedPlayer && result.state.status === 'playing') setHandoff(result.state.currentPlayer)
    }
  }

  const playSelected = (side: DominoSide) => {
    if (!selected || !humanCanAct) return
    acceptResult(playDomino(game, game.currentPlayer, selected.id, side))
  }

  const chooseTile = (tile: DominoTile) => {
    if (!humanCanAct) return
    const sides = legalSides(game, tile)
    if (sides.length === 1) {
      acceptResult(playDomino(game, game.currentPlayer, tile.id, sides[0]))
      return
    }
    setSelected((current) => current?.id === tile.id ? null : tile)
    setNotice('الحجر ينفع على الناحيتين — اختار الطرف')
    sounds.tick()
  }

  const drawOrPass = () => {
    if (!humanCanAct || moves.length > 0) return
    if (game.boneyard.length > 0) acceptResult(drawDomino(game, game.currentPlayer))
    else acceptResult(passDomino(game, game.currentPlayer))
  }

  const playerTwoName = againstBot ? 'الكمبيوتر' : 'اللاعب ٢'
  const currentHand = game.hands[game.currentPlayer]
  const shownPlayer: DominoPlayer = againstBot ? 0 : game.currentPlayer
  const selectedSides = selected ? legalSides(game, selected) : []

  return (
    <div className="relative flex w-full flex-col items-center gap-2.5 py-2" dir="rtl">
      <div className="grid w-full grid-cols-2 gap-2">
        <PlayerCard
          active={game.currentPlayer === 0 && game.status === 'playing'}
          avatar={profile.avatar}
          name={againstBot ? 'أنت' : 'اللاعب ١'}
          count={game.hands[0].length}
          accent="emerald"
        />
        <PlayerCard
          active={game.currentPlayer === 1 && game.status === 'playing'}
          avatar={againstBot ? '🤖' : '🎮'}
          name={playerTwoName}
          count={game.hands[1].length}
          accent="amber"
        />
      </div>

      <DominoTable
        board={game.board}
        boneyardCount={game.boneyard.length}
        leftEnd={ends.left}
        rightEnd={ends.right}
        message={againstBot && game.status === 'playing' && game.currentPlayer === 1 ? 'الكمبيوتر بيفكّر…' : notice}
      />

      <div className="flex min-h-11 w-full items-center justify-center gap-2">
        <AnimatePresence mode="popLayout">
          {selected && selectedSides.length === 2 ? (
            <motion.div
              key="side-picker"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2"
            >
              <button type="button" onClick={() => playSelected('left')} className="flex min-h-11 items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-400/15 px-4 text-xs font-black text-emerald-100">
                <ArrowRight className="h-4 w-4" /> طرف {ends.left}
              </button>
              <DominoPiece compact tile={selected} className="pointer-events-none" />
              <button type="button" onClick={() => playSelected('right')} className="flex min-h-11 items-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/15 px-4 text-xs font-black text-amber-100">
                طرف {ends.right} <ArrowLeft className="h-4 w-4" />
              </button>
            </motion.div>
          ) : moves.length === 0 && humanCanAct ? (
            <motion.button
              key="draw"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              type="button"
              onClick={drawOrPass}
              className="flex min-h-11 items-center gap-2 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/35"
            >
              {game.boneyard.length > 0 ? <PackageOpen className="h-4 w-4" /> : <Hand className="h-4 w-4" />}
              {game.boneyard.length > 0 ? 'اسحب حجر' : 'عدّي الدور'}
            </motion.button>
          ) : (
            <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-xs font-bold text-white/55">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              {humanCanAct ? `${playableIds.size} حجر ينفع يتلعب` : `دور ${game.currentPlayer === 0 ? (againstBot ? 'ك' : 'اللاعب ١') : playerTwoName}`}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div className="w-full rounded-[1.6rem] border border-white/10 bg-white/[0.035] px-1 pt-1">
        <div className="flex items-center justify-between px-3 pt-1 text-[11px] font-bold text-white/55">
          <span>حجارة {shownPlayer === 0 ? (againstBot ? 'إيدك' : 'اللاعب ١') : 'اللاعب ٢'}</span>
          {game.status === 'ended' && <span>المجموع: {handPipTotal(game, shownPlayer)} نقطة</span>}
        </div>
        <DominoHand
          tiles={againstBot ? game.hands[0] : currentHand}
          playableIds={shownPlayer === game.currentPlayer ? playableIds : new Set()}
          selectedId={selected?.id ?? null}
          disabled={!humanCanAct}
          onTile={chooseTile}
        />
      </div>

      <AnimatePresence>
        {handoff !== null && game.status === 'playing' && (
          <motion.div
            className="absolute inset-0 z-30 flex items-center justify-center rounded-[2rem] bg-[#07120f]/94 p-5 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div initial={{ scale: 0.88, y: 15 }} animate={{ scale: 1, y: 0 }} className="glass w-full max-w-xs rounded-[2rem] p-6 text-center">
              <div className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-400/15 text-3xl">🤫</div>
              <h3 className="text-xl font-black">سلّم الموبايل</h3>
              <p className="mt-2 text-sm font-bold text-white/60">دور {handoff === 0 ? 'اللاعب ١' : 'اللاعب ٢'} — حجارتك لسه مخفية</p>
              <button
                type="button"
                onClick={() => {
                  setHandoff(null)
                  setNotice('دورك — اختار حجر مناسب')
                }}
                className="mt-5 min-h-12 w-full rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-sm font-black text-white shadow-lg shadow-emerald-950/40"
              >
                أنا جاهز، ورّيني حجاري
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
        <p className={cn('text-base font-black tabular-nums', accent === 'emerald' ? 'text-emerald-300' : 'text-amber-300')}>
          {count} حجر
        </p>
      </div>
    </motion.div>
  )
}
