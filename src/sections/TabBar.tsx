import { Gamepad2, Home, MessageCircle, User, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { sounds } from '@/lib/sounds'

export type TabId = 'home' | 'games' | 'chat' | 'friends' | 'profile'

const TABS: { id: TabId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'games', label: 'الألعاب', icon: Gamepad2 },
  { id: 'chat', label: 'الدردشة', icon: MessageCircle },
  { id: 'friends', label: 'الأصدقاء', icon: Users },
  { id: 'profile', label: 'حسابي', icon: User },
]

export function TabBar({ active, onChange, unreadChats }: { active: TabId; onChange: (t: TabId) => void; unreadChats: number }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40">
      <div className="mx-auto max-w-[420px] px-3 pb-2 safe-bottom">
        <div className="glass-strong rounded-3xl px-2 py-2 flex items-center justify-between shadow-2xl shadow-black/50">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id
            return (
              <button
                key={id}
                onClick={() => {
                  sounds.click()
                  onChange(id)
                }}
                className="relative flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-2xl"
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 bg-emerald-500/15 border border-emerald-400/30 rounded-2xl"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative">
                  <Icon className={cn('w-5 h-5 transition-colors', isActive ? 'text-emerald-400' : 'text-slate-400')} />
                  {id === 'chat' && unreadChats > 0 && (
                    <span className="absolute -top-1.5 -start-2 min-w-4 h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                      {unreadChats}
                    </span>
                  )}
                </span>
                <span className={cn('relative text-[10px] font-bold transition-colors', isActive ? 'text-emerald-300' : 'text-slate-400')}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
