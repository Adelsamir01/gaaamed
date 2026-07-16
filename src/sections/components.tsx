import { motion } from 'framer-motion'
import { Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import { levelFromXp, xpProgress, XP_PER_LEVEL } from '@/types'

export function AvatarCircle({ emoji, size = 'md', glow }: { emoji: string; size?: 'sm' | 'md' | 'lg' | 'xl'; glow?: boolean }) {
  const sizes = {
    sm: 'w-9 h-9 text-lg',
    md: 'w-11 h-11 text-xl',
    lg: 'w-16 h-16 text-3xl',
    xl: 'w-24 h-24 text-5xl',
  }
  return (
    <div
      className={cn(
        'rounded-full glass flex items-center justify-center shrink-0 select-none',
        sizes[size],
        glow && 'glow-emerald border-emerald-400/40',
      )}
    >
      {emoji}
    </div>
  )
}

export function CoinChip({ coins, className }: { coins: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1.5 glass rounded-full px-3 py-1.5', className)}>
      <Coins className="w-4 h-4 text-amber-400" />
      <span className="text-sm font-bold text-amber-300 tabular-nums">{coins}</span>
    </div>
  )
}

export function LevelBar({ xp, showLabel = true }: { xp: number; showLabel?: boolean }) {
  const level = levelFromXp(xp)
  const progress = xpProgress(xp)
  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold text-emerald-300">المستوى {level}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {progress} / {XP_PER_LEVEL} نقطة
          </span>
        </div>
      )}
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-teal-300"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 mt-6">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {action}
    </div>
  )
}

export function StatusDot({ status }: { status: 'online' | 'playing' | 'offline' }) {
  const colors = {
    online: 'bg-emerald-400',
    playing: 'bg-amber-400',
    offline: 'bg-slate-500',
  }
  return <span className={cn('inline-block w-2.5 h-2.5 rounded-full', colors[status])} />
}
