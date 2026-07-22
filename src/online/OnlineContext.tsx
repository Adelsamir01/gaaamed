import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { onlineClient, getServerUrl, saveServerUrl, getDeviceId, hydrateOnlineClientStorage, type ConnectionStatus, type ServerMessage } from './client'
import { useApp } from '@/store/AppContext'
import type { GameResult, PublicUserCard, RoomSettings, ServerChatMessage, ServerFriend, ServerThread } from '@/types'
import { readStoredJson, writeStoredJson } from '@/lib/persistentStorage'
import { getCurrentPushToken, initializePushNotifications, onPushToken, openNotificationThread } from '@/lib/pushNotifications'

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
  | { kind: 'rps_series_end'; winnerSlot: number; wins: Record<number, number>; rounds: number }
  | { kind: 'react_result'; winnerSlot: number; times: Record<number, number | null>; fouls: Record<number, boolean> }
  | { kind: 'react_series_end'; winnerSlot: number; wins: Record<number, number>; rounds: number }
  | { kind: 'memory'; msg: ServerMessage }
  | { kind: 'trivia'; msg: ServerMessage }
  | { kind: 'match3'; msg: ServerMessage }
  | { kind: 'sh'; msg: ServerMessage }
  | { kind: 'bank'; msg: ServerMessage }
  | { kind: 'snake'; msg: ServerMessage }

type GameEventHandler = (ev: GameEvent) => void

const SHAKHBATA_MSGS = new Set(['round_choosing', 'word_options', 'your_word', 'round', 'draw', 'hint', 'chat', 'scores', 'round_end', 'ended'])
const SNAKE_PUBLIC_MSGS = new Set([
  'snake_public_joined',
  'snake_public_respawned',
  'snake_public_snapshot',
  'snake_public_dead',
  'snake_public_count',
])

export interface MeIdentity {
  userId: string
  handle: string
}

/** رسالة دردشة كما يخزنها العميل — تمتد برسالة الخادم + علم "قيد الإرسال" للرسائل المتفائلة */
export type ChatMessage = ServerChatMessage & { pending?: boolean }

interface QueuedChatMessage {
  clientId: string
  threadId: string
  text: string
  createdAt: number
}

interface SocialCache {
  ownerUserId?: string
  friends: ServerFriend[]
  incomingFriendRequests: PublicUserCard[]
  outgoingFriendRequests: PublicUserCard[]
  threads: ServerThread[]
  messages: Record<string, ChatMessage[]>
  cachedAt: number
}

const SOCIAL_CACHE_KEY = 'gaaamed-social-cache-v1'
const CHAT_OUTBOX_KEY = 'gaaamed-chat-outbox-v1'
const MAX_CACHED_MESSAGES_PER_THREAD = 100

const EMPTY_SOCIAL_CACHE: SocialCache = {
  friends: [],
  incomingFriendRequests: [],
  outgoingFriendRequests: [],
  threads: [],
  messages: {},
  cachedAt: 0,
}

function trimMessageCache(messages: Record<string, ChatMessage[]>): Record<string, ChatMessage[]> {
  return Object.fromEntries(
    Object.entries(messages).map(([threadId, list]) => [threadId, list.slice(-MAX_CACHED_MESSAGES_PER_THREAD)]),
  )
}

function showChatNotification(threadId: string, message: ServerChatMessage) {
  const preview = message.kind === 'game_invite' ? 'دعوة للعب 🎮' : message.text.trim().slice(0, 72)
  toast.custom((toastId) => (
    <button
      type="button"
      onClick={() => {
        toast.dismiss(toastId)
        openNotificationThread(threadId)
      }}
      className="group flex w-[min(92vw,370px)] items-center gap-3 rounded-[1.35rem] border border-emerald-300/30 bg-gradient-to-l from-slate-950 via-[#101f2a] to-emerald-950 p-3 text-right text-white shadow-[0_18px_55px_rgba(2,12,23,0.7),0_0_28px_rgba(16,185,129,0.16)]"
      dir="rtl"
      aria-label={`رسالة جديدة من ${message.senderName}`}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/15 bg-gradient-to-br from-emerald-400/25 to-teal-400/5 text-2xl shadow-inner">
        {message.senderAvatar || '💬'}
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] leading-6">
        <strong className="font-black text-emerald-300">{message.senderName}</strong>
        <span className="text-white/40"> · </span>
        <span className="font-semibold text-white/80">{preview || 'رسالة جديدة'}</span>
      </p>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pink-400/12 text-base transition-transform group-hover:scale-110" aria-hidden="true">
        💚
      </span>
    </button>
  ), { duration: 4_200 })
}

interface OnlineContextValue {
  status: ConnectionStatus
  phase: OnlinePhase
  code: string | null
  slot: number | null
  gameId: string | null
  opponent: Opponent | null
  players: RoomPlayer[]
  matchId: number
  rematchMine: boolean
  rematchTheirs: boolean
  serverUrl: string
  /** إعدادات جلسة اللعب الحالية (عدد الجولات). */
  roomSettings: RoomSettings | null
  /** Accept a chat game invitation; the session identifier stays private to the UI. */
  acceptGameInvite: (inviteToken: string, name: string, avatar: string) => void
  leaveRoom: () => void
  startGame: () => void
  sendAction: (action: Record<string, unknown>) => void
  sendRpsChoice: (choice: string) => void
  sendReactTap: (ms: number | null, foul: boolean) => void
  sendMemoryFlip: (index: number) => void
  sendTriviaAnswer: (questionIndex: number, option: number) => void
  requestGameSync: () => void
  sendRaw: (obj: Record<string, unknown>) => void
  requestRematch: () => void
  resetRematch: () => void
  subscribe: (h: GameEventHandler) => () => void
  updateServerUrl: (url: string) => void
  reconnect: () => void
  // الهوية والاجتماعي (خادم حقيقي)
  me: MeIdentity | null
  friends: ServerFriend[]
  incomingFriendRequests: PublicUserCard[]
  outgoingFriendRequests: PublicUserCard[]
  threads: ServerThread[]
  messages: Record<string, ChatMessage[]>
  openThreadId: string | null
  setOpenThreadId: (id: string | null) => void
  searchUser: (handle: string) => Promise<PublicUserCard | null>
  setHandle: (handle: string) => Promise<{ ok: boolean; message?: string }>
  friendAdd: (userId: string) => void
  friendAccept: (userId: string) => void
  friendReject: (userId: string) => void
  friendRequestCancel: (userId: string) => void
  friendRemove: (userId: string) => void
  createDm: (userId: string) => Promise<ServerThread | null>
  createGroup: (name: string, memberIds: string[]) => Promise<ServerThread | null>
  loadThread: (threadId: string) => void
  chatSend: (threadId: string, text: string) => void
  chatReact: (threadId: string, messageId: string) => void
  chatSendInvite: (threadId: string, gameId: string, settings?: RoomSettings) => void
  reportFriendGameResult: (threadId: string, result: GameResult) => void
  refreshSocial: () => void
  // المباراة السريعة
  quickMatch: (gameId: string) => void
  /** الغرفة الحالية جاءت من مباراة سريعة (تُستخدم للبدء التلقائي في بنك الحظ) */
  fromQuickMatch: boolean
  /** غرفة دعوة محادثة فردية: تبدأ تلقائيًا فور اكتمال لاعبَين */
  autoStartRoom: boolean
  // غرفة دعوة أرسلها المستخدم — ليدخلها تلقائيًا فور إرسالها
  ownInviteRoom: { code: string; gameId: string; threadId: string } | null
  clearOwnInviteRoom: () => void
}

const OnlineContext = createContext<OnlineContextValue | null>(null)

export function OnlineProvider({ children }: { children: ReactNode }) {
  const app = useApp()
  const [status, setStatus] = useState<ConnectionStatus>(onlineClient.status)
  const [phase, setPhase] = useState<OnlinePhase>('idle')
  const [code, setCode] = useState<string | null>(null)
  const [slot, setSlot] = useState<number | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [opponent, setOpponent] = useState<Opponent | null>(null)
  const [players, setPlayers] = useState<RoomPlayer[]>([])
  const [matchId, setMatchId] = useState(0)
  const [rematchMine, setRematchMine] = useState(false)
  const [rematchTheirs, setRematchTheirs] = useState(false)
  const [serverUrl, setServerUrl] = useState(getServerUrl())
  // الاجتماعي
  const [me, setMe] = useState<MeIdentity | null>(null)
  const [friends, setFriends] = useState<ServerFriend[]>([])
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<PublicUserCard[]>([])
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<PublicUserCard[]>([])
  const [threads, setThreads] = useState<ServerThread[]>([])
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({})
  const [chatOutbox, setChatOutbox] = useState<QueuedChatMessage[]>([])
  const [socialCacheReady, setSocialCacheReady] = useState(false)
  const [openThreadId, setOpenThreadId] = useState<string | null>(null)
  const [fromQuickMatch, setFromQuickMatch] = useState(false)
  const [autoStartRoom, setAutoStartRoom] = useState(false)
  const [roomSettings, setRoomSettings] = useState<RoomSettings | null>(null)
  const [ownInviteRoom, setOwnInviteRoom] = useState<{ code: string; gameId: string; threadId: string } | null>(null)
  const clearOwnInviteRoom = useCallback(() => setOwnInviteRoom(null), [])

  const gameHandlersRef = useRef(new Set<GameEventHandler>())
  const rematchRef = useRef({ mine: false, theirs: false })
  const phaseRef = useRef<OnlinePhase>('idle')
  phaseRef.current = phase
  const slotRef = useRef<number | null>(null)
  slotRef.current = slot
  const autoStartRef = useRef(false)
  autoStartRef.current = autoStartRoom
  // مؤقّت البدء التلقائي لغرف الدعوات الفردية + ختم آخر إطلاق (منع الإطلاق المزدوج)
  const autoStartTimerRef = useRef<number | null>(null)
  const lastAutoStartRef = useRef(0)
  const meRef = useRef<MeIdentity | null>(null)
  meRef.current = me
  const openThreadRef = useRef<string | null>(null)
  openThreadRef.current = openThreadId
  const searchResolversRef = useRef(new Map<string, (card: PublicUserCard | null) => void>())
  const handleResolverRef = useRef<((r: { ok: boolean; message?: string }) => void) | null>(null)
  const threadResolverRef = useRef<((t: ServerThread | null) => void) | null>(null)
  const startGameRef = useRef<() => void>(() => {})
  const sentOutboxIdsRef = useRef(new Set<string>())
  const initialProfileUserIdRef = useRef(app.profile.userId)

  useEffect(() => {
    if (!app.onboarded) return
    const sendToken = (token: string) => {
      if (!meRef.current || onlineClient.status !== 'online') return
      onlineClient.send({ type: 'push_register', token, platform: 'android' })
    }
    const unsubscribe = onPushToken(sendToken)
    void initializePushNotifications()
    return unsubscribe
  }, [app.onboarded])

  const upsertThread = useCallback((thread: ServerThread) => {
    setThreads((list) => {
      const next = list.filter((t) => t.id !== thread.id)
      next.unshift(thread)
      return next.sort((a, b) => b.updatedAt - a.updatedAt)
    })
  }, [])

  useEffect(() => {
    // البدء التلقائي لغرف دعوات الـ DM: المضيف (slot=1) يرسل start بعد لحظة قصيرة من اكتمال لاعبَين
    // (يعكس مسار المباراة السريعة). الخادم يتجاهل start المكرر بأمان، والختم الزمني يمنع الإطلاق المزدوج.
    const scheduleAutoStart = () => {
      if (autoStartTimerRef.current != null) return
      if (phaseRef.current === 'playing') return
      if (Date.now() - lastAutoStartRef.current < 3000) return
      autoStartTimerRef.current = window.setTimeout(() => {
        autoStartTimerRef.current = null
        if (phaseRef.current === 'playing') return
        lastAutoStartRef.current = Date.now()
        startGameRef.current()
      }, 700)
    }
    const offStatus = onlineClient.onStatus(setStatus)
    const offMsg = onlineClient.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'joined': {
          const auto = msg.autoStart === true
          setAutoStartRoom(auto)
          autoStartRef.current = auto
          // بنك الحظ: مكوّن اللعبة يقرأ fromQuickMatch ليبدأ تلقائيًا — فعّله لغرف الدعوات الفردية أيضًا
          if (auto && msg.gameId === 'bank-el7az') setFromQuickMatch(true)
          setCode(msg.code as string)
          setSlot(msg.slot as number)
          slotRef.current = msg.slot as number
          if (msg.gameId) setGameId(msg.gameId as string)
          if (msg.settings) setRoomSettings(msg.settings as RoomSettings)
          if (msg.players) setPlayers(msg.players as RoomPlayer[])
          if (msg.opponent) {
            setOpponent(msg.opponent as Opponent)
            setPhase('ready')
          } else {
            setPhase('waiting')
          }
          // حالة نادرة: انضممنا كمضيف (slot=1) والخصم موجود بالفعل — ابدأ فورًا
          if (auto && slotRef.current === 1) {
            const count = msg.opponent ? 2 : ((msg.players as RoomPlayer[] | undefined)?.length ?? 1)
            if (count >= 2) scheduleAutoStart()
          }
          break
        }
        case 'opponent_joined':
          setOpponent(msg.opponent as Opponent)
          setPhase('ready')
          if (msg.settings) setRoomSettings(msg.settings as RoomSettings)
          toast.success(`انضم ${(msg.opponent as Opponent)?.name ?? 'الخصم'} إلى الغرفة! 🎮`)
          if (msg.autoStart === true && slotRef.current === 1) scheduleAutoStart()
          break
        case 'player_joined': {
          const list = (msg.players as RoomPlayer[]) ?? []
          setPlayers(list)
          if (autoStartRef.current && slotRef.current === 1 && list.length >= 2) scheduleAutoStart()
          break
        }
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
        case 'rps_series_end':
          gameHandlersRef.current.forEach((h) =>
            h({
              kind: 'rps_series_end',
              winnerSlot: msg.winnerSlot as number,
              wins: msg.wins as Record<number, number>,
              rounds: msg.rounds as number,
            }),
          )
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
        case 'react_series_end':
          gameHandlersRef.current.forEach((h) =>
            h({
              kind: 'react_series_end',
              winnerSlot: msg.winnerSlot as number,
              wins: msg.wins as Record<number, number>,
              rounds: msg.rounds as number,
            }),
          )
          break
        case 'memory_state':
        case 'memory_end':
          gameHandlersRef.current.forEach((h) => h({ kind: 'memory', msg }))
          break
        case 'trivia_question':
        case 'trivia_result':
        case 'trivia_end':
          gameHandlersRef.current.forEach((h) => h({ kind: 'trivia', msg }))
          break
        case 'match3_state':
        case 'match3_scores':
        case 'match3_rejected':
        case 'match3_end':
          gameHandlersRef.current.forEach((h) => h({ kind: 'match3', msg }))
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
        case 'bank':
          // نفق بنك الحظ: تمرير رسالة البروتوكول الأصلية لشاشة اللعبة
          gameHandlersRef.current.forEach((h) => h({ kind: 'bank', msg: msg.msg as ServerMessage }))
          break

        // ---------------- الهوية والاجتماعي ----------------
        case 'identified': {
          const user = msg.user as PublicUserCard & { createdAt?: number }
          const identity = { userId: user.userId, handle: user.handle }
          setMe(identity)
          app.setIdentity(user.userId, user.handle)
          onlineClient.send({ type: 'friends_list' })
          onlineClient.send({ type: 'chat_list' })
          const pushToken = getCurrentPushToken()
          if (pushToken) onlineClient.send({ type: 'push_register', token: pushToken, platform: 'android' })
          break
        }
        case 'handle_set': {
          const user = msg.user as PublicUserCard
          setMe((m) => (m ? { ...m, handle: user.handle } : m))
          app.setIdentity(user.userId, user.handle)
          handleResolverRef.current?.({ ok: true })
          handleResolverRef.current = null
          break
        }
        case 'handle_error':
          handleResolverRef.current?.({ ok: false, message: msg.message as string })
          handleResolverRef.current = null
          break
        case 'search_result': {
          const handle = msg.handle as string
          const resolver = searchResolversRef.current.get(handle)
          if (resolver) {
            searchResolversRef.current.delete(handle)
            resolver((msg.user as PublicUserCard | null) ?? null)
          }
          break
        }
        case 'friends_update':
          setFriends((msg.friends as ServerFriend[]) ?? [])
          break
        case 'friend_requests_update':
          setIncomingFriendRequests((msg.incoming as PublicUserCard[]) ?? [])
          setOutgoingFriendRequests((msg.outgoing as PublicUserCard[]) ?? [])
          break
        case 'friend_request_sent':
          toast.success('تم إرسال طلب الصداقة', { description: 'سيظهر الشخص في أصدقائك بعد موافقته.' })
          break
        case 'friend_request_received': {
          const requester = msg.user as PublicUserCard | undefined
          toast.info('طلب صداقة جديد 👋', { description: requester ? `${requester.name} يريد إضافتك` : undefined })
          break
        }
        case 'session_state':
          if (msg.inRoom !== true && phaseRef.current !== 'idle') {
            if (phaseRef.current === 'playing' || phaseRef.current === 'ready') {
              setPhase('opponent_left')
              toast.info('انتهت الجلسة بعد انقطاع الخادم', { description: 'اتصلنا من جديد، لكن المباراة القديمة لم تعد موجودة.' })
            } else {
              setPhase('idle')
              setCode(null)
              setSlot(null)
              setGameId(null)
              setOpponent(null)
              setPlayers([])
              toast.info('تمت إعادة الاتصال بالخادم')
            }
          }
          break
        case 'friend_accepted': {
          const friend = msg.user as PublicUserCard | undefined
          toast.success('تم قبول طلب الصداقة 🎉', { description: friend ? `أنت و${friend.name} أصدقاء الآن` : undefined })
          break
        }
        case 'chat_threads':
          setThreads((msg.threads as ServerThread[]) ?? [])
          break
        case 'chat_thread': {
          const thread = msg.thread as ServerThread
          upsertThread(thread)
          threadResolverRef.current?.(thread)
          threadResolverRef.current = null
          break
        }
        case 'chat_update':
          upsertThread(msg.thread as ServerThread)
          break
        case 'chat_history': {
          const threadId = msg.threadId as string
          setMessages((current) => {
            const official = (msg.messages as ServerChatMessage[]) ?? []
            const officialIds = new Set(official.map((message) => message.id))
            const pending = (current[threadId] ?? []).filter((message) => message.pending && !officialIds.has(message.id))
            return { ...current, [threadId]: [...official, ...pending] }
          })
          if (msg.thread) upsertThread(msg.thread as ServerThread)
          break
        }
        case 'chat_message': {
          const threadId = msg.threadId as string
          const message = msg.message as ServerChatMessage
          setMessages((m) => {
            const list = m[threadId] ?? []
            const idx = list.findIndex((x) => x.id === message.id)
            if (idx >= 0) {
              // صدى رسالتنا المتفائلة: استبدلها بالنسخة الرسمية (يزيل علم pending)
              if (list[idx] === message) return m
              const next = [...list]
              next[idx] = message
              return { ...m, [threadId]: next }
            }
            return { ...m, [threadId]: [...list, message] }
          })
          sentOutboxIdsRef.current.delete(message.id)
          setChatOutbox((queue) => queue.filter((item) => item.clientId !== message.id))
          if (msg.thread) upsertThread(msg.thread as ServerThread)
          // دعوتي أنا: الخادم أنشأ الغرفة — أدخلها تلقائيًا لأنتظر الخصم داخلها
          if (
            message.kind === 'game_invite' &&
            message.senderId === meRef.current?.userId &&
            message.invite?.roomCode
          ) {
            setOwnInviteRoom({ code: message.invite.roomCode, gameId: message.invite.gameId, threadId })
          }
          if (message.senderId !== meRef.current?.userId && openThreadRef.current !== threadId) {
            showChatNotification(threadId, message)
          }
          break
        }
        case 'chat_reaction': {
          const threadId = String(msg.threadId || '')
          const messageId = String(msg.messageId || '')
          const heartUserIds = Array.isArray(msg.heartUserIds) ? msg.heartUserIds.map(String) : []
          setMessages((current) => {
            const list = current[threadId]
            if (!list?.some((message) => message.id === messageId)) return current
            return {
              ...current,
              [threadId]: list.map((message) => (
                message.id === messageId ? { ...message, heartUserIds } : message
              )),
            }
          })
          setThreads((current) => current.map((thread) => (
            thread.id === threadId && thread.lastMessage?.id === messageId
              ? { ...thread, lastMessage: { ...thread.lastMessage, heartUserIds } }
              : thread
          )))
          break
        }
        case 'chat_game_result': {
          const threadId = String(msg.threadId || '')
          const message = msg.message as ServerChatMessage
          if (!threadId || !message?.id) break
          setMessages((current) => {
            const list = current[threadId]
            if (!list?.some((candidate) => candidate.id === message.id)) return current
            return {
              ...current,
              [threadId]: list.map((candidate) => candidate.id === message.id ? message : candidate),
            }
          })
          if (msg.thread) upsertThread(msg.thread as ServerThread)
          break
        }
        case 'quick_match_waiting':
          break
        case 'quick_match_cancelled':
          break
        case 'matched': {
          setFromQuickMatch(true)
          setCode(msg.code as string)
          setSlot(msg.slot as number)
          setGameId(msg.gameId as string)
          setOpponent(msg.opponent as Opponent)
          setPhase('ready')
          if (msg.settings) setRoomSettings(msg.settings as RoomSettings)
          toast.success('وجدنا لك خصمًا! ⚡', { description: (msg.opponent as Opponent)?.name })
          // الدخول المباشر: المضيف يبدأ تلقائيًا (إلا بنك الحظ — يبدأ من لوبي اللعبة)
          if ((msg.slot as number) === 1 && msg.gameId !== 'bank-el7az') {
            window.setTimeout(() => startGameRef.current(), 700)
          }
          break
        }
        default:
          if (SNAKE_PUBLIC_MSGS.has(msg.type)) {
            gameHandlersRef.current.forEach((h) => h({ kind: 'snake', msg }))
            break
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ابدأ الاتصال بعد أن تظهر الواجهة الأولى، وبعد تحميل إعدادات الجهاز الأصلية.
  useEffect(() => {
    let cancelled = false
    let timer: number | null = null
    void hydrateOnlineClientStorage().then(() => {
      if (cancelled) return
      setServerUrl(getServerUrl())
      timer = window.setTimeout(() => onlineClient.connect(), 350)
    })
    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  // اعرض آخر حالة اجتماعية فورًا حتى لو كان الخادم ما زال يعيد الاتصال.
  useEffect(() => {
    let cancelled = false
    void Promise.all([
      readStoredJson<SocialCache>(SOCIAL_CACHE_KEY, EMPTY_SOCIAL_CACHE),
      readStoredJson<QueuedChatMessage[]>(CHAT_OUTBOX_KEY, []),
    ]).then(([cache, outbox]) => {
      if (cancelled) return
      const initialUserId = initialProfileUserIdRef.current
      const sameOwner = !cache.ownerUserId || !initialUserId || cache.ownerUserId === initialUserId
      if (sameOwner) {
        setFriends(cache.friends ?? [])
        setIncomingFriendRequests(cache.incomingFriendRequests ?? [])
        setOutgoingFriendRequests(cache.outgoingFriendRequests ?? [])
        setThreads(cache.threads ?? [])
        setMessages(cache.messages ?? {})
        setChatOutbox(outbox)
      }
      setSocialCacheReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!socialCacheReady) return
    const timer = window.setTimeout(() => {
      void writeStoredJson(SOCIAL_CACHE_KEY, {
        ownerUserId: app.profile.userId,
        friends,
        incomingFriendRequests,
        outgoingFriendRequests,
        threads,
        messages: trimMessageCache(messages),
        cachedAt: Date.now(),
      } satisfies SocialCache)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [app.profile.userId, friends, incomingFriendRequests, messages, outgoingFriendRequests, socialCacheReady, threads])

  useEffect(() => {
    if (!socialCacheReady) return
    void writeStoredJson(CHAT_OUTBOX_KEY, chatOutbox)
  }, [chatOutbox, socialCacheReady])

  useEffect(() => {
    if (status !== 'online') {
      sentOutboxIdsRef.current.clear()
      return
    }
    if (!me || chatOutbox.length === 0) return
    for (const item of chatOutbox) {
      if (sentOutboxIdsRef.current.has(item.clientId)) continue
      sentOutboxIdsRef.current.add(item.clientId)
      onlineClient.send({
        type: 'chat_send',
        threadId: item.threadId,
        text: item.text,
        clientId: item.clientId,
      })
    }
  }, [chatOutbox, me, status])

  // identify عند الاتصال (وعند تغيّر الملف) — بعد اكتمال الأونبوردنج فقط
  const { onboarded, profile } = app
  useEffect(() => {
    if (status !== 'online' || !onboarded || !profile.name) return
    let cancelled = false
    void getDeviceId().then((deviceId) => {
      if (cancelled) return
      onlineClient.send({
        type: 'identify',
        deviceId,
        name: profile.name,
        avatar: profile.avatar,
        handle: profile.handle,
      })
    })
    return () => {
      cancelled = true
    }
  }, [status, onboarded, profile.name, profile.avatar, profile.handle])

  const acceptGameInvite = useCallback((inviteToken: string, name: string, avatar: string) => {
    setOpponent(null)
    setFromQuickMatch(false)
    setAutoStartRoom(false)
    setRoomSettings(null)
    lastAutoStartRef.current = 0
    if (autoStartTimerRef.current != null) {
      window.clearTimeout(autoStartTimerRef.current)
      autoStartTimerRef.current = null
    }
    onlineClient.send({ type: 'join', code: inviteToken.trim(), name, avatar })
  }, [])

  const leaveRoom = useCallback(() => {
    onlineClient.send({ type: 'quick_match_cancel' })
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
    setFromQuickMatch(false)
    setAutoStartRoom(false)
    setRoomSettings(null)
    lastAutoStartRef.current = 0
    if (autoStartTimerRef.current != null) {
      window.clearTimeout(autoStartTimerRef.current)
      autoStartTimerRef.current = null
    }
  }, [])

  const startGame = useCallback(() => {
    // لا تضع إرسال الشبكة داخل state updater: React قد يستدعي updater مرتين في وضع التطوير.
    if (gameId === 'shakhbata') {
      // شخبطة: الخادم يبدأ المباراة ويبث أول جولة
      onlineClient.send({ type: 'start' })
    } else if (gameId && gameId !== 'bank-el7az') {
      onlineClient.send({ type: 'action', action: { kind: 'start' } })
      rematchRef.current = { mine: false, theirs: false }
      setRematchMine(false)
      setRematchTheirs(false)
      setMatchId((id) => id + 1)
      setPhase('playing')
    }
  }, [gameId])
  startGameRef.current = startGame

  const sendAction = useCallback((action: Record<string, unknown>) => {
    onlineClient.send({ type: 'action', action })
  }, [])

  const sendRpsChoice = useCallback((choice: string) => {
    onlineClient.send({ type: 'rps_choice', choice })
  }, [])

  const sendReactTap = useCallback((ms: number | null, foul: boolean) => {
    onlineClient.send({ type: 'react_tap', ms, foul })
  }, [])

  const sendMemoryFlip = useCallback((index: number) => {
    onlineClient.send({ type: 'memory_flip', index })
  }, [])

  const sendTriviaAnswer = useCallback((questionIndex: number, option: number) => {
    onlineClient.send({ type: 'trivia_answer', questionIndex, option })
  }, [])

  const requestGameSync = useCallback(() => {
    onlineClient.send({ type: 'game_sync' })
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

  // ---------------- الاجتماعي ----------------
  const searchUser = useCallback((handle: string) => {
    const clean = handle.trim().toLowerCase().replace(/^@/, '')
    if (!clean) return Promise.resolve(null)
    return new Promise<PublicUserCard | null>((resolvePromise) => {
      searchResolversRef.current.set(clean, resolvePromise)
      onlineClient.send({ type: 'search_user', handle: clean })
      window.setTimeout(() => {
        if (searchResolversRef.current.delete(clean)) resolvePromise(null)
      }, 5000)
    })
  }, [])

  const setHandle = useCallback((handle: string) => {
    return new Promise<{ ok: boolean; message?: string }>((resolvePromise) => {
      handleResolverRef.current = resolvePromise
      onlineClient.send({ type: 'set_handle', handle: handle.trim().toLowerCase() })
      window.setTimeout(() => {
        if (handleResolverRef.current) {
          handleResolverRef.current = null
          resolvePromise({ ok: false, message: 'الخادم لم يرد.' })
        }
      }, 5000)
    })
  }, [])

  const friendAdd = useCallback((userId: string) => {
    onlineClient.send({ type: 'friend_request', userId })
  }, [])

  const friendAccept = useCallback((userId: string) => {
    onlineClient.send({ type: 'friend_accept', userId })
  }, [])

  const friendReject = useCallback((userId: string) => {
    onlineClient.send({ type: 'friend_reject', userId })
  }, [])

  const friendRequestCancel = useCallback((userId: string) => {
    onlineClient.send({ type: 'friend_request_cancel', userId })
  }, [])

  const friendRemove = useCallback((userId: string) => {
    onlineClient.send({ type: 'friend_remove', userId })
  }, [])

  const createDm = useCallback((userId: string) => {
    return new Promise<ServerThread | null>((resolvePromise) => {
      threadResolverRef.current = resolvePromise
      onlineClient.send({ type: 'chat_create_dm', userId })
      window.setTimeout(() => {
        if (threadResolverRef.current) {
          threadResolverRef.current = null
          resolvePromise(null)
        }
      }, 5000)
    })
  }, [])

  const createGroup = useCallback((name: string, memberIds: string[]) => {
    return new Promise<ServerThread | null>((resolvePromise) => {
      threadResolverRef.current = resolvePromise
      onlineClient.send({ type: 'chat_create_group', name, memberIds })
      window.setTimeout(() => {
        if (threadResolverRef.current) {
          threadResolverRef.current = null
          resolvePromise(null)
        }
      }, 5000)
    })
  }, [])

  const loadThread = useCallback((threadId: string) => {
    onlineClient.send({ type: 'chat_history', threadId })
    setThreads((list) => list.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)))
  }, [])

  const chatSend = useCallback(
    (threadId: string, text: string) => {
      const clean = text.trim()
      if (!clean) return
      // إرسال متفائل: أظهر الرسالة فورًا بمعرّف محلي — الخادم يصدّ نفس المعرّف فيستبدل الصدى النسخة المعلّقة
      const clientId = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
      const meNow = meRef.current
      const senderId = meNow?.userId ?? app.profile.userId
      if (senderId) {
        const optimistic: ChatMessage = {
          id: clientId,
          senderId,
          senderName: app.profile.name || 'أنا',
          senderAvatar: app.profile.avatar || '🎮',
          text: clean.slice(0, 1000),
          kind: 'text',
          invite: null,
          time: Date.now(),
          pending: true,
        }
        setMessages((m) => ({ ...m, [threadId]: [...(m[threadId] ?? []), optimistic] }))
      }
      setChatOutbox((queue) => [...queue.filter((item) => item.clientId !== clientId), {
        clientId,
        threadId,
        text: clean,
        createdAt: Date.now(),
      }])
    },
    [app.profile.avatar, app.profile.name, app.profile.userId],
  )

  const chatReact = useCallback((threadId: string, messageId: string) => {
    const userId = meRef.current?.userId
    if (!userId) return
    setMessages((current) => {
      const list = current[threadId]
      if (!list?.some((message) => message.id === messageId && !message.pending)) return current
      return {
        ...current,
        [threadId]: list.map((message) => {
          if (message.id !== messageId) return message
          const hearts = new Set(message.heartUserIds ?? [])
          if (hearts.has(userId)) hearts.delete(userId)
          else hearts.add(userId)
          return { ...message, heartUserIds: [...hearts] }
        }),
      }
    })
    onlineClient.send({ type: 'chat_react', threadId, messageId })
  }, [])

  const chatSendInvite = useCallback((threadId: string, gameId: string, settings?: RoomSettings) => {
    onlineClient.send({
      type: 'chat_send',
      threadId,
      kind: 'game_invite',
      invite: { gameId },
      ...(settings ? { settings } : {}),
    })
  }, [])

  const reportFriendGameResult = useCallback((threadId: string, result: GameResult) => {
    if (!code) return
    onlineClient.send({
      type: 'chat_game_result',
      threadId,
      roomCode: code,
      outcome: result.outcome,
      ...(result.winnerName ? { winnerName: result.winnerName } : {}),
      ...(result.winnerSlot != null ? { winnerSlot: result.winnerSlot } : {}),
    })
  }, [code])

  const refreshSocial = useCallback(() => {
    onlineClient.send({ type: 'friends_list' })
    onlineClient.send({ type: 'friend_requests_list' })
    onlineClient.send({ type: 'chat_list' })
  }, [])

  // ---------------- المباراة السريعة ----------------
  const quickMatch = useCallback(
    (gid: string) => {
      onlineClient.send({ type: 'quick_match', gameId: gid, name: app.profile.name, avatar: app.profile.avatar })
    },
    [app.profile.name, app.profile.avatar],
  )

  const value = useMemo<OnlineContextValue>(
    () => ({
      status, phase, code, slot, gameId, opponent, players, matchId,
      rematchMine, rematchTheirs, serverUrl, roomSettings,
      acceptGameInvite, leaveRoom, startGame,
      sendAction, sendRpsChoice, sendReactTap, sendMemoryFlip, sendTriviaAnswer, requestGameSync, sendRaw,
      requestRematch, resetRematch, subscribe, updateServerUrl, reconnect,
      me, friends, incomingFriendRequests, outgoingFriendRequests,
      threads, messages, openThreadId, setOpenThreadId,
      searchUser, setHandle, friendAdd, friendAccept, friendReject, friendRequestCancel, friendRemove, createDm, createGroup,
      loadThread, chatSend, chatReact, chatSendInvite, reportFriendGameResult, refreshSocial,
      quickMatch, fromQuickMatch, autoStartRoom,
      ownInviteRoom, clearOwnInviteRoom,
    }),
    [status, phase, code, slot, gameId, opponent, players, matchId, rematchMine, rematchTheirs, serverUrl, roomSettings,
      acceptGameInvite, leaveRoom, startGame, sendAction, sendRpsChoice, sendReactTap,
      sendMemoryFlip, sendTriviaAnswer, requestGameSync, sendRaw,
      requestRematch, resetRematch, subscribe, updateServerUrl, reconnect,
      me, friends, incomingFriendRequests, outgoingFriendRequests,
      threads, messages, openThreadId,
      searchUser, setHandle, friendAdd, friendAccept, friendReject, friendRequestCancel, friendRemove, createDm, createGroup,
      loadThread, chatSend, chatReact, chatSendInvite, reportFriendGameResult, refreshSocial,
      quickMatch, fromQuickMatch, autoStartRoom,
      ownInviteRoom, clearOwnInviteRoom],
  )

  return <OnlineContext.Provider value={value}>{children}</OnlineContext.Provider>
}

export function useOnline(): OnlineContextValue {
  const ctx = useContext(OnlineContext)
  if (!ctx) throw new Error('useOnline must be used within OnlineProvider')
  return ctx
}
