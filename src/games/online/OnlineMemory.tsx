import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Layers3, MousePointerClick, Sparkles } from 'lucide-react'
import type { Difficulty } from '@/types'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from '@/sections/components'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { memoryLevel } from '@/games/memory/config.js'

interface MemoryCard {
  index: number
  emoji: string | null
  matched: boolean
}

interface MemoryState {
  difficulty: Difficulty
  pairs: number
  columns: number
  cards: MemoryCard[]
  selected: number[]
  lastPair: number[]
  activeSlot: number
  scores: Record<number, number>
  moves: number
  resolving: boolean
  ended: boolean
}

interface MemoryEnd {
  difficulty: Difficulty
  winnerSlot: number
  scores: Record<number, number>
  moves: number
}

interface Resolution {
  kind: 'match' | 'miss'
  indices: number[]
}

export default function OnlineMemory({ onFinish }: GameProps) {
  const { slot, opponent, subscribe, sendMemoryFlip, requestGameSync } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const theirSlot = mySlot === 1 ? 2 : 1
  const [game, setGame] = useState<MemoryState | null>(null)
  const [ending, setEnding] = useState<string | null>(null)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const finishedRef = useRef(false)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const effectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finish = useCallback((result: MemoryEnd) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const level = memoryLevel(result.difficulty)
    const outcome = result.winnerSlot === 0 ? 'draw' : result.winnerSlot === mySlot ? 'win' : 'loss'
    const mine = result.scores[mySlot] ?? 0
    const theirs = result.scores[theirSlot] ?? 0
    const rewardScale = level.difficulty === 'hard' ? 1.55 : level.difficulty === 'medium' ? 1.25 : 1
    const winnerName = result.winnerSlot === mySlot
      ? profile.name
      : result.winnerSlot === theirSlot
        ? opponent?.name ?? 'الخصم'
        : undefined
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    setEnding(outcome === 'win' ? 'الذاكرة الأقوى! 🏆' : outcome === 'draw' ? 'تعادل في الأزواج! 🤝' : 'الخصم جمع أزواجًا أكثر')
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'memory',
        outcome,
        winnerName,
        winnerSlot: result.winnerSlot === 0 ? undefined : result.winnerSlot,
        score: mine,
        coinsEarned: Math.round((outcome === 'win' ? 35 : outcome === 'draw' ? 12 : 5) * rewardScale),
        xpEarned: Math.round((outcome === 'win' ? 45 : outcome === 'draw' ? 18 : 8) * rewardScale),
        summary: outcome === 'draw'
          ? `تعادلت مع ${opponent?.name ?? 'الخصم'} ${mine} - ${theirs} في ${result.moves} محاولة`
          : outcome === 'win'
            ? `جمعت ${mine} أزواج مقابل ${theirs} لـ${opponent?.name ?? 'الخصم'} 🧠`
            : `${opponent?.name ?? 'الخصم'} جمع ${theirs} أزواج مقابل ${mine}`,
        detail: `المستوى ${level.label} · لوحة ${level.boardLabel}. من يطابق زوجًا يحتفظ بالدور، والخطأ ينقل الدور للخصم.`,
      })
    }, 1_350)
  }, [mySlot, onFinish, opponent?.name, profile.name, theirSlot])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'memory') return
      if (event.msg.type === 'memory_state') {
        const next = event.msg.state as unknown as MemoryState
        const effect = String(event.msg.effect || '')
        setGame(next)
        if ((effect === 'match' || effect === 'miss') && next.lastPair.length === 2) {
          setResolution({ kind: effect, indices: next.lastPair })
          if (effectTimerRef.current) clearTimeout(effectTimerRef.current)
          if (effect === 'match') {
            effectTimerRef.current = setTimeout(() => setResolution(null), 620)
            sounds.correct()
          } else {
            sounds.wrong()
          }
        } else if (effect === 'settled' || effect === 'start') {
          setResolution(null)
        }
      } else if (event.msg.type === 'memory_end') {
        finish(event.msg as unknown as MemoryEnd)
      }
    })
    requestGameSync()
    return () => {
      unsubscribe()
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
      if (effectTimerRef.current) clearTimeout(effectTimerRef.current)
    }
  }, [finish, requestGameSync, subscribe])

  const flip = (card: MemoryCard) => {
    if (!game || game.ended || game.resolving || game.activeSlot !== mySlot || card.emoji || card.matched) return
    sounds.flip()
    sendMemoryFlip(card.index)
  }

  if (!game) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <motion.p animate={{ opacity: [0.35, 1, 0.35] }} transition={{ repeat: Infinity, duration: 1.2 }} className="font-bold text-muted-foreground">
          بنجهّز البطاقات… 🧠
        </motion.p>
      </div>
    )
  }

  const level = memoryLevel(game.difficulty)
  const myTurn = game.activeSlot === mySlot
  const mine = game.scores[mySlot] ?? 0
  const theirs = game.scores[theirSlot] ?? 0
  const matchedPairs = mine + theirs
  const compact = level.columns >= 5
  const hard = level.columns >= 6

  return (
    <div className="flex flex-col items-center gap-2.5 py-2" dir="rtl">
      <div className="grid w-full grid-cols-2 gap-2 text-center">
        <motion.div layout className={cn('glass flex min-h-16 items-center justify-center gap-2 rounded-2xl py-2 transition-all', myTurn && !ending && 'border-emerald-400/60 glow-emerald')}>
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div>
            <p className="text-[11px] font-bold">أنت</p>
            <AnimatePresence mode="popLayout">
              <motion.p key={mine} initial={{ scale: 1.35, y: -3 }} animate={{ scale: 1, y: 0 }} className="text-lg font-black text-emerald-300 tabular-nums">{mine} زوج</motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
        <motion.div layout className={cn('glass flex min-h-16 items-center justify-center gap-2 rounded-2xl py-2 transition-all', !myTurn && !ending && 'border-amber-400/60 glow-amber')}>
          <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
          <div>
            <p className="max-w-24 truncate text-[11px] font-bold">{opponent?.name ?? 'الخصم'}</p>
            <AnimatePresence mode="popLayout">
              <motion.p key={theirs} initial={{ scale: 1.35, y: -3 }} animate={{ scale: 1, y: 0 }} className="text-lg font-black text-amber-300 tabular-nums">{theirs} زوج</motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <div className="flex min-h-7 w-full items-center justify-between gap-2">
        <AnimatePresence mode="wait">
          <motion.p key={ending ?? `${myTurn}-${game.resolving}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 flex-1 text-center text-xs font-extrabold">
            {ending ?? (game.resolving ? 'ثبّت الرمزين في ذاكرتك…' : myTurn ? '🟢 دورك — اختر كارتين' : `🟡 دور ${opponent?.name ?? 'الخصم'}…`)}
          </motion.p>
        </AnimatePresence>
        <span className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/8 px-2 py-1 text-[10px] font-extrabold text-emerald-200">
          <Layers3 className="h-3 w-3" /> {level.label} · {level.boardLabel}
        </span>
      </div>

      <div className="flex w-full items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-emerald-400 via-teal-300 to-amber-300"
            animate={{ width: `${(matchedPairs / level.pairs) * 100}%` }}
            transition={{ type: 'spring', stiffness: 150, damping: 22 }}
          />
        </div>
        <div className="glass flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1 text-[11px] font-bold">
          <MousePointerClick className="h-3.5 w-3.5 text-emerald-400" />
          {game.moves} محاولة
        </div>
      </div>

      <motion.div
        layout
        className="grid w-full max-w-[374px]"
        style={{
          gridTemplateColumns: `repeat(${level.columns}, minmax(0, 1fr))`,
          gap: hard ? 4 : compact ? 7 : 10,
        }}
      >
        {game.cards.map((card) => {
          const open = card.emoji !== null
          const resolving = resolution?.indices.includes(card.index) ?? false
          const matching = resolving && resolution?.kind === 'match'
          const missing = resolving && resolution?.kind === 'miss'
          return (
            <motion.button
              key={card.index}
              type="button"
              initial={{ opacity: 0, scale: 0.72, y: 10 }}
              animate={missing
                ? { opacity: 1, scale: [1, 0.96, 1], x: [0, -4, 4, -3, 3, 0], y: 0 }
                : matching
                  ? { opacity: 1, scale: [1, 1.12, 1.04], x: 0, y: [0, -4, 0] }
                  : { opacity: card.matched ? 0.82 : 1, scale: 1, x: 0, y: 0 }}
              transition={resolving
                ? { duration: matching ? 0.46 : 0.42, ease: 'easeInOut' }
                : { delay: Math.min(card.index * 0.015, 0.24), type: 'spring', stiffness: 330, damping: 24 }}
              whileTap={!open && myTurn && !game.resolving ? { scale: 0.9 } : undefined}
              onClick={() => flip(card)}
              disabled={open || !myTurn || game.resolving || !!ending}
              className="aspect-square touch-manipulation disabled:cursor-default"
              style={{ perspective: 800 }}
              aria-label={open ? `بطاقة ${card.emoji}` : 'اقلب البطاقة'}
            >
              <motion.div
                className="relative h-full w-full"
                animate={{ rotateY: open ? 180 : 0 }}
                transition={{ type: 'spring', stiffness: 360, damping: 29, mass: 0.72 }}
                style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
              >
                <div
                  className={cn(
                    'glass absolute inset-0 flex items-center justify-center overflow-hidden border bg-gradient-to-br from-white/10 to-emerald-500/8 shadow-lg',
                    myTurn && !game.resolving ? 'border-emerald-400/25' : 'border-white/10',
                    hard ? 'rounded-xl' : 'rounded-2xl',
                  )}
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  <span className={cn('font-black text-emerald-400/75', hard ? 'text-base' : 'text-xl')}>؟</span>
                </div>
                <div
                  className={cn(
                    'absolute inset-0 flex items-center justify-center overflow-hidden border shadow-xl',
                    hard ? 'rounded-xl text-[25px]' : compact ? 'rounded-2xl text-[28px]' : 'rounded-2xl text-3xl',
                    card.matched
                      ? 'border-emerald-300/70 bg-gradient-to-br from-emerald-400/28 to-teal-500/14 shadow-emerald-400/15'
                      : missing
                        ? 'border-rose-300/60 bg-rose-400/14'
                        : 'border-white/25 bg-gradient-to-br from-white/16 to-white/7',
                  )}
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <span className="drop-shadow-lg">{card.emoji}</span>
                  <AnimatePresence>
                    {matching && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.3, rotate: -25 }}
                        animate={{ opacity: [0, 1, 0], scale: [0.3, 1.25, 1.6], rotate: 20 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="absolute left-1 top-1 text-amber-200"
                      >
                        <Sparkles className={hard ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.button>
          )
        })}
      </motion.div>
    </div>
  )
}
