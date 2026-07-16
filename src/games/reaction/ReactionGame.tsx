import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Zap } from 'lucide-react'
import type { GameProps } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const ROUNDS = 5
type Phase = 'idle' | 'waiting' | 'go' | 'result' | 'foul'

export default function ReactionGame({ onFinish }: GameProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [times, setTimes] = useState<number[]>([])
  const [lastTime, setLastTime] = useState<number | null>(null)
  const startRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedRef = useRef(false)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const startRound = () => {
    sounds.click()
    setPhase('waiting')
    const delay = 2000 + Math.random() * 3000
    timerRef.current = setTimeout(() => {
      startRef.current = performance.now()
      setPhase('go')
      sounds.pop()
    }, delay)
  }

  const handleTap = () => {
    if (phase === 'idle' || phase === 'result') {
      startRound()
      return
    }
    if (phase === 'waiting') {
      // ضغط مبكر = إنذار
      if (timerRef.current) clearTimeout(timerRef.current)
      sounds.wrong()
      setPhase('foul')
      return
    }
    if (phase === 'go') {
      const ms = Math.round(performance.now() - startRef.current)
      sounds.correct()
      setLastTime(ms)
      const newTimes = [...times, ms]
      setTimes(newTimes)
      setPhase('result')

      if (newTimes.length >= ROUNDS && !finishedRef.current) {
        finishedRef.current = true
        const avg = Math.round(newTimes.reduce((a, b) => a + b, 0) / newTimes.length)
        const best = Math.min(...newTimes)
        const great = avg < 300
        if (great) sounds.win()
        setTimeout(() => {
          onFinish({
            gameId: 'reaction',
            outcome: great ? 'win' : 'draw',
            score: avg,
            bestCandidate: best,
            lowerIsBetter: true,
            coinsEarned: great ? 30 : 10,
            xpEarned: great ? 40 : 15,
            summary: `متوسط سرعتك ${avg} م.ث — أفضل محاولة ${best} م.ث ⚡`,
            detail: great ? 'ردة فعلك خارقة! أسرع من البرق' : 'تدرّب أكثر لتكسر حاجز ٣٠٠ م.ث',
          })
        }, 1600)
      }
    }
  }

  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* مؤشر الجولات */}
      <div className="flex items-center gap-2">
        {Array.from({ length: ROUNDS }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'w-2.5 h-2.5 rounded-full transition-colors',
              i < times.length ? 'bg-emerald-400' : i === times.length && phase !== 'idle' ? 'bg-amber-400 animate-pulse' : 'bg-white/15',
            )}
          />
        ))}
      </div>

      {/* منطقة اللعب */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={phase === 'foul' ? () => setPhase('idle') : handleTap}
        className={cn(
          'w-full rounded-3xl min-h-[300px] flex flex-col items-center justify-center gap-3 border transition-colors duration-150 select-none',
          phase === 'idle' && 'glass hover:bg-white/10',
          phase === 'waiting' && 'bg-red-500/20 border-red-400/50',
          phase === 'go' && 'bg-emerald-500/30 border-emerald-300/70 glow-emerald',
          phase === 'result' && 'glass',
          phase === 'foul' && 'bg-amber-500/15 border-amber-400/50',
        )}
      >
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
              <Zap className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-xl font-extrabold">{times.length === 0 ? 'اضغط للبدء' : 'اضغط للجولة التالية'}</p>
              <p className="text-sm text-muted-foreground mt-1">الجولة {times.length + 1} من {ROUNDS}</p>
            </motion.div>
          )}
          {phase === 'waiting' && (
            <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <p className="text-2xl font-black text-red-300">انتظر…</p>
              <p className="text-sm text-red-200/70 mt-2">لا تضغط قبل ظهور اللون الأخضر!</p>
            </motion.div>
          )}
          {phase === 'go' && (
            <motion.div key="go" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
              <p className="text-3xl font-black text-emerald-200">اضغط الآن! ⚡</p>
            </motion.div>
          )}
          {phase === 'result' && lastTime !== null && (
            <motion.div key="result" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
              <p className="text-5xl font-black text-gradient tabular-nums">{lastTime}</p>
              <p className="text-sm text-muted-foreground mt-1">مللي ثانية</p>
              <p className="text-sm font-bold mt-3 text-emerald-300">
                {lastTime < 250 ? '🔥 سرعة خارقة!' : lastTime < 350 ? '💪 ممتاز!' : lastTime < 500 ? '👍 جيد' : '🐢 حاول أسرع'}
              </p>
            </motion.div>
          )}
          {phase === 'foul' && (
            <motion.div key="foul" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-6">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="text-xl font-extrabold text-amber-300">إنذار! ضغطت مبكرًا 🟨</p>
              <p className="text-sm text-muted-foreground mt-2">اضغط لإعادة الجولة</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* إحصائيات الجولة */}
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className="glass rounded-2xl py-2.5">
          <div className="text-[11px] text-muted-foreground">المتوسط</div>
          <div className="text-lg font-extrabold text-emerald-300 tabular-nums">{avg !== null ? `${avg} م.ث` : '—'}</div>
        </div>
        <div className="glass rounded-2xl py-2.5">
          <div className="text-[11px] text-muted-foreground">أفضل محاولة</div>
          <div className="text-lg font-extrabold text-amber-300 tabular-nums">{times.length ? `${Math.min(...times)} م.ث` : '—'}</div>
        </div>
      </div>
    </div>
  )
}
