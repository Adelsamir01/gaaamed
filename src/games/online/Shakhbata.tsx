import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Crown, Eraser, Pen, Send, Trash2, Undo2 } from 'lucide-react'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import type { ServerMessage } from '@/online/client'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { launchConfetti } from '@/lib/confetti'
import { AvatarCircle } from '@/sections/components'

const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#78350f', '#b45309', '#52525b', '#6b7280']
const SIZES = [4, 8, 14, 22]
// تجميع نقاط الرسم في دفعات ~40ms قبل الإرسال (بدل رسالة لكل pointermove)
const STROKE_BATCH_MS = 40

// لون ثابت لكل اسم في الدردشة (هاش بسيط)
const NAME_COLORS = ['#5eead4', '#fcd34d', '#93c5fd', '#f9a8d4', '#fca5a5', '#c4b5fd', '#6ee7b7', '#fdba74']
function nameColor(name = '') {
  let h = 0
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  return NAME_COLORS[h % NAME_COLORS.length]
}

interface Pt { x: number; y: number }
interface StrokeEvent { op: 'stroke' | 'clear' | 'undo'; points: Pt[]; color: string; size: number; tool: 'pen' | 'eraser'; strokeId: string; done?: boolean }
interface ScorePlayer { slot: number; name: string; avatar: string; score: number; guessed: boolean }
interface ChatMsg { id: number; kind: 'message' | 'system' | 'correct' | 'hint'; name?: string; text: string }
type Status = 'choosing' | 'playing' | 'reveal' | 'ended'

function replayStrokes(events: StrokeEvent[]): StrokeEvent[] {
  const strokes: StrokeEvent[] = []
  for (const e of events) {
    if (e.op === 'clear') strokes.length = 0
    else if (e.op === 'undo') {
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokes[i].strokeId === e.strokeId) strokes.splice(i, 1)
      }
    } else strokes.push(e)
  }
  return strokes
}

// ===== مربعات حروف الكلمة (نمط سكريبل) =====
function WordTiles({ pattern, hints, revealWord }: { pattern?: string; hints?: { index: number; letter: string }[]; revealWord?: string }) {
  const source = revealWord ?? pattern ?? ''
  const hintMap = new Map((hints ?? []).map((h) => [h.index, h.letter]))
  return (
    <div dir="rtl" className="flex flex-wrap items-center justify-center gap-1">
      {[...source].map((c, i) => {
        if (c === ' ') return <span key={i} className="w-2.5" />
        const letter = revealWord ? c : hintMap.get(i)
        if (letter) {
          return (
            <motion.span
              key={`${i}-${letter}`}
              initial={{ scale: 0, y: 10, rotate: -12 }}
              animate={{ scale: 1, y: 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 20, delay: revealWord ? i * 0.045 : 0 }}
              className="w-6 h-8 rounded-lg bg-amber-400/15 border border-amber-400/50 text-amber-300 grid place-items-center text-base font-black shadow-[0_0_12px_rgba(245,158,11,0.18)]"
            >
              {letter}
            </motion.span>
          )
        }
        return <span key={i} className="w-6 h-8 rounded-lg bg-white/[0.04] border border-white/10 border-b-[3px] border-b-white/25" />
      })}
    </div>
  )
}

// ===== شريحة لاعب في لوحة النقاط المصغرة =====
function ScoreChip({ p, isDrawer, isMe }: { p: ScorePlayer; isDrawer: boolean; isMe: boolean }) {
  const prevRef = useRef(p.score)
  const [delta, setDelta] = useState<number | null>(null)
  useEffect(() => {
    const d = p.score - prevRef.current
    prevRef.current = p.score
    if (d > 0) {
      setDelta(d)
      const t = setTimeout(() => setDelta(null), 1300)
      return () => clearTimeout(t)
    }
  }, [p.score])
  return (
    <motion.span
      layout
      className={cn(
        'relative glass rounded-full ps-1.5 pe-2.5 py-1 flex items-center gap-1.5 shrink-0',
        isDrawer && 'border-amber-400/60 shadow-[0_0_14px_rgba(245,158,11,0.18)]',
        !isDrawer && p.guessed && 'border-emerald-400/50',
        isMe && 'bg-emerald-500/10',
      )}
    >
      <span className="relative w-6 h-6 grid place-items-center text-sm select-none">
        {p.avatar}
        {isDrawer && <span className="absolute -bottom-1.5 -end-1.5 text-[9px]">🖌️</span>}
      </span>
      <span className="text-[11px] font-bold max-w-[64px] truncate">{p.name}</span>
      <motion.span key={p.score} initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }} className="text-[11px] font-black text-amber-300 tabular-nums">
        {p.score}
      </motion.span>
      {p.guessed && !isDrawer && <Check className="w-3 h-3 text-emerald-400" />}
      <AnimatePresence>
        {delta !== null && (
          <motion.span
            initial={{ opacity: 0, y: 4, scale: 0.6 }}
            animate={{ opacity: 1, y: -14, scale: 1.15 }}
            exit={{ opacity: 0, y: -22 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
            className="absolute -top-1 end-2 text-[10px] font-black text-emerald-300 pointer-events-none"
          >
            +{delta}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  )
}

// ===== بطاقة منصة التتويج =====
function PodiumCard({ p, rank, delay, isMe }: { p: ScorePlayer; rank: 1 | 2 | 3; delay: number; isMe: boolean }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'
  const bar =
    rank === 1
      ? 'h-16 bg-gradient-to-t from-amber-500/30 to-amber-400/60 glow-amber'
      : rank === 2
        ? 'h-11 bg-gradient-to-t from-slate-400/20 to-slate-300/40'
        : 'h-8 bg-gradient-to-t from-orange-700/20 to-orange-500/40'
  return (
    <motion.div
      initial={{ opacity: 0, y: 48 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 17 }}
      className="flex flex-col items-center gap-1.5 w-20"
    >
      {rank === 1 && (
        <motion.div animate={{ rotate: [-6, 6, -6] }} transition={{ repeat: Infinity, duration: 2.2 }}>
          <Crown className="w-5 h-5 text-amber-400" />
        </motion.div>
      )}
      <div className="relative">
        <AvatarCircle emoji={p.avatar} size={rank === 1 ? 'lg' : 'md'} glow={rank === 1} />
        <span className="absolute -bottom-1.5 start-1/2 -translate-x-1/2 text-lg leading-none">{medal}</span>
      </div>
      <p className={cn('text-[11px] font-extrabold truncate max-w-full', isMe && 'text-emerald-300')}>
        {p.name} {isMe && '(أنت)'}
      </p>
      <p className="text-sm font-black text-amber-300 tabular-nums -mt-1">{p.score}</p>
      <div className={cn('w-full rounded-t-xl mt-1', bar)} />
    </motion.div>
  )
}

export default function Shakhbata({ onFinish }: GameProps) {
  const { slot, sendRaw, subscribe, players } = useOnline()
  const mySlot = slot ?? 1

  const [status, setStatus] = useState<Status>('choosing')
  const [round, setRound] = useState(1)
  const [totalRounds, setTotalRounds] = useState(1)
  const [drawerSlot, setDrawerSlot] = useState<number>(1)
  const [drawerName, setDrawerName] = useState('')
  const [wordOptions, setWordOptions] = useState<string[]>([])
  const [myWord, setMyWord] = useState('')
  const [wordPattern, setWordPattern] = useState('')
  const [hints, setHints] = useState<{ index: number; letter: string }[]>([])
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [duration, setDuration] = useState(60)
  const [timeLeft, setTimeLeft] = useState(0)
  const [scores, setScores] = useState<ScorePlayer[]>([])
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [revealWord, setRevealWord] = useState<string | null>(null)
  const [revealReason, setRevealReason] = useState('')
  const [leaderboard, setLeaderboard] = useState<ScorePlayer[] | null>(null)
  const [draft, setDraft] = useState('')

  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [color, setColor] = useState('#111827')
  const [size, setSize] = useState(8)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)
  const eventsRef = useRef<StrokeEvent[]>([])
  const myStrokeIdsRef = useRef<string[]>([])
  const drawingRef = useRef(false)
  const strokeIdRef = useRef('')
  const pendingRef = useRef<Pt[]>([])
  const liveTailRef = useRef<Pt | null>(null)
  // ذيل آخر قطعة مرسومة لكل strokeId وارد — لربط الدفعات ببعضها بمنحنى متصل
  const remoteTailsRef = useRef(new Map<string, Pt>())
  const lastSentRef = useRef(0)
  const chatIdRef = useRef(0)
  const finishedRef = useRef(false)
  // بصمة آخر word_options — الخادم يعيد الإرسال احتياطيًا بعد ~750ms، فلا نكرر الصوت/الحالة
  const wordOptionsSigRef = useRef('')

  const isDrawer = drawerSlot === mySlot
  const iGuessed = scores.find((p) => p.slot === mySlot)?.guessed ?? false
  const drawerAvatar = players.find((p) => p.slot === drawerSlot)?.avatar ?? '🖌️'

  // ===== أدوات الرسم على الـ canvas =====
  const getCtx = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return canvas.getContext('2d')
  }, [])

  const setupCtx = useCallback((ctx: CanvasRenderingContext2D, s: { color: string; size: number; tool: 'pen' | 'eraser' }) => {
    // الممحاة تمسح فعليًا لتكشف ورقة النقاط تحتها
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = s.tool === 'eraser' ? 'rgba(0,0,0,1)' : s.color
    ctx.lineWidth = s.size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  // رسم خط ناعم بمنحنيات تربيعية (تنعيم بنقاط المنتصف)
  const drawStroke = useCallback(
    (stroke: StrokeEvent) => {
      const canvas = canvasRef.current
      const ctx = getCtx()
      if (!canvas || !ctx || !stroke.points.length) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const pts = stroke.points
      ctx.save()
      setupCtx(ctx, stroke)
      ctx.beginPath()
      if (pts.length < 3) {
        ctx.moveTo(pts[0].x * w, pts[0].y * h)
        const last = pts[pts.length - 1]
        ctx.lineTo(last.x * w + (pts.length === 1 ? 0.01 : 0), last.y * h)
      } else {
        ctx.moveTo(pts[0].x * w, pts[0].y * h)
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = ((pts[i].x + pts[i + 1].x) / 2) * w
          const midY = ((pts[i].y + pts[i + 1].y) / 2) * h
          ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, midX, midY)
        }
        ctx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h)
      }
      ctx.stroke()
      ctx.restore()
    },
    [getCtx, setupCtx],
  )

  // رسم دفعة نقاط واردة بسلاسة: تبدأ من ذيل الدفعة السابقة لنفس الخط (strokeId)
  // فيظهر الخط متصلًا رغم وصوله على دفعات ~40ms، وتُكمل العلامة done الذيل حتى آخر نقطة
  const drawBatch = useCallback(
    (e: StrokeEvent) => {
      const canvas = canvasRef.current
      const ctx = getCtx()
      if (!canvas || !ctx || !e.points.length) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const pts = e.points
      const tails = remoteTailsRef.current
      ctx.save()
      setupCtx(ctx, e)
      let from = tails.get(e.strokeId) ?? pts[0]
      if (pts.length === 1) {
        ctx.beginPath()
        ctx.moveTo(from.x * w, from.y * h)
        ctx.lineTo(pts[0].x * w + 0.01, pts[0].y * h)
        ctx.stroke()
      }
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1]
        const point = pts[i]
        const mid = { x: (prev.x + point.x) / 2, y: (prev.y + point.y) / 2 }
        ctx.beginPath()
        ctx.moveTo(from.x * w, from.y * h)
        ctx.quadraticCurveTo(prev.x * w, prev.y * h, mid.x * w, mid.y * h)
        ctx.stroke()
        from = mid
      }
      if (e.done && pts.length >= 2) {
        const last = pts[pts.length - 1]
        const prev = pts[pts.length - 2]
        ctx.beginPath()
        ctx.moveTo(from.x * w, from.y * h)
        ctx.quadraticCurveTo(prev.x * w, prev.y * h, last.x * w, last.y * h)
        ctx.stroke()
        tails.delete(e.strokeId)
      } else {
        tails.set(e.strokeId, from)
      }
      ctx.restore()
    },
    [getCtx, setupCtx],
  )

  // قطعة حية أثناء سحب الإصبع: منحنى تربيعي من آخر نقطة وسطية
  const drawLiveSegment = useCallback(
    (from: Pt, ctrl: Pt, to: Pt, s: { color: string; size: number; tool: 'pen' | 'eraser' }) => {
      const canvas = canvasRef.current
      const ctx = getCtx()
      if (!canvas || !ctx) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.save()
      setupCtx(ctx, s)
      ctx.beginPath()
      ctx.moveTo(from.x * w, from.y * h)
      ctx.quadraticCurveTo(ctrl.x * w, ctrl.y * h, to.x * w, to.y * h)
      ctx.stroke()
      ctx.restore()
    },
    [getCtx, setupCtx],
  )

  const fullRedraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = getCtx()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    remoteTailsRef.current.clear()
    for (const s of replayStrokes(eventsRef.current)) drawBatch(s)
  }, [drawBatch, getCtx])

  const clearBoard = useCallback(() => {
    eventsRef.current = []
    myStrokeIdsRef.current = []
    remoteTailsRef.current.clear()
    const canvas = canvasRef.current
    const ctx = getCtx()
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
  }, [getCtx])

  // ضبط حجم الـ canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      fullRedraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [fullRedraw])

  const applyDrawEvent = useCallback(
    (e: StrokeEvent) => {
      eventsRef.current.push(e)
      if (e.op === 'stroke') {
        drawBatch(e)
      } else {
        fullRedraw()
      }
    },
    [drawBatch, fullRedraw],
  )

  const pushChat = useCallback((kind: ChatMsg['kind'], text: string, name?: string) => {
    setChat((prev) => [...prev.slice(-79), { id: ++chatIdRef.current, kind, name, text }])
  }, [])

  // ===== استقبال رسائل الخادم =====
  useEffect(() => {
    return subscribe((ev) => {
      if (ev.kind !== 'sh') return
      const msg = ev.msg as ServerMessage
      switch (msg.type) {
        case 'round_choosing':
          setStatus('choosing')
          setRound(msg.round as number)
          setTotalRounds(msg.totalRounds as number)
          setDrawerSlot(msg.drawer as number)
          setDrawerName(msg.drawerName as string)
          setWordOptions([])
          setMyWord('')
          setHints([])
          setRevealWord(null)
          setRevealReason('')
          setEndsAt(null)
          wordOptionsSigRef.current = ''
          clearBoard()
          break
        case 'word_options': {
          const opts = (msg.options as string[]) ?? []
          const sig = opts.join('')
          if (sig !== wordOptionsSigRef.current) sounds.pop()
          wordOptionsSigRef.current = sig
          setWordOptions(opts)
          break
        }
        case 'your_word':
          setMyWord(msg.word as string)
          break
        case 'round':
          setStatus('playing')
          setDrawerSlot(msg.drawer as number)
          setWordPattern(msg.wordPattern as string)
          setDuration(msg.duration as number)
          setEndsAt(msg.endsAt as number)
          setTimeLeft(msg.duration as number)
          setHints([])
          sounds.pop()
          break
        case 'hint':
          setHints(msg.hints as { index: number; letter: string }[])
          sounds.tick()
          break
        case 'draw':
          applyDrawEvent(msg as unknown as StrokeEvent)
          break
        case 'scores':
          setScores(msg.players as ScorePlayer[])
          break
        case 'chat':
          pushChat(msg.kind as ChatMsg['kind'], msg.text as string, msg.name as string | undefined)
          if (msg.kind === 'correct') sounds.correct()
          break
        case 'round_end':
          setStatus('reveal')
          setRevealWord(msg.word as string)
          setRevealReason((msg.reason as string) ?? '')
          setScores(msg.players as ScorePlayer[])
          setEndsAt(null)
          break
        case 'ended': {
          setStatus('ended')
          const board = msg.leaderboard as ScorePlayer[]
          setLeaderboard(board)
          setEndsAt(null)
          break
        }
      }
    })
  }, [subscribe, applyDrawEvent, pushChat, clearBoard])

  // المؤقّت المحلي
  useEffect(() => {
    if (!endsAt) return
    const t = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)))
    }, 250)
    return () => clearInterval(t)
  }, [endsAt])

  // تمرير الدردشة للأسفل بنعومة
  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat])

  // ===== النتيجة النهائية =====
  const myRank = useMemo(() => {
    if (!leaderboard) return 0
    return leaderboard.findIndex((p) => p.slot === mySlot) + 1
  }, [leaderboard, mySlot])

  useEffect(() => {
    if (status === 'ended' && myRank === 1 && !finishedRef.current) {
      sounds.win()
      const colors = ['#10b981', '#f59e0b', '#ffffff', '#14b8a6']
      launchConfetti({ particleCount: 140, spread: 85, origin: { y: 0.3 }, colors })
      setTimeout(() => launchConfetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.5 }, colors }), 300)
      setTimeout(() => launchConfetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.5 }, colors }), 500)
    }
  }, [status, myRank])

  const finishMatch = () => {
    if (finishedRef.current || !leaderboard) return
    finishedRef.current = true
    const myScore = leaderboard.find((p) => p.slot === mySlot)?.score ?? 0
    const rewards = [
      { coins: 30, xp: 40, outcome: 'win' as const },
      { coins: 20, xp: 25, outcome: 'draw' as const },
      { coins: 15, xp: 18, outcome: 'draw' as const },
    ]
    const r = rewards[myRank - 1] ?? { coins: 10, xp: 10, outcome: 'loss' as const }
    onFinish({
      gameId: 'shakhbata',
      outcome: r.outcome,
      score: myScore,
      bestCandidate: myScore,
      coinsEarned: r.coins,
      xpEarned: r.xp,
      summary:
        myRank === 1
          ? `فزت بمباراة شخبطة برصيد ${myScore} نقطة! 🏆`
          : `حللت في المركز ${myRank} برصيد ${myScore} نقطة`,
      detail: `الفائز: ${leaderboard[0]?.name ?? ''}`,
    })
  }

  // ===== الرسم =====
  const pointFromEvent = (e: React.PointerEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: Number(((e.clientX - rect.left) / rect.width).toFixed(4)),
      y: Number(((e.clientY - rect.top) / rect.height).toFixed(4)),
    }
  }

  const canDraw = status === 'playing' && isDrawer

  const startStroke = (e: React.PointerEvent) => {
    if (!canDraw) return
    e.preventDefault()
    drawingRef.current = true
    strokeIdRef.current = crypto.randomUUID()
    pendingRef.current = [pointFromEvent(e)]
    liveTailRef.current = null
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  const moveStroke = (e: React.PointerEvent) => {
    if (!drawingRef.current || !canDraw) return
    e.preventDefault()
    const point = pointFromEvent(e)
    const pts = pendingRef.current
    const prev = pts[pts.length - 1]
    if (Math.hypot(point.x - prev.x, point.y - prev.y) < 0.0015) return
    pts.push(point)
    const style = { color: tool === 'eraser' ? '#ffffff' : color, size, tool }
    // منحنى حي ناعم عبر النقطة السابقة إلى منتصف القطعة الجديدة
    const mid = { x: (prev.x + point.x) / 2, y: (prev.y + point.y) / 2 }
    drawLiveSegment(liveTailRef.current ?? prev, prev, mid, style)
    liveTailRef.current = mid
    if (Date.now() - lastSentRef.current > STROKE_BATCH_MS && pts.length > 1) flushStroke(false)
  }

  const endStroke = () => {
    if (!drawingRef.current) return
    drawingRef.current = false
    const pts = pendingRef.current
    // أكمل ذيل المنحنى حتى آخر نقطة
    if (pts.length >= 2 && liveTailRef.current) {
      const style = { color: tool === 'eraser' ? '#ffffff' : color, size, tool }
      drawLiveSegment(liveTailRef.current, pts[pts.length - 2], pts[pts.length - 1], style)
    }
    liveTailRef.current = null
    flushStroke(true)
    myStrokeIdsRef.current.push(strokeIdRef.current)
    // نقرة مفردة بدون حركة — أرسلها كنقطتين متقاربتين
    const alreadySent = eventsRef.current.some((e) => e.strokeId === strokeIdRef.current)
    if (!alreadySent && pts.length === 1) {
      const p = pts[0]
      const ev: StrokeEvent = { op: 'stroke', strokeId: strokeIdRef.current, points: [p, { x: p.x + 0.0001, y: p.y + 0.0001 }], color: tool === 'eraser' ? '#ffffff' : color, size, tool, done: true }
      eventsRef.current.push(ev)
      drawStroke(ev)
      sendRaw({ type: 'draw', ...ev })
    }
    pendingRef.current = []
  }

  const flushStroke = (force: boolean) => {
    if (!force && pendingRef.current.length < 2) return
    if (pendingRef.current.length >= 2) {
      const ev: StrokeEvent = {
        op: 'stroke',
        strokeId: strokeIdRef.current,
        points: pendingRef.current,
        color: tool === 'eraser' ? '#ffffff' : color,
        size,
        tool,
        done: force, // الدفعة الأخيرة من الخط — المستقبِل يكمل بها ذيل المنحنى
      }
      // أضف للوحة المحلية (النقاط الجديدة فقط تُرسم؛ الخط الكامل يُحفظ للتراجع)
      eventsRef.current.push(ev)
      sendRaw({ type: 'draw', ...ev })
    }
    pendingRef.current = pendingRef.current.slice(-1)
    lastSentRef.current = Date.now()
  }

  const undoStroke = () => {
    const lastId = myStrokeIdsRef.current.pop()
    if (!lastId) return
    sounds.click()
    eventsRef.current.push({ op: 'undo', strokeId: lastId, points: [], color: '', size: 0, tool: 'pen' })
    fullRedraw()
    sendRaw({ type: 'draw', op: 'undo', strokeId: lastId })
  }

  const clearAll = () => {
    sounds.click()
    eventsRef.current.push({ op: 'clear', strokeId: '', points: [], color: '', size: 0, tool: 'pen' })
    fullRedraw()
    sendRaw({ type: 'draw', op: 'clear' })
  }

  const chooseWord = (word: string) => {
    sounds.pop()
    setWordOptions([])
    sendRaw({ type: 'choose_word', word })
  }

  const sendGuess = () => {
    const text = draft.trim()
    if (!text) return
    sounds.pop()
    sendRaw({ type: 'guess', text })
    setDraft('')
  }

  const topScores = useMemo(() => [...scores].sort((a, b) => b.score - a.score), [scores])
  const timerPct = duration ? Math.min(100, (timeLeft / duration) * 100) : 0
  const timerBar =
    timeLeft <= 7
      ? 'from-red-500 to-rose-400'
      : timeLeft <= 15
        ? 'from-amber-400 to-orange-400'
        : 'from-emerald-400 to-teal-300'
  const reward = useMemo(() => {
    const rewards = [
      { coins: 30, xp: 40 },
      { coins: 20, xp: 25 },
      { coins: 15, xp: 18 },
    ]
    return rewards[myRank - 1] ?? { coins: 10, xp: 10 }
  }, [myRank])

  return (
    <div className="relative flex flex-col gap-1.5 h-[calc(100dvh-5rem)] overflow-hidden select-none">
      {/* ===== الترويسة: جولة + رسام + مؤقت ===== */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span className="glass rounded-full px-3 py-1 text-[11px] font-extrabold text-muted-foreground">
          الجولة <span className="text-foreground font-black">{round}</span> / {totalRounds}
        </span>
        <span className="glass rounded-full px-3 py-1 text-[11px] font-extrabold flex items-center gap-1.5 min-w-0 border-amber-400/25">
          <span className="text-sm leading-none">{drawerAvatar}</span>
          <span className="truncate max-w-[110px]">{isDrawer ? 'أنت ترسم!' : drawerName}</span>
          <span className="text-amber-300">🖌️</span>
        </span>
        {endsAt && status === 'playing' ? (
          <motion.span
            animate={timeLeft <= 15 ? { scale: [1, 1.14, 1] } : { scale: 1 }}
            transition={timeLeft <= 15 ? { repeat: Infinity, duration: 0.9 } : {}}
            className={cn(
              'glass rounded-full px-2.5 py-1 text-sm font-black tabular-nums',
              timeLeft <= 7 ? 'text-red-400 border-red-400/50' : timeLeft <= 15 ? 'text-amber-300 border-amber-400/40' : 'text-emerald-300',
            )}
          >
            {timeLeft}
          </motion.span>
        ) : (
          <span className="w-10" />
        )}
      </div>

      {/* ===== شريط الوقت المتدرج ===== */}
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden shrink-0">
        {endsAt && status === 'playing' && (
          <motion.div
            className={cn('h-full rounded-full bg-gradient-to-l', timerBar)}
            animate={{ width: `${timerPct}%`, opacity: timeLeft <= 15 ? [1, 0.55, 1] : 1 }}
            transition={{ width: { duration: 0.25, ease: 'linear' }, opacity: { repeat: Infinity, duration: 0.8 } }}
          />
        )}
      </div>

      {/* ===== الكلمة: مربعات حروف / حبّة الرسام ===== */}
      <div className="shrink-0 min-h-[40px] flex items-center justify-center">
        {isDrawer && status === 'playing' ? (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="glass-strong rounded-full px-6 py-1.5 border-emerald-400/40 glow-emerald flex items-center gap-2"
          >
            <span className="text-base">🖌️</span>
            <span className="text-xl font-black text-gradient tracking-wide">{myWord}</span>
          </motion.div>
        ) : status === 'reveal' && revealWord ? (
          <WordTiles revealWord={revealWord} />
        ) : status === 'playing' && wordPattern ? (
          <WordTiles pattern={wordPattern} hints={hints} />
        ) : (
          <span className="text-[11px] text-muted-foreground font-bold">…</span>
        )}
      </div>

      {/* ===== اللوحة الورقية ===== */}
      <div
        className="relative rounded-3xl overflow-hidden border border-white/15 shrink-0 shadow-[inset_0_2px_16px_rgba(2,6,23,0.14)] h-[54%]"
        style={{
          background: '#fdfdfa',
          backgroundImage: 'radial-gradient(circle, rgba(15,23,42,0.08) 1px, transparent 1px)',
          backgroundSize: '22px 22px',
        }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ touchAction: 'none', overscrollBehavior: 'none', cursor: canDraw ? 'crosshair' : 'default' }}
          onPointerDown={startStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />

        {/* ===== مرسى أدوات الرسام العائم ===== */}
        <AnimatePresence>
          {canDraw && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="absolute bottom-2 inset-x-2 z-20 glass-strong rounded-2xl border-white/20 shadow-[0_10px_36px_rgba(2,6,23,0.5)] p-2 flex flex-col gap-1.5"
            >
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTool('pen')}
                  className={cn(
                    'w-8 h-8 rounded-xl grid place-items-center border transition-all',
                    tool === 'pen'
                      ? 'bg-emerald-500/25 border-emerald-400/70 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10',
                  )}
                >
                  <Pen className="w-4 h-4" style={{ color: tool === 'pen' ? color : undefined }} />
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={cn(
                    'w-8 h-8 rounded-xl grid place-items-center border transition-all',
                    tool === 'eraser'
                      ? 'bg-emerald-500/25 border-emerald-400/70 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10',
                  )}
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <button onClick={undoStroke} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-slate-300 hover:bg-white/10 transition-all">
                  <Undo2 className="w-4 h-4" />
                </button>
                <button onClick={clearAll} className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 grid place-items-center hover:bg-red-500/15 transition-all">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
                <span className="w-px h-5 bg-white/15 mx-0.5" />
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={cn(
                      'flex-1 h-8 rounded-xl grid place-items-center border transition-all',
                      size === s ? 'border-emerald-400/70 bg-emerald-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10',
                    )}
                  >
                    <span
                      className="rounded-full"
                      style={{
                        width: Math.min(20, 4 + s * 0.72),
                        height: Math.min(20, 4 + s * 0.72),
                        background: tool === 'eraser' ? '#ffffff' : color,
                        border: tool === 'eraser' ? '1.5px solid #94a3b8' : 'none',
                      }}
                    />
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-9 gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColor(c)
                      setTool('pen')
                    }}
                    className={cn(
                      'aspect-square rounded-full transition-transform',
                      color === c && tool === 'pen' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111a2e] scale-110' : 'hover:scale-110',
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ===== لوحة النقاط المصغرة ===== */}
      {scores.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 shrink-0">
          {topScores.map((p) => (
            <ScoreChip key={p.slot} p={p} isDrawer={p.slot === drawerSlot && status !== 'ended'} isMe={p.slot === mySlot} />
          ))}
        </div>
      )}

      {/* ===== الدردشة: فقاعات ===== */}
      <div ref={chatRef} className="glass rounded-2xl p-2 flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-1.5">
        {chat.length === 0 && <p className="text-center text-[11px] text-muted-foreground my-auto">خمّنوا الكلمة هنا… 💬</p>}
        {chat.map((m) => {
          if (m.kind === 'message') {
            return (
              <div key={m.id} className="flex">
                <div className="max-w-[88%] bg-white/[0.06] border border-white/10 rounded-xl rounded-ss-sm px-2.5 py-1">
                  <span className="text-[11px] font-extrabold" style={{ color: nameColor(m.name) }}>
                    {m.name}
                  </span>{' '}
                  <span className="text-xs text-slate-100 leading-relaxed">{m.text}</span>
                </div>
              </div>
            )
          }
          if (m.kind === 'correct') {
            const pts = /\+(\d+)/.exec(m.text)?.[1]
            return (
              <motion.div
                key={m.id}
                initial={{ scale: 0.7, opacity: 0, y: 8 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                className="mx-auto flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/40 px-3 py-1 shadow-[0_0_16px_rgba(16,185,129,0.22)]"
              >
                <span className="text-[11px] font-extrabold text-emerald-300">🎯 {m.text.replace(/\s*\+\d+$/, '')}</span>
                {pts && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.6, 1] }} transition={{ delay: 0.15, duration: 0.5 }} className="text-[11px] font-black text-amber-300">
                    +{pts}
                  </motion.span>
                )}
              </motion.div>
            )
          }
          if (m.kind === 'hint') {
            return (
              <motion.div
                key={m.id}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                className="mx-auto rounded-full bg-amber-500/15 border border-amber-400/40 px-3 py-1 text-[11px] font-extrabold text-amber-300"
              >
                💡 {m.text}
              </motion.div>
            )
          }
          return (
            <div key={m.id} className="mx-auto rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground">
              {m.text}
            </div>
          )
        })}
      </div>

      {/* ===== حقل التخمين ===== */}
      <div className="glass-strong rounded-full flex items-center gap-2 p-1.5 shrink-0">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendGuess()}
          placeholder={isDrawer ? 'أنت الرسام في هذه الجولة…' : iGuessed && status === 'playing' ? 'خمّنت بشكل صحيح! 🎉' : 'خمّن الكلمة…'}
          disabled={status === 'ended'}
          className="flex-1 bg-transparent px-3 py-2 text-sm font-bold placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-60"
        />
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={sendGuess}
          disabled={!draft.trim()}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0',
            draft.trim() ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white glow-emerald' : 'bg-white/10 text-muted-foreground',
          )}
        >
          <Send className="w-4 h-4 -scale-x-100" />
        </motion.button>
      </div>

      {/* ===== غطاء اختيار الكلمة / بداية الجولة ===== */}
      <AnimatePresence>
        {status === 'choosing' && (
          <motion.div
            key={`choosing-${round}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 rounded-3xl bg-slate-900/90 backdrop-blur-xl border border-white/10 flex flex-col items-center justify-center gap-2.5 p-6 overflow-hidden"
          >
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 16 }}
              className="glass rounded-full px-3.5 py-1 text-[11px] font-extrabold text-muted-foreground tracking-wide"
            >
              الجولة {round} من {totalRounds}
            </motion.span>
            <motion.div
              initial={{ scale: 0, rotate: -24 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 13 }}
              className="relative"
            >
              <AvatarCircle emoji={drawerAvatar} size="lg" glow />
              <motion.span animate={{ rotate: [-8, 8, -8] }} transition={{ repeat: Infinity, duration: 1.6 }} className="absolute -bottom-1 -end-2 text-2xl">
                🖌️
              </motion.span>
            </motion.div>
            <motion.h3 initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.28 }} className="text-2xl font-black">
              {isDrawer ? 'دورك في الرسم!' : <><span className="text-gradient">{drawerName}</span> يرسم الآن</>}
            </motion.h3>

            {isDrawer && wordOptions.length > 0 ? (
              <>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-xs text-muted-foreground">
                  اختر كلمة — سيُختار أول خيار تلقائيًا
                </motion.p>
                <div className="flex flex-col gap-2.5 w-full max-w-[260px] mt-1">
                  {wordOptions.map((w, i) => (
                    <motion.button
                      key={w}
                      initial={{ opacity: 0, x: 28, scale: 0.94 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      transition={{ delay: 0.45 + i * 0.13, type: 'spring', stiffness: 280, damping: 20 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => chooseWord(w)}
                      className="glass-strong rounded-2xl py-3.5 px-5 text-lg font-black text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/15 hover:border-emerald-400/60 transition-all"
                    >
                      {w}
                    </motion.button>
                  ))}
                </div>
              </>
            ) : isDrawer ? (
              <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }} className="text-sm text-muted-foreground">
                جاري تحضير الكلمات…
              </motion.p>
            ) : (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.42 }} className="text-sm text-muted-foreground">
                {drawerName} يختار كلمة — استعد للتخمين! 🤔
              </motion.p>
            )}

            <div className="w-full max-w-[260px] h-1 rounded-full bg-white/10 overflow-hidden mt-2">
              <motion.div
                key={`cd-${round}`}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 8, ease: 'linear' }}
                className="h-full rounded-full bg-gradient-to-l from-amber-400 to-emerald-400"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== غطاء كشف الكلمة بين الجولات ===== */}
      <AnimatePresence>
        {status === 'reveal' && (
          <motion.div
            key={`reveal-${round}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 rounded-3xl bg-slate-900/90 backdrop-blur-xl border border-white/10 flex flex-col items-center justify-center gap-2 p-6"
          >
            {revealReason && (
              <motion.span initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-full px-3 py-0.5 text-[11px] font-bold text-muted-foreground">
                {revealReason}
              </motion.span>
            )}
            <p className="text-xs text-muted-foreground mt-1">الكلمة كانت</p>
            <motion.p
              initial={{ scale: 0.55, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 240, damping: 15 }}
              className="text-4xl font-black text-gradient"
            >
              {revealWord}
            </motion.p>
            <div className="flex flex-wrap justify-center gap-1.5 mt-2 max-w-full">
              {topScores.slice(0, 4).map((p, i) => (
                <motion.span
                  key={p.slot}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  className="glass rounded-full px-2.5 py-1 text-[11px] font-bold flex items-center gap-1"
                >
                  {p.avatar} {p.name} · <span className="text-amber-300 font-black">{p.score}</span>
                </motion.span>
              ))}
            </div>
            <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.4 }} className="text-[11px] text-muted-foreground mt-3">
              الجولة التالية بعد قليل…
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== لوحة النتائج النهائية: منصة تتويج ===== */}
      <AnimatePresence>
        {status === 'ended' && leaderboard && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-50 bg-[#0b1220]/95 backdrop-blur-md flex items-center justify-center p-5">
            <motion.div
              initial={{ scale: 0.85, y: 24 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="w-full max-w-[400px] glass rounded-[2rem] p-6 flex flex-col items-center max-h-[85dvh] overflow-y-auto"
            >
              <div className="text-5xl mb-1">{myRank === 1 ? '🏆' : '🎨'}</div>
              <h2 className="text-2xl font-black text-gradient mb-0.5">{myRank === 1 ? 'فزت بالمباراة!' : 'انتهت المباراة!'}</h2>
              <p className="text-xs text-muted-foreground mb-4">الترتيب النهائي</p>

              {/* المنصة */}
              <div className="flex items-end justify-center gap-3 w-full mb-4" dir="rtl">
                {leaderboard[1] && <PodiumCard p={leaderboard[1]} rank={2} delay={0.3} isMe={leaderboard[1].slot === mySlot} />}
                {leaderboard[0] && <PodiumCard p={leaderboard[0]} rank={1} delay={0.12} isMe={leaderboard[0].slot === mySlot} />}
                {leaderboard[2] && <PodiumCard p={leaderboard[2]} rank={3} delay={0.45} isMe={leaderboard[2].slot === mySlot} />}
              </div>

              {/* بقية الترتيب */}
              {leaderboard.length > 3 && (
                <div className="w-full flex flex-col gap-1.5 mb-4">
                  {leaderboard.slice(3).map((p, i) => (
                    <motion.div
                      key={p.slot}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.55 + i * 0.08 }}
                      className={cn(
                        'flex items-center gap-2.5 rounded-2xl px-3 py-2 border',
                        p.slot === mySlot ? 'bg-emerald-500/10 border-emerald-400/40' : 'bg-white/5 border-white/10',
                      )}
                    >
                      <span className="w-5 text-center text-xs font-black text-muted-foreground">{i + 4}</span>
                      <AvatarCircle emoji={p.avatar} size="sm" />
                      <span className="flex-1 font-extrabold text-xs truncate">
                        {p.name} {p.slot === mySlot && <span className="text-emerald-300">(أنت)</span>}
                      </span>
                      <span className="font-black text-amber-300 tabular-nums text-sm">{p.score}</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* المكافآت */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="w-full glass rounded-2xl border-amber-400/30 px-4 py-3 mb-4 flex items-center justify-center gap-5"
              >
                <span className="text-sm font-black text-amber-300">🪙 +{reward.coins}</span>
                <span className="w-px h-4 bg-white/15" />
                <span className="text-sm font-black text-emerald-300">✨ +{reward.xp} XP</span>
                <span className="w-px h-4 bg-white/15" />
                <span className="text-xs font-bold text-muted-foreground">مركزك #{myRank}</span>
              </motion.div>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={finishMatch}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-extrabold glow-emerald hover:from-emerald-400 hover:to-teal-400 transition-all"
              >
                العودة للوبي 🏠
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
