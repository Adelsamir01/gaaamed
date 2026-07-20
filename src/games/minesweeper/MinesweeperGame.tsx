import { useEffect, useMemo, useRef, useState } from 'react'
import { Bomb, Flag, MousePointer2, RefreshCw, Timer } from 'lucide-react'
import type { GameProps } from '@/games'
import type { Difficulty } from '@/types'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

interface Cell {
  mine: boolean
  adjacent: number
  revealed: boolean
  flagged: boolean
}

interface Level {
  size: number
  mines: number
  label: string
}

const LEVELS: Record<Difficulty, Level> = {
  easy: { size: 8, mines: 10, label: 'سهل' },
  medium: { size: 9, mines: 14, label: 'متوسط' },
  hard: { size: 10, mines: 20, label: 'صعب' },
}

const NUMBER_COLORS = [
  '',
  'text-sky-300',
  'text-emerald-300',
  'text-red-300',
  'text-violet-300',
  'text-amber-300',
  'text-cyan-300',
  'text-pink-300',
  'text-white',
]

function createBlankBoard(size: number): Cell[] {
  return Array.from({ length: size * size }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false }))
}

function neighbours(index: number, size: number): number[] {
  const x = index % size
  const y = Math.floor(index / size)
  const result: number[] = []
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) result.push(ny * size + nx)
    }
  }
  return result
}

function plantMines(board: Cell[], safeIndex: number, level: Level): Cell[] {
  const forbidden = new Set([safeIndex, ...neighbours(safeIndex, level.size)])
  const candidates = board.map((_, index) => index).filter((index) => !forbidden.has(index))
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = candidates[i]
    candidates[i] = candidates[j] as number
    candidates[j] = current as number
  }
  const mineIndexes = new Set(candidates.slice(0, level.mines))
  return board.map((cell, index) => ({
    ...cell,
    mine: mineIndexes.has(index),
    adjacent: neighbours(index, level.size).filter((nearby) => mineIndexes.has(nearby)).length,
  }))
}

function revealArea(board: Cell[], startIndex: number, size: number): Cell[] {
  const next = board.map((cell) => ({ ...cell }))
  const queue = [startIndex]
  const visited = new Set<number>()
  while (queue.length > 0) {
    const index = queue.shift()
    if (index === undefined || visited.has(index)) continue
    visited.add(index)
    const cell = next[index]
    if (!cell || cell.flagged || cell.mine) continue
    cell.revealed = true
    if (cell.adjacent === 0) {
      neighbours(index, size).forEach((nearby) => {
        if (!visited.has(nearby)) queue.push(nearby)
      })
    }
  }
  return next
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export default function MinesweeperGame({ config, onFinish }: GameProps) {
  const level = LEVELS[config.difficulty]
  const [board, setBoard] = useState<Cell[]>(() => createBlankBoard(level.size))
  const [firstMove, setFirstMove] = useState(true)
  const [started, setStarted] = useState(false)
  const [done, setDone] = useState(false)
  const [won, setWon] = useState(false)
  const [flagMode, setFlagMode] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const finishedRef = useRef(false)
  const resultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const secondsRef = useRef(0)

  const flags = useMemo(() => board.filter((cell) => cell.flagged).length, [board])
  const revealedSafe = useMemo(() => board.filter((cell) => cell.revealed && !cell.mine).length, [board])
  const safeTotal = level.size * level.size - level.mines

  useEffect(() => {
    secondsRef.current = seconds
  }, [seconds])

  useEffect(() => {
    if (!started || done) return
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [done, started])

  useEffect(() => () => {
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
  }, [])

  const finish = (outcome: 'win' | 'loss', finalSeconds: number) => {
    if (finishedRef.current) return
    finishedRef.current = true
    setDone(true)
    setWon(outcome === 'win')
    if (outcome === 'win') sounds.win()
    else sounds.lose()

    const baseCoins: Record<Difficulty, number> = { easy: 30, medium: 45, hard: 60 }
    resultTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'minesweeper',
        outcome,
        score: finalSeconds,
        bestCandidate: outcome === 'win' ? finalSeconds : undefined,
        lowerIsBetter: true,
        coinsEarned: outcome === 'win' ? Math.max(12, baseCoins[config.difficulty] - Math.floor(finalSeconds / 10)) : 2,
        xpEarned: outcome === 'win' ? ({ easy: 35, medium: 50, hard: 70 } as Record<Difficulty, number>)[config.difficulty] : 8,
        summary: outcome === 'win'
          ? `نظّفت اللوحة في ${formatTime(finalSeconds)} من غير أي انفجار 🏆`
          : `انفجر اللغم بعد ${formatTime(finalSeconds)} 💥`,
        detail: outcome === 'win' ? 'كلما خلصت أسرع، زادت مكافأتك.' : 'الأرقام حول المربع تساوي عدد الألغام الملامسة له.',
      })
    }, 900)
  }

  const reveal = (index: number) => {
    if (done) return
    let workingBoard = board
    const currentCell = workingBoard[index]
    if (!currentCell || currentCell.flagged || currentCell.revealed) return

    if (firstMove) {
      workingBoard = plantMines(board, index, level)
      setFirstMove(false)
      setStarted(true)
    }

    const cell = workingBoard[index]
    if (!cell) return
    if (cell.mine) {
      const exploded = workingBoard.map((item) => item.mine ? { ...item, revealed: true } : item)
      setBoard(exploded)
      finish('loss', secondsRef.current)
      return
    }

    sounds.flip()
    const next = revealArea(workingBoard, index, level.size)
    setBoard(next)
    const isWin = next.every((item) => item.mine || item.revealed)
    if (isWin) finish('win', secondsRef.current)
  }

  const toggleFlag = (index: number) => {
    if (done) return
    const cell = board[index]
    if (!cell || cell.revealed || (!cell.flagged && flags >= level.mines)) return
    sounds.click()
    setStarted(true)
    setBoard((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, flagged: !item.flagged } : item))
  }

  const handleCell = (index: number) => {
    if (flagMode) toggleFlag(index)
    else reveal(index)
  }

  const reset = () => {
    sounds.click()
    if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
    finishedRef.current = false
    setBoard(createBlankBoard(level.size))
    setFirstMove(true)
    setStarted(false)
    setDone(false)
    setWon(false)
    setFlagMode(false)
    setSeconds(0)
    secondsRef.current = 0
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2 select-none">
      <div className="w-full grid grid-cols-3 gap-2">
        <div className="glass rounded-2xl px-2 py-2 flex items-center justify-center gap-1.5">
          <Bomb className="w-4 h-4 text-red-300" />
          <span className="text-sm font-black tabular-nums">{Math.max(0, level.mines - flags)}</span>
        </div>
        <div className="glass rounded-2xl px-2 py-2 flex items-center justify-center gap-1.5">
          <Timer className="w-4 h-4 text-amber-300" />
          <span className="text-sm font-black tabular-nums">{formatTime(seconds)}</span>
        </div>
        <button type="button" onClick={reset} disabled={done} className="glass rounded-2xl px-2 py-2 flex items-center justify-center gap-1.5 disabled:opacity-50">
          <RefreshCw className="w-4 h-4 text-emerald-300" />
          <span className="text-xs font-bold">جديد</span>
        </button>
      </div>

      <div className="w-full flex items-center justify-between gap-3">
        <div>
          <p className="font-black">كاسحة الألغام 💣</p>
          <p className="text-[10px] text-muted-foreground">{level.label} · {revealedSafe}/{safeTotal} مربع آمن</p>
        </div>
        <div className="flex rounded-2xl glass p-1" role="group" aria-label="طريقة اللعب">
          <button
            type="button"
            onClick={() => setFlagMode(false)}
            className={cn('rounded-xl px-3 py-2 flex items-center gap-1 text-xs font-bold transition-colors', !flagMode && 'bg-emerald-500/25 text-emerald-200')}
            aria-pressed={!flagMode}
          >
            <MousePointer2 className="w-4 h-4" /> كشف
          </button>
          <button
            type="button"
            onClick={() => setFlagMode(true)}
            className={cn('rounded-xl px-3 py-2 flex items-center gap-1 text-xs font-bold transition-colors', flagMode && 'bg-amber-500/25 text-amber-200')}
            aria-pressed={flagMode}
          >
            <Flag className="w-4 h-4" /> علم
          </button>
        </div>
      </div>

      <div
        className="relative grid gap-1 w-full max-w-[360px] rounded-3xl bg-slate-950/60 border border-white/10 p-2.5 shadow-[0_0_35px_rgba(16,185,129,0.1)]"
        style={{ gridTemplateColumns: `repeat(${level.size}, minmax(0, 1fr))` }}
        aria-label="لوحة كاسحة الألغام"
      >
        {board.map((cell, index) => (
          <button
            key={index}
            type="button"
            onClick={() => handleCell(index)}
            onContextMenu={(event) => {
              event.preventDefault()
              toggleFlag(index)
            }}
            className={cn(
              'aspect-square min-w-0 rounded-md sm:rounded-lg flex items-center justify-center font-black text-xs sm:text-sm transition-all leading-none',
              cell.revealed
                ? cell.mine
                  ? 'bg-red-500/25 border border-red-400/50'
                  : 'bg-white/[0.045] border border-white/[0.04]'
                : 'bg-gradient-to-br from-slate-600/80 to-slate-800/90 border border-white/15 shadow-sm active:scale-90',
              cell.revealed && !cell.mine && NUMBER_COLORS[cell.adjacent],
              cell.flagged && !cell.revealed && 'bg-amber-500/20 border-amber-400/50',
            )}
            aria-label={cell.flagged ? `مربع ${index + 1} عليه علم` : cell.revealed ? `مربع مكشوف ${cell.adjacent}` : `مربع مخفي ${index + 1}`}
          >
            {cell.revealed ? (cell.mine ? '💣' : cell.adjacent || '') : cell.flagged ? '🚩' : ''}
          </button>
        ))}

        {done && (
          <div className="absolute inset-0 rounded-3xl bg-slate-950/65 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl">{won ? '🏆' : '💥'}</span>
            <span className="font-black text-lg mt-2">{won ? 'نظّفت اللوحة!' : 'اللغم انفجر!'}</span>
            <span className="text-xs text-slate-300 mt-1">الوقت {formatTime(seconds)}</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        {firstMove ? 'أول ضغطة آمنة دائمًا' : flagMode ? 'اضغط على أي مربع لوضع علم أو إزالته' : 'اكشف المربعات الآمنة واتبع الأرقام'}
      </p>
    </div>
  )
}
