import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { GameProps } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type Cell = 'X' | 'O' | null
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]
const WIN_TARGET = 3

function findWinner(b: Cell[]): { winner: 'X' | 'O'; line: number[] } | null {
  for (const line of LINES) {
    const [a, c, d] = line
    if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a] as 'X' | 'O', line }
  }
  return null
}

function availableMoves(b: Cell[]): number[] {
  return b.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
}

function minimax(b: Cell[], isMax: boolean): number {
  const w = findWinner(b)
  if (w) return w.winner === 'O' ? 10 : -10
  const moves = availableMoves(b)
  if (moves.length === 0) return 0
  let best = isMax ? -Infinity : Infinity
  for (const m of moves) {
    b[m] = isMax ? 'O' : 'X'
    const score = minimax(b, !isMax)
    b[m] = null
    best = isMax ? Math.max(best, score) : Math.min(best, score)
  }
  return best
}

function bestMove(b: Cell[]): number {
  let best = -Infinity
  let move = availableMoves(b)[0]
  for (const m of availableMoves(b)) {
    b[m] = 'O'
    const score = minimax(b, false)
    b[m] = null
    if (score > best) {
      best = score
      move = m
    }
  }
  return move
}

function mediumMove(b: Cell[]): number {
  const moves = availableMoves(b)
  // حاول الفوز
  for (const m of moves) {
    const copy = [...b]
    copy[m] = 'O'
    if (findWinner(copy)?.winner === 'O') return m
  }
  // امنع الخصم
  for (const m of moves) {
    const copy = [...b]
    copy[m] = 'X'
    if (findWinner(copy)?.winner === 'X') return m
  }
  return moves[Math.floor(Math.random() * moves.length)]
}

export default function TicTacToe({ config, onFinish }: GameProps) {
  const isBot = config.mode === 'bot'
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null))
  const [turn, setTurn] = useState<'X' | 'O'>('X')
  const [scores, setScores] = useState({ x: 0, o: 0, draws: 0 })
  const [winLine, setWinLine] = useState<number[] | null>(null)
  const [roundMsg, setRoundMsg] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishedRef = useRef(false)

  const nameX = isBot ? 'أنت' : 'اللاعب الأول'
  const nameO = isBot ? 'الكمبيوتر' : 'اللاعب الثاني'

  const finishMatch = useCallback(
    (final: { x: number; o: number; draws: number }) => {
      if (finishedRef.current) return
      finishedRef.current = true
      const playerWon = final.x > final.o
      const tied = final.x === final.o
      const outcome = playerWon ? 'win' : tied ? 'draw' : 'loss'
      if (outcome === 'win') sounds.win()
      else if (outcome === 'loss') sounds.lose()
      setTimeout(() => {
        onFinish({
          gameId: 'tictactoe',
          outcome,
          coinsEarned: outcome === 'win' ? 30 : outcome === 'draw' ? 10 : 5,
          xpEarned: outcome === 'win' ? 40 : outcome === 'draw' ? 15 : 8,
          summary: playerWon ? `فزت بالمباراة ${final.x} - ${final.o} 🏆` : tied ? `تعادلتم ${final.x} - ${final.o}` : `خسرت المباراة ${final.x} - ${final.o}`,
          detail: `عدد التعادلات: ${final.draws}`,
        })
      }, 1600)
    },
    [onFinish],
  )

  const endRound = useCallback(
    (winner: 'X' | 'O' | 'draw', line: number[] | null) => {
      setWinLine(line)
      const newScores = { ...scores }
      if (winner === 'X') newScores.x++
      else if (winner === 'O') newScores.o++
      else newScores.draws++
      setScores(newScores)
      if (winner === 'X') sounds.correct()
      else if (winner === 'O') sounds.wrong()
      else sounds.pop()
      setRoundMsg(winner === 'draw' ? 'تعادل! 🤝' : `النقطة لـ${winner === 'X' ? nameX : nameO}! 🎯`)

      if (newScores.x >= WIN_TARGET || newScores.o >= WIN_TARGET) {
        timerRef.current = setTimeout(() => finishMatch(newScores), 1200)
      } else {
        timerRef.current = setTimeout(() => {
          setBoard(Array(9).fill(null))
          setWinLine(null)
          setRoundMsg(null)
          setTurn('X')
        }, 1500)
      }
    },
    [scores, nameX, nameO, finishMatch],
  )

  const playAt = useCallback(
    (i: number, symbol: 'X' | 'O') => {
      if (board[i] || findWinner(board)) return
      const next = [...board]
      next[i] = symbol
      sounds.pop()
      setBoard(next)
      const w = findWinner(next)
      if (w) {
        setTimeout(() => endRound(w.winner, w.line), 350)
      } else if (availableMoves(next).length === 0) {
        setTimeout(() => endRound('draw', null), 350)
      } else {
        setTurn(symbol === 'X' ? 'O' : 'X')
      }
    },
    [board, endRound],
  )

  const handleTap = (i: number) => {
    if (roundMsg || winLine) return
    if (isBot && turn === 'O') return
    playAt(i, turn)
  }

  // حركة الكمبيوتر
  useEffect(() => {
    if (!isBot || turn !== 'O' || roundMsg) return
    const t = setTimeout(() => {
      if (findWinner(board) || availableMoves(board).length === 0) return
      const moves = availableMoves(board)
      let m: number
      if (config.difficulty === 'easy') m = moves[Math.floor(Math.random() * moves.length)]
      else if (config.difficulty === 'medium') m = mediumMove(board)
      else m = bestMove([...board])
      const next = [...board]
      next[m] = 'O'
      sounds.tick()
      setBoard(next)
      const w = findWinner(next)
      if (w) setTimeout(() => endRound(w.winner, w.line), 350)
      else if (availableMoves(next).length === 0) setTimeout(() => endRound('draw', null), 350)
      else setTurn('X')
    }, 650)
    return () => clearTimeout(t)
  }, [isBot, turn, roundMsg, board, config.difficulty, endRound])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* لوحة النقاط */}
      <div className="w-full grid grid-cols-3 gap-2 text-center">
        <div className={cn('glass rounded-2xl py-2.5 transition-all', turn === 'X' && !roundMsg && 'border-emerald-400/50 glow-emerald')}>
          <div className="text-[11px] text-muted-foreground">{nameX} ❌</div>
          <div className="text-xl font-extrabold text-emerald-300 tabular-nums">{scores.x}</div>
        </div>
        <div className="glass rounded-2xl py-2.5">
          <div className="text-[11px] text-muted-foreground">تعادل</div>
          <div className="text-xl font-extrabold text-slate-300 tabular-nums">{scores.draws}</div>
        </div>
        <div className={cn('glass rounded-2xl py-2.5 transition-all', turn === 'O' && !roundMsg && 'border-amber-400/50 glow-amber')}>
          <div className="text-[11px] text-muted-foreground">{nameO} ⭕</div>
          <div className="text-xl font-extrabold text-amber-300 tabular-nums">{scores.o}</div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">الأول إلى {WIN_TARGET} نقاط يفوز بالمباراة</p>

      <AnimatePresence mode="wait">
        {roundMsg ? (
          <motion.div
            key="msg"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="h-8 flex items-center"
          >
            <span className="text-lg font-extrabold text-gradient">{roundMsg}</span>
          </motion.div>
        ) : (
          <motion.div key="turn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-8 flex items-center">
            <span className="text-sm font-bold text-slate-300">
              الدور على: <span className="text-emerald-300">{turn === 'X' ? nameX : nameO}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* اللوحة */}
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
                !cell && !roundMsg && 'hover:bg-white/10',
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
