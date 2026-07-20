import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pause, Play } from 'lucide-react'
import type { GameProps } from '@/games'
import type { Difficulty } from '@/types'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const BOARD_SIZE = 16
const BOARD_CELLS = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => index)

type Direction = 'up' | 'down' | 'left' | 'right'
type Status = 'running' | 'paused' | 'over'

interface Point {
  x: number
  y: number
}

const MOVEMENT: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
}

const SPEED: Record<Difficulty, number> = {
  easy: 175,
  medium: 125,
  hard: 85,
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'سهل',
  medium: 'متوسط',
  hard: 'صعب',
}

function initialSnake(): Point[] {
  return [
    { x: 8, y: 8 },
    { x: 7, y: 8 },
    { x: 6, y: 8 },
  ]
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

function createFood(snake: Point[]): Point {
  const free: Point[] = []
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const point = { x, y }
      if (!snake.some((part) => samePoint(part, point))) free.push(point)
    }
  }
  return free[Math.floor(Math.random() * free.length)] ?? { x: 2, y: 2 }
}

export default function SnakeGame({ config, onFinish }: GameProps) {
  const [snake, setSnake] = useState<Point[]>(initialSnake)
  const [food, setFood] = useState<Point>({ x: 12, y: 8 })
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<Status>('running')
  const snakeRef = useRef(snake)
  const foodRef = useRef(food)
  const directionRef = useRef<Direction>('right')
  const queuedDirectionRef = useRef<Direction>('right')
  const finishedRef = useRef(false)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerStartRef = useRef<Point | null>(null)

  const changeDirection = useCallback((next: Direction) => {
    if (status === 'over' || OPPOSITE[directionRef.current] === next) return
    queuedDirectionRef.current = next
  }, [status])

  const finishGame = useCallback((finalScore: number) => {
    if (finishedRef.current) return
    finishedRef.current = true
    setStatus('over')
    sounds.lose()
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'snake',
        outcome: finalScore >= 8 ? 'win' : 'loss',
        score: finalScore,
        bestCandidate: finalScore,
        coinsEarned: Math.min(60, 5 + finalScore * 3),
        xpEarned: Math.min(80, 15 + finalScore * 3),
        summary: `جمعت ${finalScore} تفاحة ووصل طول الثعبان إلى ${finalScore + 3} 🐍`,
        detail: finalScore >= 8 ? 'شغل ممتاز! جرّب مستوى أسرع وسجّل رقمًا جديدًا.' : 'ركّز على المساحة أمامك وغيّر الاتجاه بدري.',
      })
    }, 850)
  }, [onFinish])

  const move = useCallback(() => {
    const current = snakeRef.current
    const direction = queuedDirectionRef.current
    directionRef.current = direction
    const delta = MOVEMENT[direction]
    const head = current[0]
    if (!head) return

    const nextHead = { x: head.x + delta.x, y: head.y + delta.y }
    const ateFood = samePoint(nextHead, foodRef.current)
    const bodyToCheck = ateFood ? current : current.slice(0, -1)
    const hitWall = nextHead.x < 0 || nextHead.x >= BOARD_SIZE || nextHead.y < 0 || nextHead.y >= BOARD_SIZE
    const hitBody = bodyToCheck.some((part) => samePoint(part, nextHead))

    if (hitWall || hitBody) {
      finishGame(current.length - 3)
      return
    }

    const nextSnake = ateFood ? [nextHead, ...current] : [nextHead, ...current.slice(0, -1)]
    snakeRef.current = nextSnake
    setSnake(nextSnake)

    if (ateFood) {
      const nextScore = nextSnake.length - 3
      const nextFood = createFood(nextSnake)
      foodRef.current = nextFood
      setFood(nextFood)
      setScore(nextScore)
      sounds.correct()
    }
  }, [finishGame])

  useEffect(() => {
    if (status !== 'running') return
    const timer = setInterval(move, SPEED[config.difficulty])
    return () => clearInterval(timer)
  }, [config.difficulty, move, status])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Partial<Record<string, Direction>> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }
      const direction = directions[event.key]
      if (!direction) return
      event.preventDefault()
      changeDirection(direction)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [changeDirection])

  useEffect(() => () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
  }, [])

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
    changeDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
  }

  const snakeKeys = new Set(snake.map((part) => `${part.x}-${part.y}`))
  const headKey = snake[0] ? `${snake[0].x}-${snake[0].y}` : ''
  const foodKey = `${food.x}-${food.y}`

  return (
    <div className="flex flex-col items-center gap-3 py-2 select-none">
      <div className="w-full flex items-center justify-between gap-2">
        <div className="glass rounded-2xl px-3.5 py-2 text-center">
          <p className="text-[10px] text-muted-foreground">النقاط</p>
          <p className="font-black tabular-nums text-emerald-300">{score}</p>
        </div>
        <div className="text-center">
          <p className="font-black">الثعبان 🐍</p>
          <p className="text-[11px] text-muted-foreground">المستوى: {DIFFICULTY_LABEL[config.difficulty]}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            sounds.click()
            setStatus((current) => current === 'running' ? 'paused' : current === 'paused' ? 'running' : current)
          }}
          disabled={status === 'over'}
          className="glass rounded-2xl min-w-14 min-h-12 flex flex-col items-center justify-center disabled:opacity-50"
          aria-label={status === 'paused' ? 'استكمال اللعبة' : 'إيقاف اللعبة مؤقتًا'}
        >
          {status === 'paused' ? <Play className="w-4 h-4 text-emerald-300" /> : <Pause className="w-4 h-4 text-amber-300" />}
          <span className="text-[9px] mt-0.5">{status === 'paused' ? 'كمّل' : 'إيقاف'}</span>
        </button>
      </div>

      <div
        className="relative w-full max-w-[360px] aspect-square grid gap-px rounded-3xl overflow-hidden border-2 border-emerald-400/35 bg-emerald-950/70 p-1 shadow-[0_0_35px_rgba(16,185,129,0.14)]"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))`, touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartRef.current = null }}
        aria-label="لوحة لعبة الثعبان"
      >
        {BOARD_CELLS.map((index) => {
          const x = index % BOARD_SIZE
          const y = Math.floor(index / BOARD_SIZE)
          const key = `${x}-${y}`
          const isSnake = snakeKeys.has(key)
          const isHead = key === headKey
          const isFood = key === foodKey
          return (
            <div
              key={index}
              className={cn(
                'aspect-square rounded-[28%] flex items-center justify-center text-[11px] leading-none',
                isSnake && 'bg-gradient-to-br from-emerald-300 to-emerald-600 shadow-sm',
                isHead && 'bg-gradient-to-br from-lime-200 to-emerald-500 ring-1 ring-lime-100/70',
                !isSnake && !isFood && (x + y) % 2 === 0 && 'bg-white/[0.025]',
              )}
            >
              {isHead ? '🐍' : isFood ? '🍎' : null}
            </div>
          )
        })}

        {status === 'paused' && (
          <button
            type="button"
            onClick={() => setStatus('running')}
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex flex-col items-center justify-center gap-2"
          >
            <Play className="w-10 h-10 text-emerald-300 fill-emerald-300" />
            <span className="font-black text-lg">اضغط للتكملة</span>
          </button>
        )}
        {status === 'over' && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center">
            <span className="text-4xl">💥</span>
            <span className="font-black text-lg mt-2">انتهت اللعبة</span>
            <span className="text-sm text-slate-300">نتيجتك: {score}</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">اسحب على اللوحة أو استخدم الأسهم</p>
      <div className="grid grid-cols-3 gap-2 w-44" dir="ltr">
        <span />
        <DirectionButton label="أعلى" onClick={() => changeDirection('up')}><ChevronUp /></DirectionButton>
        <span />
        <DirectionButton label="يسار" onClick={() => changeDirection('left')}><ChevronLeft /></DirectionButton>
        <DirectionButton label="أسفل" onClick={() => changeDirection('down')}><ChevronDown /></DirectionButton>
        <DirectionButton label="يمين" onClick={() => changeDirection('right')}><ChevronRight /></DirectionButton>
      </div>
    </div>
  )
}

function DirectionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => {
        sounds.click()
        onClick()
      }}
      className="aspect-square rounded-2xl glass flex items-center justify-center text-emerald-200 active:bg-emerald-500/25 [&>svg]:w-6 [&>svg]:h-6"
      aria-label={label}
    >
      {children}
    </button>
  )
}
