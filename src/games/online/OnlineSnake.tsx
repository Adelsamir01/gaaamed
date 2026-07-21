import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronRight, RefreshCw, Users, WifiOff, Zap } from 'lucide-react'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'

interface Point {
  x: number
  y: number
}

interface ArenaFood extends Point {
  id: number
  hue: number
  radius: number
  value?: number
  source?: 'arena' | 'remains'
}

interface ArenaPlayer {
  id: string
  name: string
  avatar: string
  hue: number
  score: number
  alive: boolean
  boosting: boolean
  angle: number
  trail: Point[]
}

interface ArenaSnapshot {
  players: ArenaPlayer[]
  foods?: ArenaFood[]
  speed: number
  boostMultiplier: number
}

interface RenderPlayer extends Omit<ArenaPlayer, 'trail'> {
  trail: Point[]
}

interface PointerState {
  active: boolean
  origin: Point
  current: Point
}

interface Props {
  onExit: () => void
}

type ArenaPhase = 'joining' | 'playing' | 'dead'

type LeaderboardPlayer = Pick<ArenaPlayer, 'id' | 'name' | 'avatar' | 'score'> & { isMine: boolean }

const DEFAULT_WORLD_SIZE = 4_800
const BODY_WIDTH = 17
const HEAD_RADIUS = 11

function wrap(value: number, size: number): number {
  return ((value % size) + size) % size
}

function wrappedDelta(from: number, to: number, size: number): number {
  let delta = to - from
  if (delta > size / 2) delta -= size
  if (delta < -size / 2) delta += size
  return delta
}

function angleDifference(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

function copyPlayer(player: ArenaPlayer): RenderPlayer {
  return { ...player, trail: player.trail.map((point) => ({ ...point })) }
}

function screenPoint(point: Point, camera: Point, width: number, height: number, worldSize: number): Point {
  return {
    x: width / 2 + wrappedDelta(camera.x, point.x, worldSize),
    y: height / 2 + wrappedDelta(camera.y, point.y, worldSize),
  }
}

export default function OnlineSnake({ onExit }: Props) {
  const online = useOnline()
  const { reconnect, sendRaw, status, subscribe } = online
  const { profile, finishGame } = useApp()
  const [phase, setPhase] = useState<ArenaPhase>('joining')
  const [score, setScore] = useState(0)
  const [playerCount, setPlayerCount] = useState(0)
  const [showGuide, setShowGuide] = useState(true)
  const [boosting, setBoosting] = useState(false)
  const [leaders, setLeaders] = useState<LeaderboardPlayer[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef({ width: 0, height: 0 })
  const pixelRatioRef = useRef(1)
  const worldSizeRef = useRef(DEFAULT_WORLD_SIZE)
  const playerIdRef = useRef<string | null>(null)
  const snapshotRef = useRef<ArenaSnapshot>({ players: [], foods: [], speed: 90, boostMultiplier: 1.38 })
  const renderPlayersRef = useRef(new Map<string, RenderPlayer>())
  const cameraRef = useRef<Point>({ x: 0, y: 0 })
  const cameraReadyRef = useRef(false)
  const lastFrameRef = useRef(0)
  const lastSteerSentRef = useRef(0)
  const lastSentAngleRef = useRef<number | null>(null)
  const scoreRef = useRef(0)
  const lifeRef = useRef(0)
  const rewardedLifeRef = useRef(0)
  const boostingRef = useRef(false)
  const leaderboardKeyRef = useRef('')
  const pointerRef = useRef<PointerState>({
    active: false,
    origin: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
  })

  const finishRun = useCallback((finalScore: number) => {
    if (rewardedLifeRef.current === lifeRef.current) return
    rewardedLifeRef.current = lifeRef.current
    sounds.lose()
    finishGame({
      gameId: 'snake',
      outcome: finalScore >= 8 ? 'win' : 'loss',
      score: finalScore,
      bestCandidate: finalScore,
      coinsEarned: Math.min(60, 5 + finalScore * 3),
      xpEarned: Math.min(80, 15 + finalScore * 3),
      summary: `جمعت ${finalScore} نقطة في الساحة العامة 🐍`,
      detail: finalScore >= 8
        ? 'جولة قوية! تقدر تدخل فورًا لجولة جديدة وتنافس لاعبين مختلفين.'
        : 'اسحب بإصبعك بهدوء، اجمع الأكل الكبير لنقط أكتر، وابعد عن جسم باقي الثعابين.',
    })
  }, [finishGame])

  useEffect(() => subscribe((event) => {
    if (event.kind !== 'snake') return
    const message = event.msg
    if (message.type === 'snake_public_joined') {
      playerIdRef.current = String(message.playerId)
      worldSizeRef.current = Number(message.worldSize) || DEFAULT_WORLD_SIZE
      setPlayerCount(Number(message.playerCount) || 1)
      scoreRef.current = 0
      setScore(0)
      lifeRef.current += 1
      cameraReadyRef.current = false
      boostingRef.current = false
      setBoosting(false)
      setShowGuide(true)
      setPhase('playing')
      return
    }
    if (message.type === 'snake_public_respawned') {
      scoreRef.current = 0
      setScore(0)
      lifeRef.current += 1
      cameraReadyRef.current = false
      boostingRef.current = false
      setBoosting(false)
      setShowGuide(true)
      setPhase('playing')
      return
    }
    if (message.type === 'snake_public_count') {
      setPlayerCount(Number(message.playerCount) || 0)
      return
    }
    if (message.type === 'snake_public_dead') {
      const finalScore = Number(message.score) || scoreRef.current
      boostingRef.current = false
      setBoosting(false)
      setPhase('dead')
      finishRun(finalScore)
      return
    }
    if (message.type !== 'snake_public_snapshot') return

    const nextPlayers = Array.isArray(message.players) ? message.players as unknown as ArenaPlayer[] : []
    const priorFoods = snapshotRef.current.foods ?? []
    const nextFoods = Array.isArray(message.foods) ? message.foods as unknown as ArenaFood[] : priorFoods
    snapshotRef.current = {
      players: nextPlayers,
      foods: nextFoods,
      speed: Number(message.speed) || snapshotRef.current.speed,
      boostMultiplier: Number(message.boostMultiplier) || snapshotRef.current.boostMultiplier,
    }
    setPlayerCount(nextPlayers.length)
    const nextLeaders = nextPlayers
      .filter((player) => player.alive)
      .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
      .slice(0, 3)
      .map(({ id, name, avatar, score }) => ({ id, name, avatar, score, isMine: id === playerIdRef.current }))
    const leaderboardKey = nextLeaders.map((player) => `${player.id}:${player.score}`).join('|')
    if (leaderboardKey !== leaderboardKeyRef.current) {
      leaderboardKeyRef.current = leaderboardKey
      setLeaders(nextLeaders)
    }
    const mine = nextPlayers.find((player) => player.id === playerIdRef.current)
    if (!mine) return
    if (mine.score > scoreRef.current) sounds.correct()
    scoreRef.current = mine.score
    setScore(mine.score)
    if (!mine.alive) {
      boostingRef.current = false
      setBoosting(false)
      setPhase('dead')
      finishRun(mine.score)
    }
  }), [finishRun, subscribe])

  useEffect(() => {
    if (status !== 'online') return
    sendRaw({
      type: 'snake_public_join',
      name: profile.name || 'لاعب',
      avatar: profile.avatar || '🎮',
    })
  }, [profile.avatar, profile.name, sendRaw, status])

  useEffect(() => () => {
    if (boostingRef.current) sendRaw({ type: 'snake_public_boost', active: false })
    sendRaw({ type: 'snake_public_leave' })
  }, [sendRaw])

  useEffect(() => {
    if (phase !== 'playing' || !showGuide) return
    const timer = window.setTimeout(() => setShowGuide(false), 4_200)
    return () => window.clearTimeout(timer)
  }, [phase, showGuide])

  const sendSteering = useCallback((angle: number, force = false) => {
    const now = performance.now()
    const lastAngle = lastSentAngleRef.current
    if (!force && (now - lastSteerSentRef.current < 50 || (lastAngle != null && Math.abs(angleDifference(lastAngle, angle)) < 0.015))) return
    lastSteerSentRef.current = now
    lastSentAngleRef.current = angle
    sendRaw({ type: 'snake_public_steer', angle })
  }, [sendRaw])

  const changeBoost = useCallback((active: boolean) => {
    const nextActive = active && phase === 'playing'
    if (boostingRef.current === nextActive) return
    boostingRef.current = nextActive
    setBoosting(nextActive)
    if (nextActive) setShowGuide(false)
    sendRaw({ type: 'snake_public_boost', active: nextActive })
  }, [phase, sendRaw])

  useEffect(() => {
    const stopBoost = () => {
      if (boostingRef.current) changeBoost(false)
    }
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') stopBoost()
    }
    window.addEventListener('blur', stopBoost)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('blur', stopBoost)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [changeBoost])

  const updateRenderedPlayers = useCallback((elapsed: number) => {
    const targetPlayers = snapshotRef.current.players
    const targetIds = new Set(targetPlayers.map((player) => player.id))
    const worldSize = worldSizeRef.current
    const factor = 1 - Math.exp(-elapsed * 15)

    for (const [id] of renderPlayersRef.current) {
      if (!targetIds.has(id)) renderPlayersRef.current.delete(id)
    }

    for (const target of targetPlayers) {
      const rendered = renderPlayersRef.current.get(target.id)
      if (!rendered || rendered.trail.length === 0) {
        renderPlayersRef.current.set(target.id, copyPlayer(target))
        continue
      }
      rendered.name = target.name
      rendered.avatar = target.avatar
      rendered.hue = target.hue
      rendered.score = target.score
      rendered.alive = target.alive
      rendered.angle += angleDifference(rendered.angle, target.angle) * factor
      rendered.trail = target.trail.map((point, index) => {
        const current = rendered.trail[index] ?? point
        return {
          x: wrap(current.x + wrappedDelta(current.x, point.x, worldSize) * factor, worldSize),
          y: wrap(current.y + wrappedDelta(current.y, point.y, worldSize) * factor, worldSize),
        }
      })
    }

    const mine = playerIdRef.current ? renderPlayersRef.current.get(playerIdRef.current) : undefined
    const head = mine?.trail[0]
    if (!head) return
    if (!cameraReadyRef.current) {
      cameraRef.current = { ...head }
      cameraReadyRef.current = true
      return
    }
    const cameraFactor = 1 - Math.exp(-elapsed * 7)
    cameraRef.current = {
      x: wrap(cameraRef.current.x + wrappedDelta(cameraRef.current.x, head.x, worldSize) * cameraFactor, worldSize),
      y: wrap(cameraRef.current.y + wrappedDelta(cameraRef.current.y, head.y, worldSize) * cameraFactor, worldSize),
    }
  }, [])

  const renderScene = useCallback(() => {
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return
    const ratio = pixelRatioRef.current
    const camera = cameraRef.current
    const worldSize = worldSizeRef.current

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    const background = context.createLinearGradient(0, 0, 0, viewport.height)
    background.addColorStop(0, '#06372f')
    background.addColorStop(0.55, '#052a25')
    background.addColorStop(1, '#041f1d')
    context.fillStyle = background
    context.fillRect(0, 0, viewport.width, viewport.height)

    const dotSpacing = 38
    const dotOffsetX = ((viewport.width / 2 - camera.x) % dotSpacing + dotSpacing) % dotSpacing
    const dotOffsetY = ((viewport.height / 2 - camera.y) % dotSpacing + dotSpacing) % dotSpacing
    context.fillStyle = 'rgba(167, 243, 208, 0.065)'
    for (let x = dotOffsetX; x < viewport.width; x += dotSpacing) {
      for (let y = dotOffsetY; y < viewport.height; y += dotSpacing) {
        context.beginPath()
        context.arc(x, y, 1.3, 0, Math.PI * 2)
        context.fill()
      }
    }

    for (const food of snapshotRef.current.foods ?? []) {
      const point = screenPoint(food, camera, viewport.width, viewport.height, worldSize)
      if (point.x < -30 || point.y < -30 || point.x > viewport.width + 30 || point.y > viewport.height + 30) continue
      context.save()
      context.shadowColor = `hsla(${food.hue}, 95%, 62%, 0.95)`
      context.shadowBlur = 15
      const glow = context.createRadialGradient(point.x - food.radius * 0.35, point.y - food.radius * 0.35, 1, point.x, point.y, food.radius)
      glow.addColorStop(0, 'rgba(255,255,255,0.98)')
      glow.addColorStop(0.28, `hsl(${food.hue}, 96%, 68%)`)
      glow.addColorStop(1, `hsl(${food.hue}, 90%, 46%)`)
      context.fillStyle = glow
      context.beginPath()
      context.arc(point.x, point.y, food.radius, 0, Math.PI * 2)
      context.fill()
      if (food.source === 'remains') {
        context.strokeStyle = 'rgba(255,255,255,0.68)'
        context.lineWidth = 1.2
        context.stroke()
      }
      if ((food.value ?? 1) >= 3) {
        context.shadowBlur = 0
        context.fillStyle = '#06251f'
        context.font = '900 7px Cairo, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(String(food.value), point.x, point.y + 0.5)
      }
      context.restore()
    }

    const currentPlayers = [...renderPlayersRef.current.values()]
    const leaderId = currentPlayers
      .filter((player) => player.alive)
      .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))[0]?.id
    const players = currentPlayers.sort((a, b) => Number(a.id === playerIdRef.current) - Number(b.id === playerIdRef.current))
    for (const player of players) {
      if (!player.alive || player.trail.length < 2) continue
      const trail = player.trail.map((point) => screenPoint(point, camera, viewport.width, viewport.height, worldSize))
      const head = trail[0]
      const visible = trail.some((point) => point.x > -80 && point.y > -80 && point.x < viewport.width + 80 && point.y < viewport.height + 80)
      if (!visible) continue

      context.save()
      context.globalAlpha = player.alive ? 1 : 0.36
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      context.moveTo(trail[0].x, trail[0].y)
      for (let index = 1; index < trail.length; index += 1) context.lineTo(trail[index].x, trail[index].y)
      context.strokeStyle = 'rgba(1, 14, 13, 0.78)'
      context.lineWidth = BODY_WIDTH + 7
      context.stroke()
      context.shadowColor = `hsla(${player.hue}, 88%, 58%, ${player.boosting ? 0.92 : 0.58})`
      context.shadowBlur = player.boosting ? 20 : 13
      context.strokeStyle = `hsl(${player.hue}, 78%, 52%)`
      context.lineWidth = BODY_WIDTH
      context.stroke()
      context.shadowBlur = 0
      context.strokeStyle = 'rgba(255,255,255,0.3)'
      context.lineWidth = 3
      context.stroke()

      context.shadowColor = `hsla(${player.hue}, 90%, 60%, 0.7)`
      context.shadowBlur = 12
      context.fillStyle = `hsl(${player.hue}, 82%, 54%)`
      context.beginPath()
      context.arc(head.x, head.y, HEAD_RADIUS, 0, Math.PI * 2)
      context.fill()
      context.shadowBlur = 0

      const forward = { x: Math.cos(player.angle), y: Math.sin(player.angle) }
      const side = { x: -forward.y, y: forward.x }
      for (const direction of [-1, 1]) {
        const eyeX = head.x + forward.x * 4.5 + side.x * direction * 4.6
        const eyeY = head.y + forward.y * 4.5 + side.y * direction * 4.6
        context.fillStyle = '#f8fafc'
        context.beginPath()
        context.arc(eyeX, eyeY, 2.8, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#07150f'
        context.beginPath()
        context.arc(eyeX + forward.x, eyeY + forward.y, 1.35, 0, Math.PI * 2)
        context.fill()
      }

      if (player.alive && player.id === leaderId) {
        const crownY = head.y - HEAD_RADIUS - 7
        context.save()
        context.translate(head.x, crownY)
        context.shadowColor = 'rgba(250, 204, 21, 0.85)'
        context.shadowBlur = 8
        context.fillStyle = '#facc15'
        context.strokeStyle = '#854d0e'
        context.lineWidth = 1.25
        context.beginPath()
        context.moveTo(-10, 5)
        context.lineTo(-9, -5)
        context.lineTo(-4, 0)
        context.lineTo(0, -8)
        context.lineTo(4, 0)
        context.lineTo(9, -5)
        context.lineTo(10, 5)
        context.closePath()
        context.fill()
        context.stroke()
        context.fillStyle = '#fff7ae'
        for (const jewelX of [-9, 0, 9]) {
          context.beginPath()
          context.arc(jewelX, jewelX === 0 ? -8 : -5, 1.7, 0, Math.PI * 2)
          context.fill()
        }
        context.restore()
      }

      context.globalAlpha = player.alive ? 0.96 : 0.42
      context.font = '800 11px Cairo, sans-serif'
      context.textAlign = 'center'
      context.fillStyle = '#f8fafc'
      context.shadowColor = 'rgba(0,0,0,0.95)'
      context.shadowBlur = 7
      context.fillText(`${player.avatar} ${player.name} · ${player.score}`, head.x, head.y - (player.id === leaderId ? 38 : 21))
      context.restore()
    }

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      viewportRef.current = { width: rect.width, height: rect.height }
      pixelRatioRef.current = ratio
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
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
      const elapsed = Math.min(0.05, (timestamp - (lastFrameRef.current || timestamp)) / 1000)
      lastFrameRef.current = timestamp
      updateRenderedPlayers(elapsed)
      renderScene()
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [renderScene, updateRenderedPlayers])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && phase === 'playing') {
        event.preventDefault()
        changeBoost(true)
        return
      }
      const angles: Partial<Record<string, number>> = {
        ArrowRight: 0,
        ArrowDown: Math.PI / 2,
        ArrowLeft: Math.PI,
        ArrowUp: -Math.PI / 2,
      }
      const angle = angles[event.key]
      if (angle == null || phase !== 'playing') return
      event.preventDefault()
      setShowGuide(false)
      sendSteering(angle, true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      event.preventDefault()
      changeBoost(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [changeBoost, phase, sendSteering])

  const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const steerFromPointer = (point: Point, force = false) => {
    const pointer = pointerRef.current
    pointer.current = point
    const dx = point.x - pointer.origin.x
    const dy = point.y - pointer.origin.y
    if (Math.hypot(dx, dy) < 5) return
    setShowGuide(false)
    sendSteering(Math.atan2(dy, dx), force)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing') return
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
    if (pointerRef.current.active) steerFromPointer(pointerPosition(event), true)
    pointerRef.current.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const respawn = () => {
    sounds.click()
    setPhase('joining')
    renderPlayersRef.current.clear()
    sendRaw({ type: 'snake_public_respawn' })
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#041f1d]">
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
        aria-label="ساحة الثعبان العامة — اسحب بإصبعك لتغيير الاتجاه"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pt-3" dir="rtl">
        <button
          type="button"
          onClick={() => {
            sounds.click()
            onExit()
          }}
          className="pointer-events-auto flex min-h-12 items-center gap-1 font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
          aria-label="الخروج من الساحة العامة"
        >
          <ChevronRight className="h-6 w-6" />
          خروج
        </button>

        <div className="absolute left-1/2 top-1 -translate-x-1/2 text-center drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]">
          <p className="text-[10px] font-extrabold tracking-wide text-emerald-100/80">النقاط</p>
          <p className="text-4xl font-black leading-none tabular-nums text-white">{score}</p>
          <p className="mt-1 whitespace-nowrap text-[9px] font-bold text-emerald-200/80">ساحة عامة</p>
        </div>

        <div className="flex min-h-12 items-center gap-1.5 font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]" aria-label={`${playerCount} لاعبين في الساحة`}>
          <Users className="h-5 w-5 text-emerald-200" />
          <bdi className="tabular-nums">{playerCount}</bdi>
        </div>
      </div>

      {leaders.length > 0 && (
        <ol
          className="pointer-events-none absolute left-3 top-12 z-10 w-[8.25rem] space-y-0.5 text-[10px] font-extrabold text-white drop-shadow-[0_2px_7px_rgba(0,0,0,0.98)]"
          aria-label="أول ثلاثة لاعبين"
          dir="rtl"
        >
          {leaders.map((leader, index) => (
            <li key={leader.id} className={`flex h-4 min-w-0 items-center gap-1 ${leader.isMine ? 'text-lime-300' : 'text-white/90'}`}>
              <span className="w-4 shrink-0 text-center" aria-hidden="true">{index === 0 ? '👑' : index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{leader.avatar} {leader.name}</span>
              <bdi className="shrink-0 tabular-nums text-emerald-200">{leader.score}</bdi>
            </li>
          ))}
        </ol>
      )}

      {phase === 'playing' && status === 'online' && (
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            changeBoost(true)
          }}
          onPointerUp={(event) => {
            event.preventDefault()
            changeBoost(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onPointerCancel={() => changeBoost(false)}
          onLostPointerCapture={() => changeBoost(false)}
          onContextMenu={(event) => event.preventDefault()}
          className={`absolute bottom-5 right-4 z-10 flex h-16 w-16 touch-none flex-col items-center justify-center rounded-full border-2 font-black shadow-xl shadow-black/35 transition duration-100 active:scale-95 ${
            boosting
              ? 'scale-105 border-yellow-100 bg-yellow-300 text-emerald-950 shadow-yellow-300/25'
              : 'border-emerald-100/65 bg-emerald-400/80 text-emerald-950 backdrop-blur-sm'
          }`}
          aria-label="دوس مطولًا لزيادة السرعة"
          aria-pressed={boosting}
        >
          <Zap className={`h-6 w-6 ${boosting ? 'fill-current' : ''}`} />
          <span className="text-[10px] leading-none">سرعة</span>
        </button>
      )}

      {showGuide && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-20 bottom-[16%] z-10 text-center font-extrabold text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
          <p className="text-sm">اسحب في الاتجاه اللي عايزه · دوس مطول على «سرعة»</p>
          <p className="mt-1 text-[10px] text-emerald-100/85">الأكل الكبير بنقط أكتر</p>
        </div>
      )}

      {phase === 'joining' && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#031b18]/42 text-center text-white">
          <div className="drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]">
            <RefreshCw className="mx-auto h-9 w-9 animate-spin text-emerald-300" />
            <p className="mt-3 text-lg font-black">بندخّلك الساحة العامة…</p>
            <p className="mt-1 text-xs font-bold text-emerald-100/80">اللاعبين يقدروا يدخلوا ويخرجوا في أي وقت</p>
          </div>
        </div>
      )}

      {status !== 'online' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#031b18]/78 px-8 text-center text-white">
          <div className="drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]">
            <WifiOff className="mx-auto h-10 w-10 text-amber-300" />
            <p className="mt-3 text-lg font-black">الاتصال بالساحة اتقطع</p>
            <button
              type="button"
              onClick={reconnect}
              className="mt-4 min-h-12 rounded-full bg-emerald-500 px-7 font-black text-emerald-950 shadow-lg shadow-black/30 active:scale-95"
            >
              حاول تاني
            </button>
          </div>
        </div>
      )}

      {phase === 'dead' && status === 'online' && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#031b18]/48 px-8 text-center text-white">
          <div className="drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]">
            <p className="text-3xl font-black">الجولة خلصت</p>
            <p className="mt-2 font-extrabold text-emerald-100">جمعت <bdi className="tabular-nums">{score}</bdi> نقطة</p>
            <button
              type="button"
              onClick={respawn}
              className="mt-5 min-h-14 rounded-full bg-lime-400 px-9 text-lg font-black text-emerald-950 shadow-xl shadow-black/35 active:scale-95"
            >
              العب تاني فورًا
            </button>
            <button type="button" onClick={onExit} className="mt-4 block min-h-11 w-full font-extrabold text-white/80">
              خروج
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
