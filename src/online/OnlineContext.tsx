import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { onlineClient, getServerUrl, saveServerUrl, type ConnectionStatus, type ServerMessage } from './client'

export interface Opponent {
  name: string
  avatar: string
}

export interface RoomPlayer {
  id: number
  slot: number
  name: string
  avatar: string
}

export type OnlinePhase = 'idle' | 'waiting' | 'ready' | 'playing' | 'opponent_left'

/** رسائل موجهة لشاشة اللعبة النشطة */
export type GameEvent =
  | { kind: 'action'; action: Record<string, unknown>; from: number }
  | { kind: 'rps_reveal'; choices: Record<number, string> }
  | { kind: 'react_result'; winnerSlot: number; times: Record<number, number | null>; fouls: Record<number, boolean> }
  | { kind: 'sh'; msg: ServerMessage }

type GameEventHandler = (ev: GameEvent) => void

const SHAKHBATA_MSGS = new Set(['round_choosing', 'word_options', 'your_word', 'round', 'draw', 'hint', 'chat', 'scores', 'round_end', 'ended'])

interface OnlineContextValue {
  status: ConnectionStatus
  phase: OnlinePhase
  code: string | null
  slot: 1 | 2 | null
  gameId: string | null
  opponent: Opponent | null
  players: RoomPlayer[]
  matchId: number
  rematchMine: boolean
  rematchTheirs: boolean
  serverUrl: string
  createRoom: (gameId: string, name: string, avatar: string) => void
  joinRoom: (code: string, name: string, avatar: string) => void
  leaveRoom: () => void
  startGame: () => void
  sendAction: (action: Record<string, unknown>) => void
  sendRpsChoice: (choice: string) => void
  sendReactTap: (ms: number | null, foul: boolean) => void
  sendRaw: (obj: Record<string, unknown>) => void
  requestRematch: () => void
  resetRematch: () => void
  subscribe: (h: GameEventHandler) => () => void
  updateServerUrl: (url: string) => void
  reconnect: () => void
}

const OnlineContext = createContext<OnlineContextValue | null>(null)

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>(onlineClient.status)
  const [phase, setPhase] = useState<OnlinePhase>('idle')
  const [code, setCode] = useState<string | null>(null)
  const [slot, setSlot] = useState<1 | 2 | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [opponent, setOpponent] = useState<Opponent | null>(null)
  const [players, setPlayers] = useState<RoomPlayer[]>([])
  const [matchId, setMatchId] = useState(0)
  const [rematchMine, setRematchMine] = useState(false)
  const [rematchTheirs, setRematchTheirs] = useState(false)
  const [serverUrl, setServerUrl] = useState(getServerUrl())
  const gameHandlersRef = useRef(new Set<GameEventHandler>())
  const rematchRef = useRef({ mine: false, theirs: false })
  const phaseRef = useRef<OnlinePhase>('idle')
  phaseRef.current = phase

  useEffect(() => {
    onlineClient.connect()
    const offStatus = onlineClient.onStatus(setStatus)
    const offMsg = onlineClient.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'created':
          setCode(msg.code as string)
          setSlot(1)
          setPhase('waiting')
          break
        case 'joined':
          setCode(msg.code as string)
          setSlot(msg.slot as 1 | 2)
          if (msg.gameId) setGameId(msg.gameId as string)
          if (msg.players) setPlayers(msg.players as RoomPlayer[])
          if (msg.opponent) {
            setOpponent(msg.opponent as Opponent)
            setPhase('ready')
          } else {
            setPhase('waiting')
          }
          break
        case 'opponent_joined':
          setOpponent(msg.opponent as Opponent)
          setPhase('ready')
          toast.success(`انضم ${(msg.opponent as Opponent)?.name ?? 'الخصم'} إلى الغرفة! 🎮`)
          break
        case 'player_joined':
          setPlayers(msg.players as RoomPlayer[])
          break
        case 'round_choosing':
          if (phaseRef.current !== 'playing') {
            setMatchId((id) => id + 1)
            setPhase('playing')
          }
          gameHandlersRef.current.forEach((h) => h({ kind: 'sh', msg }))
          break
        case 'error':
          toast.error((msg.message as string) || 'حدث خطأ ما')
          break
        case 'action': {
          const action = msg.action as Record<string, unknown>
          if (action?.kind === 'start') {
            rematchRef.current = { mine: false, theirs: false }
            setRematchMine(false)
            setRematchTheirs(false)
            setMatchId((id) => id + 1)
            setPhase('playing')
          } else {
            gameHandlersRef.current.forEach((h) => h({ kind: 'action', action, from: msg.from as number }))
          }
          break
        }
        case 'rps_reveal':
          gameHandlersRef.current.forEach((h) => h({ kind: 'rps_reveal', choices: msg.choices as Record<number, string> }))
          break
        case 'react_result':
          gameHandlersRef.current.forEach((h) =>
            h({
              kind: 'react_result',
              winnerSlot: msg.winnerSlot as number,
              times: msg.times as Record<number, number | null>,
              fouls: (msg.fouls as Record<number, boolean>) ?? { 1: false, 2: false },
            }),
          )
          break
        case 'rematch': {
          rematchRef.current.theirs = true
          setRematchTheirs(true)
          if (rematchRef.current.mine) {
            rematchRef.current = { mine: false, theirs: false }
            setRematchMine(false)
            setRematchTheirs(false)
            setMatchId((id) => id + 1)
            setPhase('playing')
          } else {
            toast.info('الخصم يريد إعادة اللعب! 🔄', { description: 'اضغط "إعادة اللعب" للموافقة' })
          }
          break
        }
        case 'opponent_left':
          setPhase('opponent_left')
          break
        default:
          // رسائل شخبطة تمر لشاشة اللعبة
          if (SHAKHBATA_MSGS.has(msg.type)) {
            gameHandlersRef.current.forEach((h) => h({ kind: 'sh', msg }))
          }
      }
    })
    return () => {
      offStatus()
      offMsg()
    }
  }, [])

  const createRoom = useCallback((gid: string, name: string, avatar: string) => {
    setGameId(gid)
    setOpponent(null)
    onlineClient.send({ type: 'create', gameId: gid, name, avatar })
  }, [])

  const joinRoom = useCallback((c: string, name: string, avatar: string) => {
    setOpponent(null)
    onlineClient.send({ type: 'join', code: c.trim(), name, avatar })
  }, [])

  const leaveRoom = useCallback(() => {
    onlineClient.send({ type: 'leave' })
    rematchRef.current = { mine: false, theirs: false }
    setRematchMine(false)
    setRematchTheirs(false)
    setPhase('idle')
    setCode(null)
    setSlot(null)
    setGameId(null)
    setOpponent(null)
    setPlayers([])
  }, [])

  const startGame = useCallback(() => {
    setGameId((gid) => {
      if (gid === 'shakhbata') {
        // شخبطة: الخادم يبدأ المباراة ويبث أول جولة
        onlineClient.send({ type: 'start' })
      } else {
        onlineClient.send({ type: 'action', action: { kind: 'start' } })
        rematchRef.current = { mine: false, theirs: false }
        setRematchMine(false)
        setRematchTheirs(false)
        setMatchId((id) => id + 1)
        setPhase('playing')
      }
      return gid
    })
  }, [])

  const sendAction = useCallback((action: Record<string, unknown>) => {
    onlineClient.send({ type: 'action', action })
  }, [])

  const sendRpsChoice = useCallback((choice: string) => {
    onlineClient.send({ type: 'rps_choice', choice })
  }, [])

  const sendReactTap = useCallback((ms: number | null, foul: boolean) => {
    onlineClient.send({ type: 'react_tap', ms, foul })
  }, [])

  const sendRaw = useCallback((obj: Record<string, unknown>) => {
    onlineClient.send(obj)
  }, [])

  const requestRematch = useCallback(() => {
    if (rematchRef.current.mine) return
    rematchRef.current.mine = true
    setRematchMine(true)
    onlineClient.send({ type: 'rematch' })
    if (rematchRef.current.theirs) {
      rematchRef.current = { mine: false, theirs: false }
      setRematchMine(false)
      setRematchTheirs(false)
      setMatchId((id) => id + 1)
      setPhase('playing')
    }
  }, [])

  const resetRematch = useCallback(() => {
    rematchRef.current = { mine: false, theirs: false }
    setRematchMine(false)
    setRematchTheirs(false)
  }, [])

  const subscribe = useCallback((h: GameEventHandler) => {
    gameHandlersRef.current.add(h)
    return () => {
      gameHandlersRef.current.delete(h)
    }
  }, [])

  const updateServerUrl = useCallback((url: string) => {
    saveServerUrl(url)
    setServerUrl(url)
    onlineClient.reconnect()
    toast.success('تم حفظ عنوان الخادم، جارٍ إعادة الاتصال…')
  }, [])

  const reconnect = useCallback(() => {
    onlineClient.reconnect()
  }, [])

  const value = useMemo<OnlineContextValue>(
    () => ({
      status, phase, code, slot, gameId, opponent, players, matchId,
      rematchMine, rematchTheirs, serverUrl,
      createRoom, joinRoom, leaveRoom, startGame,
      sendAction, sendRpsChoice, sendReactTap, sendRaw,
      requestRematch, resetRematch, subscribe, updateServerUrl, reconnect,
    }),
    [status, phase, code, slot, gameId, opponent, players, matchId, rematchMine, rematchTheirs, serverUrl,
      createRoom, joinRoom, leaveRoom, startGame, sendAction, sendRpsChoice, sendReactTap, sendRaw,
      requestRematch, resetRematch, subscribe, updateServerUrl, reconnect],
  )

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>
}

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext)
  if (!ctx) throw new Error('useOnline must be used within OnlineProvider')
  return ctx
}
