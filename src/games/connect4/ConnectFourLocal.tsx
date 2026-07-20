import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { GameProps } from '@/games'
import type { Difficulty } from '@/types'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from '@/sections/components'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const ROWS = 6
const COLS = 7
type Cell = 0 | 1 | 2
type Board = Cell[][]

const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(0))

function winningCells(board: Board): { player: 1 | 2; cells: Array<[number, number]> } | null {
  const directions: Array<[number, number]> = [[0, 1], [1, 0], [1, 1], [1, -1]]
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const player = board[row]?.[col]
      if (!player) continue
      for (const [dr, dc] of directions) {
        const cells: Array<[number, number]> = []
        for (let step = 0; step < 4; step += 1) {
          const nextRow = row + dr * step
          const nextCol = col + dc * step
          if (nextRow < 0 || nextRow >= ROWS || nextCol < 0 || nextCol >= COLS || board[nextRow]?.[nextCol] !== player) break
          cells.push([nextRow, nextCol])
        }
        if (cells.length === 4) return { player, cells }
      }
    }
  }
  return null
}

function dropDisc(board: Board, col: number, player: 1 | 2): { board: Board; row: number } | null {
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    if (board[row]?.[col] !== 0) continue
    const next = board.map((line) => [...line])
    next[row]![col] = player
    return { board: next, row }
  }
  return null
}

function validColumns(board: Board): number[] {
  return Array.from({ length: COLS }, (_, col) => col).filter((col) => board[0]?.[col] === 0)
}

function scoreWindow(window: Cell[]): number {
  const bot = window.filter((cell) => cell === 2).length
  const human = window.filter((cell) => cell === 1).length
  const empty = window.filter((cell) => cell === 0).length
  if (bot === 4) return 10_000
  if (human === 4) return -10_000
  if (bot === 3 && empty === 1) return 80
  if (bot === 2 && empty === 2) return 12
  if (human === 3 && empty === 1) return -95
  if (human === 2 && empty === 2) return -10
  return 0
}

function evaluateBoard(board: Board): number {
  const winner = winningCells(board)
  if (winner?.player === 2) return 100_000
  if (winner?.player === 1) return -100_000
  let score = board.reduce((total, row) => total + (row[3] === 2 ? 6 : row[3] === 1 ? -6 : 0), 0)
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col <= COLS - 4; col += 1) score += scoreWindow(board[row]!.slice(col, col + 4))
  }
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row <= ROWS - 4; row += 1) score += scoreWindow(Array.from({ length: 4 }, (_, step) => board[row + step]?.[col] ?? 0))
  }
  for (let row = 0; row <= ROWS - 4; row += 1) {
    for (let col = 0; col <= COLS - 4; col += 1) {
      score += scoreWindow(Array.from({ length: 4 }, (_, step) => board[row + step]?.[col + step] ?? 0))
      score += scoreWindow(Array.from({ length: 4 }, (_, step) => board[row + 3 - step]?.[col + step] ?? 0))
    }
  }
  return score
}

function minimax(board: Board, depth: number, maximizing: boolean, alpha: number, beta: number): number {
  const columns = validColumns(board)
  if (depth === 0 || winningCells(board) || columns.length === 0) return evaluateBoard(board)
  let low = alpha
  let high = beta
  if (maximizing) {
    let value = -Infinity
    for (const col of columns) {
      const move = dropDisc(board, col, 2)
      if (!move) continue
      value = Math.max(value, minimax(move.board, depth - 1, false, low, high))
      low = Math.max(low, value)
      if (low >= high) break
    }
    return value
  }
  let value = Infinity
  for (const col of columns) {
    const move = dropDisc(board, col, 1)
    if (!move) continue
    value = Math.min(value, minimax(move.board, depth - 1, true, low, high))
    high = Math.min(high, value)
    if (low >= high) break
  }
  return value
}

function chooseBotColumn(board: Board, difficulty: Difficulty): number {
  const columns = validColumns(board)
  if (difficulty === 'easy') return columns[Math.floor(Math.random() * columns.length)] ?? 3

  const winning = columns.find((col) => winningCells(dropDisc(board, col, 2)?.board ?? board)?.player === 2)
  if (winning !== undefined) return winning
  const blocking = columns.find((col) => winningCells(dropDisc(board, col, 1)?.board ?? board)?.player === 1)
  if (blocking !== undefined) return blocking

  if (difficulty === 'medium') {
    const preferred = columns.filter((col) => col >= 2 && col <= 4)
    return preferred[Math.floor(Math.random() * preferred.length)] ?? columns[0] ?? 3
  }

  let bestColumn = columns[0] ?? 3
  let bestScore = -Infinity
  for (const col of columns) {
    const move = dropDisc(board, col, 2)
    if (!move) continue
    const score = minimax(move.board, 4, false, -Infinity, Infinity)
    if (score > bestScore) {
      bestScore = score
      bestColumn = col
    }
  }
  return bestColumn
}

export default function ConnectFourLocal({ config, onFinish }: GameProps) {
  const { profile } = useApp()
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [turn, setTurn] = useState<1 | 2>(1)
  const [winCells, setWinCells] = useState<Set<string> | null>(null)
  const [endMessage, setEndMessage] = useState<string | null>(null)
  const [lastMove, setLastMove] = useState<{ row: number; col: number } | null>(null)
  const finishedRef = useRef(false)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const againstBot = config.mode === 'bot'

  const finish = useCallback((winner: 1 | 2 | 'draw') => {
    if (finishedRef.current) return
    finishedRef.current = true
    const outcome = winner === 'draw' ? 'draw' : winner === 1 ? 'win' : 'loss'
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    setEndMessage(winner === 'draw' ? 'تعادل! 🤝' : winner === 1 ? 'الأحمر كسب! 🏆' : `${againstBot ? 'الكمبيوتر' : 'الأصفر'} كسب!`)
    timersRef.current.push(setTimeout(() => {
      onFinish({
        gameId: 'connect4',
        outcome,
        coinsEarned: outcome === 'win' ? 30 : outcome === 'draw' ? 10 : 5,
        xpEarned: outcome === 'win' ? 40 : outcome === 'draw' ? 15 : 8,
        summary: winner === 'draw' ? 'اللوحة امتلأت وانتهت بالتعادل 🤝' : winner === 1 ? `صففت أربعة قبل ${againstBot ? 'الكمبيوتر' : 'اللاعب الثاني'}!` : `${againstBot ? 'الكمبيوتر' : 'اللاعب الثاني'} صفّ أربعة أولًا`,
      })
    }, 1_150))
  }, [againstBot, onFinish])

  const playColumn = useCallback((col: number, player: 1 | 2) => {
    if (finishedRef.current) return
    const move = dropDisc(board, col, player)
    if (!move) return
    sounds.pop()
    setBoard(move.board)
    setLastMove({ row: move.row, col })
    const winner = winningCells(move.board)
    if (winner) {
      setWinCells(new Set(winner.cells.map(([row, column]) => `${row},${column}`)))
      timersRef.current.push(setTimeout(() => finish(winner.player), 500))
    } else if (validColumns(move.board).length === 0) {
      timersRef.current.push(setTimeout(() => finish('draw'), 500))
    } else {
      setTurn(player === 1 ? 2 : 1)
    }
  }, [board, finish])

  useEffect(() => {
    if (!againstBot || turn !== 2 || endMessage) return
    const timer = setTimeout(() => playColumn(chooseBotColumn(board, config.difficulty), 2), 480)
    return () => clearTimeout(timer)
  }, [againstBot, board, config.difficulty, endMessage, playColumn, turn])

  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout)
  }, [])

  const playerTwoName = againstBot ? 'الكمبيوتر' : 'اللاعب ٢'

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="w-full grid grid-cols-2 gap-2 text-center">
        <div className={cn('glass rounded-2xl py-2 flex flex-col items-center gap-1 transition-all', turn === 1 && !endMessage && 'border-red-400/60 shadow-[0_0_18px_rgba(248,113,113,0.2)]')}>
          <AvatarCircle emoji={profile.avatar} size="sm" />
          <div className="text-xs font-bold">{againstBot ? 'أنت' : 'اللاعب ١'} 🔴</div>
        </div>
        <div className={cn('glass rounded-2xl py-2 flex flex-col items-center gap-1 transition-all', turn === 2 && !endMessage && 'border-amber-400/60 glow-amber')}>
          <AvatarCircle emoji={againstBot ? '🤖' : '🎮'} size="sm" />
          <div className="text-xs font-bold">{playerTwoName} 🟡</div>
        </div>
      </div>

      <div className="h-7 flex items-center">
        <AnimatePresence mode="wait">
          <motion.span key={endMessage ?? turn} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-extrabold text-slate-200">
            {endMessage ?? (turn === 1 ? '🔴 دور الأحمر — اختر عمودًا' : `🟡 دور ${playerTwoName}${againstBot ? '…' : ' — اختر عمودًا'}`)}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="glass rounded-3xl p-2.5 w-full max-w-[360px]">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: COLS }, (_, col) => (
            <button
              key={col}
              type="button"
              onClick={() => playColumn(col, turn)}
              disabled={!!endMessage || (againstBot && turn === 2) || board[0]?.[col] !== 0}
              className="flex flex-col gap-1.5 rounded-xl p-0.5 transition-colors enabled:hover:bg-white/10 disabled:cursor-default"
              aria-label={`العمود ${col + 1}`}
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const value = board[row]?.[col] ?? 0
                const winning = winCells?.has(`${row},${col}`)
                const latest = lastMove?.row === row && lastMove.col === col
                return (
                  <span key={row} className={cn('aspect-square w-full shrink-0 rounded-full border border-white/10 bg-[#0b1220]/70 flex items-center justify-center overflow-hidden', winning && 'glow-emerald border-emerald-300/70')}>
                    {value !== 0 && (
                      <motion.span
                        initial={latest ? { y: -240 } : false}
                        animate={{ y: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                        className={cn('w-full h-full rounded-full', value === 1 ? 'bg-gradient-to-br from-red-400 to-red-600' : 'bg-gradient-to-br from-amber-300 to-amber-500', winning && 'ring-2 ring-white/80')}
                      />
                    )}
                  </span>
                )
              })}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
