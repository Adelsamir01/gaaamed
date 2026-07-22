import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Layers3, MousePointerClick, Sparkles, Timer } from 'lucide-react'
import type { GameProps } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { buildMemoryDeck, memoryLevel, MEMORY_EMOJIS } from './config.js'

interface Card {
  id: number
  emoji: string
  flipped: boolean
  matched: boolean
}

interface Resolution {
  kind: 'match' | 'miss'
  indices: number[]
}

function createCards(difficulty: GameProps['config']['difficulty']): Card[] {
  return buildMemoryDeck(difficulty).map((emojiIndex, id) => ({
    id,
    emoji: MEMORY_EMOJIS[emojiIndex],
    flipped: false,
    matched: false,
  }))
}

function fmtTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

export default function MemoryGame({ config, onFinish }: GameProps) {
  const level = memoryLevel(config.difficulty)
  const [cards, setCards] = useState<Card[]>(() => createCards(level.difficulty))
  const [picked, setPicked] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [done, setDone] = useState(false)
  const [resolution, setResolution] = useState<Resolution | null>(null)
  const lockRef = useRef(false)
  const finishedRef = useRef(false)
  const secondsRef = useRef(0)
  const resolutionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const matchedCount = useMemo(() => cards.filter((card) => card.matched).length, [cards])
  const matchedPairs = matchedCount / 2

  useEffect(() => {
    if (done) return
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        secondsRef.current = current + 1
        return current + 1
      })
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [done])

  useEffect(() => () => {
    if (resolutionTimerRef.current) clearTimeout(resolutionTimerRef.current)
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
  }, [])

  const complete = (finalMoves: number) => {
    if (finishedRef.current) return
    finishedRef.current = true
    setDone(true)
    sounds.win()
    const rewardScale = level.difficulty === 'hard' ? 1.75 : level.difficulty === 'medium' ? 1.35 : 1
    const coins = Math.max(10, Math.round((level.pairs * 5 - finalMoves) * rewardScale))
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'memory',
        outcome: 'win',
        score: finalMoves,
        bestCandidate: finalMoves,
        lowerIsBetter: true,
        coinsEarned: coins,
        xpEarned: Math.round(40 * rewardScale),
        summary: `أنهيت المستوى ${level.label} في ${finalMoves} حركة خلال ${fmtTime(secondsRef.current)} 🧠`,
        detail: `${level.pairs} أزواج على لوحة ${level.boardLabel} — كلما قلّت حركاتك زادت مكافأتك!`,
      })
    }, 900)
  }

  const flip = (index: number) => {
    if (lockRef.current || done) return
    const card = cards[index]
    if (!card || card.flipped || card.matched) return

    sounds.flip()
    const next = cards.map((item, itemIndex) => itemIndex === index ? { ...item, flipped: true } : item)
    const nextPicked = [...picked, index]
    setCards(next)
    setPicked(nextPicked)
    if (nextPicked.length !== 2) return

    lockRef.current = true
    const [first, second] = nextPicked
    const nextMoves = moves + 1
    setMoves(nextMoves)
    const matched = next[first].emoji === next[second].emoji
    setResolution({ kind: matched ? 'match' : 'miss', indices: [first, second] })

    if (matched) {
      sounds.correct()
      resolutionTimerRef.current = setTimeout(() => {
        setCards((current) => current.map((item, itemIndex) => (
          itemIndex === first || itemIndex === second ? { ...item, matched: true } : item
        )))
        setPicked([])
        setResolution(null)
        lockRef.current = false
        if (matchedCount + 2 === cards.length) complete(nextMoves)
      }, 460)
      return
    }

    sounds.wrong()
    resolutionTimerRef.current = setTimeout(() => {
      setCards((current) => current.map((item, itemIndex) => (
        itemIndex === first || itemIndex === second ? { ...item, flipped: false } : item
      )))
      setPicked([])
      setResolution(null)
      lockRef.current = false
    }, 720)
  }

  const compact = level.columns >= 5
  const hard = level.columns >= 6

  return (
    <div className="flex flex-col items-center gap-3 py-3" dir="rtl">
      <div className="flex w-full items-center justify-between gap-2">
        <div className="glass flex min-h-10 items-center gap-2 rounded-2xl px-3">
          <MousePointerClick className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-bold tabular-nums">{moves} حركة</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/8 px-3 py-1.5 text-[11px] font-extrabold text-emerald-200">
          <Layers3 className="h-3.5 w-3.5" />
          {level.label} · {level.boardLabel}
        </div>
        <div className="glass flex min-h-10 items-center gap-2 rounded-2xl px-3">
          <Timer className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-bold tabular-nums">{fmtTime(seconds)}</span>
        </div>
      </div>

      <div className="w-full">
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-emerald-400 via-teal-300 to-amber-300"
            animate={{ width: `${(matchedCount / cards.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 150, damping: 22 }}
          />
        </div>
        <p className="mt-1.5 text-center text-[11px] font-bold text-muted-foreground">
          {done ? 'ذاكرة ممتازة! اللوحة اكتملت ✨' : `طابق الأزواج — ${matchedPairs} / ${level.pairs}`}
        </p>
      </div>

      <motion.div
        layout
        className="grid w-full max-w-[374px]"
        style={{
          gridTemplateColumns: `repeat(${level.columns}, minmax(0, 1fr))`,
          gap: hard ? 4 : compact ? 7 : 10,
        }}
      >
        {cards.map((card, index) => {
          const resolving = resolution?.indices.includes(index) ?? false
          const matching = resolving && resolution?.kind === 'match'
          const missing = resolving && resolution?.kind === 'miss'
          const open = card.flipped || card.matched
          return (
            <motion.button
              key={card.id}
              type="button"
              initial={{ opacity: 0, scale: 0.72, y: 10 }}
              animate={missing
                ? { opacity: 1, scale: [1, 0.96, 1], x: [0, -4, 4, -3, 3, 0], y: 0 }
                : matching
                  ? { opacity: 1, scale: [1, 1.12, 1.04], x: 0, y: [0, -4, 0] }
                  : { opacity: card.matched ? 0.82 : 1, scale: 1, x: 0, y: 0 }}
              transition={resolving
                ? { duration: matching ? 0.46 : 0.42, ease: 'easeInOut' }
                : { delay: Math.min(index * 0.018, 0.28), type: 'spring', stiffness: 330, damping: 24 }}
              whileTap={!open && !resolution ? { scale: 0.9 } : undefined}
              onClick={() => flip(index)}
              disabled={open || done}
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
                    'glass absolute inset-0 flex items-center justify-center overflow-hidden border border-white/12 bg-gradient-to-br from-white/10 to-emerald-500/8 shadow-lg',
                    hard ? 'rounded-xl' : 'rounded-2xl',
                  )}
                  style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                  <span className={cn('font-black text-emerald-400/75', hard ? 'text-base' : 'text-xl')}>؟</span>
                  <span className="absolute -right-4 -top-6 h-12 w-12 rounded-full bg-emerald-300/10 blur-lg" />
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
