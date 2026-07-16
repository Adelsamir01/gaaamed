import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GameProps } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Hand = 'rock' | 'paper' | 'scissors'
const HANDS: { id: Hand; emoji: string; label: string }[] = [
  { id: 'rock', emoji: '🪨', label: 'حجر' },
  { id: 'paper', emoji: '📄', label: 'ورقة' },
  { id: 'scissors', emoji: '✂️', label: 'مقص' },
]
const BEATS: Record<Hand, Hand> = { rock: 'scissors', paper: 'rock', scissors: 'paper' }
const COUNTER: Record<Hand, Hand> = { rock: 'paper', paper: 'scissors', scissors: 'rock' }

const WIN_TAUNTS = ['نقطة لك! 🎯', 'أحسنت! 👏', 'ضربة معلّم! 🔥', 'يا له من حظ! 😮']
const LOSE_TAUNTS = ['النقطة للكمبيوتر 🤖', 'أووووه! خسرت الجولة 😅', 'ركّز أكثر! 🧠', 'الكمبيوتر يتفوق عليك! 😈']
const DRAW_TAUNTS = ['تعادل! 🤝', 'نفس الاختيار! 😄', 'عقول متشابهة! ✨']
const COUNTDOWN = ['حجر…', 'ورقة…', 'مقص…', 'اضرب! 💥']
const WIN_TARGET = 3

export default function RpsGame({ config, onFinish }: GameProps) {
  const [phase, setPhase] = useState<'pick' | 'countdown' | 'reveal'>('pick')
  const [countIdx, setCountIdx] = useState(0)
  const [myHand, setMyHand] = useState<Hand | null>(null)
  const [botHand, setBotHand] = useState<Hand | null>(null)
  const [taunt, setTaunt] = useState('اختر سلاحك! ⚔️')
  const [scores, setScores] = useState({ me: 0, bot: 0 })
  const [history, setHistory] = useState<Hand[]>([])
  const finishedRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach(clearTimeout)
  }, [])

  const pickBotHand = (myHistory: Hand[]): Hand => {
    const r = Math.random()
    if (config.difficulty === 'easy') return HANDS[Math.floor(r * 3)].id
    if (config.difficulty === 'medium') {
      if (myHistory.length > 0 && r < 0.45) return COUNTER[myHistory[myHistory.length - 1]]
      return HANDS[Math.floor(Math.random() * 3)].id
    }
    // صعب: يواجه أكثر اختيار تكرره
    if (myHistory.length >= 2 && r < 0.6) {
      const freq: Record<Hand, number> = { rock: 0, paper: 0, scissors: 0 }
      myHistory.forEach((h) => freq[h]++)
      const most = (Object.entries(freq) as [Hand, number][]).sort((a, b) => b[1] - a[1])[0][0]
      return COUNTER[most]
    }
    return HANDS[Math.floor(Math.random() * 3)].id
  }

  const play = (hand: Hand) => {
    if (phase !== 'pick') return
    sounds.click()
    setMyHand(hand)
    setBotHand(null)
    setPhase('countdown')
    setCountIdx(0)

    COUNTDOWN.forEach((_, i) => {
      timersRef.current.push(
        setTimeout(() => {
          setCountIdx(i + 1)
          sounds.tick()
        }, (i + 1) * 550),
      )
    })

    timersRef.current.push(
      setTimeout(() => {
        const bot = pickBotHand([...history, hand])
        setBotHand(bot)
        setPhase('reveal')
        setHistory((h) => [...h, hand])

        let newScores = { ...scores }
        if (BEATS[hand] === bot) {
          sounds.correct()
          newScores = { ...newScores, me: newScores.me + 1 }
          setTaunt(WIN_TAUNTS[Math.floor(Math.random() * WIN_TAUNTS.length)])
        } else if (BEATS[bot] === hand) {
          sounds.wrong()
          newScores = { ...newScores, bot: newScores.bot + 1 }
          setTaunt(LOSE_TAUNTS[Math.floor(Math.random() * LOSE_TAUNTS.length)])
        } else {
          sounds.pop()
          setTaunt(DRAW_TAUNTS[Math.floor(Math.random() * DRAW_TAUNTS.length)])
        }
        setScores(newScores)

        if (newScores.me >= WIN_TARGET || newScores.bot >= WIN_TARGET) {
          if (finishedRef.current) return
          finishedRef.current = true
          const win = newScores.me > newScores.bot
          if (win) sounds.win()
          else sounds.lose()
          timersRef.current.push(
            setTimeout(() => {
              onFinish({
                gameId: 'rps',
                outcome: win ? 'win' : 'loss',
                coinsEarned: win ? 30 : 5,
                xpEarned: win ? 40 : 8,
                summary: win ? `فزت بالمباراة ${newScores.me} - ${newScores.bot} 🏆` : `خسرت المباراة ${newScores.me} - ${newScores.bot}`,
                detail: 'حجر يكسر المقص، والمقص يقص الورقة، والورقة تغلف الحجر',
              })
            }, 1800),
          )
        } else {
          timersRef.current.push(
            setTimeout(() => {
              setPhase('pick')
              setMyHand(null)
              setBotHand(null)
              setTaunt('الجولة التالية… اختر! ⚔️')
            }, 1700),
          )
        }
      }, (COUNTDOWN.length + 1) * 550),
    )
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* نقاط المباراة */}
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className="glass rounded-2xl py-2.5">
          <div className="text-[11px] text-muted-foreground">أنت</div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            {Array.from({ length: WIN_TARGET }).map((_, i) => (
              <span key={i} className={cn('w-3 h-3 rounded-full', i < scores.me ? 'bg-emerald-400 glow-emerald' : 'bg-white/15')} />
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl py-2.5">
          <div className="text-[11px] text-muted-foreground">الكمبيوتر</div>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            {Array.from({ length: WIN_TARGET }).map((_, i) => (
              <span key={i} className={cn('w-3 h-3 rounded-full', i < scores.bot ? 'bg-amber-400 glow-amber' : 'bg-white/15')} />
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
              <p className="font-extrabold text-lg">{taunt}</p>
            </motion.div>
          )}
          {phase === 'countdown' && (
            <motion.div key={`c${countIdx}`} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
              <div className="text-5xl mb-2">✊</div>
              <p className="font-black text-2xl text-gradient">{COUNTDOWN[countIdx]}</p>
            </motion.div>
          )}
          {phase === 'reveal' && myHand && botHand && (
            <motion.div key="reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full px-6">
              <div className="flex items-center justify-around">
                <motion.div initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="text-center">
                  <div className="text-6xl">{HANDS.find((h) => h.id === myHand)!.emoji}</div>
                  <div className="text-xs font-bold text-emerald-300 mt-2">أنت</div>
                </motion.div>
                <div className="text-2xl font-black text-muted-foreground">VS</div>
                <motion.div initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="text-center">
                  <div className="text-6xl">{HANDS.find((h) => h.id === botHand)!.emoji}</div>
                  <div className="text-xs font-bold text-amber-300 mt-2">الكمبيوتر</div>
                </motion.div>
              </div>
              <p className="text-center font-extrabold mt-4">{taunt}</p>
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
            onClick={() => play(h.id)}
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
