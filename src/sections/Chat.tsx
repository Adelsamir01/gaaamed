import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Loader2, Search, Users } from 'lucide-react'
import { useOnline } from '@/online/OnlineContext'
import { AvatarCircle, StatusDot } from './components'
import { statusLabel } from '@/data/friends'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { ServerThread } from '@/types'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

function fmtTime(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
}

function preview(t: ServerThread) {
  if (!t.lastMessage) return 'ابدأ المحادثة…'
  if (t.lastMessage.kind === 'game_invite') {
    const invite = t.lastMessage.invite
    if (invite?.result?.kind === 'draw') return `🤝 ${invite.gameName}: تعادل`
    if (invite?.result?.kind === 'winner') return `🏆 ${invite.result.winnerName} كسب ${invite.gameName}`
    return `🎮 دعوة لعبة ${invite?.gameName ?? ''}`
  }
  return t.lastMessage.text
}

export default function Chat({ openChat }: { openChat: (id: string) => void }) {
  const { threads, friends, createGroup } = useOnline()
  const [query, setQuery] = useState('')
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return threads
    return threads.filter((t) => t.name.includes(q) || t.lastMessage?.text.includes(q))
  }, [threads, query])

  const dmFriend = (t: ServerThread) =>
    t.kind === 'dm' ? friends.find((f) => t.memberIds.includes(f.userId)) : undefined

  const togglePick = (userId: string) =>
    setPicked((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]))

  const submitGroup = async () => {
    const name = groupName.trim()
    if (!name || picked.length < 2 || busy) return
    setBusy(true)
    const thread = await createGroup(name, picked)
    setBusy(false)
    if (thread) {
      sounds.pop()
      setGroupOpen(false)
      setGroupName('')
      setPicked([])
      openChat(thread.id)
    }
  }

  return (
    <div className="px-4 pt-6 tab-page">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-black">الدردشة 💬</h1>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => {
            sounds.click()
            setGroupOpen(true)
          }}
          className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-extrabold rounded-full px-3.5 py-2 hover:bg-emerald-400 transition-colors"
        >
          <Users className="w-3.5 h-3.5" />
          جروب جديد
        </motion.button>
      </div>
      <p className="text-sm text-muted-foreground mb-4">غرف الدردشة مع أصدقائك واللاعبين</p>

      {/* البحث */}
      <div className="relative mb-4">
        <Search className="absolute top-1/2 -translate-y-1/2 start-4 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="دوّر في المحادثات…"
          className="w-full glass rounded-2xl ps-11 pe-4 py-3 font-bold placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        {filtered.map((t, i) => {
          const df = dmFriend(t)
          return (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => {
                sounds.click()
                openChat(t.id)
              }}
              className="glass rounded-3xl p-3.5 flex items-center gap-3 text-start hover:bg-white/10 transition-colors"
            >
              <div className="relative shrink-0">
                <AvatarCircle emoji={t.avatar} />
                {t.kind === 'dm' && df && (
                  <span className="absolute -bottom-0.5 -end-0.5">
                    <StatusDot status={df.presence} />
                  </span>
                )}
                {t.kind === 'group' && (
                  <span className="absolute -bottom-1 -end-1 bg-emerald-500 text-white text-[9px] font-extrabold rounded-full min-w-4 h-4 px-1 flex items-center justify-center border-2 border-[#0b1220]">
                    {t.memberIds.length}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-sm truncate">{t.name}</span>
                  {t.lastMessage && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {fmtTime(t.lastMessage.invite?.result?.completedAt ?? t.lastMessage.time)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {t.lastMessage && t.kind === 'group' && (
                      <span className="font-bold text-slate-300">{t.lastMessage.senderName}: </span>
                    )}
                    {preview(t)}
                  </p>
                  {t.unread > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {t.unread}
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          )
        })}
        {filtered.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center text-muted-foreground">
            <div className="text-4xl mb-2">💬</div>
            <p className="font-bold">لا توجد محادثات</p>
            <p className="text-xs mt-1">ابدأ محادثة من صفحة الأصدقاء 👥</p>
          </div>
        )}
      </div>

      {/* إنشاء جروب */}
      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="max-w-[380px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center">إنشاء جروب 👥</DialogTitle>
            <DialogDescription className="text-center">سمّ الجروب واختار صاحبين على الأقل</DialogDescription>
          </DialogHeader>
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="اسم الجروب…"
            maxLength={30}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 font-bold placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
          />
          <p className="text-xs font-bold text-muted-foreground">المختارون: {picked.length} (الحد الأدنى ٢)</p>
          <div className="max-h-56 overflow-y-auto no-scrollbar flex flex-col gap-1.5">
            {friends.length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-6">مفيش أصدقاء لسه — ضيفهم من صفحة الأصدقاء</p>
            )}
            {friends.map((f) => {
              const on = picked.includes(f.userId)
              return (
                <button
                  key={f.userId}
                  onClick={() => {
                    sounds.click()
                    togglePick(f.userId)
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl p-2.5 border transition-all text-start',
                    on ? 'bg-emerald-500/15 border-emerald-400/60' : 'bg-white/5 border-white/10 hover:bg-white/10',
                  )}
                >
                  <AvatarCircle emoji={f.avatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-sm truncate">{f.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      <span dir="ltr">@{f.handle}</span> · {statusLabel[f.presence]}
                    </p>
                  </div>
                  {on && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                </button>
              )
            })}
          </div>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={submitGroup}
            disabled={!groupName.trim() || picked.length < 2 || busy}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-40 transition-all"
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء الجروب 🚀'}
          </motion.button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
