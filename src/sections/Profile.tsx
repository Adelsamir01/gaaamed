import { useState } from 'react'
import { motion } from 'framer-motion'
import { Coins, Pencil, RotateCcw, Server, Target, Trophy, Volume2, VolumeX } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/store/AppContext'
import { useOnline } from '@/online/OnlineContext'
import { AvatarCircle, CoinChip, LevelBar } from './components'
import { GAMES } from '@/games'
import { AVATAR_OPTIONS } from '@/data/friends'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'

export default function Profile() {
  const { profile, stats, settings, toggleSound, updateProfile, resetProgress } = useApp()
  const { serverUrl, updateServerUrl, status } = useOnline()
  const [editOpen, setEditOpen] = useState(false)
  const [serverOpen, setServerOpen] = useState(false)
  const [serverDraft, setServerDraft] = useState(serverUrl)
  const [name, setName] = useState(profile.name)
  const [avatar, setAvatar] = useState(profile.avatar)

  const totalPlayed = Object.values(stats).reduce((a, s) => a + s.played, 0)
  const totalWon = Object.values(stats).reduce((a, s) => a + s.won, 0)
  const winRate = totalPlayed > 0 ? Math.round((totalWon / totalPlayed) * 100) : 0

  const saveProfile = () => {
    if (name.trim().length < 2) return
    sounds.pop()
    updateProfile(name.trim(), avatar)
    setEditOpen(false)
  }

  return (
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-2xl font-black mb-5">حسابي 👤</h1>

      {/* البطاقة الشخصية */}
      <div className="glass rounded-3xl p-5 flex flex-col items-center text-center mb-4">
        <div className="relative">
          <AvatarCircle emoji={profile.avatar} size="xl" glow />
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogTrigger asChild>
              <button
                onClick={() => {
                  setName(profile.name)
                  setAvatar(profile.avatar)
                }}
                className="absolute -bottom-1 -end-1 w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center border-4 border-[#0b1220] hover:bg-emerald-400 transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-[380px] rounded-3xl">
              <DialogHeader>
                <DialogTitle className="text-center">تعديل الملف الشخصي</DialogTitle>
                <DialogDescription className="text-center">غيّر اسمك وشخصيتك المفضلة</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={20}
                  placeholder="اسمك"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                />
                <div className="grid grid-cols-6 gap-2">
                  {AVATAR_OPTIONS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAvatar(a)}
                      className={cn(
                        'aspect-square rounded-xl text-xl flex items-center justify-center border transition-all',
                        avatar === a ? 'bg-emerald-500/25 border-emerald-400/70 scale-110' : 'bg-white/5 border-white/10 hover:bg-white/10',
                      )}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <button
                  onClick={saveProfile}
                  disabled={name.trim().length < 2}
                  className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-extrabold hover:bg-emerald-400 transition-colors disabled:opacity-40"
                >
                  حفظ التغييرات
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <h2 className="text-xl font-black mt-3">{profile.name}</h2>
        <div className="w-full mt-4">
          <LevelBar xp={profile.xp} />
        </div>
      </div>

      {/* الإحصائيات */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'لعب', value: totalPlayed, icon: Target, color: 'text-sky-300' },
          { label: 'فاز', value: totalWon, icon: Trophy, color: 'text-amber-300' },
          { label: 'نسبة الفوز', value: `${winRate}٪`, icon: Trophy, color: 'text-emerald-300' },
          { label: 'العملات', value: profile.coins, icon: Coins, color: 'text-amber-300' },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl py-3 text-center">
            <div className={cn('text-lg font-black tabular-nums', s.color)}>{s.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* إحصائيات الألعاب */}
      <h2 className="font-extrabold mb-2.5">إحصائيات الألعاب 🎮</h2>
      <div className="glass rounded-3xl p-2 mb-4">
        {GAMES.map((g) => {
          const s = stats[g.id]
          return (
            <div key={g.id} className="flex items-center gap-3 p-2.5">
              <span className="text-2xl">{g.emoji}</span>
              <span className="flex-1 font-bold text-sm">{g.name}</span>
              <div className="text-[11px] text-muted-foreground flex items-center gap-2.5">
                <span>لعب {s?.played ?? 0}</span>
                <span className="text-emerald-300">فاز {s?.won ?? 0}</span>
                {s?.bestScore !== undefined && <span className="text-amber-300">الأفضل {s.bestScore}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* الإعدادات */}
      <h2 className="font-extrabold mb-2.5">الإعدادات ⚙️</h2>
      <div className="glass rounded-3xl p-2 mb-4">
        <div className="flex items-center gap-3 p-3">
          {settings.sound ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-muted-foreground" />}
          <div className="flex-1">
            <p className="font-bold text-sm">المؤثرات الصوتية</p>
            <p className="text-[11px] text-muted-foreground">أصوات النقر والفوز والخسارة</p>
          </div>
          <Switch checked={settings.sound} onCheckedChange={toggleSound} dir="rtl" />
        </div>

        {/* إعدادات الخادم */}
        <Dialog open={serverOpen} onOpenChange={setServerOpen}>
          <DialogTrigger asChild>
            <button
              onClick={() => setServerDraft(serverUrl)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors text-start border-t border-white/5"
            >
              <Server className="w-5 h-5 text-emerald-400" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">إعدادات الخادم</p>
                <p className="text-[11px] text-muted-foreground truncate" dir="ltr">
                  {serverUrl}
                </p>
              </div>
              <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', status === 'online' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400')} />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-[380px] rounded-3xl">
            <DialogHeader>
              <DialogTitle className="text-center">عنوان خادم الأونلاين</DialogTitle>
              <DialogDescription className="text-center">
                مثال: ws://localhost:8787 — في محاكي أندرويد استخدم ws://10.0.2.2:8787
              </DialogDescription>
            </DialogHeader>
            <input
              value={serverDraft}
              onChange={(e) => setServerDraft(e.target.value)}
              dir="ltr"
              placeholder="ws://10.0.2.2:8787"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
            />
            <DialogFooter>
              <button
                onClick={() => {
                  const url = serverDraft.trim()
                  if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
                    toast.error('العنوان يجب أن يبدأ بـ ws://')
                    return
                  }
                  updateServerUrl(url)
                  setServerOpen(false)
                }}
                className="w-full py-3 rounded-2xl bg-emerald-500 text-white font-extrabold hover:bg-emerald-400 transition-colors"
              >
                حفظ وإعادة الاتصال
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* إعادة التعيين */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="w-full py-3.5 rounded-2xl bg-red-500/10 border border-red-400/40 text-red-300 font-extrabold flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            إعادة تعيين التقدم
          </motion.button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-[380px] rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟ ⚠️</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف كل تقدمك: العملات، نقاط الخبرة، إحصائيات الألعاب، والدردشات. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2">
            <AlertDialogCancel className="flex-1 rounded-2xl mt-0">إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={resetProgress} className="flex-1 rounded-2xl bg-red-500 hover:bg-red-400">
              نعم، احذف كل شيء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="text-center mt-6">
        <CoinChip coins={profile.coins} className="inline-flex" />
        <p className="text-[10px] text-muted-foreground mt-3">قييمد | gaaamed — الإصدار ١٫٠ 💚</p>
      </div>
    </div>
  )
}
