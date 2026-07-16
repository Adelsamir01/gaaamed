import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { AvatarCircle } from '@/sections/components'

const ROWS = 6
const COLS = 7
/** 0 = فارغ، 1 = أحمر (اللاعب 1)، 2 = أصفر (اللاعب 2) */
type Board = number[][]

const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array(COLS).fill(0))

function findWin(b: Board): { player: number; cells: [number, number][] } | null {
  const dirs: [number, number][] = [
    [0, 1], [1, 0], [1, 1], [1, -1],
  ]
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c]
      if (!p) continue
      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = [[r, c]]
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k
          const nc = c + dc * k
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || b[nr][nc] !== p) break
          cells.push([nr, nc])
        }
        if (cells.length === 4) return { player: p, cells }
      }
    }
  }
  return null
}

export default function ConnectFour({ onFinish }: GameProps) {
  const { slot, opponent, sendAction, subscribe } = useOnline()
  const { profile } = useApp()
  const myPlayer = slot === 1 ? 1 : 2
  const theirPlayer = myPlayer === 1 ? 2 : 1

  const [board, setBoard] = useState<Board>(emptyBoard)
  const [turn, setTurn] = useState(1)
  const [winCells, setWinCells] = useState<Set<string> | null>(null)
  const [endMsg, setEndMsg] = useState<string | null>(null)
  const [lastMove, setLastMove] = useState<{ r: number; c: number } | null>(null)
  const finishedRef = useRef(false)

  const finish = useCallback(
    (winner: number | 'draw') => {
      if (finishedRef.current) return
      finishedRef.current = true
      const won = winner === myPlayer
      const outcome = winner === 'draw' ? 'draw' : won ? 'win' : 'loss'
      if (outcome === 'win') sounds.win()
      else if (outcome === 'loss') sounds.lose()
      setEndMsg(winner === 'draw' ? 'تعادل! 🤝' : won ? 'فزت! 🏆' : 'فاز الخصم 😅')
      setTimeout(() => {
        onFinish({
          gameId: 'connect4',
          outcome,
          coinsEarned: outcome === 'win' ? 30 : outcome === 'draw' ? 10 : 5,
          xpEarned: outcome === 'win' ? 40 : outcome === 'draw' ? 15 : 8,
          summary:
            winner === 'draw'
              ? `تعادلت مع ${opponent?.name ?? 'الخصم'}`
              : won
                ? `صففت أربعة قبل ${opponent?.name ?? 'الخصم'} 🏆`
                : `${opponent?.name ?? 'الخصم'} صفّ أربعة قبلك`,
        })
      }, 1700)
    },
    [myPlayer, opponent, onFinish],
  )

  const applyMove = useCallback(
    (col: number, player: number) => {
      setBoard((prev) => {
        if (finishedRef.current) return prev
        // أدنى صف فارغ في العمود
        let row = -1
        for (let r = ROWS - 1; r >= 0; r--) {
          if (prev[r][col] === 0) {
            row = r
            break
          }
        }
        if (row === -1) return prev
        const next = prev.map((r) => [...r])
        next[row][col] = player
        setLastMove({ r: row, c: col })
        const w = findWin(next)
        if (w) {
          setWinCells(new Set(w.cells.map(([r, c]) => `${r},${c}`)))
          setTimeout(() => finish(w.player), 700)
        } else if (next.every((r) => r.every((c) => c !== 0))) {
          setTimeout(() => finish('draw'), 700)
        } else {
          setTurn(player === 1 ? 2 : 1)
        }
        return next
      })
    },
    [finish],
  )

  useEffect(() => {
    return subscribe((ev) => {
      if (ev.kind === 'action' && typeof ev.action.column === 'number') {
        sounds.tick()
        applyMove(ev.action.column as number, theirPlayer)
      }
    })
  }, [subscribe, applyMove, theirPlayer])

  const handleColumn = (col: number) => {
    if (turn !== myPlayer || finishedRef.current || endMsg) return
    if (board[0][col] !== 0) return
    sounds.pop()
    applyMove(col, myPlayer)
    sendAction({ column: col })
  }

  const myTurn = turn === myPlayer

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* اللاعبان */}
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className={cn('glass rounded-2xl py-2 flex flex-col items-center gap-1 transition-all', myTurn && !endMsg && 'border-emerald-400/50 glow-emerald')}>
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">
            أنت {myPlayer === 1 ? '🔴' : '🟡'}
          </div>
        </div>
        <div className={cn('glass rounded-2xl py-2 flex flex-col items-center gap-1 transition-all', !myTurn && !endMsg && 'border-amber-400/50 glow-amber')}>
          <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
          <div className="text-xs font-bold truncate max-w-full px-2">
            {opponent?.name ?? 'الخصم'} {theirPlayer === 1 ? '🔴' : '🟡'}
          </div>
        </div>
      </div>

      <div className="h-7 flex items-center">
        <AnimatePresence mode="wait">
          {endMsg ? (
            <motion.span key="end" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-lg font-extrabold text-gradient">
              {endMsg}
            </motion.span>
          ) : (
            <motion.span key={String(myTurn)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-bold text-slate-300">
              {myTurn ? '🟢 دورك — اختر عمودًا' : '🟡 دور الخصم…'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* اللوحة */}
      <div className="glass rounded-3xl p-2.5 w-full max-w-[360px]">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: COLS }).map((_, col) => (
            <button
              key={col}
              onClick={() => handleColumn(col)}
              className={cn('flex flex-col gap-1.5 rounded-xl p-0.5 transition-colors', myTurn && !endMsg && 'hover:bg-white/10')}
            >
              {Array.from({ length: ROWS }).map((_, row) => {
                const v = board[row][col]
                const isWin = winCells?.has(`${row},${col}`)
                const isLast = lastMove?.r === row && lastMove?.c === col
                return (
                  <div
                    key={row}
                    className={cn(
                      'aspect-square rounded-full border border-white/10 bg-[#0b1220]/70 flex items-center justify-center overflow-hidden',
                      isWin && 'glow-emerald border-emerald-300/70',
                    )}
                  >
                    {v !== 0 && (
                      <motion.div
                        initial={isLast ? { y: -260 } : false}
                        animate={{ y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                        className={cn(
                          'w-full h-full rounded-full',
                          v === 1 ? 'bg-gradient-to-br from-red-400 to-red-600' : 'bg-gradient-to-br from-amber-300 to-amber-500',
                          isWin && 'ring-2 ring-white/80',
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
