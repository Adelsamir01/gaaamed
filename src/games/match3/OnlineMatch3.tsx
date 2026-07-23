import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, Crown, Sparkles, Swords } from 'lucide-react'
import type { GameProps } from '@/games'
import { haptics } from '@/lib/haptics'
import { sounds } from '@/lib/sounds'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from '@/sections/components'
import Match3Board from './Match3Board'
import { applyMatch3Swap, type Match3Special, type Match3State } from './engine.js'
import { useMatch3Animator } from './useMatch3Animator'

interface Match3MoveEffect {
  first: number
  second: number
  scoreDelta: number
  cleared: number
  cascades: number
  createdSpecial: Match3Special | null
  reshuffled: boolean
}

interface Match3StateMessage {
  state: Match3State
  scores: Record<number, number>
  startAt: number
  endAt: number
  serverTime: number
  ended: boolean
  effect?: 'start' | 'sync' | 'move'
  move?: Match3MoveEffect | null
}

interface Match3ScoresMessage {
  scores: Record<number, number>
  endAt: number
  serverTime: number
}

interface Match3EndMessage {
  winnerSlot: number
  scores: Record<number, number>
  durationMs: number
}

interface ScorePop {
  id: number
  text: string
  score: number
}

interface OptimisticMove {
  first: number
  second: number
  authoritativeState: Match3State | null
  animationDone: boolean
}

type Match3MoveSummary = Pick<Match3MoveEffect, 'scoreDelta' | 'cascades' | 'createdSpecial'>

function moveLabel(move: Match3MoveSummary): string {
  if (move.createdSpecial === 'rainbow') return 'دوامة ألوان! 🌈'
  if (move.createdSpecial === 'bomb') return 'قنبلة سكر! 💥'
  if (move.createdSpecial === 'row' || move.createdSpecial === 'col') return 'صاروخ حلوى! 🚀'
  if (move.cascades >= 3) return `كومبو ×${move.cascades}!`
  if (move.cascades === 2) return 'كومبو جميل!'
  return 'حلو!'
}

export default function OnlineMatch3({ onFinish }: GameProps) {
  const { slot, opponent, subscribe, sendRaw, requestGameSync } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const theirSlot = mySlot === 1 ? 2 : 1
  const { state: game, visual, animating, playFrames, syncState } = useMatch3Animator<Match3State | null>(null)
  const [scores, setScores] = useState<Record<number, number>>({ 1: 0, 2: 0 })
  const [startAt, setStartAt] = useState(0)
  const [endAt, setEndAt] = useState(0)
  const [clockOffset, setClockOffset] = useState(0)
  const [now, setNow] = useState(0)
  const [pending, setPending] = useState(false)
  const [scorePop, setScorePop] = useState<ScorePop | null>(null)
  const [ending, setEnding] = useState<'win' | 'draw' | 'loss' | null>(null)
  const finishedRef = useRef(false)
  const gameRef = useRef<Match3State | null>(null)
  const scorePopIdRef = useRef(0)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scorePopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const optimisticMoveRef = useRef<OptimisticMove | null>(null)

  const showMoveFeedback = useCallback((move: Match3MoveSummary) => {
    scorePopIdRef.current += 1
    setScorePop({ id: scorePopIdRef.current, text: moveLabel(move), score: move.scoreDelta })
    if (move.createdSpecial === 'rainbow') sounds.win()
    else if (move.cascades >= 2 || move.createdSpecial) sounds.correct()
    else sounds.pop()
    if (move.createdSpecial || move.cascades >= 2) haptics.success()
    else haptics.move()
  }, [])

  const finish = useCallback((result: Match3EndMessage) => {
    if (finishedRef.current) return
    finishedRef.current = true
    const outcome = result.winnerSlot === 0 ? 'draw' : result.winnerSlot === mySlot ? 'win' : 'loss'
    const mine = result.scores[mySlot] ?? 0
    const theirs = result.scores[theirSlot] ?? 0
    setScores(result.scores)
    setEnding(outcome)
    setPending(false)
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    if (outcome === 'win') haptics.success()
    else if (outcome === 'loss') haptics.warning()
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'match3',
        outcome,
        score: mine,
        bestCandidate: mine,
        coinsEarned: outcome === 'win' ? 45 : outcome === 'draw' ? 16 : 7,
        xpEarned: outcome === 'win' ? 55 : outcome === 'draw' ? 22 : 10,
        summary: outcome === 'draw'
          ? `تعادلت مع ${opponent?.name ?? 'الخصم'} عند ${mine.toLocaleString('ar-EG')} نقطة`
          : outcome === 'win'
            ? `كسبت سباق الحلوى ${mine.toLocaleString('ar-EG')} - ${theirs.toLocaleString('ar-EG')} 🍬`
            : `${opponent?.name ?? 'الخصم'} كسب ${theirs.toLocaleString('ar-EG')} - ${mine.toLocaleString('ar-EG')}`,
        detail: 'كل لاعب لعب على نفس ترتيب البداية، والخادم حسب الحركات والنقاط لمدة ٧٥ ثانية.',
      })
    }, 1_450)
  }, [mySlot, onFinish, opponent, theirSlot])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'match3') return
      if (event.msg.type === 'match3_state') {
        const incoming = event.msg as unknown as Match3StateMessage
        const optimistic = optimisticMoveRef.current
        const confirmsOptimisticMove = incoming.effect === 'move' && !!incoming.move && !!optimistic
          && incoming.move.first === optimistic.first
          && incoming.move.second === optimistic.second
        const animation = !confirmsOptimisticMove && incoming.effect === 'move' && incoming.move && gameRef.current
          ? applyMatch3Swap(gameRef.current, incoming.move.first, incoming.move.second)
          : null
        gameRef.current = incoming.state
        setScores(incoming.scores)
        setStartAt(incoming.startAt)
        setEndAt(incoming.endAt)
        setClockOffset(incoming.serverTime - Date.now())
        setNow(Date.now())
        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
        if (confirmsOptimisticMove && optimistic) {
          optimistic.authoritativeState = incoming.state
          setPending(false)
          if (optimistic.animationDone) {
            optimisticMoveRef.current = null
            syncState(incoming.state)
            if (scorePopTimerRef.current) clearTimeout(scorePopTimerRef.current)
            scorePopTimerRef.current = setTimeout(() => setScorePop(null), 260)
          }
        } else if (incoming.effect === 'move' && incoming.move) {
          showMoveFeedback(incoming.move)
          void playFrames(animation?.accepted ? animation.frames : undefined, incoming.state, (frame) => {
            if (frame.phase === 'burst' && frame.cascade > 1) sounds.pop()
          }).then((played) => {
            if (!played) return
            setPending(false)
            if (scorePopTimerRef.current) clearTimeout(scorePopTimerRef.current)
            scorePopTimerRef.current = setTimeout(() => setScorePop(null), 260)
          })
        } else {
          optimisticMoveRef.current = null
          syncState(incoming.state)
          setPending(false)
        }
      } else if (event.msg.type === 'match3_scores') {
        const incoming = event.msg as unknown as Match3ScoresMessage
        setScores(incoming.scores)
        setEndAt(incoming.endAt)
        setClockOffset(incoming.serverTime - Date.now())
      } else if (event.msg.type === 'match3_rejected') {
        optimisticMoveRef.current = null
        setPending(false)
        if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
        if (gameRef.current) syncState(gameRef.current)
        sounds.wrong()
        haptics.warning()
      } else if (event.msg.type === 'match3_end') {
        finish(event.msg as unknown as Match3EndMessage)
      }
    })
    requestGameSync()
    return () => {
      unsubscribe()
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
      if (scorePopTimerRef.current) clearTimeout(scorePopTimerRef.current)
    }
  }, [finish, playFrames, requestGameSync, showMoveFeedback, subscribe, syncState])

  useEffect(() => {
    if (!game || ending) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [ending, game])

  const serverNow = now + clockOffset
  const remainingMs = endAt ? Math.max(0, endAt - serverNow) : 75_000
  const leadInMs = startAt ? Math.max(0, startAt - serverNow) : 0
  const started = !!startAt && leadInMs <= 0
  const timeProgress = Math.min(100, (remainingMs / 75_000) * 100)
  const mine = game?.score ?? scores[mySlot] ?? 0
  const theirs = scores[theirSlot] ?? 0
  const leader = mine === theirs ? 0 : mine > theirs ? mySlot : theirSlot
  const countdown = Math.max(1, Math.ceil(leadInMs / 400))

  const battleLine = useMemo(() => {
    if (ending === 'win') return 'ملك الحلوى! 👑'
    if (ending === 'draw') return 'تعادل بطعم السكر! 🤝'
    if (ending === 'loss') return 'سباق قوي لآخر ثانية'
    if (!started) return 'استعد… نفس اللوحة للاعبين'
    if (mine === theirs) return 'السباق متعادل — كومبو واحد يفرق'
    if (mine > theirs) return `متقدم بـ${(mine - theirs).toLocaleString('ar-EG')} نقطة`
    return `محتاج ${(theirs - mine).toLocaleString('ar-EG')} نقطة للحاق`
  }, [ending, mine, started, theirs])

  const swap = useCallback((first: number, second: number) => {
    const tapServerTime = Date.now() + clockOffset
    if (
      !game || pending || animating || ending || !startAt
      || tapServerTime < startAt || (endAt > 0 && tapServerTime >= endAt)
    ) return
    const result = applyMatch3Swap(game, first, second)
    if (!result.accepted) {
      sounds.wrong()
      haptics.warning()
      return
    }
    const optimistic: OptimisticMove = {
      first,
      second,
      authoritativeState: null,
      animationDone: false,
    }
    optimisticMoveRef.current = optimistic
    setPending(true)
    showMoveFeedback(result)
    void playFrames(result.frames, result.state, (frame) => {
      if (frame.phase === 'burst' && frame.cascade > 1) sounds.pop()
    }).then((played) => {
      if (!played || optimisticMoveRef.current !== optimistic) return
      optimistic.animationDone = true
      if (optimistic.authoritativeState) {
        optimisticMoveRef.current = null
        syncState(optimistic.authoritativeState)
        if (scorePopTimerRef.current) clearTimeout(scorePopTimerRef.current)
        scorePopTimerRef.current = setTimeout(() => setScorePop(null), 260)
      }
    })
    sendRaw({ type: 'match3_swap', first, second })
    pendingTimerRef.current = setTimeout(() => {
      optimisticMoveRef.current = null
      setPending(false)
      setScorePop(null)
      requestGameSync()
    }, 2_000)
  }, [animating, clockOffset, endAt, ending, game, pending, playFrames, requestGameSync, sendRaw, showMoveFeedback, startAt, syncState])

  if (!game) {
    return (
      <div className="match3-game min-h-[440px] grid place-items-center" dir="rtl">
        <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.1 }} className="text-center">
          <div className="text-5xl">🍬</div>
          <p className="mt-3 font-black text-pink-100">بنجهّز سباق الحلوى…</p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="match3-game flex min-h-[calc(100dvh-76px)] flex-col items-center gap-2.5 py-2" dir="rtl">
      <section className="match3-panel w-full rounded-[1.65rem] px-3 py-2.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative">
              <AvatarCircle emoji={profile.avatar} size="sm" />
              {leader === mySlot && <Crown className="absolute -right-2 -top-3 h-4 w-4 rotate-12 fill-amber-300 text-amber-300" />}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold text-white/60">أنت</p>
              <motion.p key={mine} initial={{ scale: 1.18 }} animate={{ scale: 1 }} className="truncate text-lg font-black tabular-nums text-emerald-300">
                {mine.toLocaleString('ar-EG')}
              </motion.p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className={`grid min-w-16 place-items-center rounded-2xl border px-2.5 py-1 ${remainingMs <= 10_000 ? 'border-rose-300/50 bg-rose-500/20 text-rose-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-200'}`}>
              <Clock3 className="h-3.5 w-3.5" />
              <bdi className="text-lg font-black tabular-nums">{Math.ceil(remainingMs / 1000)}</bdi>
            </div>
          </div>

          <div className="flex min-w-0 flex-row-reverse items-center gap-2 text-left">
            <div className="relative">
              <AvatarCircle emoji={opponent?.avatar ?? '🎮'} size="sm" />
              {leader === theirSlot && <Crown className="absolute -left-2 -top-3 h-4 w-4 -rotate-12 fill-amber-300 text-amber-300" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[9px] font-bold text-white/60">{opponent?.name ?? 'الخصم'}</p>
              <motion.p key={theirs} initial={{ scale: 1.18 }} animate={{ scale: 1 }} className="truncate text-lg font-black tabular-nums text-pink-300">
                {theirs.toLocaleString('ar-EG')}
              </motion.p>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Swords className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/25" dir="ltr">
            <motion.div className={`h-full rounded-full ${remainingMs <= 10_000 ? 'bg-rose-400' : 'bg-gradient-to-r from-pink-400 via-amber-300 to-emerald-300'}`} animate={{ width: `${timeProgress}%` }} transition={{ duration: 0.1 }} />
          </div>
          <span className="max-w-[55%] truncate text-[9px] font-extrabold text-white/70">{battleLine}</span>
        </div>
      </section>

      <div className="relative w-full max-w-[390px]">
        <AnimatePresence>
          {scorePop && (
            <motion.div
              key={scorePop.id}
              initial={{ opacity: 0, y: 12, scale: 0.75 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14 }}
              className="pointer-events-none absolute inset-x-0 -top-1 z-20 mx-auto w-max rounded-full bg-amber-300 px-4 py-1.5 text-xs font-black text-violet-950 shadow-xl"
            >
              {scorePop.text} <bdi className="tabular-nums">+{scorePop.score.toLocaleString('ar-EG')}</bdi>
            </motion.div>
          )}
        </AnimatePresence>

        <Match3Board state={game} disabled={pending || animating || !started || remainingMs <= 0 || !!ending} onSwap={swap} celebration={ending === 'win'} visual={visual} />

        <AnimatePresence>
          {!started && !ending && (
            <motion.div exit={{ opacity: 0, scale: 1.15 }} className="absolute inset-2 z-30 grid place-items-center rounded-[1.35rem] bg-[#180d31]/65 backdrop-blur-sm">
              <motion.div key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                <p className="text-7xl font-black text-amber-300 drop-shadow-xl">{countdown}</p>
                <p className="mt-2 text-sm font-black">جهّز أسرع كومبو</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex h-8 items-center justify-center gap-1.5 text-[10px] font-bold text-white/65">
        <Sparkles className="h-3.5 w-3.5 text-pink-300" />
        نفس البداية، ٧٥ ثانية، وأعلى نقاط تكسب
      </div>

      <AnimatePresence>
        {ending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 grid place-items-center bg-[#160d2b]/76 px-8 text-center backdrop-blur-sm">
            <motion.div initial={{ scale: 0.65, y: 20 }} animate={{ scale: 1, y: 0 }} className="match3-panel w-full rounded-[2rem] p-7">
              <div className="text-6xl">{ending === 'win' ? '👑' : ending === 'draw' ? '🤝' : '🍭'}</div>
              <p className="mt-3 text-2xl font-black">{ending === 'win' ? 'كسبت السباق!' : ending === 'draw' ? 'تعادل!' : 'سباق جامد!'}</p>
              <p className="mt-2 font-black text-amber-200"><bdi>{mine.toLocaleString('ar-EG')}</bdi> — <bdi>{theirs.toLocaleString('ar-EG')}</bdi></p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
