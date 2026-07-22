import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronLeft, Clock3, Search, Trash2, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { useOnline } from '@/online/OnlineContext'
import { AvatarCircle, StatusDot } from './components'
import { friendStatusLabel } from '@/data/friends'
import { sounds } from '@/lib/sounds'
import type { PublicUserCard } from '@/types'

const HANDLE_RE = /^[a-z0-9_]{3,15}$/

export default function Friends({ openChat }: { openChat: (threadId: string) => void }) {
  const {
    status, friends, incomingFriendRequests, outgoingFriendRequests, me, searchUser,
    friendAdd, friendAccept, friendReject, friendRequestCancel, friendRemove,
    createDm,
  } = useOnline()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<PublicUserCard | null>(null)
  const [searched, setSearched] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // بحث بالمعرّف (مؤجل 500ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const clean = query.trim().toLowerCase().replace(/^@/, '')
    if (!HANDLE_RE.test(clean)) return
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

  const updateQuery = (value: string) => {
    setQuery(value)
    const clean = value.trim().toLowerCase().replace(/^@/, '')
    if (!HANDLE_RE.test(clean)) {
      setResult(null)
      setSearched(false)
      setSearching(false)
    } else {
      setSearching(true)
      setSearched(false)
    }
  }

  const isFriend = (userId: string) => friends.some((f) => f.userId === userId)
  const isIncoming = (userId: string) => incomingFriendRequests.some((request) => request.userId === userId)
  const isOutgoing = (userId: string) => outgoingFriendRequests.some((request) => request.userId === userId)

  const openDmWith = async (userId: string) => {
    sounds.click()
    const thread = await createDm(userId)
    if (thread) openChat(thread.id)
  }

  return (
    <div className="px-4 pt-6 tab-page">
      <h1 className="text-2xl font-black mb-1">الأصدقاء 👥</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {friends.length > 0 ? `${friends.length} صديقًا في قائمتك` : 'أضف أصدقاءك بمعرّف المستخدم'}
      </p>

      {incomingFriendRequests.length > 0 && (
        <section className="mb-5" aria-labelledby="incoming-friend-requests">
          <h2 id="incoming-friend-requests" className="font-extrabold mb-2.5 flex items-center gap-2">
            طلبات الصداقة
            <bdi className="bidi-number min-w-6 h-6 px-1.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs grid place-items-center">
              {incomingFriendRequests.length}
            </bdi>
          </h2>
          <div className="flex flex-col gap-2.5">
            {incomingFriendRequests.map((request) => (
              <div key={request.userId} className="glass rounded-3xl p-3.5 flex items-center gap-3">
                <AvatarCircle emoji={request.avatar} />
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-sm truncate">{request.name}</p>
                  <p className="text-[11px] text-emerald-300 font-bold" dir="ltr">@{request.handle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sounds.pop()
                    friendAccept(request.userId)
                  }}
                  className="min-h-11 px-3 rounded-2xl bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 hover:bg-emerald-400 transition-colors"
                  aria-label={`قبول طلب صداقة ${request.name}`}
                >
                  <Check className="w-4 h-4" />
                  قبول
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sounds.click()
                    friendReject(request.userId)
                    toast.info('تم رفض طلب الصداقة')
                  }}
                  className="min-w-11 min-h-11 rounded-2xl bg-white/5 border border-white/15 text-muted-foreground grid place-items-center hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  aria-label={`رفض طلب صداقة ${request.name}`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* البحث بالمعرّف */}
      <div className="relative mb-3">
        <Search className="absolute top-1/2 -translate-y-1/2 start-4 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
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
                ) : isIncoming(result.userId) ? (
                  <button
                    type="button"
                    onClick={() => friendAccept(result.userId)}
                    className="min-h-11 flex items-center gap-1 px-3.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold hover:bg-emerald-400 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    قبول الطلب
                  </button>
                ) : isOutgoing(result.userId) ? (
                  <button
                    type="button"
                    onClick={() => friendRequestCancel(result.userId)}
                    className="min-h-11 flex items-center gap-1 px-3.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    aria-label={`إلغاء طلب الصداقة المرسل إلى ${result.name}`}
                  >
                    <Clock3 className="w-3.5 h-3.5" />
                    طلب مرسل · إلغاء
                  </button>
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
                    إرسال طلب
                  </motion.button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground font-bold py-2 w-full text-center">مفيش مستخدم بالمعرّف ده 🤷</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {outgoingFriendRequests.length > 0 && (
        <section className="glass rounded-3xl p-3.5 mb-5" aria-labelledby="outgoing-friend-requests">
          <h2 id="outgoing-friend-requests" className="text-sm font-extrabold mb-2.5 flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-amber-300" />
            طلبات مرسلة
          </h2>
          <div className="flex flex-wrap gap-2">
            {outgoingFriendRequests.map((request) => (
              <button
                type="button"
                key={request.userId}
                onClick={() => friendRequestCancel(request.userId)}
                className="min-h-11 flex items-center gap-2 rounded-2xl bg-white/5 border border-white/10 px-3 py-2 text-start hover:bg-red-500/10 transition-colors"
                aria-label={`إلغاء طلب الصداقة المرسل إلى ${request.name}`}
              >
                <span>{request.avatar}</span>
                <span className="text-xs font-bold">{request.name}</span>
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* قائمة الأصدقاء */}
      <div className="flex flex-col gap-2.5">
        {friends.map((f, i) => {
          const presence = status === 'online' ? f.presence : 'offline'
          const liveGame = status === 'online' ? f.activeGame : null
          const label = status === 'online'
            ? friendStatusLabel(f)
            : status === 'connecting' ? 'جاري تحديث الحالة…' : 'غير متصل'
          return (
          <motion.div
            key={f.userId}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="glass flex items-center gap-1 rounded-3xl p-2.5 transition-colors hover:bg-white/10"
          >
            <motion.button
              type="button"
              whileTap={{ scale: 0.985 }}
              onClick={() => openDmWith(f.userId)}
              className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-1 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
              aria-label={`افتح دردشة ${f.name}`}
            >
              <div className="relative shrink-0">
                <AvatarCircle emoji={f.avatar} />
                <span className="absolute -bottom-0.5 -end-0.5">
                  <StatusDot status={presence} />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">{f.name}</p>
                <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px]">
                  <span className={liveGame ? 'shrink-0 font-bold text-amber-300' : 'shrink-0 font-bold text-muted-foreground'}>
                    {label}
                  </span>
                  <span className="truncate font-bold text-emerald-300" dir="ltr">@{f.handle}</span>
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/70" />
            </motion.button>
            <button
              type="button"
              onClick={() => {
                sounds.click()
                friendRemove(f.userId)
                toast.info(`حذفت ${f.name} من الأصدقاء`)
              }}
              className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-300"
              aria-label={`حذف ${f.name} من الأصدقاء`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </motion.div>
          )
        })}
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

    </div>
  )
}
