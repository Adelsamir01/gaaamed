import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, Eraser, Palette, Pen, Send, Trash2 } from 'lucide-react'
import type { GameProps } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const WORDS = [
  'قطة', 'كلب', 'أسد', 'فيل', 'زرافة', 'تمساح', 'بطريق', 'فراشة', 'أخطبوط', 'دلفين',
  'بيت', 'كرسي', 'مصباح', 'هاتف', 'كتاب', 'مفتاح', 'ثلاجة', 'كاميرا', 'كمبيوتر', 'مظلة',
  'بيتزا', 'كشري', 'كنافة', 'تفاحة', 'قهوة', 'برجر', 'بطيخ', 'مانجو', 'شوكولاتة', 'دونات',
  'طبيب', 'مهندس', 'شرطي', 'طباخ', 'طيار', 'رجل إطفاء', 'رائد فضاء', 'مصور', 'مزارع', 'حلاق',
  'مدرسة', 'حديقة', 'مطار', 'سينما', 'مسجد', 'مستشفى', 'ملعب', 'جزيرة', 'صحراء', 'قلعة',
  'سيارة', 'قطار', 'طائرة', 'صاروخ', 'كرة قدم', 'شطرنج', 'قوس قزح', 'بركان', 'هرم', 'مومياء',
  'روبوت', 'تنين', 'كنز', 'مصباح سحري', 'توك توك', 'ميكروباص', 'فانوس', 'طبلة', 'سفينة فضاء', 'أبو الهول',
]

const COLORS = ['#111827', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
const TOTAL_ROUNDS = 4
const ROUND_SECONDS = 60

type Phase = 'choose' | 'draw' | 'roundEnd' | 'gameEnd'
type Tool = 'pen' | 'eraser'

interface Point {
  x: number
  y: number
}

function normalizeArabic(value: string): string {
  return value
    .trim()
    .replace(/[إأآ]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function pickOptions(): string[] {
  const shuffled = [...WORDS]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const current = shuffled[i]
    shuffled[i] = shuffled[j] as string
    shuffled[j] = current as string
  }
  return shuffled.slice(0, 3)
}

function hiddenWord(word: string): string {
  return [...word].map((letter) => letter === ' ' ? '  ' : 'ـ').join(' ')
}

export default function ShakhbataLocal({ onFinish }: GameProps) {
  const [phase, setPhase] = useState<Phase>('choose')
  const [round, setRound] = useState(1)
  const [options, setOptions] = useState<string[]>(pickOptions)
  const [word, setWord] = useState('')
  const [guess, setGuess] = useState('')
  const [seconds, setSeconds] = useState(ROUND_SECONDS)
  const [scores, setScores] = useState<[number, number]>([0, 0])
  const [roundWasCorrect, setRoundWasCorrect] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#111827')
  const [brushSize, setBrushSize] = useState(8)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<Point | null>(null)
  const finishedRef = useRef(false)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const drawerIndex = (round - 1) % 2
  const guesserIndex = drawerIndex === 0 ? 1 : 0
  const drawerName = `اللاعب ${drawerIndex + 1}`
  const guesserName = `اللاعب ${guesserIndex + 1}`

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const finishGame = useCallback((finalScores: [number, number]) => {
    if (finishedRef.current) return
    finishedRef.current = true
    setPhase('gameEnd')
    const outcome = finalScores[0] === finalScores[1] ? 'draw' : finalScores[0] > finalScores[1] ? 'win' : 'loss'
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'shakhbata',
        outcome,
        score: finalScores[0],
        bestCandidate: finalScores[0],
        coinsEarned: outcome === 'win' ? 35 : outcome === 'draw' ? 15 : 8,
        xpEarned: outcome === 'win' ? 50 : outcome === 'draw' ? 25 : 12,
        summary: `النتيجة النهائية: اللاعب ١ ${finalScores[0]} — ${finalScores[1]} اللاعب ٢ 🎨`,
        detail: 'الرسم والتخمين تمّا بالكامل على نفس الجهاز من غير إنترنت.',
      })
    }, 1_300)
  }, [onFinish])

  const endRound = useCallback((correct: boolean) => {
    if (phase !== 'draw') return
    const nextScores: [number, number] = [...scores]
    if (correct) {
      nextScores[guesserIndex] += 100 + seconds
      nextScores[drawerIndex] += 50 + Math.floor(seconds / 2)
      sounds.correct()
    } else {
      sounds.wrong()
    }
    setScores(nextScores)
    setRoundWasCorrect(correct)
    setPhase('roundEnd')
    if (round === TOTAL_ROUNDS) finishTimerRef.current = setTimeout(() => finishGame(nextScores), 1_900)
  }, [drawerIndex, finishGame, guesserIndex, phase, round, scores, seconds])

  useEffect(() => {
    if (phase !== 'draw') return
    const timer = setTimeout(() => {
      if (seconds <= 1) endRound(false)
      else setSeconds((value) => value - 1)
    }, 1_000)
    return () => clearTimeout(timer)
  }, [endRound, phase, seconds])

  useEffect(() => () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
  }, [])

  const chooseWord = (selected: string) => {
    sounds.click()
    setWord(selected)
    setGuess('')
    setSeconds(ROUND_SECONDS)
    setPhase('draw')
    requestAnimationFrame(clearCanvas)
  }

  const submitGuess = () => {
    if (!guess.trim()) return
    if (normalizeArabic(guess) === normalizeArabic(word)) endRound(true)
    else {
      sounds.wrong()
      setGuess('')
    }
  }

  const nextRound = () => {
    if (round >= TOTAL_ROUNDS) return
    setRound((value) => value + 1)
    setOptions(pickOptions())
    setWord('')
    setGuess('')
    setSeconds(ROUND_SECONDS)
    setRoundWasCorrect(false)
    setPhase('choose')
  }

  const canvasPoint = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width),
      y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height),
    }
  }

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'draw') return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    lastPointRef.current = canvasPoint(event)
  }

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !lastPointRef.current) return
    const context = event.currentTarget.getContext('2d')
    if (!context) return
    const point = canvasPoint(event)
    context.save()
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = brushSize
    context.strokeStyle = color
    context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    context.beginPath()
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    context.lineTo(point.x, point.y)
    context.stroke()
    context.restore()
    lastPointRef.current = point
  }

  const stopDrawing = () => {
    drawingRef.current = false
    lastPointRef.current = null
  }

  if (phase === 'choose') {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <div className="text-6xl">🤫</div>
        <div>
          <p className="text-xs text-muted-foreground">الجولة {round} من {TOTAL_ROUNDS}</p>
          <h2 className="text-xl font-black mt-1">{drawerName} يختار كلمة سرًا</h2>
          <p className="text-sm text-slate-300 mt-2">خلي {guesserName} يبص بعيد لحد ما تختار</p>
        </div>
        <div className="w-full grid gap-2">
          {options.map((option) => (
            <button key={option} type="button" onClick={() => chooseWord(option)} className="glass rounded-2xl min-h-14 px-4 font-black text-lg hover:bg-emerald-500/15 border border-white/10 hover:border-emerald-400/50">
              {option}
            </button>
          ))}
        </div>
        <ScoreBar scores={scores} drawerIndex={drawerIndex} />
      </div>
    )
  }

  if (phase === 'roundEnd' || phase === 'gameEnd') {
    return (
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <div className="text-6xl">{roundWasCorrect ? '🎯' : phase === 'gameEnd' ? '🏆' : '⏰'}</div>
        <div>
          <h2 className="text-2xl font-black">{roundWasCorrect ? 'إجابة صحيحة!' : 'انتهى الوقت'}</h2>
          <p className="text-slate-300 mt-2">الكلمة كانت: <strong className="text-amber-300 text-xl">{word}</strong></p>
        </div>
        <ScoreBar scores={scores} drawerIndex={drawerIndex} />
        {phase === 'roundEnd' && round < TOTAL_ROUNDS && (
          <button type="button" onClick={nextRound} className="w-full min-h-14 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 font-black text-lg glow-emerald">
            الجولة التالية — تبديل الرسّام
          </button>
        )}
        {phase === 'gameEnd' && <p className="font-bold text-emerald-300">جارٍ حساب النتيجة النهائية…</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="w-full flex items-center justify-between gap-2">
        <div>
          <p className="font-black">{drawerName} بيرسم</p>
          <p className="text-[10px] text-muted-foreground">{guesserName} يخمّن · جولة {round}/{TOTAL_ROUNDS}</p>
        </div>
        <div className={cn('min-w-14 h-11 rounded-2xl grid place-items-center font-black tabular-nums border', seconds <= 10 ? 'bg-red-500/15 border-red-400/50 text-red-300' : 'glass border-white/10 text-amber-300')}>
          {seconds}
        </div>
      </div>

      <div className="font-black tracking-[0.25em] text-amber-200 text-center" aria-label={`${word.length} حروف`}>
        {hiddenWord(word)}
      </div>

      <div className="w-full rounded-3xl overflow-hidden border-2 border-emerald-400/30 bg-[#f8f4e8] shadow-[0_0_28px_rgba(16,185,129,0.12)]">
        <canvas
          ref={canvasRef}
          width={720}
          height={600}
          className="block w-full aspect-[6/5] touch-none"
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          aria-label="لوحة رسم شخبطة المحلية"
        />
      </div>

      <div className="w-full glass rounded-2xl p-2">
        <button type="button" onClick={() => setToolsOpen((open) => !open)} className="w-full min-h-10 flex items-center gap-2 px-2" aria-expanded={toolsOpen}>
          <Palette className="w-4 h-4 text-emerald-300" />
          <span className="font-bold text-sm flex-1 text-start">أدوات الرسم</span>
          <ChevronDown className={cn('w-4 h-4 transition-transform', toolsOpen && 'rotate-180')} />
        </button>
        {toolsOpen && (
          <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setTool('pen')} className={cn('w-10 h-10 rounded-xl grid place-items-center', tool === 'pen' ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/5')} aria-label="قلم"><Pen className="w-4 h-4" /></button>
            <button type="button" onClick={() => setTool('eraser')} className={cn('w-10 h-10 rounded-xl grid place-items-center', tool === 'eraser' ? 'bg-emerald-500/25 text-emerald-200' : 'bg-white/5')} aria-label="ممحاة"><Eraser className="w-4 h-4" /></button>
            <button type="button" onClick={clearCanvas} className="w-10 h-10 rounded-xl bg-white/5 grid place-items-center" aria-label="مسح اللوحة"><Trash2 className="w-4 h-4" /></button>
            <select value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} className="h-10 rounded-xl bg-slate-800 px-2 text-xs" aria-label="حجم القلم">
              <option value={4}>رفيع</option><option value={8}>وسط</option><option value={16}>عريض</option>
            </select>
            <div className="flex flex-wrap gap-1.5 flex-1 justify-end">
              {COLORS.map((item) => <button key={item} type="button" onClick={() => { setColor(item); setTool('pen') }} className={cn('w-7 h-7 rounded-full border-2', color === item ? 'border-white scale-110' : 'border-transparent')} style={{ backgroundColor: item }} aria-label={`لون ${item}`} />)}
            </div>
          </div>
        )}
      </div>

      <form className="w-full flex gap-2" onSubmit={(event) => { event.preventDefault(); submitGuess() }}>
        <input value={guess} onChange={(event) => setGuess(event.target.value)} placeholder={`${guesserName}: اكتب التخمين…`} className="flex-1 min-w-0 glass rounded-2xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400/60" />
        <button type="submit" className="w-12 rounded-2xl bg-emerald-500 grid place-items-center" aria-label="إرسال التخمين"><Send className="w-5 h-5" /></button>
      </form>
      <ScoreBar scores={scores} drawerIndex={drawerIndex} />
    </div>
  )
}

function ScoreBar({ scores, drawerIndex }: { scores: [number, number]; drawerIndex: number }) {
  return (
    <div className="w-full grid grid-cols-2 gap-2">
      {scores.map((score, index) => (
        <div key={index} className={cn('glass rounded-2xl px-3 py-2 flex items-center justify-between', drawerIndex === index && 'border-amber-400/40')}>
          <span className="text-xs font-bold">{index === 0 ? 'اللاعب ١' : 'اللاعب ٢'} {drawerIndex === index && '🖌️'}</span>
          <bdi className="font-black text-amber-300 tabular-nums bidi-number">{score}</bdi>
        </div>
      ))}
    </div>
  )
}
