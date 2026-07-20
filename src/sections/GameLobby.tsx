import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, ChevronDown, ChevronRight, Globe, Play, UserRound, Users, Info } from 'lucide-react'
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

type Mode = 'solo' | 'bot' | 'twoPlayer' | 'online'

interface Props {
  game: GameDef
  onStart: (config: GameConfig) => void
  onOnline: () => void
  onBack: () => void
}

export default function GameLobby({ game, onStart, onOnline, onBack }: Props) {
  const { stats } = useApp()
  const onlineOnly = !!game.online && !game.singlePlayer && !game.supportsBot && !game.supportsTwoPlayer
  const [mode, setMode] = useState<Mode>(onlineOnly ? 'online' : game.singlePlayer ? 'solo' : game.supportsBot ? 'bot' : 'twoPlayer')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [showHowToPlay, setShowHowToPlay] = useState(false)
  const s = stats[game.id]

  const start = () => {
    sounds.pop()
    if (mode === 'online') onOnline()
    else onStart({ mode, difficulty })
  }

  return (
    <div className="px-4 pt-4 pb-4">
      {/* رجوع */}
      <button onClick={onBack} className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2">
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
        <div className="relative p-5 flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 15 }}
            className="text-6xl mb-2 drop-shadow-xl"
          >
            {game.emoji}
          </motion.div>
          <h1 className="text-2xl font-black">{game.name}</h1>
          <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{game.description}</p>
          {s && (
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
              <span>لعبت <bdi className="bidi-number tabular-nums">{s.played}</bdi> مرة</span>
              <span>فزت <bdi className="bidi-number tabular-nums">{s.won}</bdi> مرة</span>
              {s.bestScore !== undefined && <span>أفضل نتيجة: <bdi className="bidi-number tabular-nums">{s.bestScore}</bdi></span>}
            </div>
          )}
        </div>
      </motion.div>

      {/* كيف تلعب */}
      <div className="glass rounded-3xl p-4 mb-4">
        <button
          type="button"
          onClick={() => setShowHowToPlay((open) => !open)}
          className="w-full min-h-11 rounded-2xl flex items-center gap-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
          aria-expanded={showHowToPlay}
          aria-controls="game-instructions"
        >
          <Info className="w-4 h-4 text-emerald-400" />
          <span className="font-extrabold flex-1">كيف تلعب؟</span>
          <span className="text-xs text-muted-foreground">{showHowToPlay ? 'إخفاء' : 'عرض التعليمات'}</span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', showHowToPlay && 'rotate-180')} />
        </button>
        <AnimatePresence initial={false}>
          {showHowToPlay && (
            <motion.ul
              id="game-instructions"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-col gap-2 overflow-hidden pt-2.5"
            >
              {game.howToPlay.map((line, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300 leading-relaxed">
                  <bdi dir="ltr" className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-[11px] leading-none font-black grid place-items-center shrink-0 mt-0.5 tabular-nums">
                    {i + 1}
                  </bdi>
                  {line}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* نمط اللعب */}
      <div className="glass rounded-3xl p-4 mb-4">
        <h2 className="font-extrabold mb-3">نمط اللعب</h2>
        <div className="flex flex-col gap-2">
          {game.singlePlayer && (
            <button
              onClick={() => {
                sounds.click()
                setMode('solo')
              }}
              className={cn(
                'flex items-center gap-3 rounded-2xl p-3.5 border transition-all text-start',
                mode === 'solo' ? 'bg-emerald-500/15 border-emerald-400/60 glow-emerald' : 'bg-white/5 border-white/10 hover:bg-white/10',
              )}
              aria-pressed={mode === 'solo'}
            >
              <UserRound className={cn('w-6 h-6', mode === 'solo' ? 'text-emerald-400' : 'text-muted-foreground')} />
              <div className="flex-1">
                <p className="font-extrabold text-sm">لاعب واحد</p>
                <p className="text-[11px] text-muted-foreground">العب وسجّل أفضل نتيجة</p>
              </div>
              {mode === 'solo' && <span className="text-emerald-400 text-lg">✓</span>}
            </button>
          )}
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
              aria-pressed={mode === 'bot'}
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
              aria-pressed={mode === 'twoPlayer'}
            >
              <Users className={cn('w-6 h-6', mode === 'twoPlayer' ? 'text-emerald-400' : 'text-muted-foreground')} />
              <div className="flex-1">
                <p className="font-extrabold text-sm">لاعبان على نفس الجهاز</p>
                <p className="text-[11px] text-muted-foreground">العب مع صديق بجانبك</p>
              </div>
              {mode === 'twoPlayer' && <span className="text-emerald-400 text-lg">✓</span>}
            </button>
          )}
          {game.online && (
            <button
              onClick={() => {
                sounds.click()
                setMode('online')
              }}
              className={cn(
                'flex items-center gap-3 rounded-2xl p-3.5 border transition-all text-start',
                mode === 'online' ? 'bg-emerald-500/15 border-emerald-400/60 glow-emerald' : 'bg-white/5 border-white/10 hover:bg-white/10',
              )}
              aria-pressed={mode === 'online'}
            >
              <Globe className={cn('w-6 h-6', mode === 'online' ? 'text-emerald-400' : 'text-muted-foreground')} />
              <div className="flex-1">
                <p className="font-extrabold text-sm">{game.publicArena ? 'الساحة العامة 🌐' : 'أونلاين 🌐'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {game.publicArena ? 'ادخل فورًا والعب مع أشخاص عشوائيين' : 'غرفة برمز أو مباراة سريعة ضد لاعب حقيقي'}
                </p>
              </div>
              {mode === 'online' && <span className="text-emerald-400 text-lg">✓</span>}
            </button>
          )}
        </div>
      </div>

      {/* الصعوبة */}
      {game.difficulties && (mode === 'bot' || mode === 'solo') && (
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
                aria-pressed={difficulty === d.id}
              >
                <p className={cn('font-extrabold text-sm', difficulty === d.id && 'text-emerald-300')}>{d.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{d.hint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* زر البدء */}
      <div className="game-start-action">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={start}
          className="w-full min-h-14 py-3.5 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-black text-lg flex items-center justify-center gap-2 glow-emerald hover:from-emerald-400 hover:to-teal-400 transition-all"
        >
          {mode === 'online' ? <Globe className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
          {mode === 'online' ? (game.publicArena ? 'ادخل الساحة العامة' : 'العب أونلاين') : 'ابدأ اللعب'}
        </motion.button>
      </div>
    </div>
  )
}
