import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Check, X, ChevronLeft } from 'lucide-react'
import type { GameProps } from '@/games'
import type { TriviaQuestion } from '@/types'
import { TRIVIA_QUESTIONS } from '@/data/trivia'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const QUESTION_TIME = 15
const ROUND_SIZE = 10

interface Answer {
  question: TriviaQuestion
  picked: number | null // null = انتهى الوقت
}

export default function TriviaGame({ onFinish }: GameProps) {
  const questions = useMemo(() => [...TRIVIA_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, ROUND_SIZE), [])
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME)
  const [streak, setStreak] = useState(0)
  const [coins, setCoins] = useState(0)
  const [showReview, setShowReview] = useState(false)
  const finishedRef = useRef(false)

  const current = questions[index]
  const correctCount = answers.filter((a) => a.picked === a.question.correct).length
  const mistakes = answers.filter((a) => a.picked !== a.question.correct)

  // المؤقّت
  useEffect(() => {
    if (picked !== null || showReview) return
    if (timeLeft <= 0) {
      answer(null)
      return
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000)
    if (timeLeft <= 5) sounds.tick()
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, picked, showReview])

  const answer = (option: number | null) => {
    if (picked !== null) return
    setPicked(option)
    const isCorrect = option === current.correct
    if (isCorrect) {
      sounds.correct()
      const newStreak = streak + 1
      setStreak(newStreak)
      setCoins((c) => c + 5 + (newStreak % 3 === 0 ? 2 : 0))
    } else {
      sounds.wrong()
      setStreak(0)
    }
    const newAnswers = [...answers, { question: current, picked: option }]
    setAnswers(newAnswers)

    setTimeout(() => {
      if (index + 1 >= questions.length) {
        setShowReview(true)
      } else {
        setIndex((i) => i + 1)
        setPicked(null)
        setTimeLeft(QUESTION_TIME)
      }
    }, 1200)
  }

  const finish = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    const win = correctCount >= 7
    const draw = correctCount >= 4 && correctCount < 7
    const outcome = win ? 'win' : draw ? 'draw' : 'loss'
    if (win) sounds.win()
    else sounds.lose()
    onFinish({
      gameId: 'trivia',
      outcome,
      score: correctCount,
      bestCandidate: correctCount,
      coinsEarned: coins,
      xpEarned: win ? 40 : draw ? 15 : 8,
      summary: `أجبت على ${correctCount} من ${questions.length} أسئلة بشكل صحيح 🧠`,
      detail: win ? 'معلوماتك العامة ممتازة!' : 'راجع أخطاءك وحاول مجددًا',
    })
  }

  if (showReview) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <div className="glass rounded-3xl p-5 text-center">
          <div className="text-5xl mb-2">{correctCount >= 7 ? '🏆' : correctCount >= 4 ? '💪' : '📚'}</div>
          <div className="text-3xl font-black text-gradient tabular-nums">
            <bdi className="bidi-number">{correctCount} / {questions.length}</bdi>
          </div>
          <p className="text-sm text-muted-foreground mt-1">إجابة صحيحة — جمعت {coins} عملة</p>
        </div>

        {mistakes.length > 0 ? (
          <div>
            <h3 className="font-extrabold mb-2">راجع أخطاءك ({mistakes.length})</h3>
            <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pe-1">
              {mistakes.map((m, i) => (
                <div key={i} className="glass rounded-2xl p-3.5">
                  <p className="text-sm font-bold mb-2 leading-relaxed">{m.question.q}</p>
                  <div className="flex items-center gap-1.5 text-xs text-red-300">
                    <X className="w-3.5 h-3.5 shrink-0" />
                    <span>{m.picked === null ? 'انتهى الوقت' : m.question.options[m.picked]}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-300 mt-1">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>{m.question.options[m.question.correct]}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass rounded-2xl p-4 text-center text-emerald-300 font-bold">🎯 جولة مثالية! بدون أي خطأ</div>
        )}

        <button
          onClick={finish}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold text-lg flex items-center justify-center gap-2 transition-colors glow-emerald"
        >
          عرض النتيجة
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      {/* شريط التقدم والوقت */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold text-muted-foreground tabular-nums">
          سؤال <bdi className="bidi-number">{index + 1} / {questions.length}</bdi>
        </span>
        <div className="flex items-center gap-3">
          {streak >= 2 && (
            <motion.span
              key={streak}
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              className="flex items-center gap-1 text-amber-400 font-extrabold"
            >
              <Flame className="w-4 h-4" />
              {streak}
            </motion.span>
          )}
          <span className={cn('font-black tabular-nums text-lg', timeLeft <= 5 ? 'text-red-400' : 'text-emerald-300')}>{timeLeft}</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          key={`${index}-${timeLeft}`}
          className={cn('h-full rounded-full', timeLeft <= 5 ? 'bg-red-400' : 'bg-gradient-to-l from-emerald-400 to-teal-300')}
          initial={false}
          animate={{ width: `${(timeLeft / QUESTION_TIME) * 100}%` }}
          transition={{ duration: 0.9, ease: 'linear' }}
        />
      </div>

      {/* السؤال */}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-3"
        >
          <div className="glass rounded-3xl p-5 min-h-[110px] flex items-center justify-center">
            <p className="text-lg font-extrabold leading-relaxed text-center">{current.q}</p>
          </div>

          <div className="flex flex-col gap-2.5">
            {current.options.map((opt, i) => {
              const isPicked = picked === i
              const isCorrect = i === current.correct
              const revealed = picked !== null
              return (
                <motion.button
                  key={i}
                  whileTap={revealed ? undefined : { scale: 0.98 }}
                  onClick={() => answer(i)}
                  disabled={revealed}
                  className={cn(
                    'w-full text-start glass rounded-2xl px-4 py-3.5 font-bold transition-all flex items-center justify-between gap-2',
                    !revealed && 'hover:bg-white/10',
                    revealed && isCorrect && 'bg-emerald-500/25 border-emerald-400/60 text-emerald-200',
                    revealed && isPicked && !isCorrect && 'bg-red-500/25 border-red-400/60 text-red-200',
                    revealed && !isPicked && !isCorrect && 'opacity-50',
                  )}
                >
                  <span>{opt}</span>
                  {revealed && isCorrect && <Check className="w-5 h-5 text-emerald-400 shrink-0" />}
                  {revealed && isPicked && !isCorrect && <X className="w-5 h-5 text-red-400 shrink-0" />}
                </motion.button>
              )
            })}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
