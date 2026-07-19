import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MousePointerClick } from 'lucide-react'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from '@/sections/components'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

interface MemoryCard {
  index: number
  emoji: string | null
  matched: boolean
}

interface MemoryState {
  cards: MemoryCard[]
  selected: number[]
  activeSlot: number
  scores: Record<number, number>
  moves: number
  resolving: boolean
  ended: boolean
}

interface MemoryEnd {
  winnerSlot: number
  scores: Record<number, number>
  moves: number
}

export default function OnlineMemory({ onFinish }: GameProps) {
  const { slot, opponent, subscribe, sendMemoryFlip, requestGameSync } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const theirSlot = mySlot === 1 ? 2 : 1
  const [game, setGame] = useState<MemoryState | null>(null)
  const [ending, setEnding] = useState<string | null>(null)
  const finishedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finish = useCallback((result: MemoryEnd) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const outcome = result.winnerSlot === 0 ? 'draw' : result.winnerSlot === mySlot ? 'win' : 'loss'
    const mine = result.scores[mySlot] ?? 0
    const theirs = result.scores[theirSlot] ?? 0
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    setEnding(outcome === 'win' ? 'الذاكرة الأقوى! 🏆' : outcome === 'draw' ? 'تعادل في الأزواج! 🤝' : 'الخصم جمع أزواجًا أكثر')
    timerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'memory',
        outcome,
        coinsEarned: outcome === 'win' ? 35 : outcome === 'draw' ? 12 : 5,
        xpEarned: outcome === 'win' ? 45 : outcome === 'draw' ? 18 : 8,
        summary: outcome === 'draw'
          ? `تعادلت مع ${opponent?.name ?? 'الخصم'} ${mine} - ${theirs} في ${result.moves} محاولة`
          : outcome === 'win'
            ? `جمعت ${mine} أزواج مقابل ${theirs} لـ${opponent?.name ?? 'الخصم'} 🧠`
            : `${opponent?.name ?? 'الخصم'} جمع ${theirs} أزواج مقابل ${mine}`,
        detail: 'من يطابق زوجًا يحتفظ بالدور، والخطأ ينقل الدور للخصم.',
      })
    }, 1400)
  }, [mySlot, theirSlot, onFinish, opponent])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'memory') return
      if (event.msg.type === 'memory_state') {
        setGame(event.msg.state as unknown as MemoryState)
        if (event.msg.effect === 'match') sounds.correct()
        else if (event.msg.effect === 'miss') sounds.wrong()
      } else if (event.msg.type === 'memory_end') {
        finish(event.msg as unknown as MemoryEnd)
      }
    })
    requestGameSync()
    return () => {
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [finish, requestGameSync, subscribe])

  const flip = (card: MemoryCard) => {
    if (!game || game.ended || game.resolving || game.activeSlot !== mySlot || card.emoji || card.matched) return
    sounds.flip()
    sendMemoryFlip(card.index)
  }

  if (!game) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <motion.p animate={{ opacity: [0.35, 1, 0.35] }} transition={{ repeat: Infinity, duration: 1.2 }} className="font-bold text-muted-foreground">
          بنجهّز البطاقات… 🧠
        </motion.p>
      </div>
    )
  }

  const myTurn = game.activeSlot === mySlot
  const mine = game.scores[mySlot] ?? 0
  const theirs = game.scores[theirSlot] ?? 0
  const matchedPairs = Object.values(game.scores).reduce((sum, value) => sum + value, 0)

  return (
    <div className="flex flex-col items-center gap-3 py-3">
      <div className="grid grid-cols-2 gap-2 w-full text-center">
        <div className={cn('glass rounded-2xl py-2 flex items-center justify-center gap-2 transition-all', myTurn && !ending && 'border-emerald-400/60 glow-emerald')}>
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div>
            <p className="text-[11px] font-bold">أنت</p>
            <p className="text-lg font-black text-emerald-300 tabular-nums">{mine} زوج</p>
          </div>
        </div>
        <div className={cn('glass rounded-2xl py-2 flex items-center justify-center gap-2 transition-all', !myTurn && !ending && 'border-amber-400/60 glow-amber')}>
          <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
          <div>
            <p className="text-[11px] font-bold max-w-24 truncate">{opponent?.name ?? 'الخصم'}</p>
            <p className="text-lg font-black text-amber-300 tabular-nums">{theirs} زوج</p>
          </div>
        </div>
      </div>

      <div className="h-7 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.p key={ending ?? `${myTurn}-${game.resolving}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-extrabold text-center">
            {ending ?? (game.resolving ? 'ثبّت الرمزين في ذاكرتك…' : myTurn ? '🟢 دورك — اختار كارتين' : `🟡 دور ${opponent?.name ?? 'الخصم'}…`)}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="w-full flex items-center gap-3">
        <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
          <motion.div className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-teal-300" animate={{ width: `${(matchedPairs / 8) * 100}%` }} />
        </div>
        <div className="glass rounded-xl px-2.5 py-1 flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap">
          <MousePointerClick className="w-3.5 h-3.5 text-emerald-400" />
          {game.moves} محاولة
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2.5 w-full max-w-[360px]">
        {game.cards.map((card) => {
          const open = card.emoji !== null
          return (
            <motion.button
              key={card.index}
              whileTap={!open && myTurn ? { scale: 0.9 } : undefined}
              onClick={() => flip(card)}
              disabled={open || !myTurn || game.resolving || !!ending}
              className="aspect-square disabled:cursor-default"
              style={{ perspective: 600 }}
              aria-label={open ? `بطاقة ${card.emoji}` : 'اقلب البطاقة'}
            >
              <motion.div className="relative w-full h-full" animate={{ rotateY: open ? 180 : 0 }} transition={{ duration: 0.3 }} style={{ transformStyle: 'preserve-3d' }}>
                <div className={cn('absolute inset-0 rounded-2xl glass flex items-center justify-center text-xl', myTurn && !game.resolving && 'border-emerald-400/20')} style={{ backfaceVisibility: 'hidden' }}>
                  <span className="text-emerald-400/70 font-black">؟</span>
                </div>
                <div
                  className={cn('absolute inset-0 rounded-2xl flex items-center justify-center text-3xl border', card.matched ? 'bg-emerald-500/20 border-emerald-400/60 glow-emerald' : 'bg-white/10 border-white/25')}
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  {card.emoji}
                </div>
              </motion.div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
