import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ChevronRight, RefreshCw, Users, WifiOff } from 'lucide-react'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import {
  advancePaperPosition,
  angleDifference,
  applyTerritoryPatches,
  cellCenter,
  cellIndexAt,
  decodeOwnershipRle,
  reconcilePaperPosition,
  type PaperPoint,
  type TerritoryPatch,
} from './paperMotion'

interface ArenaPlayer {
  id: string
  slot: number
  name: string
  avatar: string
  color: string
  isBot?: boolean
  alive: boolean
  x: number
  y: number
  angle: number
  targetAngle: number
  trail: number[]
  score: number
  territoryCells: number
  kills: number
  lastInputSeq: number
}

interface ArenaSnapshot {
  players: ArenaPlayer[]
  gridSize: number
  cellSize: number
  worldSize: number
  speed: number
  turnRate: number
  revision: number
}

interface RenderPlayer extends ArenaPlayer {
  serverX: number
  serverY: number
  serverAngle: number
  serverTargetAngle: number
  trailSet: Set<number>
  lastPredictedCell: number
}

interface PointerState {
  active: boolean
  start: PaperPoint
  last: PaperPoint
  travelled: number
}

interface CaptureBurst {
  x: number
  y: number
  color: string
  startedAt: number
  size: number
}

interface Props {
  onExit: () => void
}

type ArenaPhase = 'joining' | 'playing' | 'dead'
type LeaderboardPlayer = Pick<ArenaPlayer, 'id' | 'name' | 'avatar' | 'score' | 'color'> & { isMine: boolean }

const DEFAULT_GRID_SIZE = 72
const DEFAULT_CELL_SIZE = 28
const DEFAULT_WORLD_SIZE = DEFAULT_GRID_SIZE * DEFAULT_CELL_SIZE
const DEFAULT_SPEED = 150
const DEFAULT_TURN_RATE = 7.4
const MIN_FRAME_INTERVAL_MS = 1_000 / 60
const MINIMAP_INTERVAL_MS = 180
const STALE_SNAPSHOT_MS = 5_000

function preferredPixelRatio(): number {
  const mobileCap = window.innerWidth < 768 ? 1.5 : 2
  return Math.min(window.devicePixelRatio || 1, mobileCap)
}

function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function colorToRgb(color: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(color) ? color.slice(1) : '22c55e'
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function copyPlayer(player: ArenaPlayer): RenderPlayer {
  return {
    ...player,
    trail: [...player.trail],
    serverX: player.x,
    serverY: player.y,
    serverAngle: player.angle,
    serverTargetAngle: player.targetAngle,
    trailSet: new Set(player.trail),
    lastPredictedCell: -1,
  }
}

function traceSmoothPath(context: CanvasRenderingContext2D, points: PaperPoint[]): void {
  if (points.length === 0) return
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2)
  }
  if (points.length > 1) context.lineTo(points.at(-1)!.x, points.at(-1)!.y)
}

export default function OnlinePaper({ onExit }: Props) {
  const { reconnect, sendRaw, status, subscribe } = useOnline()
  const { profile, finishGame } = useApp()
  const [phase, setPhase] = useState<ArenaPhase>('joining')
  const [score, setScore] = useState(0)
  const [kills, setKills] = useState(0)
  const [playerCount, setPlayerCount] = useState(0)
  const [showGuide, setShowGuide] = useState(true)
  const [leaders, setLeaders] = useState<LeaderboardPlayer[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const minimapRef = useRef<HTMLCanvasElement>(null)
  const territoryTextureRef = useRef<HTMLCanvasElement | null>(null)
  const territoryDirtyRef = useRef(true)
  const backgroundGradientRef = useRef<CanvasGradient | null>(null)
  const viewportRef = useRef({ width: 0, height: 0 })
  const pixelRatioRef = useRef(1)
  const gridSizeRef = useRef(DEFAULT_GRID_SIZE)
  const cellSizeRef = useRef(DEFAULT_CELL_SIZE)
  const worldSizeRef = useRef(DEFAULT_WORLD_SIZE)
  const ownersRef = useRef<Uint16Array<ArrayBufferLike>>(new Uint16Array(DEFAULT_GRID_SIZE * DEFAULT_GRID_SIZE))
  const paletteRef = useRef(new Map<number, string>())
  const revisionRef = useRef(0)
  const playerIdRef = useRef<string | null>(null)
  const snapshotRef = useRef<ArenaSnapshot>({
    players: [],
    gridSize: DEFAULT_GRID_SIZE,
    cellSize: DEFAULT_CELL_SIZE,
    worldSize: DEFAULT_WORLD_SIZE,
    speed: DEFAULT_SPEED,
    turnRate: DEFAULT_TURN_RATE,
    revision: 0,
  })
  const renderPlayersRef = useRef(new Map<string, RenderPlayer>())
  const cameraRef = useRef<PaperPoint>({ x: DEFAULT_WORLD_SIZE / 2, y: DEFAULT_WORLD_SIZE / 2 })
  const zoomRef = useRef(0.82)
  const cameraReadyRef = useRef(false)
  const desiredAngleRef = useRef(0)
  const inputSequenceRef = useRef(0)
  const lastSteerSentRef = useRef(0)
  const lastSentAngleRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)
  const lastMinimapFrameRef = useRef(0)
  const lastSnapshotReceivedRef = useRef(0)
  const snapshotVersionRef = useRef(0)
  const appliedSnapshotVersionRef = useRef(-1)
  const lastStallRecoveryRef = useRef(0)
  const scoreRef = useRef(0)
  const killsRef = useRef(0)
  const playerCountRef = useRef(0)
  const lifeRef = useRef(0)
  const rewardedLifeRef = useRef(0)
  const leaderboardKeyRef = useRef('')
  const leaderIdRef = useRef<string | null>(null)
  const captureBurstsRef = useRef<CaptureBurst[]>([])
  const pointerRef = useRef<PointerState>({
    active: false,
    start: { x: 0, y: 0 },
    last: { x: 0, y: 0 },
    travelled: 0,
  })

  const finishRun = useCallback((finalScore: number) => {
    if (rewardedLifeRef.current === lifeRef.current) return
    rewardedLifeRef.current = lifeRef.current
    sounds.lose()
    finishGame({
      gameId: 'paper',
      outcome: finalScore >= 5 ? 'win' : 'loss',
      score: Math.round(finalScore * 10),
      bestCandidate: Math.round(finalScore * 10),
      coinsEarned: Math.min(70, 5 + Math.round(finalScore * 2) + killsRef.current * 4),
      xpEarned: Math.min(90, 15 + Math.round(finalScore * 3) + killsRef.current * 5),
      summary: `سيطرت على ${finalScore.toFixed(1)}٪ وأسقطت ${killsRef.current} منافس 🟪`,
      detail: finalScore >= 5
        ? 'جولة قوية! اقفل مساحات صغيرة بسرعة قبل ما تطمع في مساحة كبيرة.'
        : 'خليك قريب من أرضك، اقفل المسار بسرعة، واقطع خط المنافس وهو خارج منطقته.',
    })
  }, [finishGame])

  const requestFullSync = useCallback(() => {
    sendRaw({ type: 'paper_public_sync' })
  }, [sendRaw])

  useEffect(() => subscribe((event) => {
    if (event.kind !== 'paper') return
    const message = event.msg
    if (message.type === 'paper_public_joined') {
      playerIdRef.current = String(message.playerId)
      gridSizeRef.current = Number(message.gridSize) || DEFAULT_GRID_SIZE
      cellSizeRef.current = Number(message.cellSize) || DEFAULT_CELL_SIZE
      worldSizeRef.current = Number(message.worldSize) || gridSizeRef.current * cellSizeRef.current
      playerCountRef.current = Number(message.playerCount) || 1
      setPlayerCount(playerCountRef.current)
      scoreRef.current = 0
      killsRef.current = 0
      setScore(0)
      setKills(0)
      lifeRef.current += 1
      renderPlayersRef.current.clear()
      appliedSnapshotVersionRef.current = -1
      revisionRef.current = 0
      lastSnapshotReceivedRef.current = performance.now()
      cameraReadyRef.current = false
      captureBurstsRef.current = []
      setShowGuide(true)
      setPhase('playing')
      return
    }
    if (message.type === 'paper_public_respawned') {
      scoreRef.current = 0
      killsRef.current = 0
      setScore(0)
      setKills(0)
      lifeRef.current += 1
      renderPlayersRef.current.clear()
      appliedSnapshotVersionRef.current = -1
      lastSnapshotReceivedRef.current = performance.now()
      cameraReadyRef.current = false
      captureBurstsRef.current = []
      setShowGuide(true)
      setPhase('playing')
      return
    }
    if (message.type === 'paper_public_count') {
      const nextPlayerCount = Number(message.playerCount) || 0
      if (nextPlayerCount !== playerCountRef.current) {
        playerCountRef.current = nextPlayerCount
        setPlayerCount(nextPlayerCount)
      }
      return
    }
    if (message.type === 'paper_public_dead') {
      const finalScore = Number(message.score) || scoreRef.current
      setPhase('dead')
      finishRun(finalScore)
      return
    }
    if (message.type !== 'paper_public_snapshot') return

    lastSnapshotReceivedRef.current = performance.now()
    snapshotVersionRef.current += 1
    const nextPlayers = Array.isArray(message.players) ? message.players as unknown as ArenaPlayer[] : []
    const nextGridSize = Number(message.gridSize) || gridSizeRef.current
    const nextCellSize = Number(message.cellSize) || cellSizeRef.current
    const nextWorldSize = Number(message.worldSize) || nextGridSize * nextCellSize
    const nextRevision = Math.max(0, Math.floor(Number(message.revision) || 0))
    gridSizeRef.current = nextGridSize
    cellSizeRef.current = nextCellSize
    worldSizeRef.current = nextWorldSize

    let paletteChanged = false
    for (const player of nextPlayers) {
      if (paletteRef.current.get(player.slot) !== player.color) {
        paletteRef.current.set(player.slot, player.color)
        paletteChanged = true
      }
    }

    if (Array.isArray(message.ownerRle)) {
      ownersRef.current = decodeOwnershipRle(
        message.ownerRle.map(Number),
        nextGridSize * nextGridSize,
      )
      revisionRef.current = nextRevision
      territoryDirtyRef.current = true
    } else {
      const patches = (Array.isArray(message.patches) ? message.patches : []) as unknown as TerritoryPatch[]
      const freshPatches = patches
        .filter((patch) => Number(patch.revision) > revisionRef.current)
        .sort((first, second) => first.revision - second.revision)
      let expectedRevision = revisionRef.current + 1
      let complete = true
      for (const patch of freshPatches) {
        if (patch.revision !== expectedRevision) {
          complete = false
          break
        }
        expectedRevision += 1
      }
      if (!complete || (freshPatches.length === 0 && nextRevision > revisionRef.current)) {
        requestFullSync()
      } else if (freshPatches.length > 0) {
        ownersRef.current = applyTerritoryPatches(ownersRef.current, freshPatches)
        revisionRef.current = freshPatches.at(-1)!.revision
        territoryDirtyRef.current = true
        const now = performance.now()
        for (const patch of freshPatches.slice(-5)) {
          if (patch.owner <= 0 || patch.ranges.length < 2) continue
          const midpoint = patch.ranges[0] + Math.floor(patch.ranges[1] / 2)
          const point = cellCenter(midpoint, nextGridSize, nextCellSize)
          const changedCells = patch.ranges.reduce((total, value, index) => (
            index % 2 === 1 ? total + value : total
          ), 0)
          captureBurstsRef.current.push({
            ...point,
            color: paletteRef.current.get(patch.owner) ?? '#ffffff',
            startedAt: now,
            size: Math.min(180, 35 + Math.sqrt(changedCells) * nextCellSize * 0.55),
          })
        }
        captureBurstsRef.current = captureBurstsRef.current.slice(-8)
      }
    }
    if (paletteChanged) territoryDirtyRef.current = true

    snapshotRef.current = {
      players: nextPlayers,
      gridSize: nextGridSize,
      cellSize: nextCellSize,
      worldSize: nextWorldSize,
      speed: Number(message.speed) || snapshotRef.current.speed,
      turnRate: Number(message.turnRate) || snapshotRef.current.turnRate,
      revision: nextRevision,
    }
    if (nextPlayers.length !== playerCountRef.current) {
      playerCountRef.current = nextPlayers.length
      setPlayerCount(nextPlayers.length)
    }
    const nextLeaders = [...nextPlayers]
      .filter((player) => player.alive)
      .sort((first, second) => second.score - first.score || second.kills - first.kills || first.name.localeCompare(second.name))
      .slice(0, 3)
      .map(({ id, name, avatar, score: playerScore, color }) => ({
        id,
        name,
        avatar,
        score: playerScore,
        color,
        isMine: id === playerIdRef.current,
      }))
    const leaderboardKey = nextLeaders.map((player) => `${player.id}:${player.score}`).join('|')
    if (leaderboardKey !== leaderboardKeyRef.current) {
      leaderboardKeyRef.current = leaderboardKey
      setLeaders(nextLeaders)
    }
    leaderIdRef.current = nextLeaders[0]?.id ?? null

    const mine = nextPlayers.find((player) => player.id === playerIdRef.current)
    if (!mine) return
    if (mine.score > scoreRef.current + 0.05) sounds.correct()
    if (mine.score !== scoreRef.current) {
      scoreRef.current = mine.score
      setScore(mine.score)
    }
    if (mine.kills !== killsRef.current) {
      killsRef.current = mine.kills
      setKills(mine.kills)
    }
    if (!mine.alive) {
      setPhase('dead')
      finishRun(mine.score)
    }
  }), [finishRun, requestFullSync, subscribe])

  const joinPublicArena = useCallback(() => {
    sendRaw({
      type: 'paper_public_join',
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
    sendRaw({ type: 'paper_public_leave' })
  }, [sendRaw])

  useEffect(() => {
    if (phase !== 'playing' || !showGuide) return
    const timer = window.setTimeout(() => setShowGuide(false), 4_400)
    return () => window.clearTimeout(timer)
  }, [phase, showGuide])

  const sendSteering = useCallback((rawAngle: number, force = false) => {
    const angle = normalizeAngle(rawAngle)
    desiredAngleRef.current = angle
    const now = performance.now()
    const lastAngle = lastSentAngleRef.current
    if (!force && (
      now - lastSteerSentRef.current < 42
      || (lastAngle != null && Math.abs(angleDifference(lastAngle, angle)) < 0.018)
    )) return
    inputSequenceRef.current += 1
    lastSteerSentRef.current = now
    lastSentAngleRef.current = angle
    sendRaw({
      type: 'paper_public_steer',
      angle,
      sequence: inputSequenceRef.current,
    })
  }, [sendRaw])

  const updateRenderedPlayers = useCallback((elapsed: number) => {
    const targets = snapshotRef.current.players
    const hasNewSnapshot = appliedSnapshotVersionRef.current !== snapshotVersionRef.current
    if (hasNewSnapshot) {
      const targetIds = new Set(targets.map((player) => player.id))
      for (const [id] of renderPlayersRef.current) {
        if (!targetIds.has(id)) renderPlayersRef.current.delete(id)
      }
      for (const target of targets) {
        let rendered = renderPlayersRef.current.get(target.id)
        if (!rendered) {
          rendered = copyPlayer(target)
          renderPlayersRef.current.set(target.id, rendered)
          if (target.id === playerIdRef.current) desiredAngleRef.current = target.targetAngle
        }
        rendered.name = target.name
        rendered.avatar = target.avatar
        rendered.slot = target.slot
        rendered.color = target.color
        rendered.isBot = target.isBot
        rendered.alive = target.alive
        rendered.score = target.score
        rendered.territoryCells = target.territoryCells
        rendered.kills = target.kills
        rendered.lastInputSeq = target.lastInputSeq
        rendered.serverX = target.x
        rendered.serverY = target.y
        rendered.serverAngle = target.angle
        rendered.serverTargetAngle = target.targetAngle
        rendered.trail = [...target.trail]
        rendered.trailSet = new Set(target.trail)
        rendered.lastPredictedCell = target.trail.at(-1) ?? cellIndexAt(target, gridSizeRef.current, cellSizeRef.current)
      }
      appliedSnapshotVersionRef.current = snapshotVersionRef.current
    }

    const speed = snapshotRef.current.speed
    const turnRate = snapshotRef.current.turnRate
    for (const rendered of renderPlayersRef.current.values()) {
      if (!rendered.alive) continue
      const serverAdvanced = advancePaperPosition(
        { x: rendered.serverX, y: rendered.serverY },
        rendered.serverAngle,
        rendered.serverTargetAngle,
        speed,
        turnRate,
        elapsed,
      )
      rendered.serverX = serverAdvanced.x
      rendered.serverY = serverAdvanced.y
      rendered.serverAngle = serverAdvanced.angle

      const mine = rendered.id === playerIdRef.current
      const correction = reconcilePaperPosition(
        rendered,
        { x: rendered.serverX, y: rendered.serverY },
        1 - Math.exp(-elapsed * (mine ? 5.2 : 8.5)),
      )
      const targetAngle = mine ? desiredAngleRef.current : rendered.serverTargetAngle
      const advanced = advancePaperPosition(
        correction,
        rendered.angle,
        targetAngle,
        speed,
        turnRate,
        elapsed,
      )
      rendered.x = advanced.x
      rendered.y = advanced.y
      rendered.angle = advanced.angle
      rendered.targetAngle = targetAngle

      const currentCell = cellIndexAt(rendered, gridSizeRef.current, cellSizeRef.current)
      if (currentCell < 0 || currentCell === rendered.lastPredictedCell) continue
      rendered.lastPredictedCell = currentCell
      if (ownersRef.current[currentCell] === rendered.slot) {
        if (rendered.trail.length > 0) {
          rendered.trail = []
          rendered.trailSet.clear()
        }
      } else if (!rendered.trailSet.has(currentCell)) {
        rendered.trail.push(currentCell)
        rendered.trailSet.add(currentCell)
      }
    }

    const mine = playerIdRef.current ? renderPlayersRef.current.get(playerIdRef.current) : undefined
    if (!mine?.alive) return
    if (!cameraReadyRef.current) {
      cameraRef.current = { x: mine.x, y: mine.y }
      cameraReadyRef.current = true
    } else {
      const cameraFactor = 1 - Math.exp(-elapsed * 8)
      cameraRef.current = {
        x: cameraRef.current.x + (mine.x - cameraRef.current.x) * cameraFactor,
        y: cameraRef.current.y + (mine.y - cameraRef.current.y) * cameraFactor,
      }
    }
    const targetZoom = Math.max(0.68, 0.86 - Math.min(0.18, mine.score * 0.006))
    zoomRef.current += (targetZoom - zoomRef.current) * (1 - Math.exp(-elapsed * 2.8))
    const viewport = viewportRef.current
    const horizontalMargin = viewport.width / (2 * zoomRef.current)
    const verticalMargin = viewport.height / (2 * zoomRef.current)
    const worldSize = worldSizeRef.current
    cameraRef.current = {
      x: worldSize <= horizontalMargin * 2
        ? worldSize / 2
        : Math.max(horizontalMargin, Math.min(worldSize - horizontalMargin, cameraRef.current.x)),
      y: worldSize <= verticalMargin * 2
        ? worldSize / 2
        : Math.max(verticalMargin, Math.min(worldSize - verticalMargin, cameraRef.current.y)),
    }
  }, [])

  const rebuildTerritoryTexture = useCallback(() => {
    if (!territoryDirtyRef.current) return
    const gridSize = gridSizeRef.current
    let texture = territoryTextureRef.current
    if (!texture) {
      texture = document.createElement('canvas')
      territoryTextureRef.current = texture
    }
    if (texture.width !== gridSize || texture.height !== gridSize) {
      texture.width = gridSize
      texture.height = gridSize
    }
    const context = texture.getContext('2d')
    if (!context) return
    const image = context.createImageData(gridSize, gridSize)
    const owners = ownersRef.current
    const palette = paletteRef.current
    for (let index = 0; index < owners.length; index += 1) {
      const offset = index * 4
      const owner = owners[index]
      if (owner === 0) {
        image.data[offset] = 12
        image.data[offset + 1] = 22
        image.data[offset + 2] = 38
        image.data[offset + 3] = 255
        continue
      }
      const [red, green, blue] = colorToRgb(palette.get(owner) ?? '#64748b')
      image.data[offset] = red
      image.data[offset + 1] = green
      image.data[offset + 2] = blue
      image.data[offset + 3] = 225
    }
    context.putImageData(image, 0, 0)
    territoryDirtyRef.current = false
  }, [])

  const renderMinimap = useCallback(() => {
    const canvas = minimapRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const ratio = preferredPixelRatio()
    const targetWidth = Math.round(rect.width * ratio)
    const targetHeight = Math.round(rect.height * ratio)
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth
      canvas.height = targetHeight
    }
    const context = canvas.getContext('2d')
    const texture = territoryTextureRef.current
    if (!context || !texture) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, rect.width, rect.height)
    context.imageSmoothingEnabled = false
    context.drawImage(texture, 0, 0, rect.width, rect.height)
    context.strokeStyle = 'rgba(255,255,255,0.55)'
    context.lineWidth = 1.5
    context.strokeRect(1, 1, rect.width - 2, rect.height - 2)

    for (const player of renderPlayersRef.current.values()) {
      if (!player.alive) continue
      const x = (player.x / worldSizeRef.current) * rect.width
      const y = (player.y / worldSizeRef.current) * rect.height
      const mine = player.id === playerIdRef.current
      context.shadowColor = mine ? '#ffffff' : player.color
      context.shadowBlur = mine ? 6 : 3
      context.fillStyle = mine ? '#ffffff' : player.color
      context.beginPath()
      context.arc(x, y, mine ? 3.6 : 2.2, 0, Math.PI * 2)
      context.fill()
    }
    context.shadowBlur = 0
  }, [])

  const renderScene = useCallback((timestamp: number) => {
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || viewport.width <= 0 || viewport.height <= 0) return
    const context = canvas.getContext('2d')
    if (!context) return
    rebuildTerritoryTexture()
    const texture = territoryTextureRef.current
    const ratio = pixelRatioRef.current
    const camera = cameraRef.current
    const zoom = zoomRef.current
    const worldSize = worldSizeRef.current
    const cellSize = cellSizeRef.current
    const gridSize = gridSizeRef.current
    const halfWidth = viewport.width / (2 * zoom)
    const halfHeight = viewport.height / (2 * zoom)

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    context.fillStyle = backgroundGradientRef.current ?? '#07111f'
    context.fillRect(0, 0, viewport.width, viewport.height)

    const dotSpacing = 32 * zoom
    const dotOffsetX = ((viewport.width / 2 - camera.x * zoom) % dotSpacing + dotSpacing) % dotSpacing
    const dotOffsetY = ((viewport.height / 2 - camera.y * zoom) % dotSpacing + dotSpacing) % dotSpacing
    context.fillStyle = 'rgba(255,255,255,0.045)'
    context.beginPath()
    for (let x = dotOffsetX; x < viewport.width; x += dotSpacing) {
      for (let y = dotOffsetY; y < viewport.height; y += dotSpacing) {
        context.moveTo(x + 1, y)
        context.arc(x, y, 1, 0, Math.PI * 2)
      }
    }
    context.fill()

    context.save()
    context.translate(viewport.width / 2, viewport.height / 2)
    context.scale(zoom, zoom)
    context.translate(-camera.x, -camera.y)

    context.save()
    context.shadowColor = 'rgba(14,165,233,0.3)'
    context.shadowBlur = 30
    context.fillStyle = '#0c1626'
    context.fillRect(0, 0, worldSize, worldSize)
    context.restore()
    if (texture) {
      context.imageSmoothingEnabled = false
      context.drawImage(texture, 0, 0, gridSize, gridSize, 0, 0, worldSize, worldSize)
    }

    context.strokeStyle = 'rgba(255,255,255,0.045)'
    context.lineWidth = 1
    context.beginPath()
    for (let cell = 0; cell <= gridSize; cell += 4) {
      const coordinate = cell * cellSize
      context.moveTo(coordinate, 0)
      context.lineTo(coordinate, worldSize)
      context.moveTo(0, coordinate)
      context.lineTo(worldSize, coordinate)
    }
    context.stroke()
    context.shadowColor = 'rgba(248,113,113,0.75)'
    context.shadowBlur = 22
    context.strokeStyle = 'rgba(251,113,133,0.95)'
    context.lineWidth = 12
    context.strokeRect(0, 0, worldSize, worldSize)
    context.shadowBlur = 0
    context.strokeStyle = 'rgba(254,240,138,0.85)'
    context.lineWidth = 2
    context.setLineDash([12, 9])
    context.strokeRect(7, 7, worldSize - 14, worldSize - 14)
    context.setLineDash([])

    const bursts = captureBurstsRef.current
    for (const burst of bursts) {
      const progress = (timestamp - burst.startedAt) / 620
      if (progress < 0 || progress > 1) continue
      context.globalAlpha = (1 - progress) * 0.75
      context.strokeStyle = burst.color
      context.lineWidth = 7 * (1 - progress) + 1
      context.shadowColor = burst.color
      context.shadowBlur = 18
      context.beginPath()
      context.arc(burst.x, burst.y, 10 + burst.size * progress, 0, Math.PI * 2)
      context.stroke()
    }
    context.globalAlpha = 1
    context.shadowBlur = 0
    captureBurstsRef.current = bursts.filter((burst) => timestamp - burst.startedAt < 650)

    const players = [...renderPlayersRef.current.values()]
    const mineIndex = players.findIndex((player) => player.id === playerIdRef.current)
    if (mineIndex >= 0) players.push(...players.splice(mineIndex, 1))
    for (const player of players) {
      if (!player.alive) continue
      const visible = (
        player.x >= camera.x - halfWidth - 120
        && player.y >= camera.y - halfHeight - 120
        && player.x <= camera.x + halfWidth + 120
        && player.y <= camera.y + halfHeight + 120
      )
      if (!visible && player.trail.length === 0) continue

      if (player.trail.length > 0) {
        context.save()
        context.lineCap = 'round'
        context.lineJoin = 'round'
        context.beginPath()
        const trailPoints = player.trail.map((cell) => cellCenter(cell, gridSize, cellSize))
        trailPoints.push({ x: player.x, y: player.y })
        traceSmoothPath(context, trailPoints)
        context.strokeStyle = 'rgba(2,6,23,0.72)'
        context.lineWidth = cellSize * 0.78
        context.stroke()
        context.shadowColor = player.color
        context.shadowBlur = 12
        context.strokeStyle = player.color
        context.lineWidth = cellSize * 0.55
        context.stroke()
        context.shadowBlur = 0
        context.strokeStyle = 'rgba(255,255,255,0.28)'
        context.lineWidth = 2.5
        context.stroke()
        context.restore()
      }

      context.save()
      context.translate(player.x, player.y)
      context.rotate(player.angle)
      context.shadowColor = player.color
      context.shadowBlur = 16
      context.fillStyle = player.color
      context.strokeStyle = 'rgba(2,6,23,0.85)'
      context.lineWidth = 4
      context.beginPath()
      context.roundRect(-14, -12, 27, 24, 7)
      context.fill()
      context.stroke()
      context.beginPath()
      context.moveTo(11, -8)
      context.lineTo(21, 0)
      context.lineTo(11, 8)
      context.closePath()
      context.fill()
      context.stroke()
      context.shadowBlur = 0
      context.fillStyle = 'rgba(255,255,255,0.86)'
      context.beginPath()
      context.roundRect(-8, -7, 5, 14, 2)
      context.fill()
      context.fillStyle = '#07111f'
      context.beginPath()
      context.arc(5, -5, 2.2, 0, Math.PI * 2)
      context.arc(5, 5, 2.2, 0, Math.PI * 2)
      context.fill()
      context.restore()

      if (player.id === leaderIdRef.current) {
        context.save()
        context.translate(player.x, player.y - 29)
        context.font = '18px sans-serif'
        context.textAlign = 'center'
        context.shadowColor = 'rgba(250,204,21,0.85)'
        context.shadowBlur = 8
        context.fillText('👑', 0, 0)
        context.restore()
      }

      context.save()
      context.font = `800 ${11 / zoom}px Cairo, sans-serif`
      context.textAlign = 'center'
      context.fillStyle = '#ffffff'
      context.shadowColor = 'rgba(0,0,0,0.95)'
      context.shadowBlur = 7
      context.fillText(`${player.avatar} ${player.name} · ${player.score.toFixed(1)}٪`, player.x, player.y - 22 / zoom)
      context.restore()
    }
    context.restore()
  }, [rebuildTerritoryTexture])

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
        const gradient = context.createLinearGradient(0, 0, 0, rect.height)
        gradient.addColorStop(0, '#101d34')
        gradient.addColorStop(0.55, '#07111f')
        gradient.addColorStop(1, '#050b15')
        backgroundGradientRef.current = gradient
      }
      renderScene(performance.now())
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
      const elapsed = Math.min(0.05, (timestamp - (lastFrameRef.current || timestamp)) / 1_000)
      lastFrameRef.current = timestamp
      updateRenderedPlayers(elapsed)
      renderScene(timestamp)
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

  const pointerPosition = (event: ReactPointerEvent<HTMLCanvasElement>): PaperPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing') return
    const point = pointerPosition(event)
    pointerRef.current = { active: true, start: point, last: point, travelled: 0 }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current
    if (!pointer.active) return
    const point = pointerPosition(event)
    const dx = point.x - pointer.last.x
    const dy = point.y - pointer.last.y
    const distance = Math.hypot(dx, dy)
    if (distance >= 4) {
      pointer.last = point
      pointer.travelled += distance
      setShowGuide(false)
      sendSteering(Math.atan2(dy, dx))
    }
    event.preventDefault()
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current
    if (pointer.active && pointer.travelled < 8) {
      const point = pointerPosition(event)
      const viewport = viewportRef.current
      sendSteering(Math.atan2(point.y - viewport.height / 2, point.x - viewport.width / 2), true)
      setShowGuide(false)
    } else if (pointer.active) {
      sendSteering(desiredAngleRef.current, true)
    }
    pointer.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const respawn = () => {
    sounds.click()
    setPhase('joining')
    renderPlayersRef.current.clear()
    sendRaw({ type: 'paper_public_respawn' })
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#07111f]">
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
        aria-label="ساحة سيطر العامة — اسحب في أي اتجاه للتحرك"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-4 pt-3" dir="rtl">
        <button
          type="button"
          onClick={() => {
            sounds.click()
            onExit()
          }}
          className="pointer-events-auto flex min-h-12 items-center gap-1 font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]"
          aria-label="الخروج من ساحة سيطر"
        >
          <ChevronRight className="h-6 w-6" />
          خروج
        </button>

        <div className="absolute left-1/2 top-1 -translate-x-1/2 text-center drop-shadow-[0_3px_10px_rgba(0,0,0,0.95)]">
          <p className="text-[10px] font-extrabold tracking-wide text-sky-100/80">مساحتك</p>
          <p className="text-3xl font-black leading-none tabular-nums text-white">
            {score.toFixed(1)}<span className="ms-0.5 text-base">٪</span>
          </p>
          <p className="mt-1 whitespace-nowrap text-[9px] font-bold text-pink-200/85">{kills} إسقاط · ساحة عامة</p>
        </div>

        <div className="flex min-h-12 items-center gap-1.5 font-extrabold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]" aria-label={`${playerCount} لاعبين في الساحة`}>
          <Users className="h-5 w-5 text-sky-200" />
          <bdi className="tabular-nums">{playerCount}</bdi>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-[4.25rem] z-10 h-24 w-24 overflow-hidden rounded-2xl border border-white/30 bg-slate-950/90 p-1 shadow-[0_10px_30px_rgba(0,0,0,0.42),0_0_18px_rgba(56,189,248,0.14)] backdrop-blur-md">
        <canvas ref={minimapRef} className="block h-full w-full rounded-xl" aria-label="خريطة الأراضي واللاعبين" />
      </div>

      {leaders.length > 0 && (
        <ol
          className="pointer-events-none absolute left-3 top-12 z-10 w-[8.5rem] space-y-0.5 text-[10px] font-extrabold text-white drop-shadow-[0_2px_7px_rgba(0,0,0,0.98)]"
          aria-label="أكبر ثلاث مساحات"
          dir="rtl"
        >
          {leaders.map((leader, index) => (
            <li key={leader.id} className={`flex h-4 min-w-0 items-center gap-1 ${leader.isMine ? 'text-sky-200' : 'text-white/90'}`}>
              <span className="w-4 shrink-0 text-center" aria-hidden="true">{index === 0 ? '👑' : index + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: leader.color }} />
              <span className="min-w-0 flex-1 truncate">{leader.avatar} {leader.name}</span>
              <bdi className="shrink-0 tabular-nums">{leader.score.toFixed(1)}٪</bdi>
            </li>
          ))}
        </ol>
      )}

      {showGuide && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-x-14 bottom-[14%] z-10 text-center font-extrabold text-white/95 drop-shadow-[0_2px_9px_rgba(0,0,0,0.98)]">
          <p className="text-sm">اسحب في أي اتجاه واخرج من لونك</p>
          <p className="mt-1 text-[10px] text-sky-100/90">ارجع لأرضك واقفل الخط عشان تضم المساحة — واحمي خطك من المنافسين</p>
        </div>
      )}

      {phase === 'joining' && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-[#07111f]/55 text-center text-white">
          <div className="drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]">
            <RefreshCw className="mx-auto h-9 w-9 animate-spin text-sky-300" />
            <p className="mt-3 text-lg font-black">بنجهّز لك لون في الساحة…</p>
            <p className="mt-1 text-xs font-bold text-sky-100/80">هتدخل فورًا مع لاعبين وبوتات</p>
          </div>
        </div>
      )}

      {phase === 'dead' && status === 'online' && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[#050b15]/72 px-8 text-center text-white backdrop-blur-[3px]">
          <div className="w-full max-w-xs">
            <div className="text-5xl">💥</div>
            <p className="mt-3 text-2xl font-black">خطك اتقطع!</p>
            <p className="mt-2 text-sm font-bold text-sky-100/80">
              سيطرت على {score.toFixed(1)}٪ وأسقطت {kills} منافس
            </p>
            <button
              type="button"
              onClick={respawn}
              className="mt-6 min-h-14 w-full rounded-full bg-gradient-to-l from-sky-400 via-cyan-400 to-emerald-400 font-black text-slate-950 shadow-[0_12px_35px_rgba(14,165,233,0.3)] active:scale-95"
            >
              العب تاني فورًا
            </button>
            <button type="button" onClick={onExit} className="mt-3 min-h-11 px-5 font-extrabold text-white/70">
              ارجع للألعاب
            </button>
          </div>
        </div>
      )}

      {status !== 'online' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#050b15]/84 px-8 text-center text-white">
          <div className="drop-shadow-[0_3px_12px_rgba(0,0,0,0.95)]">
            <WifiOff className="mx-auto h-10 w-10 text-amber-300" />
            <p className="mt-3 text-lg font-black">الاتصال بالساحة اتقطع</p>
            <p className="mt-1 text-xs font-bold text-white/65">هنرجّعك لنفس اللعب بمجرد ما الشبكة ترجع</p>
            <button
              type="button"
              onClick={reconnect}
              className="mt-4 min-h-12 rounded-full bg-sky-400 px-7 font-black text-slate-950 shadow-lg shadow-black/30 active:scale-95"
            >
              حاول تاني
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
