import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronRight, RefreshCw, Users, WifiOff } from 'lucide-react'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import {
  advanceTrail,
  angleDifference,
  bodyRadiusForLength,
  cameraZoomForLength,
  headRadiusForLength,
  mergeFoodSnapshot,
  reconcileTrail,
  trailLength,
} from './snakeMotion'

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
  length?: number
  bodyRadius?: number
  headRadius?: number
  isBot?: boolean
  alive: boolean
  angle: number
  trail: Point[]
}

interface ArenaSnapshot {
  players: ArenaPlayer[]
  foods?: ArenaFood[]
  speed: number
  worldSize?: number
  arenaRadius?: number
}

interface RenderPlayer extends Omit<ArenaPlayer, 'trail'> {
  length: number
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

const DEFAULT_WORLD_SIZE = 5_600
const DEFAULT_ARENA_RADIUS = 2_720
const MAX_RENDER_FPS = 60
const MIN_FRAME_INTERVAL_MS = 1_000 / MAX_RENDER_FPS
const MINIMAP_INTERVAL_MS = 160
const STALE_SNAPSHOT_MS = 5_000

function preferredPixelRatio(): number {
  const mobileCap = window.innerWidth < 768 ? 1.5 : 2
  return Math.min(window.devicePixelRatio || 1, mobileCap)
}

function traceSmoothTrail(context: CanvasRenderingContext2D, points: Point[]): void {
  if (points.length === 0) return
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2)
  }
  if (points.length > 1) context.lineTo(points.at(-1)!.x, points.at(-1)!.y)
}

function copyPlayer(player: ArenaPlayer): RenderPlayer {
  return {
    ...player,
    length: player.length ?? trailLength(player.trail),
    trail: player.trail.map((point) => ({ ...point })),
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
  const [leaders, setLeaders] = useState<LeaderboardPlayer[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const backgroundGradientRef = useRef<CanvasGradient | null>(null)
  const viewportRef = useRef({ width: 0, height: 0 })
  const pixelRatioRef = useRef(1)
  const worldSizeRef = useRef(DEFAULT_WORLD_SIZE)
  const arenaRadiusRef = useRef(DEFAULT_ARENA_RADIUS)
  const playerIdRef = useRef<string | null>(null)
  const snapshotRef = useRef<ArenaSnapshot>({ players: [], foods: [], speed: 124, worldSize: DEFAULT_WORLD_SIZE, arenaRadius: DEFAULT_ARENA_RADIUS })
  const renderPlayersRef = useRef(new Map<string, RenderPlayer>())
  const cameraRef = useRef<Point>({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const cameraReadyRef = useRef(false)
  const lastFrameRef = useRef(0)
  const lastMinimapFrameRef = useRef(0)
  const lastSnapshotReceivedRef = useRef(0)
  const snapshotVersionRef = useRef(0)
  const appliedSnapshotVersionRef = useRef(-1)
  const lastStallRecoveryRef = useRef(0)
  const lastSteerSentRef = useRef(0)
  const lastSentAngleRef = useRef<number | null>(null)
  const scoreRef = useRef(0)
  const playerCountRef = useRef(0)
  const lifeRef = useRef(0)
  const rewardedLifeRef = useRef(0)
  const leaderboardKeyRef = useRef('')
  const leaderIdRef = useRef<string | null>(null)
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
      arenaRadiusRef.current = Number(message.arenaRadius) || DEFAULT_ARENA_RADIUS
      playerCountRef.current = Number(message.playerCount) || 1
      setPlayerCount(playerCountRef.current)
      scoreRef.current = 0
      setScore(0)
      lifeRef.current += 1
      renderPlayersRef.current.clear()
      appliedSnapshotVersionRef.current = -1
      lastSnapshotReceivedRef.current = performance.now()
      cameraReadyRef.current = false
      zoomRef.current = 1
      setShowGuide(true)
      setPhase('playing')
      return
    }
    if (message.type === 'snake_public_respawned') {
      scoreRef.current = 0
      setScore(0)
      lifeRef.current += 1
      renderPlayersRef.current.clear()
      appliedSnapshotVersionRef.current = -1
      lastSnapshotReceivedRef.current = performance.now()
      cameraReadyRef.current = false
      zoomRef.current = 1
      setShowGuide(true)
      setPhase('playing')
      return
    }
    if (message.type === 'snake_public_count') {
      const nextPlayerCount = Number(message.playerCount) || 0
      if (nextPlayerCount !== playerCountRef.current) {
        playerCountRef.current = nextPlayerCount
        setPlayerCount(nextPlayerCount)
      }
      return
    }
    if (message.type === 'snake_public_dead') {
      const finalScore = Number(message.score) || scoreRef.current
      setPhase('dead')
      finishRun(finalScore)
      return
    }
    if (message.type !== 'snake_public_snapshot') return

    lastSnapshotReceivedRef.current = performance.now()
    snapshotVersionRef.current += 1
    const nextPlayers = Array.isArray(message.players) ? message.players as unknown as ArenaPlayer[] : []
    const priorFoods = snapshotRef.current.foods ?? []
    const fullFoods = Array.isArray(message.foods) ? message.foods as unknown as ArenaFood[] : undefined
    const foodUpserts = Array.isArray(message.foodUpserts) ? message.foodUpserts as unknown as ArenaFood[] : []
    const foodRemovedIds = Array.isArray(message.foodRemovedIds) ? message.foodRemovedIds.map(Number) : []
    const nextFoods = mergeFoodSnapshot(priorFoods, fullFoods, foodUpserts, foodRemovedIds)
    snapshotRef.current = {
      players: nextPlayers,
      foods: nextFoods,
      speed: Number(message.speed) || snapshotRef.current.speed,
      worldSize: Number(message.worldSize) || snapshotRef.current.worldSize,
      arenaRadius: Number(message.arenaRadius) || snapshotRef.current.arenaRadius,
    }
    worldSizeRef.current = snapshotRef.current.worldSize || DEFAULT_WORLD_SIZE
    arenaRadiusRef.current = snapshotRef.current.arenaRadius || DEFAULT_ARENA_RADIUS
    if (nextPlayers.length !== playerCountRef.current) {
      playerCountRef.current = nextPlayers.length
      setPlayerCount(nextPlayers.length)
    }
    const nextLeaders = [...nextPlayers]
      .filter((player) => player.alive)
      .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
      .slice(0, 3)
      .map(({ id, name, avatar, score }) => ({ id, name, avatar, score, isMine: id === playerIdRef.current }))
    const leaderboardKey = nextLeaders.map((player) => `${player.id}:${player.score}`).join('|')
    if (leaderboardKey !== leaderboardKeyRef.current) {
      leaderboardKeyRef.current = leaderboardKey
      setLeaders(nextLeaders)
    }
    leaderIdRef.current = nextLeaders[0]?.id ?? null
    const mine = nextPlayers.find((player) => player.id === playerIdRef.current)
    if (!mine) return
    if (mine.score > scoreRef.current) sounds.correct()
    if (mine.score !== scoreRef.current) {
      scoreRef.current = mine.score
      setScore(mine.score)
    }
    if (!mine.alive) {
      setPhase('dead')
      finishRun(mine.score)
    }
  }), [finishRun, subscribe])

  const joinPublicArena = useCallback(() => {
    sendRaw({
      type: 'snake_public_join',
      snapshotVersion: 2,
      name: profile.name || 'لاعب',
      avatar: profile.avatar || '🎮',
    })
  }, [profile.avatar, profile.name, sendRaw])

  useEffect(() => {
    if (status === 'online') joinPublicArena()
  }, [joinPublicArena, status])

  useEffect(() => {
    if (status !== 'online' || phase !== 'joining') return
    const retry = window.setTimeout(joinPublicArena, 4_000)
    return () => window.clearTimeout(retry)
  }, [joinPublicArena, phase, status])

  useEffect(() => {
    if (status !== 'online' || phase !== 'playing') return
    const watchdog = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || lastSnapshotReceivedRef.current <= 0) return
      const now = performance.now()
      if (now - lastSnapshotReceivedRef.current < STALE_SNAPSHOT_MS) return
      if (now - lastStallRecoveryRef.current < STALE_SNAPSHOT_MS * 2) return
      lastStallRecoveryRef.current = now
      setPhase('joining')
      reconnect()
    }, 1_500)
    return () => window.clearInterval(watchdog)
  }, [phase, reconnect, status])

  useEffect(() => () => {
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

  const updateRenderedPlayers = useCallback((elapsed: number) => {
    const targetPlayers = snapshotRef.current.players
    const correctionFactor = 1 - Math.exp(-elapsed * 7.5)
    const turnFactor = 1 - Math.exp(-elapsed * 12)
    const hasNewSnapshot = appliedSnapshotVersionRef.current !== snapshotVersionRef.current

    if (hasNewSnapshot) {
      const targetIds = new Set(targetPlayers.map((player) => player.id))
      for (const [id] of renderPlayersRef.current) {
        if (!targetIds.has(id)) renderPlayersRef.current.delete(id)
      }
    }

    for (const target of targetPlayers) {
      let rendered = renderPlayersRef.current.get(target.id)
      if (!rendered || rendered.trail.length === 0) {
        rendered = copyPlayer(target)
        renderPlayersRef.current.set(target.id, rendered)
      }
      const targetLength = target.length ?? trailLength(target.trail)
      if (hasNewSnapshot) {
        rendered.name = target.name
        rendered.avatar = target.avatar
        rendered.hue = target.hue
        rendered.score = target.score
        rendered.alive = target.alive
        rendered.isBot = target.isBot
        rendered.bodyRadius = target.bodyRadius
        rendered.headRadius = target.headRadius
        if (target.alive && rendered.trail.length > 0) {
          const predictionSeconds = lastSnapshotReceivedRef.current > 0
            ? Math.min(0.2, Math.max(0, (performance.now() - lastSnapshotReceivedRef.current) / 1_000))
            : 0
          const predictedTrail = advanceTrail(
            target.trail,
            target.angle,
            snapshotRef.current.speed * predictionSeconds,
            targetLength,
          )
          // Correct once per authoritative snapshot. Re-running full body
          // reconciliation on every display frame was the largest client CPU
          // hotspot for long snakes.
          rendered.trail = reconcileTrail(rendered.trail, predictedTrail, 0.46)
        }
      }
      rendered.length += (targetLength - rendered.length) * correctionFactor
      rendered.angle += angleDifference(rendered.angle, target.angle) * turnFactor
      if (!target.alive) continue

      rendered.trail = advanceTrail(
        rendered.trail,
        rendered.angle,
        snapshotRef.current.speed * elapsed,
        rendered.length,
      )
    }

    if (hasNewSnapshot) appliedSnapshotVersionRef.current = snapshotVersionRef.current

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
      x: cameraRef.current.x + (head.x - cameraRef.current.x) * cameraFactor,
      y: cameraRef.current.y + (head.y - cameraRef.current.y) * cameraFactor,
    }
    const targetZoom = cameraZoomForLength(mine.length)
    const zoomFactor = 1 - Math.exp(-elapsed * 2.8)
    zoomRef.current += (targetZoom - zoomRef.current) * zoomFactor
  }, [])

  const renderMinimap = useCallback(() => {
    const canvas = minimapRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const ratio = preferredPixelRatio()
    const width = rect.width
    const height = rect.height
    const targetWidth = Math.round(width * ratio)
    const targetHeight = Math.round(height * ratio)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)

    const center = { x: width / 2, y: height / 2 }
    const mapRadius = Math.min(width, height) / 2 - 5
    const worldCenter = worldSizeRef.current / 2
    const arenaRadius = arenaRadiusRef.current
    context.save()
    context.beginPath()
    context.arc(center.x, center.y, mapRadius, 0, Math.PI * 2)
    context.clip()
    const background = context.createRadialGradient(center.x, center.y, 2, center.x, center.y, mapRadius)
    background.addColorStop(0, 'rgba(13, 60, 54, 0.96)')
    background.addColorStop(1, 'rgba(2, 20, 24, 0.98)')
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
    context.strokeStyle = 'rgba(167, 243, 208, 0.1)'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(center.x, 4)
    context.lineTo(center.x, height - 4)
    context.moveTo(4, center.y)
    context.lineTo(width - 4, center.y)
    context.stroke()

    for (const player of renderPlayersRef.current.values()) {
      const head = player.trail[0]
      if (!player.alive || !head) continue
      const x = center.x + ((head.x - worldCenter) / arenaRadius) * mapRadius
      const y = center.y + ((head.y - worldCenter) / arenaRadius) * mapRadius
      const mine = player.id === playerIdRef.current
      context.shadowColor = mine ? '#ffffff' : `hsl(${player.hue}, 88%, 62%)`
      context.shadowBlur = mine ? 8 : 5
      context.fillStyle = mine ? '#f8fafc' : `hsl(${player.hue}, 82%, 58%)`
      context.beginPath()
      context.arc(x, y, mine ? 4.2 : 3, 0, Math.PI * 2)
      context.fill()
      if (mine) {
        context.shadowBlur = 0
        context.strokeStyle = '#34d399'
        context.lineWidth = 2
        context.beginPath()
        context.arc(x, y, 6.2, 0, Math.PI * 2)
        context.stroke()
      }
    }
    context.restore()
    context.strokeStyle = 'rgba(167, 243, 208, 0.8)'
    context.lineWidth = 2
    context.shadowColor = 'rgba(52, 211, 153, 0.55)'
    context.shadowBlur = 8
    context.beginPath()
    context.arc(center.x, center.y, mapRadius, 0, Math.PI * 2)
    context.stroke()
  }, [])

  const renderScene = useCallback(() => {
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return
    const ratio = pixelRatioRef.current
    const camera = cameraRef.current
    const zoom = zoomRef.current
    const worldSize = worldSizeRef.current
    const arenaRadius = arenaRadiusRef.current

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    context.fillStyle = backgroundGradientRef.current ?? '#052a25'
    context.fillRect(0, 0, viewport.width, viewport.height)

    const dotSpacing = 38 * zoom
    const dotOffsetX = ((viewport.width / 2 - camera.x * zoom) % dotSpacing + dotSpacing) % dotSpacing
    const dotOffsetY = ((viewport.height / 2 - camera.y * zoom) % dotSpacing + dotSpacing) % dotSpacing
    context.fillStyle = 'rgba(167, 243, 208, 0.065)'
    context.beginPath()
    for (let x = dotOffsetX; x < viewport.width; x += dotSpacing) {
      for (let y = dotOffsetY; y < viewport.height; y += dotSpacing) {
        context.moveTo(x + 1.3, y)
        context.arc(x, y, 1.3, 0, Math.PI * 2)
      }
    }
    context.fill()

    context.save()
    context.translate(viewport.width / 2, viewport.height / 2)
    context.scale(zoom, zoom)
    context.translate(-camera.x, -camera.y)

    const arenaCenter = { x: worldSize / 2, y: worldSize / 2 }
    const halfWorldWidth = viewport.width / (2 * zoom)
    const halfWorldHeight = viewport.height / (2 * zoom)
    const viewWorldRadius = Math.hypot(halfWorldWidth, halfWorldHeight)
    const cameraDistanceFromCenter = Math.hypot(camera.x - arenaCenter.x, camera.y - arenaCenter.y)
    if (cameraDistanceFromCenter + viewWorldRadius >= arenaRadius - 36) {
      context.save()
      context.fillStyle = 'rgba(2, 8, 18, 0.82)'
      context.beginPath()
      context.rect(camera.x - halfWorldWidth, camera.y - halfWorldHeight, halfWorldWidth * 2, halfWorldHeight * 2)
      context.arc(arenaCenter.x, arenaCenter.y, arenaRadius, 0, Math.PI * 2, true)
      context.fill('evenodd')
      context.shadowColor = 'rgba(251, 113, 133, 0.8)'
      context.shadowBlur = 18
      context.strokeStyle = 'rgba(251, 113, 133, 0.72)'
      context.lineWidth = 18
      context.beginPath()
      context.arc(arenaCenter.x, arenaCenter.y, arenaRadius, 0, Math.PI * 2)
      context.stroke()
      context.shadowBlur = 0
      context.setLineDash([11, 9])
      context.strokeStyle = 'rgba(254, 240, 138, 0.9)'
      context.lineWidth = 2.5
      context.beginPath()
      context.arc(arenaCenter.x, arenaCenter.y, arenaRadius - 8, 0, Math.PI * 2)
      context.stroke()
      context.restore()
    }

    const visibleFoods = (snapshotRef.current.foods ?? []).filter((food) => (
      food.x >= camera.x - halfWorldWidth - 30 && food.y >= camera.y - halfWorldHeight - 30
      && food.x <= camera.x + halfWorldWidth + 30 && food.y <= camera.y + halfWorldHeight + 30
    ))
    for (const food of visibleFoods) {
      context.shadowColor = `hsla(${food.hue}, 95%, 62%, 0.95)`
      context.shadowBlur = 9
      context.fillStyle = `hsl(${food.hue}, 90%, 54%)`
      context.beginPath()
      context.arc(food.x, food.y, food.radius, 0, Math.PI * 2)
      context.fill()
      if (food.source === 'remains') {
        context.strokeStyle = 'rgba(255,255,255,0.68)'
        context.lineWidth = 1.2
        context.stroke()
      }
      context.shadowBlur = 0
      context.fillStyle = 'rgba(255,255,255,0.72)'
      context.beginPath()
      context.arc(food.x - food.radius * 0.28, food.y - food.radius * 0.28, Math.max(1, food.radius * 0.2), 0, Math.PI * 2)
      context.fill()
    }

    const currentPlayers = [...renderPlayersRef.current.values()]
    const leaderId = leaderIdRef.current
    const mineIndex = currentPlayers.findIndex((player) => player.id === playerIdRef.current)
    if (mineIndex >= 0) currentPlayers.push(...currentPlayers.splice(mineIndex, 1))
    const players = currentPlayers
    for (const player of players) {
      if (!player.alive || player.trail.length < 2) continue
      const trail = player.trail
      const head = trail[0]
      const visible = trail.some((point) => (
        point.x > camera.x - halfWorldWidth - 80 && point.y > camera.y - halfWorldHeight - 80
        && point.x < camera.x + halfWorldWidth + 80 && point.y < camera.y + halfWorldHeight + 80
      ))
      if (!visible) continue

      const bodyRadius = player.bodyRadius ?? bodyRadiusForLength(player.length)
      const headRadius = player.headRadius ?? headRadiusForLength(player.length)
      const bodyWidth = bodyRadius * 2

      context.save()
      context.globalAlpha = player.alive ? 1 : 0.36
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.beginPath()
      traceSmoothTrail(context, trail)
      context.strokeStyle = 'rgba(1, 14, 13, 0.78)'
      context.lineWidth = bodyWidth + 7
      context.stroke()
      context.shadowColor = `hsla(${player.hue}, 88%, 58%, 0.68)`
      context.shadowBlur = 14
      context.strokeStyle = `hsl(${player.hue}, 78%, 52%)`
      context.lineWidth = bodyWidth
      context.stroke()
      context.shadowBlur = 0
      context.strokeStyle = 'rgba(255,255,255,0.3)'
      context.lineWidth = 3
      context.stroke()

      context.shadowColor = `hsla(${player.hue}, 90%, 60%, 0.7)`
      context.shadowBlur = 12
      context.fillStyle = `hsl(${player.hue}, 82%, 54%)`
      context.beginPath()
      context.arc(head.x, head.y, headRadius, 0, Math.PI * 2)
      context.fill()
      context.shadowBlur = 0

      const forward = { x: Math.cos(player.angle), y: Math.sin(player.angle) }
      const side = { x: -forward.y, y: forward.x }
      for (const direction of [-1, 1]) {
        const eyeX = head.x + forward.x * headRadius * 0.41 + side.x * direction * headRadius * 0.42
        const eyeY = head.y + forward.y * headRadius * 0.41 + side.y * direction * headRadius * 0.42
        const eyeRadius = Math.max(2.8, headRadius * 0.24)
        context.fillStyle = '#f8fafc'
        context.beginPath()
        context.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#07150f'
        context.beginPath()
        context.arc(eyeX + forward.x * eyeRadius * 0.36, eyeY + forward.y * eyeRadius * 0.36, eyeRadius * 0.48, 0, Math.PI * 2)
        context.fill()
      }

      if (player.alive && player.id === leaderId) {
        const crownY = head.y - headRadius - 7
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
      context.font = `800 ${11 / zoom}px Cairo, sans-serif`
      context.textAlign = 'center'
      context.fillStyle = '#f8fafc'
      context.shadowColor = 'rgba(0,0,0,0.95)'
      context.shadowBlur = 7
      const labelOffset = (player.id === leaderId ? headRadius + 27 : headRadius + 10) / zoom
      context.fillText(`${player.avatar} ${player.name} · ${player.score}`, head.x, head.y - labelOffset)
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const ratio = preferredPixelRatio()
      viewportRef.current = { width: rect.width, height: rect.height }
      pixelRatioRef.current = ratio
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      const context = canvas.getContext('2d')
      if (context) {
        const background = context.createLinearGradient(0, 0, 0, rect.height)
        background.addColorStop(0, '#06372f')
        background.addColorStop(0.55, '#052a25')
        background.addColorStop(1, '#041f1d')
        backgroundGradientRef.current = background
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
      if (lastFrameRef.current && timestamp - lastFrameRef.current < MIN_FRAME_INTERVAL_MS - 0.75) {
        frame = requestAnimationFrame(loop)
        return
      }
      const elapsed = Math.min(0.05, (timestamp - (lastFrameRef.current || timestamp)) / 1000)
      lastFrameRef.current = timestamp
      updateRenderedPlayers(elapsed)
      renderScene()
      if (timestamp - lastMinimapFrameRef.current >= MINIMAP_INTERVAL_MS) {
        lastMinimapFrameRef.current = timestamp
        renderMinimap()
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [renderMinimap, renderScene, updateRenderedPlayers])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, sendSteering])

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

      <div className="pointer-events-none absolute right-3 top-[4.25rem] z-10 h-24 w-24 rounded-full border border-emerald-100/35 bg-[#031b18]/90 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.38),0_0_18px_rgba(52,211,153,0.12)] backdrop-blur-md">
        <canvas
          ref={minimapRef}
          className="block h-full w-full rounded-full"
          aria-label="خريطة الساحة الدائرية ومواقع الثعابين"
        />
        <span className="absolute inset-x-0 -bottom-4 text-center text-[8px] font-black tracking-wide text-emerald-100/75 drop-shadow-lg">الخريطة</span>
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

      {showGuide && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-20 bottom-[16%] z-10 text-center font-extrabold text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
          <p className="text-sm">اسحب في الاتجاه اللي عايزه — الثعبان سريع طول الوقت</p>
          <p className="mt-1 text-[10px] text-emerald-100/85">راقب الخريطة وابعد عن سور الساحة</p>
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
