import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AvatarCircle } from '@/sections/components'

type Hand = 'rock' | 'paper' | 'scissors'
const HANDS: { id: Hand; emoji: string; label: string }[] = [
  { id: 'rock', emoji: '🪨', label: 'حجر' },
  { id: 'paper', emoji: '📄', label: 'ورقة' },
  { id: 'scissors', emoji: '✂️', label: 'مقص' },
]
const BEATS: Record<Hand, Hand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
const COUNTDOWN = ['حجر…', 'ورقة…', 'مقص…', 'اضرب! 💥']
const WIN_TARGET = 3

export default function OnlineRps({ onFinish }: GameProps) {
  const { slot, opponent, sendRpsChoice, subscribe } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const theirSlot = mySlot === 1 ? 2 : 1

  const [phase, setPhase] = useState<'pick' | 'waiting' | 'countdown' | 'reveal'>('pick')
  const [countIdx, setCountIdx] = useState(0)
  const [myHand, setMyHand] = useState<Hand | null>(null)
  const [theirHand, setTheirHand] = useState<Hand | null>(null)
  const [roundMsg, setRoundMsg] = useState('اختر سلاحك! ⚔️')
  const [scores, setScores] = useState({ me: 0, them: 0 })
  const finishedRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach(clearTimeout)
  }, [])

  // استقبال الكشف من الخادم
  useEffect(() => {
    return subscribe((ev) => {
      if (ev.kind !== 'rps_reveal') return
      const mine = ev.choices[mySlot] as Hand
      const theirs = ev.choices[theirSlot] as Hand
      setPhase('countdown')
      setCountIdx(0)
      COUNTDOWN.forEach((_, i) => {
        timersRef.current.push(
          setTimeout(() => {
            setCountIdx(i + 1)
            sounds.tick()
          }, (i + 1) * 500),
        )
      })
      timersRef.current.push(
        setTimeout(() => {
          setTheirHand(theirs)
          setPhase('reveal')

          let next = { ...scores }
          if (BEATS[mine] === theirs) {
            sounds.correct()
            next = { ...next, me: next.me + 1 }
            setRoundMsg('النقطة لك! 🎯')
          } else if (BEATS[theirs] === mine) {
            sounds.wrong()
            next = { ...next, them: next.them + 1 }
            setRoundMsg(`النقطة لـ${opponent?.name ?? 'الخصم'} 😅`)
          } else {
            sounds.pop()
            setRoundMsg('تعادل! 🤝')
          }
          setScores(next)

          if (next.me >= WIN_TARGET || next.them >= WIN_TARGET) {
            if (finishedRef.current) return
            finishedRef.current = true
            const won = next.me > next.them
            if (won) sounds.win()
            else sounds.lose()
            timersRef.current.push(
              setTimeout(() => {
                onFinish({
                  gameId: 'rps-online',
                  outcome: won ? 'win' : 'loss',
                  coinsEarned: won ? 30 : 5,
                  xpEarned: won ? 40 : 8,
                  summary: won
                    ? `فزت على ${opponent?.name ?? 'الخصم'} ${next.me} - ${next.them} 🏆`
                    : `خسرت أمام ${opponent?.name ?? 'الخصم'} ${next.me} - ${next.them}`,
                })
              }, 1800),
            )
          } else {
            timersRef.current.push(
              setTimeout(() => {
                setPhase('pick')
                setMyHand(null)
                setTheirHand(null)
                setRoundMsg('الجولة التالية… اختر! ⚔️')
              }, 1700),
            )
          }
        }, (COUNTDOWN.length + 1) * 500),
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, mySlot, theirSlot, scores, opponent, onFinish])

  const pick = (hand: Hand) => {
    if (phase !== 'pick') return
    sounds.click()
    setMyHand(hand)
    setPhase('waiting')
    sendRpsChoice(hand)
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* اللاعبان والنقاط */}
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className="glass rounded-2xl py-2 flex flex-col items-center gap-1">
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">أنت</div>
          <div className="flex items-center gap-1">
            {Array.from({ length: WIN_TARGET }).map((_, i) => (
              <span key={i} className={cn('w-2.5 h-2.5 rounded-full', i < scores.me ? 'bg-emerald-400 glow-emerald' : 'bg-white/15')} />
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl py-2 flex flex-col items-center gap-1">
          <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">{opponent?.name ?? 'الخصم'}</div>
          <div className="flex items-center gap-1">
            {Array.from({ length: WIN_TARGET }).map((_, i) => (
              <span key={i} className={cn('w-2.5 h-2.5 rounded-full', i < scores.them ? 'bg-amber-400 glow-amber' : 'bg-white/15')} />
            ))}
          </div>
        </div>
      </div>

      {/* ساحة المواجهة */}
      <div className="w-full glass rounded-3xl min-h-[190px] flex items-center justify-center relative overflow-hidden">
        <AnimatePresence mode="wait">
          {phase === 'pick' && (
            <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-4">
              <div className="text-5xl mb-3">⚔️</div>
              <p className="font-extrabold text-lg">{roundMsg}</p>
            </motion.div>
          )}
          {phase === 'waiting' && (
            <motion.div key="wait" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center px-4">
              <div className="text-5xl mb-3">{HANDS.find((h) => h.id === myHand)?.emoji}</div>
              <p className="font-extrabold">اخترت! بانتظار {opponent?.name ?? 'الخصم'}…</p>
              <motion.div
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                className="text-xs text-muted-foreground mt-2"
              >
                ⏳ الخيار سرّي حتى يختار الخصم
              </motion.div>
            </motion.div>
          )}
          {phase === 'countdown' && (
            <motion.div key={`c${countIdx}`} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
              <div className="text-5xl mb-2">✊</div>
              <p className="font-black text-2xl text-gradient">{COUNTDOWN[countIdx]}</p>
            </motion.div>
          )}
          {phase === 'reveal' && myHand && theirHand && (
            <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full px-6">
              <div className="flex items-center justify-around">
                <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="text-center">
                  <div className="text-6xl">{HANDS.find((h) => h.id === myHand)!.emoji}</div>
                  <div className="text-xs font-bold text-emerald-300 mt-2">أنت</div>
                </motion.div>
                <div className="text-2xl font-black text-muted-foreground">VS</div>
                <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="text-center">
                  <div className="text-6xl">{HANDS.find((h) => h.id === theirHand)!.emoji}</div>
                  <div className="text-xs font-bold text-amber-300 mt-2">{opponent?.name ?? 'الخصم'}</div>
                </motion.div>
              </div>
              <p className="text-center font-extrabold mt-4">{roundMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* أزرار الاختيار */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {HANDS.map((h) => (
          <motion.button
            key={h.id}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.04 }}
            onClick={() => pick(h.id)}
            disabled={phase !== 'pick'}
            className={cn(
              'glass rounded-3xl py-4 flex flex-col items-center gap-1.5 transition-all',
              phase === 'pick' ? 'hover:bg-white/10 hover:border-emerald-400/40' : 'opacity-50',
            )}
          >
            <span className="text-4xl">{h.emoji}</span>
            <span className="text-xs font-bold">{h.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
