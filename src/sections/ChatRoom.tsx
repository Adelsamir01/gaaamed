import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Send } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from './components'
import { BOT_REPLIES } from '@/data/botReplies'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

interface Props {
  threadId: string
  onBack: () => void
}

export default function ChatRoom({ threadId, onBack }: Props) {
  const { threads, sendMessage, receiveMessage, markThreadRead } = useApp()
  const thread = threads.find((t) => t.id === threadId)
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    markThreadRead(threadId)
  }, [threadId, markThreadRead, thread?.messages.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [thread?.messages.length, typing])

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach(clearTimeout)
  }, [])

  if (!thread) return null

  const send = () => {
    const text = draft.trim()
    if (!text) return
    sounds.pop()
    sendMessage(threadId, text)
    setDraft('')

    // رد وهمي بعد فترة قصيرة
    const responder = thread.id === 't1' || thread.id === 't2' ? 'سارة' : 'روبوت قييمد'
    const avatar = responder === 'سارة' ? '🦋' : '🤖'
    timersRef.current.push(
      setTimeout(() => setTyping(responder), 700),
      setTimeout(() => {
        setTyping(null)
        const reply = BOT_REPLIES[Math.floor(Math.random() * BOT_REPLIES.length)]
        receiveMessage(threadId, responder, avatar, reply)
        sounds.tick()
      }, 2200),
    )
  }

  return (
    <div className="flex flex-col h-dvh">
      {/* ترويسة الغرفة */}
      <div className="glass-strong border-x-0 border-t-0 px-4 py-3 flex items-center gap-3 shrink-0" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <button onClick={onBack} className="p-1.5 -m-1.5 rounded-full hover:bg-white/10 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <AvatarCircle emoji={thread.avatar} size="sm" />
        <div className="flex-1 min-w-0">
          <h1 className="font-extrabold text-sm truncate">{thread.name}</h1>
          <p className="text-[11px] text-emerald-300">{typing ? `${typing} يكتب الآن…` : `${thread.members} عضو`}</p>
        </div>
      </div>

      {/* الرسائل */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {thread.messages.map((m) => {
          const mine = m.senderId === 'me'
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('flex gap-2 max-w-[85%]', mine ? 'self-end flex-row-reverse' : 'self-start')}
            >
              {!mine && <AvatarCircle emoji={m.senderAvatar} size="sm" />}
              <div className={cn('flex flex-col', mine ? 'items-start' : 'items-end')}>
                {!mine && <span className="text-[10px] text-muted-foreground mb-1 px-1">{m.senderName}</span>}
                <div
                  className={cn(
                    'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed border',
                    mine
                      ? 'bg-emerald-500/85 border-emerald-400/50 text-white rounded-tl-md'
                      : 'bg-slate-700/70 border-white/10 text-slate-100 rounded-tr-md',
                  )}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-muted-foreground mt-1 px-1">
                  {new Date(m.time).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            </motion.div>
          )
        })}

        {/* مؤشر الكتابة */}
        <AnimatePresence>
          {typing && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="self-start flex gap-2 items-center">
              <div className="bg-slate-700/70 border border-white/10 rounded-2xl rounded-tr-md px-4 py-3 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ y: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }}
                    className="w-1.5 h-1.5 rounded-full bg-slate-300"
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* حقل الإدخال */}
      <div className="shrink-0 px-3 pb-3 safe-bottom">
        <div className="glass-strong rounded-full flex items-center gap-2 p-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="اكتب رسالتك…"
            className="flex-1 bg-transparent px-3 py-2 text-sm font-bold placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={send}
            disabled={!draft.trim()}
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0',
              draft.trim() ? 'bg-emerald-500 text-white glow-emerald' : 'bg-white/10 text-muted-foreground',
            )}
          >
            <Send className="w-4 h-4 -scale-x-100" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
