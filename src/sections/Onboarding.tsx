import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AtSign, Check, Sparkles, X } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { useOnline } from '@/online/OnlineContext'
import { AVATAR_OPTIONS } from '@/data/friends'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const HANDLE_RE = /^[a-z0-9_]{3,15}$/
type HandleState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export default function Onboarding() {
  const { completeOnboarding } = useApp()
  const { searchUser, status } = useOnline()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0])
  const [handle, setHandle] = useState('')
  const [handleState, setHandleState] = useState<HandleState>('idle')
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // فحص توفّر المعرف على الخادم (مؤجل 400ms)
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current)
    const clean = handle.trim().toLowerCase()
    if (!clean) {
      setHandleState('idle')
      return
    }
    if (!HANDLE_RE.test(clean)) {
      setHandleState('invalid')
      return
    }
    setHandleState('checking')
    checkTimer.current = setTimeout(() => {
      searchUser(clean).then((found) => {
        setHandleState(found ? 'taken' : 'available')
      })
    }, 400)
    return () => {
      if (checkTimer.current) clearTimeout(checkTimer.current)
    }
  }, [handle, searchUser])

  const canStart = name.trim().length >= 2 && ['idle', 'available'].includes(handleState)

  const start = () => {
    if (!canStart) return
    sounds.win()
    completeOnboarding(name.trim(), avatar, handle.trim().toLowerCase() || undefined)
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

        <h1 className="text-5xl font-black text-gradient mb-1">جااامد</h1>
        <p className="text-muted-foreground font-bold mb-7 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-400" />
          العب ودردش مع أصدقائك
        </p>

        <div className="w-full glass rounded-3xl p-5 flex flex-col gap-4">
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
            <label className="text-sm font-bold mb-2 flex items-center gap-1.5">
              <AtSign className="w-4 h-4 text-emerald-400" />
              معرّف المستخدم
              <span className="text-[10px] text-muted-foreground font-normal">(اختياري — يجدك به أصدقاؤك)</span>
            </label>
            <div className="relative">
              <span className="absolute top-1/2 -translate-y-1/2 start-4 text-muted-foreground font-black">@</span>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="adel_92"
                maxLength={15}
                dir="ltr"
                className="w-full bg-white/5 border border-white/10 rounded-2xl ps-9 pe-10 py-3.5 font-bold placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 transition text-left"
              />
              {handleState === 'checking' && (
                <span className="absolute top-1/2 -translate-y-1/2 end-4 text-xs text-muted-foreground animate-pulse">…</span>
              )}
              {handleState === 'available' && <Check className="absolute top-1/2 -translate-y-1/2 end-4 w-4 h-4 text-emerald-400" />}
              {(handleState === 'taken' || handleState === 'invalid') && (
                <X className="absolute top-1/2 -translate-y-1/2 end-4 w-4 h-4 text-red-400" />
              )}
            </div>
            <p className={cn(
              'text-[11px] font-bold mt-1.5 min-h-4',
              handleState === 'available' && 'text-emerald-300',
              (handleState === 'taken' || handleState === 'invalid') && 'text-red-300',
              (handleState === 'idle' || handleState === 'checking') && 'text-muted-foreground',
            )}>
              {handleState === 'idle' && 'من ٣ لـ ١٥ حرف إنجليزي صغير أو رقم أو _ — لو سيبته هنعملك واحد تلقائيًا'}
              {handleState === 'checking' && (status === 'online' ? 'بنتحقق من التوفر…' : 'في انتظار الاتصال بالخادم…')}
              {handleState === 'available' && '✓ المعرّف متاح'}
              {handleState === 'taken' && '✗ المعرّف ده محجوز'}
              {handleState === 'invalid' && '✗ من ٣ لـ ١٥ حرف إنجليزي صغير أو رقم أو _ بس'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2">اختر شخصيتك</label>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
              {AVATAR_OPTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    sounds.pop()
                    setAvatar(a)
                  }}
                  className={cn(
                    'w-12 h-12 shrink-0 rounded-2xl text-2xl flex items-center justify-center transition-all border',
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

        <p className="text-[11px] text-muted-foreground mt-5">gaaamed — جااامد 💚</p>
      </motion.div>
    </div>
  )
}
