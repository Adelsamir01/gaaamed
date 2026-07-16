import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AvatarCircle } from '@/sections/components'

type Cell = 'X' | 'O' | null
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

function findWinner(b: Cell[]): { winner: 'X' | 'O'; line: number[] } | null {
  for (const line of LINES) {
    const [a, c, d] = line
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a] as 'X' | 'O', line }
  }
  return null
}

export default function OnlineTicTacToe({ onFinish }: GameProps) {
  const { slot, opponent, sendAction, subscribe } = useOnline()
  const { profile } = useApp()
  const mySymbol: 'X' | 'O' = slot === 1 ? 'X' : 'O'
  const theirSymbol: 'X' | 'O' = mySymbol === 'X' ? 'O' : 'X'

  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null))
  const [turn, setTurn] = useState<'X' | 'O'>('X')
  const [winLine, setWinLine] = useState<number[] | null>(null)
  const [endMsg, setEndMsg] = useState<string | null>(null)
  const finishedRef = useRef(false)

  const finish = useCallback(
    (winner: 'X' | 'O' | 'draw') => {
      if (finishedRef.current) return
      finishedRef.current = true
      const won = winner === mySymbol
      const outcome = winner === 'draw' ? 'draw' : won ? 'win' : 'loss'
      if (outcome === 'win') sounds.win()
      else if (outcome === 'loss') sounds.lose()
      else sounds.pop()
      setEndMsg(winner === 'draw' ? 'تعادل! 🤝' : won ? 'فزت! 🏆' : 'خسر الخصم؟ لا… أنت! 😅')
      setTimeout(() => {
        onFinish({
          gameId: 'tictactoe-online',
          outcome,
          coinsEarned: outcome === 'win' ? 30 : outcome === 'draw' ? 10 : 5,
          xpEarned: outcome === 'win' ? 40 : outcome === 'draw' ? 15 : 8,
          summary:
            winner === 'draw'
              ? `تعادلت مع ${opponent?.name ?? 'الخصم'}`
              : won
                ? `فزت على ${opponent?.name ?? 'الخصم'} 🏆`
                : `فاز عليك ${opponent?.name ?? 'الخصم'}`,
        })
      }, 1600)
    },
    [mySymbol, opponent, onFinish],
  )

  const applyMove = useCallback(
    (index: number, symbol: 'X' | 'O') => {
      setBoard((prev) => {
        if (prev[index] || finishedRef.current) return prev
        const next = [...prev]
        next[index] = symbol
        const w = findWinner(next)
        if (w) {
          setWinLine(w.line)
          setTimeout(() => finish(w.winner), 600)
        } else if (next.every((c) => c !== null)) {
          setTimeout(() => finish('draw'), 600)
        } else {
          setTurn(symbol === 'X' ? 'O' : 'X')
        }
        return next
      })
    },
    [finish],
  )

  // استقبال حركات الخصم
  useEffect(() => {
    return subscribe((ev) => {
      if (ev.kind === 'action' && typeof ev.action.index === 'number') {
        sounds.tick()
        applyMove(ev.action.index as number, theirSymbol)
      }
    })
  }, [subscribe, applyMove, theirSymbol])

  const handleTap = (i: number) => {
    if (board[i] || turn !== mySymbol || finishedRef.current || endMsg) return
    sounds.pop()
    applyMove(i, mySymbol)
    sendAction({ index: i })
  }

  const myTurn = turn === mySymbol

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* اللاعبان */}
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className={cn('glass rounded-2xl py-2.5 flex flex-col items-center gap-1 transition-all', myTurn && !endMsg && 'border-emerald-400/50 glow-emerald')}>
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">أنت {mySymbol === 'X' ? '❌' : '⭕'}</div>
        </div>
        <div className={cn('glass rounded-2xl py-2.5 flex flex-col items-center gap-1 transition-all', !myTurn && !endMsg && 'border-amber-400/50 glow-amber')}>
          <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">{opponent?.name ?? 'الخصم'} {theirSymbol === 'X' ? '❌' : '⭕'}</div>
        </div>
      </div>

      <div className="h-8 flex items-center">
        <AnimatePresence mode="wait">
          {endMsg ? (
            <motion.span key="end" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-lg font-extrabold text-gradient">
              {endMsg}
            </motion.span>
          ) : (
            <motion.span key={String(myTurn)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-bold text-slate-300">
              {myTurn ? '🟢 دورك — اختر خانة' : '🟡 دور الخصم…'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-3 gap-2.5 w-full max-w-[320px]">
        {board.map((cell, i) => {
          const inWinLine = winLine?.includes(i)
          return (
            <motion.button
              key={i}
              whileTap={{ scale: 0.92 }}
              onClick={() => handleTap(i)}
              className={cn(
                'aspect-square rounded-2xl glass text-4xl font-black flex items-center justify-center transition-colors',
                inWinLine && 'bg-emerald-500/25 border-emerald-400/60 glow-emerald',
                !cell && myTurn && !endMsg && 'hover:bg-white/10',
              )}
            >
              <AnimatePresence>
                {cell && (
                  <motion.span
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                    className={cell === 'X' ? 'text-emerald-400' : 'text-amber-400'}
                  >
                    {cell === 'X' ? '✕' : '◯'}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
