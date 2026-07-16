import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Timer, MousePointerClick } from 'lucide-react'
import type { GameProps } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const EMOJIS = ['🐪', '🌴', '🕌', '☕', '🌙', '⭐', '🏺', '🐎']

interface Card {
  id: number
  emoji: string
  flipped: boolean
  matched: boolean
}

function buildDeck(): Card[] {
  return [...EMOJIS, ...EMOJIS]
    .map((emoji, i) => ({ id: i, emoji, flipped: false, matched: false }))
    .sort(() => Math.random() - 0.5)
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export default function MemoryGame({ onFinish }: GameProps) {
  const [cards, setCards] = useState<Card[]>(buildDeck)
  const [picked, setPicked] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [done, setDone] = useState(false)
  const lockRef = useRef(false)
  const finishedRef = useRef(false)

  const matchedCount = useMemo(() => cards.filter((c) => c.matched).length, [cards])

  useEffect(() => {
    if (done) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [done])

  useEffect(() => {
    if (matchedCount === 16 && !finishedRef.current) {
      finishedRef.current = true
      setDone(true)
      sounds.win()
      const coins = Math.max(10, 42 - moves)
      setTimeout(() => {
        onFinish({
          gameId: 'memory',
          outcome: 'win',
          score: moves,
          bestCandidate: moves,
          lowerIsBetter: true,
          coinsEarned: coins,
          xpEarned: 40,
          summary: `أنهيت اللوحة في ${moves} حركة خلال ${fmtTime(seconds)} 🧠`,
          detail: 'كلما قلّت حركاتك زادت عملاتك!',
        })
      }, 900)
    }
  }, [matchedCount, moves, seconds, onFinish])

  const flip = (idx: number) => {
    if (lockRef.current || done) return
    const card = cards[idx]
    if (card.flipped || card.matched) return
    sounds.flip()

    const next = cards.map((c, i) => (i === idx ? { ...c, flipped: true } : c))
    setCards(next)
    const newPicked = [...picked, idx]
    setPicked(newPicked)

    if (newPicked.length === 2) {
      setMoves((m) => m + 1)
      const [a, b] = newPicked
      if (next[a].emoji === next[b].emoji) {
        sounds.correct()
        setTimeout(() => {
          setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)))
          setPicked([])
        }, 400)
      } else {
        lockRef.current = true
        setTimeout(() => {
          sounds.wrong()
          setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, flipped: false } : c)))
          setPicked([])
          lockRef.current = false
        }, 800)
      }
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="w-full flex items-center justify-between">
        <div className="glass rounded-2xl px-4 py-2 flex items-center gap-2">
          <MousePointerClick className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold tabular-nums">{moves} حركة</span>
        </div>
        <div className="glass rounded-2xl px-4 py-2 flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold tabular-nums">{fmtTime(seconds)}</span>
        </div>
      </div>

      <div className="w-full">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-l from-emerald-400 to-teal-300 rounded-full"
            animate={{ width: `${(matchedCount / 16) * 100}%` }}
          />
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5 text-center">طابق الأزواج الثمانية — {matchedCount / 2} / 8</p>
      </div>

      <div className="grid grid-cols-4 gap-2.5 w-full max-w-[340px]">
        {cards.map((card, i) => (
          <motion.button
            key={card.id}
            whileTap={{ scale: 0.9 }}
            onClick={() => flip(i)}
            className="aspect-square"
            style={{ perspective: 600 }}
          >
            <motion.div
              className="relative w-full h-full"
              animate={{ rotateY: card.flipped || card.matched ? 180 : 0 }}
              transition={{ duration: 0.35 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* الوجه المغلق */}
              <div
                className="absolute inset-0 rounded-2xl glass flex items-center justify-center text-xl"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span className="text-emerald-500/60 font-black">؟</span>
              </div>
              {/* الوجه المفتوح */}
              <div
                className={cn(
                  'absolute inset-0 rounded-2xl flex items-center justify-center text-3xl border',
                  card.matched
                    ? 'bg-emerald-500/20 border-emerald-400/60 glow-emerald'
                    : 'bg-white/10 border-white/20',
                )}
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
              >
                {card.emoji}
              </div>
            </motion.div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
