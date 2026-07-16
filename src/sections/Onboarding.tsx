import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { AVATAR_OPTIONS } from '@/data/friends'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

export default function Onboarding() {
  const { completeOnboarding } = useApp()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0])

  const canStart = name.trim().length >= 2

  const start = () => {
    if (!canStart) return
    sounds.win()
    completeOnboarding(name.trim(), avatar)
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-5">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[420px] flex flex-col items-center"
      >
        {/* الشعار */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.1 }}
          className="relative mb-4"
        >
          <div className="w-28 h-28 rounded-[2rem] bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center glow-emerald rotate-3">
            <span className="text-6xl -rotate-3">🎮</span>
          </div>
          <motion.span
            animate={{ rotate: [0, 15, -10, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
            className="absolute -top-2 -end-2 text-2xl"
          >
            ✨
          </motion.span>
        </motion.div>

        <h1 className="text-5xl font-black text-gradient mb-1">قييمد</h1>
        <p className="text-muted-foreground font-bold mb-8 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          العب ودردش مع أصدقائك
        </p>

        <div className="w-full glass rounded-3xl p-5 flex flex-col gap-5">
          <div>
            <label className="block text-sm font-bold mb-2">ما اسمك؟</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اكتب اسمك هنا…"
              maxLength={20}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 font-bold placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">اختر شخصيتك</label>
            <div className="grid grid-cols-6 gap-2">
              {AVATAR_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    sounds.pop()
                    setAvatar(a)
                  }}
                  className={cn(
                    'aspect-square rounded-2xl text-2xl flex items-center justify-center transition-all border',
                    avatar === a
                      ? 'bg-emerald-500/25 border-emerald-400/70 glow-emerald scale-110'
                      : 'bg-white/5 border-white/10 hover:bg-white/10',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={start}
            disabled={!canStart}
            className={cn(
              'w-full py-4 rounded-2xl font-extrabold text-lg transition-all',
              canStart
                ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white glow-emerald hover:from-emerald-400 hover:to-teal-400'
                : 'bg-white/10 text-muted-foreground cursor-not-allowed',
            )}
          >
            🚀 ابدأ اللعب
          </motion.button>
        </div>

        <p className="text-[11px] text-muted-foreground mt-5">gaaamed — قييمد 💚</p>
      </motion.div>
    </div>
  )
}
