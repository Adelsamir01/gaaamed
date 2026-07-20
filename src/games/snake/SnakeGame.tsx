import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronRight, Pause, Play } from 'lucide-react'
import type { GameProps } from '@/games'
import type { Difficulty } from '@/types'
import { sounds } from '@/lib/sounds'

type Status = 'running' | 'paused' | 'over'

interface Point {
  x: number
  y: number
}

interface WorldSize {
  width: number
  height: number
}

interface FoodOrb extends Point {
  id: number
  hue: number
  radius: number
}

interface PointerState {
  active: boolean
  origin: Point
  current: Point
}

const SPEED: Record<Difficulty, number> = {
  easy: 54,
  medium: 68,
  hard: 86,
}

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'سهل وهادي',
  medium: 'متوسط',
  hard: 'سريع',
}

const FOOD_HUES = [38, 52, 94, 162, 188, 280, 332]
const FOOD_COUNT = 20
const BODY_WIDTH = 17
const HEAD_RADIUS = 11
const START_LENGTH = 112
const GROWTH_PER_ORB = 20
const TURN_RATE = 8.5

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function angleDifference(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function trimTrail(points: Point[], maxLength: number): Point[] {
  if (points.length < 2) return points
  const trimmed: Point[] = [points[0]]
  let travelled = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const segmentLength = distance(previous, current)
    if (travelled + segmentLength >= maxLength) {
      const remaining = maxLength - travelled
      const ratio = segmentLength > 0 ? remaining / segmentLength : 0
      trimmed.push({
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      })
      break
    }
    travelled += segmentLength
    trimmed.push(current)
  }

  return trimmed
}

function createFood(center: Point, viewport: WorldSize, snake: Point[], existing: FoodOrb[], id: number): FoodOrb {
  const minimumRadius = 70
  const maximumRadius = Math.max(viewport.width, viewport.height) * 0.78
  let point: Point = { x: center.x, y: center.y - minimumRadius }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = minimumRadius + Math.random() * Math.max(1, maximumRadius - minimumRadius)
    point = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }
    const awayFromSnake = snake.every((part) => distance(part, point) > 34)
    const awayFromFood = existing.every((orb) => distance(orb, point) > 38)
    if (awayFromSnake && awayFromFood) break
  }

  return {
    id,
    ...point,
    hue: FOOD_HUES[id % FOOD_HUES.length],
    radius: 6 + (id % 3),
  }
}

function initialTrail(): Point[] {
  const head = { x: 0, y: 0 }
  return Array.from({ length: Math.ceil(START_LENGTH / 4) + 1 }, (_, index) => ({
    x: head.x - index * 4,
    y: head.y,
  }))
}

export default function SnakeGame({ config, onFinish, onExit }: GameProps) {
  const [score, setScore] = useState(0)
  const [status, setStatus] = useState<Status>('running')
  const [hasSteered, setHasSteered] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<WorldSize>({ width: 0, height: 0 })
  const cameraRef = useRef<Point>({ x: 0, y: 0 })
  const pixelRatioRef = useRef(1)
  const snakeRef = useRef<Point[]>([])
  const foodRef = useRef<FoodOrb[]>([])
  const scoreRef = useRef(0)
  const bodyLengthRef = useRef(START_LENGTH)
  const angleRef = useRef(0)
  const targetAngleRef = useRef(0)
  const statusRef = useRef<Status>('running')
  const initializedRef = useRef(false)
  const lastFrameRef = useRef(0)
  const foodIdRef = useRef(FOOD_COUNT)
  const finishedRef = useRef(false)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointerRef = useRef<PointerState>({
    active: false,
    origin: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
  })

  const finishGame = useCallback((finalScore: number) => {
    if (finishedRef.current) return
    finishedRef.current = true
    statusRef.current = 'over'
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
        summary: `جمعت ${finalScore} كرة ووصل طول الثعبان إلى ${finalScore + 3} 🐍`,
        detail: finalScore >= 8
          ? 'تحكم ممتاز! جرّب مستوى أسرع وسجّل رقمًا جديدًا.'
          : 'اسحب بإصبعك باستمرار وخد اللفة بهدوء من غير ما تلف على جسمك.',
      })
    }, 900)
  }, [onFinish])

  const renderScene = useCallback(() => {
    const canvas = canvasRef.current
    const world = worldRef.current
    if (!canvas || world.width <= 0 || world.height <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return

    const ratio = pixelRatioRef.current
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, world.width, world.height)

    const background = context.createLinearGradient(0, 0, 0, world.height)
    background.addColorStop(0, '#06372f')
    background.addColorStop(0.55, '#052a25')
    background.addColorStop(1, '#041f1d')
    context.fillStyle = background
    context.fillRect(0, 0, world.width, world.height)

    const camera = cameraRef.current
    const dotSpacing = 38
    const dotOffsetX = ((world.width / 2 - camera.x) % dotSpacing + dotSpacing) % dotSpacing
    const dotOffsetY = ((world.height / 2 - camera.y) % dotSpacing + dotSpacing) % dotSpacing
    context.fillStyle = 'rgba(167, 243, 208, 0.065)'
    for (let x = dotOffsetX; x < world.width; x += dotSpacing) {
      for (let y = dotOffsetY; y < world.height; y += dotSpacing) {
        context.beginPath()
        context.arc(x, y, 1.3, 0, Math.PI * 2)
        context.fill()
      }
    }

    context.save()
    context.translate(world.width / 2 - camera.x, world.height / 2 - camera.y)

    for (const orb of foodRef.current) {
      context.save()
      context.shadowColor = `hsla(${orb.hue}, 95%, 62%, 0.95)`
      context.shadowBlur = 15
      const glow = context.createRadialGradient(
        orb.x - orb.radius * 0.35,
        orb.y - orb.radius * 0.35,
        1,
        orb.x,
        orb.y,
        orb.radius,
      )
      glow.addColorStop(0, 'rgba(255,255,255,0.98)')
      glow.addColorStop(0.28, `hsl(${orb.hue}, 96%, 68%)`)
      glow.addColorStop(1, `hsl(${orb.hue}, 90%, 46%)`)
      context.fillStyle = glow
      context.beginPath()
      context.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }

    const snake = snakeRef.current
    const head = snake[0]
    if (head && snake.length > 1) {
      const bodyGradient = context.createLinearGradient(0, 0, world.width, world.height)
      bodyGradient.addColorStop(0, '#2dd4bf')
      bodyGradient.addColorStop(0.55, '#34d399')
      bodyGradient.addColorStop(1, '#a3e635')

      context.save()
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      context.moveTo(snake[0].x, snake[0].y)
      for (let index = 1; index < snake.length; index += 1) {
        context.lineTo(snake[index].x, snake[index].y)
      }
      context.strokeStyle = 'rgba(1, 14, 13, 0.72)'
      context.lineWidth = BODY_WIDTH + 7
      context.stroke()
      context.shadowColor = 'rgba(52, 211, 153, 0.48)'
      context.shadowBlur = 13
      context.strokeStyle = bodyGradient
      context.lineWidth = BODY_WIDTH
      context.stroke()
      context.shadowBlur = 0
      context.strokeStyle = 'rgba(236, 253, 245, 0.32)'
      context.lineWidth = 3
      context.stroke()
      context.restore()

      context.save()
      context.shadowColor = 'rgba(163, 230, 53, 0.6)'
      context.shadowBlur = 12
      context.fillStyle = '#84cc16'
      context.beginPath()
      context.arc(head.x, head.y, HEAD_RADIUS, 0, Math.PI * 2)
      context.fill()
      context.shadowBlur = 0

      const forward = { x: Math.cos(angleRef.current), y: Math.sin(angleRef.current) }
      const side = { x: -forward.y, y: forward.x }
      for (const direction of [-1, 1]) {
        const eye = {
          x: head.x + forward.x * 4.5 + side.x * direction * 4.6,
          y: head.y + forward.y * 4.5 + side.y * direction * 4.6,
        }
        context.fillStyle = '#f8fafc'
        context.beginPath()
        context.arc(eye.x, eye.y, 2.8, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#07150f'
        context.beginPath()
        context.arc(eye.x + forward.x, eye.y + forward.y, 1.35, 0, Math.PI * 2)
        context.fill()
      }
      context.restore()
    }
    context.restore()

    const pointer = pointerRef.current
    if (pointer.active) {
      const dx = pointer.current.x - pointer.origin.x
      const dy = pointer.current.y - pointer.origin.y
      const length = Math.hypot(dx, dy)
      const scale = length > 38 ? 38 / length : 1
      const handle = { x: pointer.origin.x + dx * scale, y: pointer.origin.y + dy * scale }

      context.save()
      context.fillStyle = 'rgba(2, 20, 18, 0.52)'
      context.strokeStyle = 'rgba(167, 243, 208, 0.46)'
      context.lineWidth = 2
      context.beginPath()
      context.arc(pointer.origin.x, pointer.origin.y, 44, 0, Math.PI * 2)
      context.fill()
      context.stroke()
      context.fillStyle = 'rgba(52, 211, 153, 0.75)'
      context.beginPath()
      context.arc(handle.x, handle.y, 19, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
  }, [])

  const updateWorld = useCallback((timestamp: number) => {
    const previous = lastFrameRef.current || timestamp
    const elapsed = Math.min(0.04, (timestamp - previous) / 1000)
    lastFrameRef.current = timestamp
    if (statusRef.current !== 'running' || !initializedRef.current || elapsed <= 0) return

    const snake = snakeRef.current
    const head = snake[0]
    const world = worldRef.current
    if (!head) return

    const turn = clamp(angleDifference(angleRef.current, targetAngleRef.current), -TURN_RATE * elapsed, TURN_RATE * elapsed)
    angleRef.current += turn
    const travel = SPEED[config.difficulty] * elapsed
    const nextHead = {
      x: head.x + Math.cos(angleRef.current) * travel,
      y: head.y + Math.sin(angleRef.current) * travel,
    }

    let hitBody = false
    let bodyDistance = 0
    for (let index = 1; index < snake.length; index += 1) {
      bodyDistance += distance(snake[index - 1], snake[index])
      if (bodyDistance < 52 || index % 3 !== 0) continue
      if (distance(nextHead, snake[index]) < BODY_WIDTH * 0.72) {
        hitBody = true
        break
      }
    }

    if (hitBody) {
      finishGame(scoreRef.current)
      return
    }

    const nextSnake = trimTrail([nextHead, ...snake], bodyLengthRef.current)
    snakeRef.current = nextSnake

    const cameraCatchUp = Math.min(1, elapsed * 4.5)
    cameraRef.current = {
      x: cameraRef.current.x + (nextHead.x - cameraRef.current.x) * cameraCatchUp,
      y: cameraRef.current.y + (nextHead.y - cameraRef.current.y) * cameraCatchUp,
    }

    const recycleDistance = Math.max(world.width, world.height) * 0.95
    const recycledFood: FoodOrb[] = []
    for (const orb of foodRef.current) {
      if (distance(nextHead, orb) <= recycleDistance) {
        recycledFood.push(orb)
        continue
      }
      const id = foodIdRef.current
      foodIdRef.current += 1
      recycledFood.push(createFood(nextHead, world, nextSnake, recycledFood, id))
    }
    foodRef.current = recycledFood

    const eatenIndex = foodRef.current.findIndex((orb) => distance(nextHead, orb) < HEAD_RADIUS + orb.radius + 2)
    if (eatenIndex >= 0) {
      scoreRef.current += 1
      bodyLengthRef.current += GROWTH_PER_ORB
      const nextFood = [...foodRef.current]
      const id = foodIdRef.current
      foodIdRef.current += 1
      nextFood[eatenIndex] = createFood(nextHead, world, nextSnake, nextFood.filter((_, index) => index !== eatenIndex), id)
      foodRef.current = nextFood
      setScore(scoreRef.current)
      sounds.correct()
    }
  }, [config.difficulty, finishGame])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const next = { width: rect.width, height: rect.height }
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(next.width * ratio)
      canvas.height = Math.round(next.height * ratio)
      pixelRatioRef.current = ratio

      if (!initializedRef.current) {
        worldRef.current = next
        snakeRef.current = initialTrail()
        const head = snakeRef.current[0]
        cameraRef.current = head
        foodRef.current = []
        for (let id = 0; id < FOOD_COUNT; id += 1) {
          foodRef.current.push(createFood(head, next, snakeRef.current, foodRef.current, id))
        }
        initializedRef.current = true
        lastFrameRef.current = performance.now()
      } else {
        worldRef.current = next
      }
      renderScene()
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [renderScene])

  useEffect(() => {
    let frame = 0
    const loop = (timestamp: number) => {
      updateWorld(timestamp)
      renderScene()
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [renderScene, updateWorld])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const angles: Partial<Record<string, number>> = {
        ArrowRight: 0,
        ArrowDown: Math.PI / 2,
        ArrowLeft: Math.PI,
        ArrowUp: -Math.PI / 2,
      }
      const angle = angles[event.key]
      if (angle == null || statusRef.current === 'over') return
      event.preventDefault()
      targetAngleRef.current = angle
      setHasSteered(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'hidden' || statusRef.current !== 'running') return
      statusRef.current = 'paused'
      setStatus('paused')
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  useEffect(() => () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
  }, [])

  const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (worldRef.current.width / rect.width),
      y: (event.clientY - rect.top) * (worldRef.current.height / rect.height),
    }
  }

  const steerFromPointer = (point: Point) => {
    const pointer = pointerRef.current
    pointer.current = point
    const dx = point.x - pointer.origin.x
    const dy = point.y - pointer.origin.y
    if (Math.hypot(dx, dy) < 5) return
    targetAngleRef.current = Math.atan2(dy, dx)
    setHasSteered(true)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (statusRef.current !== 'running') return
    const point = pointerPosition(event)
    pointerRef.current = { active: true, origin: point, current: point }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointerRef.current.active) return
    steerFromPointer(pointerPosition(event))
    event.preventDefault()
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current.active) steerFromPointer(pointerPosition(event))
    pointerRef.current.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const togglePause = () => {
    sounds.click()
    setStatus((current) => {
      const next = current === 'running' ? 'paused' : current === 'paused' ? 'running' : current
      statusRef.current = next
      lastFrameRef.current = performance.now()
      return next
    })
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden">
      <canvas
        ref={canvasRef}
        role="application"
        tabIndex={0}
        className="absolute inset-0 block h-full w-full cursor-crosshair"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onContextMenu={(event) => event.preventDefault()}
        aria-label="عالم لعبة الثعبان المفتوح — اسحب بإصبعك في الاتجاه المطلوب"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pt-3" dir="rtl">
        <button
          type="button"
          onClick={() => {
            sounds.click()
            onExit?.()
          }}
          className="pointer-events-auto flex min-h-12 items-center gap-1 font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
          aria-label="الخروج من اللعبة"
        >
          <ChevronRight className="h-6 w-6" />
          خروج
        </button>

        <div className="absolute left-1/2 top-1 -translate-x-1/2 text-center drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]">
          <p className="text-[10px] font-extrabold tracking-wide text-emerald-100/80">النقاط</p>
          <p className="text-4xl font-black leading-none tabular-nums text-white">{score}</p>
          <p className="mt-1 whitespace-nowrap text-[9px] font-bold text-emerald-200/80">{DIFFICULTY_LABEL[config.difficulty]}</p>
        </div>

        <button
          type="button"
          onClick={togglePause}
          disabled={status === 'over'}
          className="pointer-events-auto flex h-12 w-12 items-center justify-center text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] disabled:opacity-50"
          aria-label={status === 'paused' ? 'استكمال اللعبة' : 'إيقاف اللعبة مؤقتًا'}
        >
          {status === 'paused'
            ? <Play className="h-7 w-7 fill-white" />
            : <Pause className="h-7 w-7 fill-white" />}
        </button>
      </div>

      {!hasSteered && status === 'running' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[13%] z-10 flex flex-col items-center gap-3 text-center drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-emerald-100/65 text-3xl">☝️</div>
          <p className="px-5 text-sm font-extrabold text-white">
            حط صباعك واسحب — العالم هيتحرك معاك
          </p>
        </div>
      )}

      {status === 'paused' && (
        <button
          type="button"
          onClick={togglePause}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-slate-950/60 backdrop-blur-sm"
        >
          <span className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-emerald-200/60 bg-emerald-500/15">
            <Play className="h-12 w-12 fill-white text-white" />
          </span>
          <span className="text-xl font-black drop-shadow-lg">اضغط عشان تكمّل</span>
        </button>
      )}

      {status === 'over' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/62 backdrop-blur-sm">
          <span className="text-6xl">💥</span>
          <span className="mt-3 text-2xl font-black">لفّيت على نفسك!</span>
          <span className="text-sm font-bold text-emerald-100">نتيجتك: {score}</span>
        </div>
      )}
    </div>
  )
}
