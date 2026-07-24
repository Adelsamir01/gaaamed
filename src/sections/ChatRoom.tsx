import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Gamepad2, Heart, Loader2, Send, Trophy } from 'lucide-react'
import { useOnline, type ChatMessage } from '@/online/OnlineContext'
import { AvatarCircle, StatusDot } from './components'
import { CATEGORIES, ONLINE_GAMES, getGame } from '@/games'
import { DEFAULT_ROUNDS, gameUsesRounds, type Difficulty, type GameCategory } from '@/types'
import { statusLabel } from '@/data/friends'
import { ROUND_AR, RoundsStepper } from './OnlineLobby'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import PlayerProfileDialog from './PlayerProfileDialog'

interface Props {
  threadId: string
  onBack: () => void
  onAcceptInvite: (inviteToken: string, messageId: string) => void
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

interface BubbleProps {
  m: ChatMessage
  mine: boolean
  isGroup: boolean
  currentUserId?: string
  friendInsideInvite: boolean
  friendName?: string
  onJoin: (code: string, messageId: string) => void
  onHeart: (messageId: string) => void
}

/** فقاعة رسالة مُخزَّنة: لا يعاد رسمها مع كل رسالة جديدة — فقط الفقاعات الجديدة تُرسم وتتحرك */
const MessageBubble = memo(function MessageBubble({ m, mine, isGroup, currentUserId, friendInsideInvite, friendName, onJoin, onHeart }: BubbleProps) {
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const lastTapRef = useRef(0)
  const heartCount = m.heartUserIds?.length ?? 0
  const reactedByMe = !!currentUserId && (m.heartUserIds?.includes(currentUserId) ?? false)

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start || m.pending || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) return
    const now = performance.now()
    if (now - lastTapRef.current <= 340) {
      lastTapRef.current = 0
      onHeart(m.id)
    } else {
      lastTapRef.current = now
    }
  }

  const displayedAt = m.kind === 'game_invite' ? (m.invite?.result?.completedAt ?? m.time) : m.time
  const time = (
    <span
      className={cn(
        'mb-1 flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] tabular-nums',
        mine ? 'text-emerald-100/55' : 'text-muted-foreground/75',
      )}
      dir="rtl"
    >
      {m.pending && <Loader2 className="h-2.5 w-2.5 animate-spin" aria-label="جارٍ الإرسال" />}
      {fmtTime(displayedAt)}
    </span>
  )

  const heart = heartCount > 0 && (
    <motion.span
      key={`${m.id}-${heartCount}-${reactedByMe}`}
      initial={{ opacity: 0, scale: 0.35, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={cn(
        'absolute -bottom-2.5 z-10 flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full border px-1 shadow-md backdrop-blur-xl',
        mine ? 'left-2' : 'right-2',
        reactedByMe
          ? 'border-pink-200/70 bg-pink-500 text-white shadow-pink-950/35'
          : 'border-white/15 bg-slate-900/95 text-pink-400',
      )}
      aria-label={`${heartCount} إعجاب بالقلب`}
    >
      <Heart className="h-2.5 w-2.5" fill="currentColor" />
      {heartCount > 1 && <bdi className="text-[8px] font-black tabular-nums">{heartCount}</bdi>}
    </motion.span>
  )

  // فقاعة دعوة اللعبة الغنية
  if (m.kind === 'game_invite' && m.invite) {
    const result = m.invite.result
    const winnerIsMe = result?.kind === 'winner' && result.winnerId === currentUserId
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
        onPointerCancel={() => { pointerStartRef.current = null }}
        className={cn('w-fit max-w-[88%] select-none', heartCount > 0 && 'mb-2', mine ? 'self-end' : 'self-start')}
        style={{ touchAction: 'pan-y' }}
        title="اضغط مرتين لإضافة قلب"
      >
        {!mine && isGroup && (
          <span className="text-[10px] font-bold text-emerald-300 mb-1 block ps-2">
            {m.senderAvatar} {m.senderName}
          </span>
        )}
        <div className="flex items-end gap-1.5" dir="ltr">
          {!mine && time}
          <div className="relative min-w-0" dir="rtl">
            <div
              className={cn(
                'rounded-3xl border p-3.5',
                result
                  ? 'border-amber-300/40 bg-gradient-to-br from-amber-400/15 via-orange-400/8 to-white/5 shadow-[0_12px_35px_rgba(245,158,11,0.12)]'
                  : mine
                    ? 'rounded-bl-md border-emerald-400/40 bg-emerald-500/15'
                    : 'rounded-br-md border-white/15 bg-white/5',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-4xl">{m.invite.gameEmoji}</span>
                <div className="flex-1">
                  <p className="font-extrabold text-sm">{m.invite.gameName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {result ? 'انتهت المباراة' : mine ? 'أرسلت دعوة لعب 🎮' : `${m.senderName} بيتحداك!`}
                    {!result && m.invite.settings?.rounds != null &&
                      ` · ${ROUND_AR[m.invite.settings.rounds] ?? m.invite.settings.rounds} جولات 🏆`}
                    {!result && m.invite.gameId === 'memory' && m.invite.settings?.difficulty &&
                      ` · ${m.invite.settings.difficulty === 'hard' ? 'صعب ٦×٥' : m.invite.settings.difficulty === 'medium' ? 'متوسط ٥×٤' : 'سهل ٤×٤'} 🧠`}
                  </p>
                </div>
              </div>
              {result ? (
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-200/20 bg-black/20 px-3 py-2.5">
                  {result.kind === 'draw' ? (
                    <>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-xl">🤝</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-amber-200/70">النتيجة</p>
                        <p className="text-sm font-black text-amber-100">تعادل!</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-200/30 bg-amber-300/15 text-xl">
                        {result.winnerAvatar || '🏆'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold text-amber-200/70">الفائز</p>
                        <p className="truncate text-sm font-black text-amber-100">
                          {winnerIsMe ? 'إنت كسبت! 🏆' : `${result.winnerName} كسب!`}
                        </p>
                      </div>
                      <Trophy className="h-5 w-5 shrink-0 text-amber-300" />
                    </>
                  )}
                </div>
              ) : (
                <>
                  {friendInsideInvite && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 flex items-center gap-2 rounded-2xl border border-emerald-300/30 bg-emerald-400/10 px-3 py-2"
                    >
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                      </span>
                      <p className="min-w-0 text-[11px] font-extrabold text-emerald-200">
                        {friendName || 'صاحبك'} جوه اللعبة ومستنيك
                      </p>
                    </motion.div>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onJoin(m.invite!.roomCode, m.id)}
                    className={cn(
                      'mt-3 w-full rounded-2xl bg-gradient-to-l py-2.5 text-sm font-extrabold text-white transition-all',
                      friendInsideInvite
                        ? 'from-emerald-400 to-cyan-500 shadow-[0_0_22px_rgba(52,211,153,0.24)] hover:from-emerald-300 hover:to-cyan-400'
                        : 'from-emerald-500 to-teal-500 glow-emerald hover:from-emerald-400 hover:to-teal-400',
                    )}
                  >
                    {friendInsideInvite ? 'ادخل اللعبة دلوقتي 🎮' : mine ? 'ارجع للعبة 🎮' : 'اقبل التحدي 🎮'}
                  </motion.button>
                </>
              )}
            </div>
            {heart}
          </div>
          {mine && time}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onPointerDown={pointerDown}
      onPointerUp={pointerUp}
      onPointerCancel={() => { pointerStartRef.current = null }}
      className={cn('w-fit max-w-[88%] select-none', heartCount > 0 && 'mb-2', mine ? 'self-end' : 'self-start')}
      style={{ touchAction: 'pan-y' }}
      title="اضغط مرتين لإضافة قلب"
    >
      {!mine && isGroup && (
        <span className="text-[10px] font-bold text-emerald-300 mb-1 block ps-2">
          {m.senderAvatar} {m.senderName}
        </span>
      )}
      <div className="flex items-end gap-1.5" dir="ltr">
        {!mine && time}
        <div className="relative min-w-0" dir="rtl">
          <div
            className={cn(
              'rounded-3xl px-3.5 py-2',
              mine
                ? 'rounded-bl-md bg-gradient-to-l from-emerald-500 to-teal-500 text-white'
                : 'rounded-br-md border border-white/12 bg-white/8',
              m.pending && 'opacity-70',
            )}
          >
            <p className="whitespace-pre-wrap break-words text-sm font-medium leading-5" dir="auto">{m.text}</p>
          </div>
          {heart}
        </div>
        {mine && time}
      </div>
    </motion.div>
  )
})

const EMPTY_MESSAGES: ChatMessage[] = []

export default function ChatRoom({ threadId, onBack, onAcceptInvite }: Props) {
  const { status, me, friends, threads, messages, loadThread, setOpenThreadId, chatSend, chatReact, chatSendInvite } = useOnline()
  const thread = threads.find((t) => t.id === threadId)
  const msgs: ChatMessage[] = messages[threadId] ?? EMPTY_MESSAGES
  const [draft, setDraft] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  // منتقي الدعوات: اللعبة ذات الجولات المختارة + عدد الجولات (الافتراضي ٥)
  const [inviteGame, setInviteGame] = useState<string | null>(null)
  const [inviteRounds, setInviteRounds] = useState<number>(DEFAULT_ROUNDS)
  const [inviteDifficulty, setInviteDifficulty] = useState<Difficulty>('easy')
  const [inviteCategory, setInviteCategory] = useState<'الكل' | GameCategory>('الكل')
  const [profileOpen, setProfileOpen] = useState(false)
  const [showNewestButton, setShowNewestButton] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const stickToBottomRef = useRef(true)

  const dmFriend = thread?.kind === 'dm' ? friends.find((f) => thread.memberIds.includes(f.userId)) : undefined
  const dmPresence = status === 'online' ? dmFriend?.presence : 'offline'
  const isGroup = thread?.kind === 'group'
  const myId = me?.userId
  const filteredInviteGames = useMemo(
    () => inviteCategory === 'الكل'
      ? ONLINE_GAMES
      : ONLINE_GAMES.filter((game) => game.category === inviteCategory),
    [inviteCategory],
  )

  // مرجع ثابت لزر قبول التحدي حتى لا تُكسر مذكرة الفقاعات
  const handleJoin = useCallback(
    (inviteToken: string, messageId: string) => {
      sounds.pop()
      onAcceptInvite(inviteToken, messageId)
    },
    [onAcceptInvite],
  )

  const handleHeart = useCallback((messageId: string) => {
    sounds.pop()
    chatReact(threadId, messageId)
  }, [chatReact, threadId])

  // علّم المحادثة كمفتوحة طوال وجود الشاشة حتى لا يظهر تنبيه داخل التطبيق لها.
  useEffect(() => {
    setOpenThreadId(threadId)
    return () => setOpenThreadId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  // قد يفتح الإشعار قبل اكتمال تعريف المستخدم. طابور التاريخ يحتفظ بالطلب
  // حتى يكتمل التعريف، ويعيده بعد انقطاع الاتصال إن لم يصل رد الخادم.
  useEffect(() => {
    loadThread(threadId)
  }, [loadThread, status, threadId])

  const scrollToBottom = useCallback(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    scroller.scrollTop = scroller.scrollHeight
    stickToBottomRef.current = true
    setShowNewestButton(false)
  }, [])

  const lastMessage = msgs[msgs.length - 1]
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (stickToBottomRef.current || lastMessage?.senderId === myId) scrollToBottom()
      else setShowNewestButton(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [lastMessage?.id, lastMessage?.senderId, myId, scrollToBottom, threadId])

  useEffect(() => {
    const keepLatestVisible = () => {
      stickToBottomRef.current = true
      requestAnimationFrame(() => requestAnimationFrame(scrollToBottom))
    }
    window.addEventListener('keyboardDidShow', keepLatestVisible)
    window.visualViewport?.addEventListener('resize', keepLatestVisible)
    return () => {
      window.removeEventListener('keyboardDidShow', keepLatestVisible)
      window.visualViewport?.removeEventListener('resize', keepLatestVisible)
    }
  }, [scrollToBottom])

  const handleMessageScroll = () => {
    const scroller = scrollRef.current
    if (!scroller) return
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    stickToBottomRef.current = distanceFromBottom < 72
    if (stickToBottomRef.current) setShowNewestButton(false)
  }

  const send = () => {
    const text = draft.trim()
    if (!text) return
    sounds.click()
    stickToBottomRef.current = true
    chatSend(threadId, text)
    setDraft('')
    if (composerRef.current) composerRef.current.style.height = 'auto'
    requestAnimationFrame(() => {
      composerRef.current?.focus({ preventScroll: true })
      requestAnimationFrame(scrollToBottom)
    })
  }

  const sendInvite = (gameId: string) => {
    // الألعاب ذات الجولات تمر بخطوة اختيار عدد الجولات أولًا
    if (gameUsesRounds(gameId) || gameId === 'memory') {
      sounds.click()
      setInviteGame(gameId)
      return
    }
    sounds.pop()
    chatSendInvite(threadId, gameId)
    closeInvitePicker()
  }

  const confirmInvite = () => {
    if (!inviteGame) return
    sounds.pop()
    chatSendInvite(
      threadId,
      inviteGame,
      inviteGame === 'memory' ? { difficulty: inviteDifficulty } : { rounds: inviteRounds },
    )
    closeInvitePicker()
  }

  const closeInvitePicker = () => {
    setInviteOpen(false)
    setInviteGame(null)
    setInviteDifficulty('easy')
    setInviteCategory('الكل')
  }

  const openInvitePicker = () => {
    sounds.click()
    composerRef.current?.blur()
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setInviteCategory('الكل')
    setInviteOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* الترويسة */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/10 shrink-0">
        <button
          onClick={onBack}
          className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
          رجوع
        </button>
        <button
          type="button"
          disabled={!dmFriend}
          onClick={() => setProfileOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          aria-label={dmFriend ? `عرض ملف ${dmFriend.name}` : undefined}
        >
          <div className="relative shrink-0">
            <AvatarCircle emoji={thread?.avatar ?? '💬'} size="sm" />
            {dmFriend && dmPresence && (
              <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-slate-950 bg-slate-950">
                <StatusDot status={dmPresence} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-extrabold">{thread?.name ?? 'محادثة'}</p>
              {status === 'online' && dmFriend?.presence === 'playing' && dmFriend.activeGame && (
                <span className="max-w-[52%] shrink truncate rounded-full border border-amber-300/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-extrabold text-amber-200">
                  {dmFriend.activeGame.emoji} {dmFriend.activeGame.name}
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
              {thread?.kind === 'group'
                ? `${thread.memberIds.length} أعضاء`
                : dmFriend
                  ? <>
                      <span className={cn(
                        'shrink-0 font-bold',
                        status === 'online' && dmPresence === 'online' && 'text-emerald-300',
                        status === 'online' && dmPresence === 'playing' && 'text-amber-300',
                      )}>
                        {status === 'online'
                          ? statusLabel[dmFriend.presence]
                          : status === 'connecting' ? 'جاري تحديث الحالة…' : 'الحالة غير متاحة'}
                      </span>
                      {dmFriend.handle && <span className="truncate" dir="ltr">@{dmFriend.handle}</span>}
                    </>
                  : ''}
            </div>
          </div>
        </button>
      </div>

      {/* الرسائل */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleMessageScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 py-4 no-scrollbar"
        >
          {msgs.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <div className="mb-2 text-4xl">💬</div>
              <p className="text-xs font-bold">لا رسائل بعد — ابدأ المحادثة!</p>
            </div>
          )}
          {msgs.map((m) => (
            <MessageBubble
              key={m.id}
              m={m}
              mine={m.senderId === myId}
              isGroup={isGroup === true}
              currentUserId={myId}
              friendInsideInvite={Boolean(
                status === 'online' &&
                dmFriend?.activeInvite?.threadId === threadId &&
                dmFriend.activeInvite.messageId === m.id &&
                dmFriend.activeInvite.roomCode === m.invite?.roomCode &&
                dmFriend.activeInvite.gameId === m.invite?.gameId &&
                !m.invite?.result
              )}
              friendName={dmFriend?.name}
              onJoin={handleJoin}
              onHeart={handleHeart}
            />
          ))}
        </div>
        {showNewestButton && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/35 bg-slate-900/95 px-4 py-2 text-[11px] font-extrabold text-emerald-300 shadow-xl backdrop-blur-xl"
          >
            رسائل جديدة ↓
          </button>
        )}
      </div>

      {/* الإدخال */}
      <div className="px-4 pt-2 shrink-0 safe-bottom">
        <div className="flex items-end gap-2 glass rounded-3xl p-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={openInvitePicker}
            className="w-11 h-11 rounded-2xl bg-amber-400/15 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 glow-amber"
            aria-label="دعوة لعبة"
          >
            <Gamepad2 className="w-5 h-5" />
          </motion.button>
          <textarea
            ref={composerRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onInput={(e) => {
              e.currentTarget.style.height = 'auto'
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 96)}px`
            }}
            onFocus={() => {
              stickToBottomRef.current = true
              requestAnimationFrame(() => requestAnimationFrame(scrollToBottom))
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
              e.preventDefault()
              send()
            }}
            enterKeyHint="send"
            placeholder="اكتب رسالة…"
            className="max-h-24 min-h-11 flex-1 min-w-0 resize-none overflow-y-auto bg-transparent px-1 py-2.5 text-base font-medium leading-6 placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onPointerDown={(event) => event.preventDefault()}
            onClick={send}
            disabled={!draft.trim()}
            className="w-11 h-11 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white flex items-center justify-center shrink-0 disabled:opacity-40 glow-emerald"
            aria-label="إرسال"
          >
            <Send className="w-5 h-5 -scale-x-100" />
          </motion.button>
        </div>
      </div>

      {/* منتقي لعبة الدعوة */}
      <Dialog open={inviteOpen} onOpenChange={(open) => (open ? setInviteOpen(true) : closeInvitePicker())}>
        <DialogContent className="max-h-[min(86dvh,640px)] max-w-[380px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-3xl p-4">
          <DialogHeader>
            <DialogTitle className="text-center">تحدّاهم في لعبة 🎮</DialogTitle>
            <DialogDescription className="text-center">
              {inviteGame ? 'ظبّط التحدي وابعت الدعوة' : 'اختار لعبة — والدعوة هتوصل بزر انضمام مباشر'}
            </DialogDescription>
          </DialogHeader>
          {inviteGame ? (
            // خطوة عدد الجولات للألعاب ذات السلاسل (حجر ورقة مقص / سرعة البرق / شخبطة)
            <div className="min-h-0 overflow-y-auto py-2">
              <div className="glass rounded-2xl p-3.5 mb-3 flex items-center gap-3">
                <span className="text-3xl">{getGame(inviteGame)?.emoji}</span>
                <div className="flex-1">
                  <p className="font-extrabold text-sm">{getGame(inviteGame)?.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {inviteGame === 'memory'
                      ? 'اختار حجم لوحة الذاكرة'
                      : inviteGame === 'shakhbata'
                        ? 'كم جولة رسم وتخمين؟'
                        : 'أفضل من كم جولة؟'}
                  </p>
                </div>
              </div>
              {inviteGame === 'memory' ? (
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'easy', label: 'سهل', detail: '٤×٤', pairs: '٨ أزواج' },
                    { id: 'medium', label: 'متوسط', detail: '٥×٤', pairs: '١٠ أزواج' },
                    { id: 'hard', label: 'صعب', detail: '٦×٥', pairs: '١٥ زوجًا' },
                  ] as const).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        sounds.click()
                        setInviteDifficulty(option.id)
                      }}
                      aria-pressed={inviteDifficulty === option.id}
                      className={cn(
                        'rounded-2xl border px-1.5 py-3 text-center transition-all',
                        inviteDifficulty === option.id
                          ? 'border-emerald-400/60 bg-emerald-500/15 glow-emerald'
                          : 'border-white/10 bg-white/5',
                      )}
                    >
                      <p className={cn('text-xs font-extrabold', inviteDifficulty === option.id && 'text-emerald-300')}>{option.label}</p>
                      <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{option.detail}</p>
                      <p className="text-[9px] text-muted-foreground">{option.pairs}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <RoundsStepper value={inviteRounds} onChange={setInviteRounds} />
              )}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={confirmInvite}
                className="w-full mt-3 py-3 rounded-2xl font-extrabold text-sm bg-gradient-to-l from-emerald-500 to-teal-500 text-white glow-emerald hover:from-emerald-400 hover:to-teal-400 transition-all"
              >
                أرسل الدعوة 🎮
              </motion.button>
              <button
                onClick={() => {
                  sounds.click()
                  setInviteGame(null)
                }}
                className="w-full mt-2 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                ‹ اختر لعبة أخرى
              </button>
            </div>
          ) : (
            <div className="flex min-h-0 flex-col gap-2.5 py-1">
              <div
                className="-mx-1 flex shrink-0 gap-2 overflow-x-auto px-1 pb-1 no-scrollbar"
                role="group"
                aria-label="تصنيفات الألعاب"
              >
                {CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      sounds.click()
                      setInviteCategory(category)
                    }}
                    aria-pressed={inviteCategory === category}
                    className={cn(
                      'min-h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-xs font-extrabold transition-all',
                      inviteCategory === category
                        ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200 glow-emerald'
                        : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10',
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="flex shrink-0 items-center justify-between px-1 text-[10px] font-bold text-muted-foreground">
                <span>{filteredInviteGames.length.toLocaleString('ar-EG')} لعبة</span>
                <span>اضغط على اللعبة لإرسال الدعوة</span>
              </div>

              <div className="min-h-0 space-y-1.5 overflow-y-auto overscroll-contain pe-1 [scrollbar-width:thin]">
                {filteredInviteGames.map((game) => {
                  const optionLabel = gameUsesRounds(game.id)
                    ? 'اختيار الجولات'
                    : game.id === 'memory'
                      ? 'اختيار المستوى'
                      : 'دعوة مباشرة'
                  return (
                    <motion.button
                      key={game.id}
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => sendInvite(game.id)}
                      aria-label={`ادعُ للعب ${game.name}`}
                      className="group flex min-h-14 w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3 text-start transition-colors hover:border-emerald-400/25 hover:bg-emerald-400/[0.07]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-black/15 text-2xl">
                        {game.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-extrabold">{game.name}</span>
                        <span className="mt-0.5 block truncate text-[9px] font-bold text-muted-foreground">
                          {game.category} · {optionLabel}
                        </span>
                      </span>
                      <ChevronLeft className="h-4 w-4 shrink-0 text-white/25 transition-transform group-hover:-translate-x-0.5 group-hover:text-emerald-300" />
                    </motion.button>
                  )
                })}
                {filteredInviteGames.length === 0 && (
                  <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center">
                    <span className="text-3xl">🗂️</span>
                    <p className="mt-2 text-xs font-extrabold">مفيش ألعاب في التصنيف ده</p>
                    <button
                      type="button"
                      onClick={() => setInviteCategory('الكل')}
                      className="mt-1 min-h-9 px-3 text-[10px] font-bold text-emerald-300"
                    >
                      اعرض كل الألعاب
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <PlayerProfileDialog
        userId={profileOpen ? dmFriend?.userId ?? null : null}
        onClose={() => setProfileOpen(false)}
      />
    </div>
  )
}
