import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { findMatch3Move, MATCH3_SIZE, type Match3Cell, type Match3State } from './engine.js'
import PixiMatch3Board from './PixiMatch3Board'
import type { Match3VisualEffect } from './useMatch3Animator'
import './match3.css'

export const SWEET_NAMES = ['ملبن ورد', 'برتقالة', 'فستقية', 'توتة', 'نعناية', 'ليمونة'] as const

export interface Match3BoardProps {
  state: Match3State
  disabled?: boolean
  onSwap: (first: number, second: number) => void
  celebration?: boolean
  visual?: Match3VisualEffect | null
}

interface PointerStart {
  index: number
  x: number
  y: number
}

function isAdjacent(first: number, second: number): boolean {
  const firstRow = Math.floor(first / MATCH3_SIZE)
  const firstCol = first % MATCH3_SIZE
  const secondRow = Math.floor(second / MATCH3_SIZE)
  const secondCol = second % MATCH3_SIZE
  return Math.abs(firstRow - secondRow) + Math.abs(firstCol - secondCol) === 1
}

function swipeTarget(index: number, dx: number, dy: number): number | null {
  const row = Math.floor(index / MATCH3_SIZE)
  const col = index % MATCH3_SIZE
  let nextRow = row
  let nextCol = col
  if (Math.abs(dx) > Math.abs(dy)) nextCol += dx > 0 ? 1 : -1
  else nextRow += dy > 0 ? 1 : -1
  if (nextRow < 0 || nextRow >= MATCH3_SIZE || nextCol < 0 || nextCol >= MATCH3_SIZE) return null
  return nextRow * MATCH3_SIZE + nextCol
}

export function CandyPiece({ cell, mini = false }: { cell: Match3Cell; mini?: boolean }) {
  const specialLabel = cell.special === 'row'
    ? 'صاروخ أفقي'
    : cell.special === 'col'
      ? 'صاروخ رأسي'
      : cell.special === 'bomb'
        ? 'قنبلة سكر'
        : cell.special === 'rainbow'
          ? 'دوامة ألوان'
          : ''
  return (
    <span
      className={cn(
        'match3-candy',
        cell.special === 'rainbow' ? 'match3-candy-rainbow' : `match3-candy-${cell.type}`,
        cell.special !== 'none' && `match3-special-${cell.special}`,
        mini && 'match3-candy-mini',
      )}
      aria-hidden="true"
      title={specialLabel || SWEET_NAMES[cell.type]}
    >
      <span className="match3-candy-shine" />
      {cell.special !== 'none' && cell.special !== 'rainbow' && (
        <span className="match3-special-mark">{cell.special === 'bomb' ? '✦' : ''}</span>
      )}
    </span>
  )
}

function DomMatch3Board({ state, disabled = false, onSwap, celebration = false, visual = null }: Match3BoardProps) {
  const [selection, setSelection] = useState<{ index: number; boardKey: string } | null>(null)
  const [hint, setHint] = useState<{ pair: [number, number]; boardKey: string } | null>(null)
  const [interaction, setInteraction] = useState(0)
  const pointerRef = useRef<PointerStart | null>(null)
  const boardKey = useMemo(() => state.board.map((cell) => cell?.id ?? 0).join(','), [state.board])
  const clearingIndices = useMemo(() => new Set(
    visual?.phase === 'clear' ? visual.indices : [],
  ), [visual])
  const selected = selection?.boardKey === boardKey ? selection.index : null
  const visibleHint = hint?.boardKey === boardKey ? hint.pair : null

  useEffect(() => {
    if (disabled) return
    const timer = window.setTimeout(() => {
      const pair = findMatch3Move(state.board)
      if (pair) setHint({ pair, boardKey })
    }, 5_000)
    return () => window.clearTimeout(timer)
  }, [boardKey, disabled, interaction, state.board])

  const attempt = (first: number, second: number) => {
    if (disabled || !isAdjacent(first, second)) return
    setSelection(null)
    setHint(null)
    setInteraction((value) => value + 1)
    onSwap(first, second)
  }

  const tap = (index: number) => {
    if (disabled) return
    setHint(null)
    setInteraction((value) => value + 1)
    if (selected === null) {
      setSelection({ index, boardKey })
      return
    }
    if (selected === index) {
      setSelection(null)
      return
    }
    if (isAdjacent(selected, index)) attempt(selected, index)
    else setSelection({ index, boardKey })
  }

  const pointerDown = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return
    pointerRef.current = { index, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    const start = pointerRef.current
    pointerRef.current = null
    if (!start || disabled) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.hypot(dx, dy) >= 14) {
      const target = swipeTarget(start.index, dx, dy)
      if (target !== null) attempt(start.index, target)
    } else {
      tap(index)
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className={cn(
      'match3-board-wrap',
      celebration && 'match3-board-celebration',
      visual?.phase === 'burst' && 'match3-board-bursting',
      visual?.phase === 'burst' && visual.cascade >= 2 && 'match3-board-impact',
    )}>
      <div className="match3-board" role="grid" aria-label="لوحة الحلوى ٨ في ٨">
        <div className="match3-board-cells" aria-hidden="true">
          {Array.from({ length: MATCH3_SIZE * MATCH3_SIZE }, (_, index) => <span key={index} />)}
        </div>
        <AnimatePresence initial={false}>
          {state.board.map((cell, index) => {
            if (!cell) return null
            const row = Math.floor(index / MATCH3_SIZE)
            const col = index % MATCH3_SIZE
            const hinted = visibleHint?.includes(index) ?? false
            const clearing = clearingIndices.has(index)
            const moveDuration = visual?.phase === 'shuffle' ? 0.26 : visual?.phase === 'fall' ? 0.22 : 0.16
            return (
              <motion.button
                key={cell.id}
                role="gridcell"
                type="button"
                initial={{ x: `${col * 100}%`, y: '-100%', scale: 0.72, opacity: 0 }}
                animate={{
                  x: `${col * 100}%`,
                  y: `${row * 100}%`,
                  scale: selected === index ? 1.12 : 1,
                  opacity: 1,
                  rotate: 0,
                }}
                exit={{ scale: 0.12, opacity: 0, rotate: 24 }}
                transition={clearing
                  ? { duration: 0.15, ease: 'easeOut' }
                  : {
                      x: { duration: moveDuration, ease: [0.2, 0.86, 0.25, 1] },
                      y: { duration: moveDuration, ease: [0.2, 0.86, 0.25, 1] },
                      scale: { duration: 0.13, ease: 'easeOut' },
                      opacity: { duration: 0.1 },
                      rotate: { duration: 0.14 },
                    }}
                whileTap={disabled ? undefined : { scale: 0.88 }}
                onPointerDown={(event) => pointerDown(event, index)}
                onPointerUp={(event) => pointerUp(event, index)}
                onPointerCancel={() => {
                  pointerRef.current = null
                }}
                disabled={disabled}
                className={cn(
                  'match3-piece-button',
                  selected === index && 'match3-piece-selected',
                  hinted && 'match3-piece-hint',
                  clearing && 'match3-piece-clearing',
                )}
                style={{ touchAction: 'none' }}
                aria-label={`${SWEET_NAMES[cell.type] ?? 'حلوى'}${cell.special !== 'none' ? ' مميزة' : ''}، الصف ${row + 1} العمود ${col + 1}`}
              >
                <CandyPiece cell={cell} />
              </motion.button>
            )
          })}
        </AnimatePresence>

        <AnimatePresence>
          {visual?.phase === 'burst' && visual.indices.map((index) => {
            const row = Math.floor(index / MATCH3_SIZE)
            const col = index % MATCH3_SIZE
            return (
              <motion.span
                key={`${visual.key}-${index}`}
                className="match3-burst"
                style={{ left: `${col * 12.5}%`, top: `${row * 12.5}%` }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1.08, 1.32] }}
                transition={{ duration: 0.34, ease: 'easeOut' }}
                aria-hidden="true"
              >
                <span className="match3-burst-flash" />
                <span className="match3-burst-ring" />
                {Array.from({ length: 6 }, (_, particle) => (
                  <span
                    key={particle}
                    className={`match3-burst-particle match3-burst-particle-${particle % 4}`}
                    style={{
                      '--particle-angle': `${particle * 60}deg`,
                      '--particle-distance': `${24 + (particle % 3) * 5}px`,
                    } as CSSProperties}
                  />
                ))}
              </motion.span>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

function webGlAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function Match3Board(props: Match3BoardProps) {
  const [gpuFailed, setGpuFailed] = useState(false)
  const [useGpu] = useState(webGlAvailable)
  const handleRendererError = useCallback(() => setGpuFailed(true), [])
  if (useGpu && !gpuFailed) {
    return <PixiMatch3Board {...props} onRendererError={handleRendererError} />
  }
  return <DomMatch3Board {...props} />
}

export default memo(Match3Board)
