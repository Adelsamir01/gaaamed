import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, Zap } from 'lucide-react'
import type { GameProps } from '@/games'
import { TRIVIA_QUESTIONS } from '@/data/trivia'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from '@/sections/components'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

interface TriviaQuestionMessage {
  index: number
  total: number
  questionId: number
  startAt: number
  durationMs: number
  answeredSlots: number[]
  myAnswer: number | null
  scores: Record<number, number>
}

interface TriviaAnswerResult {
  option: number | null
  correct: boolean
  elapsedMs: number | null
}

interface TriviaResultMessage {
  index: number
  total: number
  questionId: number
  correctOption: number
  answers: Record<number, TriviaAnswerResult>
  winnerSlot: number
  scores: Record<number, number>
}

interface TriviaEndMessage {
  winnerSlot: number
  scores: Record<number, number>
  correctCounts: Record<number, number>
  totalCorrectMs: Record<number, number>
  total: number
  tieBreak: 'score' | 'correct' | 'time' | 'draw'
}

function seconds(ms: number | null) {
  return ms === null ? '—' : `${(ms / 1000).toFixed(2)} ث`
}

export default function OnlineTrivia({ onFinish }: GameProps) {
  const { slot, opponent, subscribe, sendTriviaAnswer, requestGameSync } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const theirSlot = mySlot === 1 ? 2 : 1
  const [round, setRound] = useState<TriviaQuestionMessage | null>(null)
  const [result, setResult] = useState<TriviaResultMessage | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [ending, setEnding] = useState(false)
  const finishedRef = useRef(false)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finish = useCallback((end: TriviaEndMessage) => {
    if (finishedRef.current) return
    finishedRef.current = true
    setEnding(true)
    const outcome = end.winnerSlot === 0 ? 'draw' : end.winnerSlot === mySlot ? 'win' : 'loss'
    const mine = end.scores[mySlot] ?? 0
    const theirs = end.scores[theirSlot] ?? 0
    const myCorrect = end.correctCounts[mySlot] ?? 0
    const theirCorrect = end.correctCounts[theirSlot] ?? 0
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'trivia',
        outcome,
        coinsEarned: outcome === 'win' ? 40 : outcome === 'draw' ? 14 : 5,
        xpEarned: outcome === 'win' ? 50 : outcome === 'draw' ? 20 : 8,
        summary: outcome === 'draw'
          ? `تعادلت مع ${opponent?.name ?? 'الخصم'} ${mine} - ${theirs}`
          : outcome === 'win'
            ? `كسبت تحدي المعلومات ${mine} - ${theirs} (${myCorrect} إجابات صحيحة) 📚`
            : `${opponent?.name ?? 'الخصم'} كسب ${theirs} - ${mine} (${theirCorrect} إجابات صحيحة)`,
        detail: end.tieBreak === 'time'
          ? 'حُسم التعادل بأقل زمن إجمالي للإجابات الصحيحة ⚡'
          : 'عندما تجيبان بشكل صحيح، النقطة تذهب للأسرع.',
      })
    }, 1100)
  }, [mySlot, theirSlot, onFinish, opponent])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'trivia') return
      if (event.msg.type === 'trivia_question') {
        const incoming = event.msg as unknown as TriviaQuestionMessage
        setRound((current) => {
          if (!current || current.index !== incoming.index) {
            setResult(null)
            setPicked(incoming.myAnswer)
          } else if (incoming.myAnswer !== null) {
            setPicked(incoming.myAnswer)
          }
          return incoming
        })
        setNow(Date.now())
      } else if (event.msg.type === 'trivia_result') {
        const incoming = event.msg as unknown as TriviaResultMessage
        setResult(incoming)
        setPicked(incoming.answers[mySlot]?.option ?? null)
        setRound((current) => current ?? {
          index: incoming.index,
          total: incoming.total,
          questionId: incoming.questionId,
          startAt: Date.now(),
          durationMs: 15_000,
          answeredSlots: [1, 2],
          myAnswer: incoming.answers[mySlot]?.option ?? null,
          scores: incoming.scores,
        })
        if (incoming.answers[mySlot]?.correct) sounds.correct()
        else sounds.wrong()
      } else if (event.msg.type === 'trivia_end') {
        finish(event.msg as unknown as TriviaEndMessage)
      }
    })
    requestGameSync()
    return () => {
      unsubscribe()
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
    }
  }, [finish, mySlot, requestGameSync, subscribe])

  useEffect(() => {
    if (!round || result || ending) return
    const timer = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(timer)
  }, [round, result, ending])

  const question = round ? TRIVIA_QUESTIONS[round.questionId] : undefined
  const remainingMs = round ? Math.max(0, Math.min(round.durationMs, round.startAt + round.durationMs - now)) : 0
  const started = round ? now >= round.startAt : false
  const submitted = round?.answeredSlots.includes(mySlot) ?? false
  const mine = (result?.scores ?? round?.scores)?.[mySlot] ?? 0
  const theirs = (result?.scores ?? round?.scores)?.[theirSlot] ?? 0
  const progress = round ? Math.max(0, Math.min(100, (remainingMs / round.durationMs) * 100)) : 0

  const resultLine = useMemo(() => {
    if (!result) return null
    const myAnswer = result.answers[mySlot]
    const theirAnswer = result.answers[theirSlot]
    if (myAnswer?.correct && theirAnswer?.correct) {
      if (result.winnerSlot === mySlot) return `⚡ أنت الأسرع بفارق ${seconds((theirAnswer.elapsedMs ?? 0) - (myAnswer.elapsedMs ?? 0))}`
      if (result.winnerSlot === theirSlot) return `⚡ ${opponent?.name ?? 'الخصم'} أسرع بفارق ${seconds((myAnswer.elapsedMs ?? 0) - (theirAnswer.elapsedMs ?? 0))}`
      return 'نفس الإجابة ونفس التوقيت! نقطة لكل لاعب 🤝'
    }
    if (result.winnerSlot === mySlot) return 'الإجابة الصح والنقطة ليك! 🎯'
    if (result.winnerSlot === theirSlot) return `النقطة لـ${opponent?.name ?? 'الخصم'}`
    return 'مفيش نقطة الجولة دي 😅'
  }, [mySlot, opponent, result, theirSlot])

  const choose = (option: number) => {
    if (!round || result || submitted || !started || remainingMs <= 0 || ending) return
    sounds.click()
    setPicked(option)
    setRound((current) => current ? { ...current, answeredSlots: [...new Set([...current.answeredSlots, mySlot])], myAnswer: option } : current)
    sendTriviaAnswer(round.index, option)
  }

  if (!round || !question) {
    return (
      <div className="min-h-[440px] flex items-center justify-center">
        <motion.p animate={{ opacity: [0.35, 1, 0.35] }} transition={{ repeat: Infinity, duration: 1.2 }} className="font-bold text-muted-foreground">
          بنختار الأسئلة… 📚
        </motion.p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <div className="grid grid-cols-2 gap-2 w-full text-center">
        <div className="glass rounded-2xl py-2 flex items-center justify-center gap-2">
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div><p className="text-[11px] font-bold">أنت</p><p className="text-xl font-black text-emerald-300">{mine}</p></div>
        </div>
        <div className="glass rounded-2xl py-2 flex items-center justify-center gap-2">
          <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
          <div><p className="text-[11px] font-bold max-w-24 truncate">{opponent?.name ?? 'الخصم'}</p><p className="text-xl font-black text-amber-300">{theirs}</p></div>
        </div>
      </div>

      <div className="w-full flex items-center gap-3">
        <span className="text-xs font-black whitespace-nowrap">سؤال {round.index + 1} / {round.total}</span>
        <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden" dir="ltr">
          <motion.div className={cn('h-full rounded-full', remainingMs < 5000 ? 'bg-red-400' : 'bg-gradient-to-r from-emerald-400 to-amber-300')} animate={{ width: `${result ? 0 : progress}%` }} transition={{ duration: 0.1 }} />
        </div>
        <span className={cn('glass rounded-xl px-2 py-1 flex items-center gap-1 text-xs font-black tabular-nums', remainingMs < 5000 && !result && 'text-red-300')}>
          <Clock3 className="w-3.5 h-3.5" />{Math.ceil(remainingMs / 1000)}
        </span>
      </div>

      <motion.div key={round.index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-3xl p-4 w-full min-h-[112px] flex items-center justify-center text-center">
        <h2 className="text-lg font-black leading-relaxed">{question.q}</h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-2.5 w-full">
        {question.options.map((option, index) => {
          const isMine = picked === index
          const isCorrect = result?.correctOption === index
          const isWrongPick = !!result && isMine && !isCorrect
          return (
            <motion.button
              key={option}
              whileTap={!submitted && !result ? { scale: 0.98 } : undefined}
              onClick={() => choose(index)}
              disabled={submitted || !!result || !started || remainingMs <= 0 || ending}
              className={cn(
                'min-h-14 rounded-2xl border px-4 py-3 text-right font-bold transition-all flex items-center gap-3',
                !result && !isMine && 'glass hover:bg-white/10',
                !result && isMine && 'bg-emerald-500/15 border-emerald-400/60 glow-emerald',
                isCorrect && 'bg-emerald-500/20 border-emerald-400/70',
                isWrongPick && 'bg-red-500/20 border-red-400/70',
              )}
            >
              <span className={cn('w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-sm font-black bg-white/10', isCorrect && 'bg-emerald-500/30', isWrongPick && 'bg-red-500/30')}>
                {['أ', 'ب', 'ج', 'د'][index]}
              </span>
              <span>{option}</span>
            </motion.button>
          )
        })}
      </div>

      <div className="min-h-16 w-full flex items-center justify-center">
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full glass rounded-2xl px-3 py-2.5 text-center">
              <p className="font-extrabold text-sm">{resultLine}</p>
              <div className="flex justify-center gap-4 mt-1.5 text-[11px] text-muted-foreground">
                <span>أنت: <bdi>{seconds(result.answers[mySlot]?.elapsedMs ?? null)}</bdi></span>
                <span>{opponent?.name ?? 'الخصم'}: <bdi>{seconds(result.answers[theirSlot]?.elapsedMs ?? null)}</bdi></span>
              </div>
            </motion.div>
          ) : !started ? (
            <motion.p key="lead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-bold text-amber-300">استعد…</motion.p>
          ) : submitted ? (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
              <Zap className="w-4 h-4 text-amber-400" /> اتسجلت إجابتك — مستنيين الخصم…
            </motion.div>
          ) : (
            <motion.p key="answer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-bold text-emerald-300">اختار بسرعة — التوقيت يحسم لو الاتنين صح ⚡</motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
