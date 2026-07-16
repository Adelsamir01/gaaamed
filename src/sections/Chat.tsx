import { Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { useApp } from '@/store/AppContext'
import { AvatarCircle } from './components'

function fmtTime(ts: number) {
  const d = new Date(ts)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
  return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
}

export default function Chat({ openChat }: { openChat: (id: string) => void }) {
  const { threads } = useApp()

  return (
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-2xl font-black mb-1">الدردشة 💬</h1>
      <p className="text-sm text-muted-foreground mb-5">غرف الدردشة مع أصدقائك واللاعبين</p>

      <div className="flex flex-col gap-2.5">
        {threads.map((t, i) => {
          const last = t.messages[t.messages.length - 1]
          return (
            <motion.button
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => openChat(t.id)}
              className="glass rounded-3xl p-3.5 flex items-center gap-3 text-start hover:bg-white/10 transition-colors"
            >
              <div className="relative">
                <AvatarCircle emoji={t.avatar} />
                {t.unread > 0 && <span className="absolute -top-0.5 -end-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0b1220]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-sm truncate">{t.name}</span>
                  {last && <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(last.time)}</span>}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">
                    {last ? (
                      <>
                        <span className="text-emerald-300/80">{last.senderName}: </span>
                        {last.text}
                      </>
                    ) : (
                      'لا رسائل بعد'
                    )}
                  </p>
                  {t.unread > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {t.unread}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {t.members} عضو
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
