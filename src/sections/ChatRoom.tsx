import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Gamepad2, Send } from 'lucide-react'
import { useOnline } from '@/online/OnlineContext'
import { AvatarCircle } from './components'
import { ONLINE_GAMES } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { ServerChatMessage } from '@/types'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

interface Props {
  threadId: string
  onBack: () => void
  onJoinRoom: (code: string) => void
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
}

export default function ChatRoom({ threadId, onBack, onJoinRoom }: Props) {
  const { me, friends, threads, messages, loadThread, setOpenThreadId, chatSend, chatSendInvite } = useOnline()
  const thread = threads.find((t) => t.id === threadId)
  const msgs: ServerChatMessage[] = messages[threadId] ?? []
  const [draft, setDraft] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const dmFriend = thread?.kind === 'dm' ? friends.find((f) => thread.memberIds.includes(f.userId)) : undefined

  // عند الفتح: حمّل التاريخ وعلّم كمقروء — وعند الخروج أغلق المؤشر
  useEffect(() => {
    setOpenThreadId(threadId)
    loadThread(threadId)
    return () => setOpenThreadId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs.length])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    sounds.click()
    chatSend(threadId, text)
    setDraft('')
  }

  const sendInvite = (gameId: string) => {
    sounds.pop()
    chatSendInvite(threadId, gameId)
    setInviteOpen(false)
  }

  return (
    <div className="flex flex-col h-dvh">
      {/* الترويسة */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/10 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
          رجوع
        </button>
        <AvatarCircle emoji={thread?.avatar ?? '💬'} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-sm truncate">{thread?.name ?? 'محادثة'}</p>
          <p className="text-[10px] text-muted-foreground">
            {thread?.kind === 'group'
              ? `${thread.memberIds.length} أعضاء`
              : dmFriend?.handle
                ? <span dir="ltr">@{dmFriend.handle}</span>
                : ''}
          </p>
        </div>
      </div>

      {/* الرسائل */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 flex flex-col gap-2.5">
        {msgs.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <div className="text-4xl mb-2">💬</div>
            <p className="text-xs font-bold">لا رسائل بعد — ابدأ المحادثة!</p>
          </div>
        )}
        {msgs.map((m) => {
          const mine = m.senderId === me?.userId

          // فقاعة دعوة اللعبة الغنية
          if (m.kind === 'game_invite' && m.invite) {
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn('max-w-[82%]', mine ? 'self-end' : 'self-start')}
              >
                {!mine && thread?.kind === 'group' && (
                  <span className="text-[10px] font-bold text-emerald-300 mb-1 block ps-2">
                    {m.senderAvatar} {m.senderName}
                  </span>
                )}
                <div
                  className={cn(
                    'rounded-3xl p-4 border',
                    mine
                      ? 'bg-emerald-500/15 border-emerald-400/40 rounded-bl-md'
                      : 'bg-white/5 border-white/15 rounded-br-md',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-4xl">{m.invite.gameEmoji}</span>
                    <div className="flex-1">
                      <p className="font-extrabold text-sm">{m.invite.gameName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {mine ? 'أرسلت دعوة لعب 🎮' : `${m.senderName} بيتحداك!`}
                      </p>
                    </div>
                  </div>
                  {!mine && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        sounds.pop()
                        onJoinRoom(m.invite!.roomCode)
                      }}
                      className="mt-3 w-full py-2.5 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-extrabold text-sm glow-emerald hover:from-emerald-400 hover:to-teal-400 transition-all"
                    >
                      انضم الآن 🎮
                    </motion.button>
                  )}
                  <p className="text-[9px] text-muted-foreground mt-2 text-end">{fmtTime(m.time)}</p>
                </div>
              </motion.div>
            )
          }

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('max-w-[82%]', mine ? 'self-end' : 'self-start')}
            >
              {!mine && thread?.kind === 'group' && (
                <span className="text-[10px] font-bold text-emerald-300 mb-1 block ps-2">
                  {m.senderAvatar} {m.senderName}
                </span>
              )}
              <div
                className={cn(
                  'rounded-3xl px-4 py-2.5',
                  mine
                    ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white rounded-bl-md'
                    : 'bg-white/8 border border-white/12 rounded-br-md',
                )}
              >
                <p className="text-sm font-medium whitespace-pre-wrap break-words">{m.text}</p>
                <p className={cn('text-[9px] mt-1 text-end', mine ? 'text-white/70' : 'text-muted-foreground')}>
                  {fmtTime(m.time)}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* الإدخال */}
      <div className="px-4 pb-4 pt-2 shrink-0">
        <div className="flex items-center gap-2 glass rounded-3xl p-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              sounds.click()
              setInviteOpen(true)
            }}
            className="w-11 h-11 rounded-2xl bg-amber-400/15 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 glow-amber"
            aria-label="دعوة لعبة"
          >
            <Gamepad2 className="w-5 h-5" />
          </motion.button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="اكتب رسالة…"
            className="flex-1 min-w-0 bg-transparent text-sm font-medium placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
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
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-[380px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center">تحدّاهم في لعبة 🎮</DialogTitle>
            <DialogDescription className="text-center">هتوصلهم دعوة بزر انضمام مباشر</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2">
            {ONLINE_GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => sendInvite(g.id)}
                className="glass rounded-2xl p-3.5 flex flex-col items-center gap-1.5 hover:bg-white/10 transition-colors"
              >
                <span className="text-3xl">{g.emoji}</span>
                <span className="font-extrabold text-xs">{g.name}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
