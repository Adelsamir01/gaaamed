import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { AnimatePresence, motion } from 'framer-motion'
import { Flag, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { GameProps } from '@/games'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import ChessBoard, { PromotionPicker } from './ChessBoard'
import { CapturedPieces, ChessPlayerCard, MoveStrip } from './ChessHud'
import { chessReasonLabel } from './presentation'

interface ChessMoveState {
  from: Square
  to: Square
  san: string
  color: Color
  piece: PieceSymbol
  captured: PieceSymbol | null
  promotion: PieceSymbol | null
}

interface ChessState {
  fen: string
  turnSlot: number
  clocks: Record<number, number>
  serverTime: number
  check: boolean
  ended: boolean
  winnerSlot: number | null
  reason: string | null
  lastMove: ChessMoveState | null
  history: ChessMoveState[]
}

interface PromotionChoice {
  from: Square
  to: Square
}

export default function OnlineChess({ onFinish }: GameProps) {
  const { slot, opponent, subscribe, requestGameSync, sendRaw } = useOnline()
  const { profile } = useApp()
  const mySlot = slot ?? 1
  const myColor: Color = mySlot === 1 ? 'w' : 'b'
  const [game, setGame] = useState<ChessState | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<PromotionChoice | null>(null)
  const [pending, setPending] = useState(false)
  const [clientNow, setClientNow] = useState(0)
  const [receivedAt, setReceivedAt] = useState(0)
  const [confirmResign, setConfirmResign] = useState(false)
  const finishedRef = useRef(false)
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const finish = useCallback((state: ChessState) => {
    if (finishedRef.current || !state.ended) return
    finishedRef.current = true
    const outcome = state.winnerSlot === 0 || state.winnerSlot == null ? 'draw' : state.winnerSlot === mySlot ? 'win' : 'loss'
    const winnerName = state.winnerSlot === mySlot
      ? profile.name
      : state.winnerSlot && state.winnerSlot !== 0
        ? opponent?.name ?? 'الخصم'
        : undefined
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'chess',
        outcome,
        winnerName,
        winnerSlot: state.winnerSlot && state.winnerSlot !== 0 ? state.winnerSlot : undefined,
        score: state.history.length,
        coinsEarned: outcome === 'win' ? 55 : outcome === 'draw' ? 20 : 7,
        xpEarned: outcome === 'win' ? 70 : outcome === 'draw' ? 28 : 12,
        summary: winnerName ? `${winnerName} كسب بـ${chessReasonLabel(state.reason)} ♟️` : chessReasonLabel(state.reason),
        detail: `مباراة أونلاين من ${Math.ceil(state.history.length / 2)} نقلة كاملة، والنقلات تحقق منها الخادم.`,
      })
    }, 1_500)
  }, [mySlot, onFinish, opponent?.name, profile.name])

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.kind !== 'chess') return
      const next = event.msg.state as unknown as ChessState | undefined
      if (!next) return
      const receivedAtNow = performance.now()
      setReceivedAt(receivedAtNow)
      setClientNow(receivedAtNow)
      setGame((current) => {
        if (event.msg.type === 'chess_state' && event.msg.effect === 'move' && current?.lastMove?.san !== next.lastMove?.san) {
          if (next.lastMove?.color === myColor) sounds.pop()
          else sounds.tick()
        }
        return next
      })
      setPending(false)
      setSelected(null)
      if (event.msg.type === 'chess_rejected') sounds.wrong()
      if (next.ended) finish(next)
    })
    requestGameSync()
    return () => {
      unsubscribe()
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
    }
  }, [finish, myColor, requestGameSync, subscribe])

  useEffect(() => {
    const timer = window.setInterval(() => setClientNow(performance.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  const fen = game?.fen
  const chess = useMemo(() => fen ? new Chess(fen) : null, [fen])
  const legalMoves = useMemo(() => selected && chess
    ? chess.moves({ square: selected, verbose: true })
    : [], [chess, selected])

  const displayClock = (playerSlot: number) => {
    if (!game) return 0
    const base = game.clocks[playerSlot] ?? 0
    if (game.ended || game.turnSlot !== playerSlot) return base
    return Math.max(0, base - Math.max(0, clientNow - receivedAt))
  }

  const sendMove = (from: Square, to: Square, promotionPiece: PieceSymbol = 'q') => {
    if (!game || game.ended || pending || game.turnSlot !== mySlot) return
    setPending(true)
    sendRaw({ type: 'chess_move', from, to, promotion: promotionPiece })
  }

  const chooseSquare = (square: Square) => {
    if (!game || !chess || game.ended || pending || game.turnSlot !== mySlot) return
    const piece = chess.get(square)
    if (!selected) {
      if (piece?.color === myColor) {
        sounds.click()
        setSelected(square)
      }
      return
    }
    if (square === selected) {
      setSelected(null)
      return
    }
    if (piece?.color === myColor) {
      sounds.click()
      setSelected(square)
      return
    }
    const candidates = legalMoves.filter((move) => move.to === square)
    if (candidates.length === 0) {
      sounds.wrong()
      setSelected(null)
      return
    }
    if (candidates.some((move) => move.promotion)) {
      setPromotion({ from: selected, to: square })
      return
    }
    sendMove(selected, square)
  }

  if (!game || !chess) {
    return (
      <div className="flex min-h-[430px] flex-col items-center justify-center gap-3 text-slate-300">
        <LoaderCircle className="h-9 w-9 animate-spin text-emerald-300" />
        <p className="font-extrabold">بنجهّز رقعة الشطرنج…</p>
      </div>
    )
  }

  const opponentSlot = mySlot === 1 ? 2 : 1
  const opponentColor: Color = myColor === 'w' ? 'b' : 'w'
  const myTurn = game.turnSlot === mySlot
  const status = game.ended
    ? chessReasonLabel(game.reason)
    : pending
      ? 'بنثبت النقلة على الخادم…'
      : game.check
        ? myTurn ? 'كش! لازم تحمي ملكك' : `كش على ${opponent?.name ?? 'الخصم'}!`
        : myTurn ? 'دورك — اختار قطعة' : `دور ${opponent?.name ?? 'الخصم'}…`
  const history = game.history as unknown as Move[]

  return (
    <div className="relative flex w-full flex-col items-center gap-2 py-2" dir="rtl">
      <div className="w-full max-w-[390px]">
        <ChessPlayerCard
          name={opponent?.name ?? 'الخصم'}
          avatar={opponent?.avatar ?? '🎮'}
          color={opponentColor}
          active={!game.ended && game.turnSlot === opponentSlot}
          clock={displayClock(opponentSlot)}
          compact
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn(
          'flex h-7 items-center justify-center text-sm font-black',
          game.check && !game.ended ? 'text-rose-300' : 'text-slate-200',
        )}>
          {pending && <LoaderCircle className="ml-2 h-4 w-4 animate-spin text-emerald-300" />}
          {status}
        </motion.div>
      </AnimatePresence>

      <div className="w-full max-w-[390px]">
        <div className="mb-1 flex min-h-5 items-center justify-between px-1">
          <CapturedPieces history={history} capturedColor={myColor} />
          <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-300/75"><ShieldCheck className="h-3 w-3" /> الخادم بيراجع كل نقلة</span>
        </div>
        <ChessBoard
          fen={game.fen}
          orientation={myColor}
          selected={selected}
          legalMoves={legalMoves}
          lastMove={game.lastMove}
          disabled={game.ended || pending || !myTurn}
          pending={pending}
          onSquare={chooseSquare}
        />
        <div className="mt-1 flex min-h-5 items-center justify-between px-1">
          <CapturedPieces history={history} capturedColor={opponentColor} />
          <span className="text-[9px] font-bold text-slate-500">آخر نقلة: {game.lastMove?.san ?? '—'}</span>
        </div>
      </div>

      <div className="w-full max-w-[390px]">
        <ChessPlayerCard
          name="أنت"
          avatar={profile.avatar}
          color={myColor}
          active={!game.ended && myTurn}
          clock={displayClock(mySlot)}
          compact
        />
      </div>

      <div className="flex w-full max-w-[390px] items-center gap-2">
        <div className="min-w-0 flex-1 rounded-2xl border border-white/8 bg-white/[0.035] px-2 py-0.5">
          <MoveStrip history={history} />
        </div>
        <button
          type="button"
          onClick={() => {
            if (!confirmResign) {
              setConfirmResign(true)
              window.setTimeout(() => setConfirmResign(false), 2_500)
              return
            }
            sendRaw({ type: 'chess_resign' })
          }}
          disabled={game.ended}
          className={cn(
            'flex min-h-11 shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-[11px] font-extrabold',
            confirmResign ? 'border-rose-300/60 bg-rose-400/18 text-rose-200' : 'border-white/10 bg-white/6 text-slate-300',
          )}
        >
          <Flag className="h-4 w-4" />
          {confirmResign ? 'تأكيد؟' : 'استسلام'}
        </button>
      </div>

      {promotion && (
        <PromotionPicker
          color={myColor}
          onPick={(piece) => {
            sendMove(promotion.from, promotion.to, piece)
            setPromotion(null)
          }}
        />
      )}
    </div>
  )
}
