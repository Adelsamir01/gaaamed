import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { Move, Sparkles, Star, Target } from 'lucide-react'
import type { GameProps } from '@/games'
import { sounds } from '@/lib/sounds'
import Match3Board, { CandyPiece, SWEET_NAMES } from './Match3Board'
import { applyMatch3Swap, createMatch3Game, type Match3Cell, type Match3State } from './engine.js'

const LEVELS = {
  easy: { moves: 34, target: 5_500, orders: [12, 10] },
  medium: { moves: 30, target: 7_500, orders: [16, 14] },
  hard: { moves: 26, target: 10_000, orders: [20, 18] },
} as const

const ORDER_TYPES = [0, 2] as const
let nextLocalSeed = Date.now() >>> 0

function takeLocalSeed(): number {
  nextLocalSeed = (nextLocalSeed + 0x9e3779b9) >>> 0
  return nextLocalSeed
}

interface Feedback {
  id: number
  text: string
  score: number
  good: boolean
}

function orderCell(type: number): Match3Cell {
  return { id: -(type + 1), type, special: 'none' }
}

export default function Match3Game({ config, onFinish }: GameProps) {
  const level = LEVELS[config.difficulty]
  const [seed] = useState(takeLocalSeed)
  const [game, setGame] = useState<Match3State>(() => createMatch3Game(seed, { moves: level.moves }))
  const [locked, setLocked] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const feedbackIdRef = useRef(0)
  const finishedRef = useRef(false)
  const unlockTimerRef = useRef<number | null>(null)

  const objectives = useMemo(() => ORDER_TYPES.map((type, index) => ({
    type,
    target: level.orders[index],
    current: game.collected[type] ?? 0,
  })), [game.collected, level.orders])
  const ordersDone = objectives.every((objective) => objective.current >= objective.target)
  const scoreDone = game.score >= level.target
  const progress = Math.min(100, (game.score / level.target) * 100)
  const ending: 'win' | 'loss' | null = scoreDone && ordersDone
    ? 'win'
    : game.movesRemaining === 0
      ? 'loss'
      : null

  useEffect(() => () => {
    if (unlockTimerRef.current !== null) window.clearTimeout(unlockTimerRef.current)
  }, [])

  useEffect(() => {
    if (finishedRef.current || !ending) return
    finishedRef.current = true
    const won = ending === 'win'
    if (won) {
      sounds.win()
      void confetti({ particleCount: 120, spread: 74, origin: { y: 0.62 }, colors: ['#ff5f91', '#ffbf3f', '#42d99a', '#a86cf7'] })
    } else sounds.lose()

    const timer = window.setTimeout(() => {
      onFinish({
        gameId: 'match3',
        outcome: won ? 'win' : 'loss',
        score: game.score,
        bestCandidate: game.score,
        coinsEarned: won ? Math.min(70, 28 + Math.floor(game.score / 900)) : Math.min(18, 5 + Math.floor(game.score / 1800)),
        xpEarned: won ? 55 : 14,
        summary: won
          ? `كمّلت طلب الحلواني وجمعت ${game.score.toLocaleString('ar-EG')} نقطة 🍬`
          : `وصلت إلى ${game.score.toLocaleString('ar-EG')} نقطة — قربت تكمّل الطلب`,
        detail: won
          ? `صنعت ${game.totalCleared} قطعة في ${level.moves - (game.movesRemaining ?? 0)} حركة.`
          : 'جرّب تجمع أربع أو خمس قطع لصناعة الصواريخ وقنبلة السكر ودوامة الألوان.',
      })
    }, 1_350)
    return () => window.clearTimeout(timer)
  }, [ending, game.movesRemaining, game.score, game.totalCleared, level.moves, onFinish])

  const trySwap = useCallback((first: number, second: number) => {
    if (locked || finishedRef.current) return
    const result = applyMatch3Swap(game, first, second)
    feedbackIdRef.current += 1
    if (!result.accepted) {
      sounds.wrong()
      setFeedback({ id: feedbackIdRef.current, text: 'لازم تكوّن ٣ قطع', score: 0, good: false })
      window.setTimeout(() => setFeedback(null), 650)
      return
    }

    setLocked(true)
    setGame(result.state)
    if (result.createdSpecial === 'rainbow') sounds.win()
    else if (result.cascades >= 2 || result.createdSpecial) sounds.correct()
    else sounds.pop()
    const comboText = result.createdSpecial === 'rainbow'
      ? 'دوامة ألوان! 🌈'
      : result.createdSpecial === 'bomb'
        ? 'قنبلة سكر! 💥'
        : result.createdSpecial === 'row' || result.createdSpecial === 'col'
          ? 'صاروخ حلوى! 🚀'
          : result.cascades >= 3
            ? `كومبو ×${result.cascades}!`
            : result.cascades === 2
              ? 'كومبو جميل!'
              : 'حلو!'
    setFeedback({ id: feedbackIdRef.current, text: comboText, score: result.scoreDelta, good: true })
    unlockTimerRef.current = window.setTimeout(() => {
      setLocked(false)
      setFeedback(null)
    }, Math.min(900, 360 + result.cascades * 90))
  }, [game, locked])

  return (
    <div className="match3-game flex flex-col items-center gap-2.5 py-2 min-h-[calc(100dvh-76px)]" dir="rtl">
      <section className="match3-panel relative w-full overflow-hidden rounded-[1.65rem] px-3.5 py-3">
        <div className="absolute -left-5 -top-7 h-24 w-24 rounded-full bg-pink-400/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-pink-400 to-orange-300 text-2xl shadow-lg shadow-pink-950/25">🧁</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold tracking-wide text-pink-200">طلب الحلواني</p>
            <h2 className="truncate text-base font-black">خلّص الأوردر قبل الحركات</h2>
          </div>
          <div className="text-left">
            <p className="text-[9px] font-bold text-white/60">النقاط</p>
            <motion.p key={game.score} initial={{ scale: 1.18 }} animate={{ scale: 1 }} className="text-xl font-black tabular-nums text-amber-300">
              {game.score.toLocaleString('ar-EG')}
            </motion.p>
          </div>
        </div>

        <div className="relative mt-2.5 flex items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-amber-300" />
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/25">
            <motion.div className="h-full rounded-full bg-gradient-to-l from-amber-300 via-pink-400 to-violet-400" animate={{ width: `${progress}%` }} />
          </div>
          <bdi className="w-12 text-left text-[10px] font-black tabular-nums text-amber-100">{Math.round(progress)}%</bdi>
        </div>

        <div className="relative mt-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {objectives.map((objective) => (
              <div key={objective.type} className="flex items-center gap-1 rounded-full bg-black/20 py-1 pe-2 ps-1">
                <CandyPiece cell={orderCell(objective.type)} mini />
                <bdi className={`text-[11px] font-black tabular-nums ${objective.current >= objective.target ? 'text-emerald-300' : 'text-white'}`}>
                  {Math.min(objective.current, objective.target)}/{objective.target}
                </bdi>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-pink-500/20 px-3 py-1.5 text-pink-100 ring-1 ring-pink-300/25">
            <Move className="h-4 w-4" />
            <bdi className="text-sm font-black tabular-nums">{game.movesRemaining}</bdi>
            <span className="text-[10px] font-bold">حركة</span>
          </div>
        </div>
      </section>

      <div className="relative w-full max-w-[390px]">
        <AnimatePresence>
          {feedback && (
            <motion.div
              key={feedback.id}
              initial={{ opacity: 0, y: 12, scale: 0.75 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.9 }}
              className={`pointer-events-none absolute inset-x-0 -top-1 z-20 mx-auto w-max max-w-[86%] rounded-full px-4 py-1.5 text-center text-xs font-black shadow-xl ${feedback.good ? 'bg-amber-300 text-violet-950' : 'bg-rose-500 text-white'}`}
            >
              {feedback.text} {feedback.score > 0 && <bdi className="tabular-nums">+{feedback.score.toLocaleString('ar-EG')}</bdi>}
            </motion.div>
          )}
        </AnimatePresence>
        <Match3Board state={game} disabled={locked || !!ending} onSwap={trySwap} celebration={ending === 'win'} />
      </div>

      <section className="match3-panel w-full rounded-2xl px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-white/72">
          <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-pink-300" />٤ قطع = صاروخ</span>
          <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-300" />شكل T = قنبلة</span>
          <span className="flex items-center gap-1">٥ قطع = 🌈</span>
        </div>
      </section>

      <AnimatePresence>
        {ending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 grid place-items-center bg-[#160d2b]/72 px-8 text-center backdrop-blur-sm">
            <motion.div initial={{ scale: 0.65, y: 20 }} animate={{ scale: 1, y: 0 }} className="match3-panel w-full rounded-[2rem] p-7">
              <div className="text-6xl">{ending === 'win' ? '🎉' : '🍬'}</div>
              <p className="mt-3 text-2xl font-black">{ending === 'win' ? 'الأوردر خلص!' : 'الحركات خلصت'}</p>
              <p className="mt-2 text-sm font-bold text-white/70">{ending === 'win' ? 'حلواني شاطر بجد' : `${SWEET_NAMES[ORDER_TYPES.find((_, index) => objectives[index].current < objectives[index].target) ?? 0]} محتاجة شوية كمان`}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
