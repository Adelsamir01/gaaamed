import { motion } from 'framer-motion'
import { Gamepad2, MessageCircle, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { AvatarCircle, StatusDot } from './components'
import { statusLabel } from '@/data/friends'
import { levelFromXp } from '@/types'
import { sounds } from '@/lib/sounds'

export default function Friends() {
  const { friends } = useApp()

  const invite = (name: string) => {
    sounds.pop()
    toast.success(`تم إرسال الدعوة إلى ${name} 🎮`, { description: 'سيصله إشعار للانضمام إلى اللعبة' })
  }

  const openDm = (name: string) => {
    sounds.click()
    toast.info(`الدردشة الخاصة مع ${name} قريبًا 💬`, { description: 'استخدم غرف الدردشة الجماعية الآن' })
  }

  const addFriend = () => {
    sounds.click()
    toast.info('ابحث عن أصدقائك باسم المستخدم قريبًا 🔍', { description: 'ميزة إضافة الأصدقاء قيد التطوير' })
  }

  return (
    <div className="px-4 pt-6 pb-28">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-black">الأصدقاء 👥</h1>
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={addFriend}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-emerald-500/15 border border-emerald-400/50 text-emerald-300 text-xs font-extrabold hover:bg-emerald-500/25 transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          إضافة صديق
        </motion.button>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{friends.length} صديقًا في قائمتك</p>

      <div className="flex flex-col gap-2.5">
        {friends.map((f, i) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="glass rounded-3xl p-3.5 flex items-center gap-3"
          >
            <div className="relative">
              <AvatarCircle emoji={f.avatar} />
              <span className="absolute -bottom-0.5 -end-0.5">
                <StatusDot status={f.status} />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-sm truncate">{f.name}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {statusLabel[f.status]}
                {f.status === 'playing' && f.playingGame ? ` — ${f.playingGame}` : ''}
              </p>
              <p className="text-[11px] text-emerald-300 font-bold mt-0.5">المستوى {levelFromXp(f.xp)}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => invite(f.name)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-extrabold hover:bg-emerald-400 transition-colors"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                دعوة
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => openDm(f.name)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold hover:bg-white/15 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                دردشة
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
