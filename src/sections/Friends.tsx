import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Gamepad2, MessageCircle, Search, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useOnline } from '@/online/OnlineContext'
import { AvatarCircle, StatusDot } from './components'
import { statusLabel } from '@/data/friends'
import { ONLINE_GAMES } from '@/games'
import { sounds } from '@/lib/sounds'
import type { PublicUserCard, ServerFriend } from '@/types'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const HANDLE_RE = /^[a-z0-9_]{3,15}$/

export default function Friends({ openChat }: { openChat: (threadId: string) => void }) {
  const { friends, me, searchUser, friendAdd, friendRemove, createDm, chatSendInvite } = useOnline()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<PublicUserCard | null>(null)
  const [searched, setSearched] = useState(false)
  const [inviteFor, setInviteFor] = useState<ServerFriend | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // بحث بالمعرّف (مؤجل 500ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const clean = query.trim().toLowerCase().replace(/^@/, '')
    if (!HANDLE_RE.test(clean)) {
      setResult(null)
      setSearched(false)
      setSearching(false)
      return
    }
    setSearching(true)
    searchTimer.current = setTimeout(() => {
      searchUser(clean).then((card) => {
        setResult(card)
        setSearched(true)
        setSearching(false)
      })
    }, 500)
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [query, searchUser])

  const isFriend = (userId: string) => friends.some((f) => f.userId === userId)

  const openDmWith = async (userId: string) => {
    sounds.click()
    const thread = await createDm(userId)
    if (thread) openChat(thread.id)
  }

  const sendInvite = async (gameId: string) => {
    if (!inviteFor) return
    sounds.pop()
    const thread = await createDm(inviteFor.userId)
    if (thread) {
      chatSendInvite(thread.id, gameId)
      toast.success(`أرسلت الدعوة إلى ${inviteFor.name} 🎮`)
      setInviteFor(null)
      openChat(thread.id)
    }
  }

  return (
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-2xl font-black mb-1">الأصدقاء 👥</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {friends.length > 0 ? `${friends.length} صديقًا في قائمتك` : 'أضف أصدقاءك بمعرّف المستخدم'}
      </p>

      {/* البحث بالمعرّف */}
      <div className="relative mb-3">
        <Search className="absolute top-1/2 -translate-y-1/2 start-4 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالمعرّف… مثل adel_92"
          dir="ltr"
          className="w-full glass rounded-2xl ps-11 pe-4 py-3 font-bold placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 text-left"
        />
      </div>

      <AnimatePresence>
        {(searching || searched) && query.trim() && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass rounded-3xl p-3.5 mb-4 flex items-center gap-3"
          >
            {searching ? (
              <p className="text-sm text-muted-foreground font-bold py-2 w-full text-center">يبحث…</p>
            ) : result ? (
              <>
                <AvatarCircle emoji={result.avatar} />
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-sm truncate">{result.name}</p>
                  <p className="text-[11px] text-emerald-300 font-bold" dir="ltr">@{result.handle}</p>
                </div>
                {isFriend(result.userId) ? (
                  <span className="text-[11px] font-bold text-emerald-300 px-3">صديقك بالفعل ✓</span>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      sounds.pop()
                      friendAdd(result.userId)
                    }}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold hover:bg-emerald-400 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    إضافة
                  </motion.button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground font-bold py-2 w-full text-center">مفيش مستخدم بالمعرّف ده 🤷</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* قائمة الأصدقاء */}
      <div className="flex flex-col gap-2.5">
        {friends.map((f, i) => (
          <motion.div
            key={f.userId}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="glass rounded-3xl p-3.5 flex items-center gap-3"
          >
            <div className="relative">
              <AvatarCircle emoji={f.avatar} />
              <span className="absolute -bottom-0.5 -end-0.5">
                <StatusDot status={f.presence} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-sm truncate">{f.name}</p>
              <p className="text-[11px] text-emerald-300 font-bold" dir="ltr">@{f.handle}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{statusLabel[f.presence]}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => {
                  sounds.click()
                  setInviteFor(f)
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold hover:bg-emerald-400 transition-colors"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                دعوة
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => openDmWith(f.userId)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold hover:bg-white/15 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                دردشة
              </motion.button>
            </div>
            <button
              onClick={() => {
                sounds.click()
                friendRemove(f.userId)
                toast.info(`حذفت ${f.name} من الأصدقاء`)
              }}
              className="self-start p-1.5 rounded-full text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors"
              aria-label="حذف الصديق"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
        {friends.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center text-muted-foreground">
            <div className="text-4xl mb-2">🫂</div>
            <p className="font-bold">لسه مفيش أصدقاء</p>
            <p className="text-xs mt-1">
              ابحث بمعرّف صديقك فوق — معرّفك أنت: <span className="text-emerald-300 font-bold" dir="ltr">@{me?.handle ?? '…'}</span>
            </p>
          </div>
        )}
      </div>

      {/* منتقي لعبة الدعوة */}
      <Dialog open={!!inviteFor} onOpenChange={(open) => !open && setInviteFor(null)}>
        <DialogContent className="max-w-[380px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center">دعوة {inviteFor?.name} للعب 🎮</DialogTitle>
            <DialogDescription className="text-center">اختر اللعبة — هيوصله لينك انضمام في الدردشة</DialogDescription>
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
