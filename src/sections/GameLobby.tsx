import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, ChevronRight, Play, Users, Info } from 'lucide-react'
import type { GameDef } from '@/games'
import type { Difficulty, GameConfig } from '@/types'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: 'سهل', hint: 'للمبتدئين' },
  { id: 'medium', label: 'متوسط', hint: 'تحدٍّ متوازن' },
  { id: 'hard', label: 'صعب', hint: 'للمحترفين' },
]

interface Props {
  game: GameDef
  onStart: (config: GameConfig) => void
  onBack: () => void
}

export default function GameLobby({ game, onStart, onBack }: Props) {
  const { stats } = useApp()
  const [mode, setMode] = useState<'bot' | 'twoPlayer'>(game.supportsBot ? 'bot' : 'twoPlayer')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const s = stats[game.id]

  return (
    <div className="px-4 pt-4 pb-28">
      {/* رجوع */}
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-4">
        <ChevronRight className="w-4 h-4" />
        عودة للألعاب
      </button>

      {/* الغلاف */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-3xl overflow-hidden relative glass mb-5"
      >
        <div className="absolute inset-0 bg-gradient-to-tl from-emerald-600/30 via-transparent to-amber-500/10" />
        <div className="relative p-6 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 15 }}
            className="text-7xl mb-3 drop-shadow-xl"
          >
            {game.emoji}
          </motion.div>
          <h1 className="text-2xl font-black">{game.name}</h1>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{game.description}</p>
          {s && (
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>لعبت {s.played} مرة</span>
              <span>فزت {s.won} مرة</span>
              {s.bestScore !== undefined && <span>أفضل نتيجة: {s.bestScore}</span>}
            </div>
          )}
        </div>
      </motion.div>

      {/* كيف تلعب */}
      <div className="glass rounded-3xl p-4 mb-4">
        <h2 className="font-extrabold flex items-center gap-2 mb-2.5">
          <Info className="w-4 h-4 text-emerald-400" />
          كيف تلعب؟
        </h2>
        <ul className="flex flex-col gap-2">
          {game.howToPlay.map((line, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300 leading-relaxed">
              <span className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              {line}
            </li>
          ))}
        </ul>
      </div>

      {/* نمط اللعب */}
      {(game.supportsBot || game.supportsTwoPlayer) && (
        <div className="glass rounded-3xl p-4 mb-4">
          <h2 className="font-extrabold mb-3">نمط اللعب</h2>
          <div className="flex flex-col gap-2">
            {game.supportsBot && (
              <button
                onClick={() => {
                  sounds.click()
                  setMode('bot')
                }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl p-3.5 border transition-all text-start',
                  mode === 'bot' ? 'bg-emerald-500/15 border-emerald-400/60 glow-emerald' : 'bg-white/5 border-white/10 hover:bg-white/10',
                )}
              >
                <Bot className={cn('w-6 h-6', mode === 'bot' ? 'text-emerald-400' : 'text-muted-foreground')} />
                <div className="flex-1">
                  <p className="font-extrabold text-sm">ضد الكمبيوتر</p>
                  <p className="text-[11px] text-muted-foreground">تحدَّ الذكاء الاصطناعي</p>
                </div>
                {mode === 'bot' && <span className="text-emerald-400 text-lg">✓</span>}
              </button>
            )}
            {game.supportsTwoPlayer && (
              <button
                onClick={() => {
                  sounds.click()
                  setMode('twoPlayer')
                }}
                className={cn(
                  'flex items-center gap-3 rounded-2xl p-3.5 border transition-all text-start',
                  mode === 'twoPlayer' ? 'bg-emerald-500/15 border-emerald-400/60 glow-emerald' : 'bg-white/5 border-white/10 hover:bg-white/10',
                )}
              >
                <Users className={cn('w-6 h-6', mode === 'twoPlayer' ? 'text-emerald-400' : 'text-muted-foreground')} />
                <div className="flex-1">
                  <p className="font-extrabold text-sm">لاعبان على نفس الجهاز</p>
                  <p className="text-[11px] text-muted-foreground">العب مع صديق بجانبك</p>
                </div>
                {mode === 'twoPlayer' && <span className="text-emerald-400 text-lg">✓</span>}
              </button>
            )}
          </div>
        </div>
      )}

      {/* الصعوبة */}
      {game.difficulties && mode === 'bot' && (
        <div className="glass rounded-3xl p-4 mb-6">
          <h2 className="font-extrabold mb-3">مستوى الصعوبة</h2>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                onClick={() => {
                  sounds.click()
                  setDifficulty(d.id)
                }}
                className={cn(
                  'rounded-2xl py-3 border transition-all text-center',
                  difficulty === d.id ? 'bg-emerald-500/15 border-emerald-400/60 glow-emerald' : 'bg-white/5 border-white/10 hover:bg-white/10',
                )}
              >
                <p className={cn('font-extrabold text-sm', difficulty === d.id && 'text-emerald-300')}>{d.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{d.hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* زر البدء */}
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={() => {
          sounds.pop()
          onStart({ mode, difficulty })
        }}
        className="w-full py-4 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-black text-lg flex items-center justify-center gap-2 glow-emerald hover:from-emerald-400 hover:to-teal-400 transition-all"
      >
        <Play className="w-5 h-5 fill-current" />
        ابدأ اللعب
      </motion.button>
    </div>
  )
}
