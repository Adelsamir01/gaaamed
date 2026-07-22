import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import { AnimatePresence, motion } from 'framer-motion'
import { Flag, RotateCcw, Undo2 } from 'lucide-react'
import type { GameProps } from '@/games'
import { useApp } from '@/store/AppContext'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import ChessBoard, { PromotionPicker } from './ChessBoard'
import { CapturedPieces, ChessPlayerCard, MoveStrip } from './ChessHud'
import { chessEndState, chooseChessMove } from './engine.js'
import { chessReasonLabel } from './presentation'
import { premoveOptions, resolvePremove, type ChessPremove } from './premove'

interface PromotionChoice {
  from: Square
  to: Square
  premove: boolean
}

export default function ChessGame({ config, onFinish }: GameProps) {
  const { profile } = useApp()
  const [chess] = useState(() => new Chess())
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const premoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const premoveRef = useRef<ChessPremove | null>(null)
  const finishedRef = useRef(false)
  const [fen, setFen] = useState(() => chess.fen())
  const [history, setHistory] = useState<Move[]>([])
  const [selected, setSelected] = useState<Square | null>(null)
  const [lastMove, setLastMove] = useState<Move | null>(null)
  const [promotion, setPromotion] = useState<PromotionChoice | null>(null)
  const [premove, setPremove] = useState<ChessPremove | null>(null)
  const [ending, setEnding] = useState<{ winner: 'w' | 'b' | null; reason: string } | null>(null)
  const [confirmResign, setConfirmResign] = useState(false)
  const againstBot = config.mode === 'bot'

  const updatePremove = useCallback((next: ChessPremove | null) => {
    premoveRef.current = next
    setPremove(next)
  }, [])

  const sync = useCallback((move?: Move | null) => {
    setFen(chess.fen())
    setHistory(chess.history({ verbose: true }))
    setLastMove(move ?? chess.history({ verbose: true }).at(-1) ?? null)
    setSelected(null)
  }, [chess])

  const finish = useCallback((winner: 'w' | 'b' | null, reason: string) => {
    if (finishedRef.current) return
    finishedRef.current = true
    updatePremove(null)
    setEnding({ winner, reason })
    const movesPlayed = chess.history().length
    const outcome = winner == null ? 'draw' : winner === 'w' ? 'win' : 'loss'
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    else sounds.pop()
    const winnerName = winner === 'w' ? (againstBot ? 'أنت' : 'اللاعب ١') : winner === 'b' ? (againstBot ? 'الكمبيوتر' : 'اللاعب ٢') : null
    finishTimerRef.current = setTimeout(() => {
      onFinish({
        gameId: 'chess',
        outcome,
        winnerName: winnerName ?? undefined,
        winnerSlot: winner === 'w' ? 1 : winner === 'b' ? 2 : undefined,
        score: movesPlayed,
        coinsEarned: outcome === 'win' ? 45 : outcome === 'draw' ? 18 : 6,
        xpEarned: outcome === 'win' ? 60 : outcome === 'draw' ? 24 : 10,
        summary: winnerName ? `${winnerName} كسب بـ${chessReasonLabel(reason)} ♟️` : chessReasonLabel(reason),
        detail: `المباراة استمرت ${Math.ceil(movesPlayed / 2)} نقلة كاملة.`,
      })
    }, 1_500)
  }, [againstBot, chess, onFinish, updatePremove])

  const finishIfNeeded = useCallback(() => {
    const end = chessEndState(chess)
    if (end.ended) finish(end.winnerColor, end.reason ?? 'draw')
  }, [chess, finish])

  const play = useCallback((from: Square, to: Square, promotionPiece: PieceSymbol = 'q') => {
    if (finishedRef.current) return false
    let move: Move
    try {
      move = chess.move({ from, to, promotion: promotionPiece })
    } catch {
      sounds.wrong()
      setSelected(null)
      return false
    }
    sounds.pop()
    sync(move)
    finishIfNeeded()
    return true
  }, [chess, finishIfNeeded, sync])

  const position = useMemo(() => new Chess(fen), [fen])
  const botThinking = againstBot && position.turn() === 'b' && !position.isGameOver() && !ending
  const legalMoves = useMemo(() => {
    if (!selected) return []
    return botThinking
      ? premoveOptions(fen, selected, 'w')
      : position.moves({ square: selected, verbose: true })
  }, [botThinking, fen, position, selected])

  const queuePremove = (from: Square, to: Square, promotionPiece: PieceSymbol = 'q') => {
    if (!botThinking || finishedRef.current) return
    updatePremove({ from, to, promotion: promotionPiece })
    setSelected(null)
    sounds.pop()
  }

  const chooseSquare = (square: Square) => {
    if (finishedRef.current) return
    if (botThinking && premove && (square === premove.from || square === premove.to)) {
      updatePremove(null)
      setSelected(null)
      sounds.click()
      return
    }
    if (againstBot && chess.turn() === 'b' && !botThinking) return
    const piece = chess.get(square)
    const selectableColor = botThinking ? 'w' : chess.turn()
    if (!selected) {
      if (piece?.color === selectableColor) {
        if (botThinking) updatePremove(null)
        sounds.click()
        setSelected(square)
      }
      return
    }
    if (square === selected) {
      setSelected(null)
      return
    }
    if (piece?.color === selectableColor) {
      if (botThinking) updatePremove(null)
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
      setPromotion({ from: selected, to: square, premove: botThinking })
      return
    }
    if (botThinking) queuePremove(selected, square)
    else play(selected, square)
  }

  useEffect(() => {
    if (!botThinking || finishedRef.current || promotion?.premove) return
    const expectedFen = chess.fen()
    botTimerRef.current = setTimeout(() => {
      const botMove = chooseChessMove(expectedFen, config.difficulty)
      if (!botMove || chess.fen() !== expectedFen) return
      const botMoved = play(botMove.from, botMove.to, botMove.promotion ?? 'q')
      const queued = premoveRef.current
      if (!botMoved || !queued || chess.isGameOver()) {
        if (chess.isGameOver()) updatePremove(null)
        return
      }
      premoveTimerRef.current = setTimeout(() => {
        const latest = premoveRef.current
        if (!latest || finishedRef.current) return
        const resolved = resolvePremove(chess.fen(), latest)
        updatePremove(null)
        if (resolved) play(resolved.from, resolved.to, resolved.promotion)
        else sounds.wrong()
      }, 220)
    }, 900)
    return () => {
      if (botTimerRef.current) clearTimeout(botTimerRef.current)
    }
  }, [botThinking, chess, config.difficulty, fen, play, promotion?.premove, updatePremove])

  useEffect(() => () => {
    if (botTimerRef.current) clearTimeout(botTimerRef.current)
    if (premoveTimerRef.current) clearTimeout(premoveTimerRef.current)
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current)
  }, [])

  const undo = () => {
    if (finishedRef.current || history.length === 0) return
    if (botTimerRef.current) clearTimeout(botTimerRef.current)
    if (premoveTimerRef.current) clearTimeout(premoveTimerRef.current)
    updatePremove(null)
    chess.undo()
    if (againstBot && chess.turn() === 'b' && chess.history().length > 0) chess.undo()
    sounds.flip()
    sync()
  }

  const resign = () => {
    if (!confirmResign) {
      setConfirmResign(true)
      window.setTimeout(() => setConfirmResign(false), 2_500)
      return
    }
    updatePremove(null)
    const winner = againstBot ? 'b' : chess.turn() === 'w' ? 'b' : 'w'
    finish(winner, 'resignation')
  }

  const whiteName = againstBot ? 'أنت' : 'اللاعب ١'
  const blackName = againstBot ? 'الكمبيوتر' : 'اللاعب ٢'
  const turn = position.turn()
  const status = ending
    ? `${chessReasonLabel(ending.reason)} ${ending.winner ? '🏆' : '🤝'}`
    : botThinking
      ? premove
        ? `نقلة مسبقة جاهزة: ${premove.from} ← ${premove.to}`
        : 'الكمبيوتر بيفكر… اختار نقلتك من دلوقتي'
      : position.isCheck()
        ? `كش! دور ${turn === 'w' ? whiteName : blackName}`
        : `دور ${turn === 'w' ? whiteName : blackName}`

  return (
    <div className="relative flex w-full flex-col items-center gap-2.5 py-2" dir="rtl">
      <div className="grid w-full grid-cols-2 gap-2">
        <ChessPlayerCard name={whiteName} avatar={profile.avatar} color="w" active={!ending && turn === 'w' && !botThinking} compact />
        <ChessPlayerCard name={blackName} avatar={againstBot ? '🤖' : '🎮'} color="b" active={!ending && turn === 'b'} compact />
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={cn(
          'flex h-7 items-center justify-center text-sm font-black',
          position.isCheck() && !ending ? 'text-rose-300' : 'text-slate-200',
        )}>
          {botThinking && <RotateCcw className="ml-2 h-4 w-4 animate-spin text-emerald-300" />}
          {status}
        </motion.div>
      </AnimatePresence>

      <div className="w-full max-w-[390px]">
        <div className="mb-1 flex min-h-5 items-center justify-between px-1">
          <CapturedPieces history={history} capturedColor="w" />
          <span className="text-[9px] font-bold text-slate-500">قطع الأبيض المأخوذة</span>
        </div>
        <ChessBoard
          fen={fen}
          selected={selected}
          legalMoves={legalMoves}
          premove={premove}
          premoveMode={botThinking}
          lastMove={lastMove}
          disabled={!!ending}
          pending={botThinking}
          onSquare={chooseSquare}
        />
        <div className="mt-1 flex min-h-5 items-center justify-between px-1">
          <CapturedPieces history={history} capturedColor="b" />
          <span className="text-[9px] font-bold text-slate-500">قطع الأسود المأخوذة</span>
        </div>
      </div>

      <div className="w-full max-w-[390px] rounded-2xl border border-white/8 bg-white/[0.035] px-2 py-1">
        <MoveStrip history={history} />
      </div>

      <div className="grid w-full max-w-[390px] grid-cols-2 gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={history.length === 0 || !!ending || botThinking}
          className="flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/6 text-xs font-extrabold text-slate-200 disabled:opacity-35"
        >
          <Undo2 className="h-4 w-4" />
          تراجع
        </button>
        <button
          type="button"
          onClick={resign}
          disabled={!!ending}
          className={cn(
            'flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-xs font-extrabold disabled:opacity-35',
            confirmResign ? 'border-rose-300/60 bg-rose-400/18 text-rose-200' : 'border-white/10 bg-white/6 text-slate-300',
          )}
        >
          <Flag className="h-4 w-4" />
          {confirmResign ? 'اضغط تاني للتأكيد' : 'استسلام'}
        </button>
      </div>

      {promotion && (
        <PromotionPicker
          color={promotion.premove ? 'w' : position.turn()}
          onPick={(piece) => {
            if (promotion.premove) queuePremove(promotion.from, promotion.to, piece)
            else play(promotion.from, promotion.to, piece)
            setPromotion(null)
          }}
        />
      )}
    </div>
  )
}
