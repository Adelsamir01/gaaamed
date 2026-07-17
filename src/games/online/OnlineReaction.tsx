import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Zap } from 'lucide-react'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AvatarCircle } from '@/sections/components'

type Phase = 'idle' | 'waiting' | 'go' | 'tapped' | 'foul' | 'result'

interface RoundResult {
  winnerSlot: number
  times: Record<number, number | null>
  fouls: Record<number, boolean>
}

export default function OnlineReaction({ onFinish }: GameProps) {
  const { slot, opponent, sendAction, sendReactTap, subscribe, roomSettings } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const theirSlot = mySlot === 1 ? 2 : 1
  const isHost = mySlot === 1
  const winTarget = Math.floor((roomSettings?.rounds ?? 5) / 2) + 1

  const [phase, setPhase] = useState<Phase>('idle')
  const [scores, setScores] = useState({ me: 0, them: 0 })
  const [lastResult, setLastResult] = useState<RoundResult | null>(null)
  const goAtRef = useRef(0)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const finishedRef = useRef(false)
  const tappedRef = useRef(false)

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  useEffect(() => {
    return () => clearTimers()
  }, [])

  // المضيف يبدأ الجولة الأولى
  useEffect(() => {
    if (!isHost) return
    const t = setTimeout(() => startRound(), 1200)
    timersRef.current.push(t)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost])

  const scheduleGo = (delay: number) => {
    setPhase('waiting')
    tappedRef.current = false
    const t = setTimeout(() => {
      goAtRef.current = performance.now()
      setPhase('go')
      sounds.pop()
    }, delay)
    timersRef.current.push(t)
  }

  const startRound = () => {
    const delay = 2000 + Math.random() * 3000
    sendAction({ kind: 'react_start', delay })
    scheduleGo(delay)
  }

  // استقبال الأحداث
  useEffect(() => {
    return subscribe((ev) => {
      // الخادم أنهى السلسلة — احتياط في حال فاتتنا نتيجة جولة
      if (ev.kind === 'react_series_end') {
        const meW = ev.wins[mySlot] ?? 0
        const themW = ev.wins[theirSlot] ?? 0
        timersRef.current.push(
          setTimeout(() => {
            if (finishedRef.current) return
            finishedRef.current = true
            clearTimers()
            const won = ev.winnerSlot === mySlot
            setScores({ me: meW, them: themW })
            if (won) sounds.win()
            else sounds.lose()
            onFinish({
              gameId: 'reaction',
              outcome: won ? 'win' : 'loss',
              coinsEarned: won ? 30 : 5,
              xpEarned: won ? 40 : 8,
              summary: won
                ? `أسرع من ${opponent?.name ?? 'الخصم'}! فزت ${meW} - ${themW} ⚡🏆`
                : `${opponent?.name ?? 'الخصم'} كان أسرع ${themW} - ${meW}`,
            })
          }, 4000),
        )
        return
      }
      if (ev.kind === 'action' && ev.action.kind === 'react_start') {
        scheduleGo(ev.action.delay as number)
        return
      }
      if (ev.kind !== 'react_result') return

      const result: RoundResult = { winnerSlot: ev.winnerSlot, times: ev.times, fouls: ev.fouls }
      setLastResult(result)
      setPhase('result')
      const iWon = ev.winnerSlot === mySlot
      const tied = ev.winnerSlot === 0
      const next = {
        me: scores.me + (iWon ? 1 : 0),
        them: scores.them + (ev.winnerSlot === theirSlot ? 1 : 0),
      }
      setScores(next)
      if (tied) sounds.pop()
      else if (iWon) sounds.correct()
      else sounds.wrong()

      if (next.me >= winTarget || next.them >= winTarget) {
        if (finishedRef.current) return
        finishedRef.current = true
        const won = next.me > next.them
        if (won) sounds.win()
        else sounds.lose()
        timersRef.current.push(
          setTimeout(() => {
            onFinish({
              gameId: 'reaction',
              outcome: won ? 'win' : 'loss',
              coinsEarned: won ? 30 : 5,
              xpEarned: won ? 40 : 8,
              summary: won
                ? `أسرع من ${opponent?.name ?? 'الخصم'}! فزت ${next.me} - ${next.them} ⚡🏆`
                : `${opponent?.name ?? 'الخصم'} كان أسرع ${next.them} - ${next.me}`,
            })
          }, 2000),
        )
      } else if (isHost) {
        timersRef.current.push(setTimeout(() => startRound(), 2600))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, mySlot, theirSlot, scores, opponent, onFinish, isHost, winTarget])

  const handleTap = () => {
    if (tappedRef.current) return
    if (phase === 'waiting') {
      tappedRef.current = true
      sounds.wrong()
      setPhase('foul')
      sendReactTap(null, true)
      return
    }
    if (phase === 'go') {
      tappedRef.current = true
      const ms = Math.round(performance.now() - goAtRef.current)
      sounds.correct()
      setPhase('tapped')
      sendReactTap(ms, false)
    }
  }

  const myTime = lastResult?.times[mySlot] ?? null
  const theirTime = lastResult?.times[theirSlot] ?? null
  const iWonRound = lastResult?.winnerSlot === mySlot
  const bothFoul = lastResult?.winnerSlot === 0

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* اللاعبان والنقاط */}
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className="glass rounded-2xl py-2 flex flex-col items-center gap-1">
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">أنت</div>
          <div className="flex items-center gap-1">
            {Array.from({ length: winTarget }).map((_, i) => (
              <span key={i} className={cn('w-2.5 h-2.5 rounded-full', i < scores.me ? 'bg-emerald-400 glow-emerald' : 'bg-white/15')} />
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl py-2 flex flex-col items-center gap-1">
          <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">{opponent?.name ?? 'الخصم'}</div>
          <div className="flex items-center gap-1">
            {Array.from({ length: winTarget }).map((_, i) => (
              <span key={i} className={cn('w-2.5 h-2.5 rounded-full', i < scores.them ? 'bg-amber-400 glow-amber' : 'bg-white/15')} />
            ))}
          </div>
        </div>
      </div>

      {/* منطقة اللعب */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleTap}
        className={cn(
          'w-full rounded-3xl min-h-[280px] flex flex-col items-center justify-center gap-3 border transition-colors duration-150 select-none',
          (phase === 'idle' || phase === 'result') && 'glass',
          phase === 'waiting' && 'bg-red-500/20 border-red-400/50',
          phase === 'go' && 'bg-emerald-500/30 border-emerald-300/70 glow-emerald',
          phase === 'tapped' && 'glass',
          phase === 'foul' && 'bg-amber-500/15 border-amber-400/50',
        )}
      >
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center px-6">
              <Zap className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <p className="text-xl font-extrabold">استعد للسباق…</p>
              <p className="text-sm text-muted-foreground mt-1">الأول إلى {winTarget} جولات يفوز</p>
            </motion.div>
          )}
          {phase === 'waiting' && (
            <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <p className="text-2xl font-black text-red-300">استعد…</p>
              <p className="text-sm text-red-200/70 mt-2">لا تضغط قبل "اضغط الآن!"</p>
            </motion.div>
          )}
          {phase === 'go' && (
            <motion.div key="go" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
              <p className="text-3xl font-black text-emerald-200">اضغط الآن! ⚡</p>
            </motion.div>
          )}
          {phase === 'tapped' && (
            <motion.div key="tapped" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <p className="text-xl font-extrabold">سُجّلت ضغطتك! ✋</p>
              <p className="text-sm text-muted-foreground mt-1">بانتظار الخصم…</p>
            </motion.div>
          )}
          {phase === 'foul' && (
            <motion.div key="foul" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center px-6">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="text-xl font-extrabold text-amber-300">إنذار! ضغطت مبكرًا 🟨</p>
              <p className="text-sm text-muted-foreground mt-2">بانتظار نتيجة الجولة…</p>
            </motion.div>
          )}
          {phase === 'result' && lastResult && (
            <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center px-6 w-full">
              <p className="text-xl font-black mb-3">
                {bothFoul ? 'كلاهما ضغط مبكرًا! 😅' : iWonRound ? 'الجولة لك! ⚡' : `الجولة لـ${opponent?.name ?? 'الخصم'} 😅`}
              </p>
              <div className="grid grid-cols-2 gap-2 max-w-[260px] mx-auto">
                <div className={cn('rounded-2xl py-2.5 border', iWonRound ? 'bg-emerald-500/15 border-emerald-400/50' : 'bg-white/5 border-white/10')}>
                  <div className="text-[10px] text-muted-foreground">أنت</div>
                  <div className="text-lg font-black tabular-nums text-emerald-300">{myTime !== null ? `${myTime}` : '🟨'}</div>
                  <div className="text-[9px] text-muted-foreground">م.ث</div>
                </div>
                <div className={cn('rounded-2xl py-2.5 border', !iWonRound && !bothFoul ? 'bg-amber-500/15 border-amber-400/50' : 'bg-white/5 border-white/10')}>
                  <div className="text-[10px] text-muted-foreground">{opponent?.name ?? 'الخصم'}</div>
                  <div className="text-lg font-black tabular-nums text-amber-300">{theirTime !== null ? `${theirTime}` : '🟨'}</div>
                  <div className="text-[9px] text-muted-foreground">م.ث</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
