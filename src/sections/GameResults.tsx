import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Coins, RotateCcw, LayoutGrid, Star } from 'lucide-react'
import confetti from 'canvas-confetti'
import type { GameResult } from '@/types'
import { getGame } from '@/games'
import { sounds } from '@/lib/sounds'

interface Props {
  result: GameResult
  onReplay: () => void
  onExit: () => void
  replayLabel?: string
  exitLabel?: string
  hideReplay?: boolean
}

export default function GameResults({ result, onReplay, onExit, replayLabel = 'العب مجددًا', exitLabel = 'عودة للألعاب', hideReplay = false }: Props) {
  const game = getGame(result.gameId)
  const firedRef = useRef(false)

  useEffect(() => {
    if (result.outcome === 'win' && !firedRef.current) {
      firedRef.current = true
      sounds.win()
      const colors = ['#10b981', '#f59e0b', '#ffffff', '#14b8a6']
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, colors })
      setTimeout(() => confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.5 }, colors }), 250)
      setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.5 }, colors }), 400)
    }
  }, [result.outcome])

  const title = result.outcome === 'win' ? 'فزت! 🏆' : result.outcome === 'draw' ? 'تعادل! 🤝' : 'خسرت! 😅'
  const emoji = result.outcome === 'win' ? '🏆' : result.outcome === 'draw' ? '🤝' : '💔'

  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 18 }}
        className="w-full max-w-[420px] glass rounded-[2rem] p-6 flex flex-col items-center text-center"
      >
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 14 }}
          className="text-7xl mb-3"
        >
          {emoji}
        </motion.div>

        <h1 className={`text-3xl font-black mb-1 ${result.outcome === 'win' ? 'text-gradient' : ''}`}>{title}</h1>
        <p className="text-sm text-muted-foreground mb-1">
          {game?.emoji} {game?.name}
        </p>
        <p className="font-bold text-slate-200 mt-2 leading-relaxed">{result.summary}</p>
        {result.detail && <p className="text-xs text-muted-foreground mt-1">{result.detail}</p>}

        {/* المكاسب */}
        <div className="grid grid-cols-2 gap-3 w-full my-6">
          <div className="rounded-2xl bg-amber-400/10 border border-amber-400/40 py-3.5 glow-amber">
            <Coins className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <div className="text-xl font-black text-amber-300 tabular-nums">+{result.coinsEarned}</div>
            <div className="text-[11px] text-muted-foreground">عملة</div>
          </div>
          <div className="rounded-2xl bg-emerald-400/10 border border-emerald-400/40 py-3.5 glow-emerald">
            <Star className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <div className="text-xl font-black text-emerald-300 tabular-nums">+{result.xpEarned}</div>
            <div className="text-[11px] text-muted-foreground">نقطة خبرة</div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 w-full">
          {!hideReplay && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onReplay}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-extrabold flex items-center justify-center gap-2 glow-emerald hover:from-emerald-400 hover:to-teal-400 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              {replayLabel}
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onExit}
            className="w-full py-3.5 rounded-2xl bg-white/10 border border-white/15 font-extrabold flex items-center justify-center gap-2 hover:bg-white/15 transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            {exitLabel}
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}
