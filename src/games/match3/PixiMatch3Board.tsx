import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Application, Container, Graphics } from 'pixi.js'
import { cn } from '@/lib/utils'
import { findMatch3Move, MATCH3_SIZE, type Match3Cell, type Match3State } from './engine.js'
import type { Match3VisualEffect } from './useMatch3Animator'

interface PixiMatch3BoardProps {
  state: Match3State
  disabled?: boolean
  onSwap: (first: number, second: number) => void
  celebration?: boolean
  visual?: Match3VisualEffect | null
  onRendererError?: () => void
}

interface PointerStart {
  index: number
  x: number
  y: number
}

interface CandyView {
  root: Container
  signature: string
  targetX: number
  targetY: number
  fromX: number
  fromY: number
  moveStartedAt: number
  moveDuration: number
  removalStartedAt: number | null
  clearingUntil: number
}

interface BurstParticle {
  graphic: Graphics
  x: number
  y: number
  velocityX: number
  velocityY: number
  rotationSpeed: number
  bornAt: number
  lifetime: number
}

const CANDY_COLORS = [0xff5f91, 0xff963c, 0x8ccd4e, 0x9c6cf1, 0x42d9b0, 0xffd34f]
const CANDY_DARK = [0xa72865, 0xb94a2b, 0x427c38, 0x56349c, 0x168b77, 0xc18b19]
const PARTICLE_COLORS = [0xfff2a6, 0xff74ad, 0x72ead3, 0xc99aff]
const MOVE_DURATION: Record<Match3VisualEffect['phase'], number> = {
  swap: 165,
  clear: 145,
  burst: 190,
  fall: 225,
  shuffle: 270,
}

function easeOutCubic(value: number): number {
  return 1 - ((1 - value) ** 3)
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

function candySignature(cell: Match3Cell): string {
  return `${cell.type}:${cell.special}`
}

function starPoints(outerRadius: number, innerRadius: number, count = 6): number[] {
  const points: number[] = []
  for (let index = 0; index < count * 2; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI) / count
    const radius = index % 2 === 0 ? outerRadius : innerRadius
    points.push(Math.cos(angle) * radius, Math.sin(angle) * radius)
  }
  return points
}

function createCandyGraphic(cell: Match3Cell): Container {
  const root = new Container()
  const shadow = new Graphics()
    .ellipse(0, 11, 35, 29)
    .fill({ color: 0x09041b, alpha: 0.34 })
  root.addChild(shadow)

  const type = Math.max(0, cell.type)
  const color = CANDY_COLORS[type] ?? 0xff5f91
  const dark = CANDY_DARK[type] ?? 0xa72865
  const body = new Graphics()

  if (type === 0) {
    body.roundRect(-32, -34, 64, 68, 24)
  } else if (type === 1) {
    body.circle(0, 0, 34)
  } else if (type === 2) {
    body.poly([0, -36, 32, 24, 0, 35, -32, 24])
  } else if (type === 3) {
    body.ellipse(0, 0, 34, 29)
  } else if (type === 4) {
    body.roundRect(-36, -25, 72, 50, 25)
  } else {
    body.poly(starPoints(36, 25, 7))
  }
  body.fill({ color })
  body.stroke({ color: dark, width: 4, alpha: 0.78 })
  root.addChild(body)

  const lowerShade = new Graphics()
    .ellipse(3, 11, 25, 15)
    .fill({ color: dark, alpha: 0.18 })
  root.addChild(lowerShade)

  const shine = new Graphics()
    .ellipse(-10, -13, 13, 8)
    .fill({ color: 0xffffff, alpha: 0.68 })
  shine.rotation = -0.35
  root.addChild(shine)

  if (cell.special === 'row' || cell.special === 'col') {
    const stripes = new Graphics()
    for (const offset of [-12, 0, 12]) {
      if (cell.special === 'row') {
        stripes.moveTo(-25, offset).lineTo(25, offset)
      } else {
        stripes.moveTo(offset, -25).lineTo(offset, 25)
      }
    }
    stripes.stroke({ color: 0xffffff, width: 5, alpha: 0.76 })
    root.addChild(stripes)
  } else if (cell.special === 'bomb') {
    const bomb = new Graphics()
      .poly(starPoints(22, 10, 8))
      .fill({ color: 0x2b153d, alpha: 0.9 })
      .stroke({ color: 0xffec9a, width: 3, alpha: 0.9 })
    root.addChild(bomb)
  } else if (cell.special === 'rainbow') {
    body.clear().circle(0, 0, 35).fill({ color: 0x3a245f }).stroke({ color: 0xffffff, width: 3, alpha: 0.78 })
    const rainbow = new Graphics()
    for (let ring = 0; ring < 6; ring += 1) {
      rainbow.circle(0, 0, 29 - ring * 4.2).stroke({
        color: CANDY_COLORS[ring],
        width: 4.5,
        alpha: 0.96,
      })
    }
    root.addChild(rainbow)
    shine.alpha = 0.52
  }

  return root
}

function drawBoardBackground(graphics: Graphics, size: number): void {
  const cellSize = size / MATCH3_SIZE
  graphics.clear()
  graphics.roundRect(0, 0, size, size, Math.max(18, cellSize * 0.42))
    .fill({ color: 0x171033, alpha: 1 })
  graphics.circle(size * 0.28, size * 0.18, size * 0.42)
    .fill({ color: 0x674b99, alpha: 0.28 })
  for (let row = 0; row < MATCH3_SIZE; row += 1) {
    for (let col = 0; col < MATCH3_SIZE; col += 1) {
      const inset = Math.max(2, cellSize * 0.045)
      graphics
        .roundRect(
          col * cellSize + inset,
          row * cellSize + inset,
          cellSize - inset * 2,
          cellSize - inset * 2,
          Math.max(6, cellSize * 0.2),
        )
        .fill({ color: 0xffffff, alpha: 0.035 })
        .stroke({ color: 0xffffff, width: 1, alpha: 0.055 })
    }
  }
}

export default function PixiMatch3Board({
  state,
  disabled = false,
  onSwap,
  celebration = false,
  visual = null,
  onRendererError,
}: PixiMatch3BoardProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const candyLayerRef = useRef<Container | null>(null)
  const effectLayerRef = useRef<Container | null>(null)
  const backgroundRef = useRef<Graphics | null>(null)
  const viewsRef = useRef(new Map<number, CandyView>())
  const cellIndexRef = useRef(new Map<number, number>())
  const particlesRef = useRef<BurstParticle[]>([])
  const boardSizeRef = useRef(0)
  const latestStateRef = useRef(state)
  const latestVisualRef = useRef(visual)
  const lastBurstKeyRef = useRef(-1)
  const selectedRef = useRef<number | null>(null)
  const hintedRef = useRef<Set<number>>(new Set())
  const pointerRef = useRef<PointerStart | null>(null)
  const [selection, setSelection] = useState<{ index: number; boardKey: string } | null>(null)
  const [hint, setHint] = useState<{ pair: [number, number]; boardKey: string } | null>(null)
  const [interaction, setInteraction] = useState(0)
  const boardKey = useMemo(() => state.board.map((cell) => cell?.id ?? 0).join(','), [state.board])
  const selected = selection?.boardKey === boardKey ? selection.index : null
  const visibleHint = hint?.boardKey === boardKey ? hint.pair : null

  const emitBurst = useCallback((index: number, now: number) => {
    const effectLayer = effectLayerRef.current
    const size = boardSizeRef.current
    if (!effectLayer || size <= 0) return
    const cellSize = size / MATCH3_SIZE
    const row = Math.floor(index / MATCH3_SIZE)
    const col = index % MATCH3_SIZE
    const originX = (col + 0.5) * cellSize
    const originY = (row + 0.5) * cellSize

    const ring = new Graphics()
      .circle(0, 0, cellSize * 0.18)
      .stroke({ color: 0xfff2a6, width: Math.max(2, cellSize * 0.055), alpha: 0.92 })
    ring.position.set(originX, originY)
    effectLayer.addChild(ring)
    particlesRef.current.push({
      graphic: ring,
      x: originX,
      y: originY,
      velocityX: 0,
      velocityY: 0,
      rotationSpeed: 0,
      bornAt: now,
      lifetime: 340,
    })

    for (let particleIndex = 0; particleIndex < 8; particleIndex += 1) {
      const angle = (particleIndex / 8) * Math.PI * 2 + (index % 3) * 0.15
      const speed = cellSize * (0.105 + (particleIndex % 3) * 0.018)
      const particle = new Graphics()
        .poly(starPoints(Math.max(3, cellSize * 0.07), Math.max(1.6, cellSize * 0.032), 4))
        .fill({ color: PARTICLE_COLORS[particleIndex % PARTICLE_COLORS.length], alpha: 1 })
      particle.position.set(originX, originY)
      effectLayer.addChild(particle)
      particlesRef.current.push({
        graphic: particle,
        x: originX,
        y: originY,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        rotationSpeed: particleIndex % 2 === 0 ? 0.11 : -0.11,
        bornAt: now,
        lifetime: 360 + (particleIndex % 3) * 35,
      })
    }
  }, [])

  const syncScene = useCallback(() => {
    const candyLayer = candyLayerRef.current
    const size = boardSizeRef.current
    if (!candyLayer || size <= 0) return
    const now = performance.now()
    const cellSize = size / MATCH3_SIZE
    const stateNow = latestStateRef.current
    const visualNow = latestVisualRef.current
    const activeIds = new Set<number>()
    const duration = visualNow ? MOVE_DURATION[visualNow.phase] : 180

    stateNow.board.forEach((cell, index) => {
      if (!cell) return
      activeIds.add(cell.id)
      const row = Math.floor(index / MATCH3_SIZE)
      const col = index % MATCH3_SIZE
      const targetX = (col + 0.5) * cellSize
      const targetY = (row + 0.5) * cellSize
      const signature = candySignature(cell)
      let view = viewsRef.current.get(cell.id)

      if (view && view.signature !== signature) {
        const currentX = view.root.x
        const currentY = view.root.y
        view.root.destroy({ children: true })
        viewsRef.current.delete(cell.id)
        const root = createCandyGraphic(cell)
        root.position.set(currentX, currentY)
        root.scale.set(cellSize / 100)
        candyLayer.addChild(root)
        view = {
          root,
          signature,
          targetX,
          targetY,
          fromX: currentX,
          fromY: currentY,
          moveStartedAt: now,
          moveDuration: duration,
          removalStartedAt: null,
          clearingUntil: 0,
        }
        viewsRef.current.set(cell.id, view)
      }

      if (!view) {
        const root = createCandyGraphic(cell)
        root.position.set(targetX, targetY - cellSize * Math.max(1.2, row + 1))
        root.scale.set(cellSize / 100)
        root.alpha = 0
        candyLayer.addChild(root)
        view = {
          root,
          signature,
          targetX,
          targetY,
          fromX: root.x,
          fromY: root.y,
          moveStartedAt: now,
          moveDuration: Math.max(210, duration),
          removalStartedAt: null,
          clearingUntil: 0,
        }
        viewsRef.current.set(cell.id, view)
      } else if (Math.abs(view.targetX - targetX) > 0.1 || Math.abs(view.targetY - targetY) > 0.1) {
        view.fromX = view.root.x
        view.fromY = view.root.y
        view.targetX = targetX
        view.targetY = targetY
        view.moveStartedAt = now
        view.moveDuration = duration
      }

      view.removalStartedAt = null
      if (visualNow?.phase === 'clear' && visualNow.indices.includes(index)) {
        view.clearingUntil = now + 180
      }
    })

    for (const [id, view] of viewsRef.current) {
      if (!activeIds.has(id) && view.removalStartedAt === null) view.removalStartedAt = now
    }

    if (visualNow?.phase === 'burst' && visualNow.key !== lastBurstKeyRef.current) {
      lastBurstKeyRef.current = visualNow.key
      for (const index of visualNow.indices) emitBurst(index, now)
    }
  }, [emitBurst])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const candyViews = viewsRef.current
    let cancelled = false
    let resizeObserver: ResizeObserver | null = null

    const start = async () => {
      try {
        const app = new Application()
        await app.init({
          antialias: true,
          autoDensity: true,
          backgroundAlpha: 0,
          preference: 'webgl',
          powerPreference: 'high-performance',
          resolution: Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2),
          resizeTo: host,
        })
        if (cancelled) {
          app.destroy(true)
          return
        }

        app.canvas.className = 'match3-pixi-canvas'
        app.canvas.setAttribute('aria-hidden', 'true')
        host.prepend(app.canvas)
        appRef.current = app

        const background = new Graphics()
        const candyLayer = new Container()
        const effectLayer = new Container()
        app.stage.addChild(background, candyLayer, effectLayer)
        backgroundRef.current = background
        candyLayerRef.current = candyLayer
        effectLayerRef.current = effectLayer

        const resize = () => {
          const size = Math.min(host.clientWidth, host.clientHeight)
          if (size <= 0 || Math.abs(size - boardSizeRef.current) < 0.5) return
          boardSizeRef.current = size
          drawBoardBackground(background, size)
          const cellSize = size / MATCH3_SIZE
          for (const view of viewsRef.current.values()) {
            view.root.scale.set(cellSize / 100)
          }
          syncScene()
        }
        resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(host)
        resize()
        syncScene()

        app.ticker.add(() => {
          const now = performance.now()
          const selectedIndex = selectedRef.current
          const hinted = hintedRef.current

          for (const [id, view] of viewsRef.current) {
            if (view.removalStartedAt !== null) {
              const progress = Math.min(1, (now - view.removalStartedAt) / 180)
              view.root.alpha = 1 - progress
              view.root.scale.set((boardSizeRef.current / MATCH3_SIZE / 100) * (1 - progress * 0.72))
              view.root.rotation = progress * 0.42
              if (progress >= 1) {
                view.root.destroy({ children: true })
                viewsRef.current.delete(id)
              }
              continue
            }

            const moveProgress = Math.min(1, Math.max(0, (now - view.moveStartedAt) / Math.max(1, view.moveDuration)))
            const eased = easeOutCubic(moveProgress)
            view.root.position.set(
              view.fromX + (view.targetX - view.fromX) * eased,
              view.fromY + (view.targetY - view.fromY) * eased,
            )
            view.root.alpha = Math.min(1, moveProgress * 2.8)
            view.root.rotation *= 0.82

            const stateIndex = cellIndexRef.current.get(id) ?? -1
            const isSelected = stateIndex === selectedIndex
            const isHinted = hinted.has(stateIndex)
            const isClearing = now < view.clearingUntil
            const pulse = isHinted ? 1 + Math.sin(now / 115) * 0.055 : 1
            const selectedScale = isSelected ? 1.11 : 1
            const clearScale = isClearing ? 1 + Math.sin(now / 34) * 0.11 : 1
            const baseScale = boardSizeRef.current / MATCH3_SIZE / 100
            view.root.scale.set(baseScale * pulse * selectedScale * clearScale)
          }

          const nextParticles: BurstParticle[] = []
          for (const particle of particlesRef.current) {
            const age = now - particle.bornAt
            const progress = Math.min(1, age / particle.lifetime)
            if (progress >= 1) {
              particle.graphic.destroy()
              continue
            }
            if (particle.velocityX === 0 && particle.velocityY === 0) {
              const scale = 1 + progress * 1.7
              particle.graphic.scale.set(scale)
            } else {
              particle.x += particle.velocityX
              particle.y += particle.velocityY
              particle.velocityX *= 0.91
              particle.velocityY = particle.velocityY * 0.91 + 0.14
              particle.graphic.position.set(particle.x, particle.y)
              particle.graphic.rotation += particle.rotationSpeed
            }
            particle.graphic.alpha = 1 - progress
            nextParticles.push(particle)
          }
          particlesRef.current = nextParticles
        })
      } catch {
        onRendererError?.()
      }
    }

    void start()
    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      particlesRef.current = []
      candyViews.clear()
      candyLayerRef.current = null
      effectLayerRef.current = null
      backgroundRef.current = null
      const app = appRef.current
      appRef.current = null
      if (app) app.destroy(true)
    }
  }, [onRendererError, syncScene])

  useEffect(() => {
    selectedRef.current = selected
    hintedRef.current = new Set(visibleHint ?? [])
    latestStateRef.current = state
    latestVisualRef.current = visual
    cellIndexRef.current = new Map(
      state.board.flatMap((cell, index) => (cell ? [[cell.id, index] as const] : [])),
    )
    syncScene()
  }, [selected, state, syncScene, visibleHint, visual])

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

  const pointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = pointerRef.current
    pointerRef.current = null
    if (!start || disabled) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (Math.hypot(dx, dy) >= 14) {
      const target = swipeTarget(start.index, dx, dy)
      if (target !== null) attempt(start.index, target)
    } else {
      tap(start.index)
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
      <div ref={hostRef} className="match3-board match3-pixi-surface">
        <div className="match3-pixi-input" role="grid" aria-label="لوحة الحلوى ٨ في ٨">
          {state.board.map((cell, index) => {
            const row = Math.floor(index / MATCH3_SIZE)
            const col = index % MATCH3_SIZE
            return (
              <button
                key={index}
                role="gridcell"
                type="button"
                disabled={disabled || !cell}
                aria-label={`حلوى، الصف ${row + 1} العمود ${col + 1}`}
                aria-selected={selected === index}
                onPointerDown={(event) => pointerDown(event, index)}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  pointerRef.current = null
                }}
                onClick={(event) => {
                  if (event.detail === 0) tap(index)
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
