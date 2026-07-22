import { motion } from 'framer-motion'
import { Gift, Crown, Flame, ChevronLeft, MessageCircle, UserPlus } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { useOnline } from '@/online/OnlineContext'
import { AvatarCircle, CoinChip, LevelBar, SectionTitle, StatusDot } from './components'
import { GAMES } from '@/games'
import { levelFromXp } from '@/types'
import { sounds } from '@/lib/sounds'
import { launchConfetti } from '@/lib/confetti'
import { buildLeaderboard } from '@/lib/leaderboard'
import { selectFavoriteGame } from '@/lib/favoriteGame'
import type { TabId } from './TabBar'

interface Props {
  goTab: (t: TabId) => void
  openGame: (id: string) => void
  openChat: (id: string) => void
}

const arabicNumber = new Intl.NumberFormat('ar-EG')

export default function Home({ goTab, openGame, openChat }: Props) {
  const { profile, canClaimDaily, claimDailyReward, stats } = useApp()
  const { friends, threads, status, onlineUserCount } = useOnline()

  const claim = () => {
    if (claimDailyReward()) {
      sounds.win()
      launchConfetti({ particleCount: 90, spread: 75, origin: { y: 0.3 }, colors: ['#10b981', '#f59e0b', '#ffffff'] })
    }
  }

  const activeThreads = threads.filter((t) => t.unread > 0).length > 0 ? threads.filter((t) => t.unread > 0) : threads.slice(0, 2)
  const favorite = selectFavoriteGame(GAMES, stats)
  const featured = favorite?.game ?? GAMES[0]
  const leaderboard = buildLeaderboard(profile, friends).slice(0, 5)
  const rankMarks = ['🥇', '🥈', '🥉']

  return (
    <div className="px-4 pt-6 tab-page">
      {/* الترويسة */}
      <div className="flex items-center gap-3 mb-5">
        <AvatarCircle emoji={profile.avatar} glow />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">مرحبًا 👋</p>
          <h1 className="text-xl font-extrabold truncate">{profile.name}</h1>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[10px] font-bold text-muted-foreground glass rounded-full px-2.5 py-1">
          <span className={`w-2 h-2 rounded-full ${status === 'online' ? 'bg-emerald-400 animate-pulse' : status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
          {status === 'online'
            ? onlineUserCount == null ? '…' : `${arabicNumber.format(onlineUserCount)} متصل`
            : status === 'connecting' ? 'يتصل…' : 'أوفلاين'}
        </span>
        <CoinChip coins={profile.coins} />
      </div>

      <div className="glass rounded-3xl p-4 mb-2">
        <LevelBar xp={profile.xp} />
      </div>

      {/* المكافأة اليومية */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 rounded-3xl p-[1px] bg-gradient-to-l from-amber-400/60 via-emerald-400/40 to-teal-400/60"
      >
        <div className="rounded-3xl bg-[#0f172a]/90 backdrop-blur-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-400/15 border border-amber-400/40 flex items-center justify-center glow-amber shrink-0">
            <Gift className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="font-extrabold">مكافأة يومية 🎁</p>
            <p className="text-xs text-muted-foreground">{canClaimDaily ? 'خذ ٥٠ عملة مجانية الآن' : 'عد غدًا لمكافأة جديدة'}</p>
          </div>
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={claim}
            disabled={!canClaimDaily}
            className={
              canClaimDaily
                ? 'px-4 py-2.5 rounded-2xl bg-amber-400 text-amber-950 font-extrabold text-sm glow-amber hover:bg-amber-300 transition-colors'
                : 'px-4 py-2.5 rounded-2xl bg-white/10 text-muted-foreground text-sm font-bold'
            }
          >
            {canClaimDaily ? <bdi dir="ltr">+٥٠ 🪙</bdi> : '✓ استلمتها'}
          </motion.button>
        </div>
      </motion.div>

      {/* اللعبة المميزة الشخصية */}
      <SectionTitle
        title={favorite ? 'لعبتك المفضلة ❤️' : 'لعبة مميزة ⭐'}
        action={favorite && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300">
            <Flame className="h-3 w-3" />
            لعبتها <bdi className="tabular-nums">{arabicNumber.format(favorite.played)}</bdi> مرة
          </span>
        )}
      />
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => openGame(featured.id)}
        className="w-full text-start rounded-3xl overflow-hidden relative glass"
      >
        <div className="absolute inset-0 bg-gradient-to-l from-emerald-600/40 to-teal-900/60" />
        <div className="relative p-5 flex items-center gap-4">
          <div className="text-6xl drop-shadow-lg">{featured.emoji}</div>
          <div className="flex-1">
            <p className="text-xl font-black">{featured.name}</p>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">{featured.description}</p>
            <span className="inline-flex items-center gap-1 mt-2.5 text-xs font-extrabold bg-emerald-400 text-emerald-950 rounded-full px-3 py-1.5">
              العب الآن
              <ChevronLeft className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </motion.button>

      {/* الألعاب الرائجة */}
      <SectionTitle
        title="الألعاب الرائجة 🔥"
        action={
          <button onClick={() => goTab('games')} className="text-xs font-bold text-emerald-300 flex items-center gap-0.5">
            الكل
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        }
      />
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {GAMES.map((g, i) => (
          <motion.button
            key={g.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => openGame(g.id)}
            className="glass rounded-3xl p-4 w-[132px] shrink-0 flex flex-col items-center gap-2"
          >
            <span className="text-4xl">{g.emoji}</span>
            <span className="text-sm font-extrabold">{g.name}</span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-400" />
              {stats[g.id]?.played ?? 0} لعبة
            </span>
          </motion.button>
        ))}
      </div>

      {/* المتصدرون */}
      <SectionTitle
        title="المتصدرون 🏆"
        action={<span className="text-[10px] font-bold text-muted-foreground">حسب نقاط الخبرة</span>}
      />
      <div className="glass rounded-3xl p-2">
        {leaderboard.map((player, index) => (
          <div
            key={player.userId}
            className={`flex items-center gap-3 p-2.5 rounded-2xl ${player.isMe ? 'bg-emerald-500/10 border border-emerald-400/30' : ''}`}
          >
            <span className="w-6 text-center font-black text-sm text-muted-foreground">{rankMarks[index] ?? index + 1}</span>
            <div className="relative">
              <AvatarCircle emoji={player.avatar} size="sm" />
              {player.presence && (
                <span className="absolute -bottom-0.5 -end-0.5">
                  <StatusDot status={player.presence} />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm truncate">{player.name}{player.isMe ? ' (أنت)' : ''}</p>
              <p className="text-[10px] text-muted-foreground font-bold" dir={player.handle ? 'ltr' : 'rtl'}>
                {player.handle ? `@${player.handle}` : 'نقاط الخبرة'}
              </p>
            </div>
            <div className="text-end shrink-0">
              <p className="text-xs font-black text-emerald-300 flex items-center justify-end gap-1">
                {index === 0 && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                <bdi className="tabular-nums">{player.points.toLocaleString('ar-EG')}</bdi> نقطة
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">مستوى {levelFromXp(player.points)}</p>
            </div>
          </div>
        ))}
        {friends.length === 0 && (
          <button
            onClick={() => goTab('friends')}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border border-dashed border-white/15 text-muted-foreground text-xs font-bold hover:bg-white/5 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            ضيف صاحبك بالمعرّف وتحدّوه
          </button>
        )}
      </div>

      {/* غرف الدردشة النشطة */}
      <SectionTitle
        title="الدردشة النشطة 💬"
        action={
          <button onClick={() => goTab('chat')} className="text-xs font-bold text-emerald-300 flex items-center gap-0.5">
            الكل
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        }
      />
      <div className="flex flex-col gap-2">
        {activeThreads.slice(0, 2).map((t) => (
          <button key={t.id} onClick={() => openChat(t.id)} className="glass rounded-3xl p-3.5 flex items-center gap-3 text-start hover:bg-white/10 transition-colors">
            <AvatarCircle emoji={t.avatar} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-sm">{t.name}</span>
                {t.unread > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{t.unread}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                <MessageCircle className="w-3 h-3 shrink-0" />
                {t.lastMessage
                  ? t.lastMessage.kind === 'game_invite'
                    ? t.lastMessage.invite?.result?.kind === 'draw'
                      ? `🤝 ${t.lastMessage.invite.gameName}: تعادل`
                      : t.lastMessage.invite?.result?.kind === 'winner'
                        ? `🏆 ${t.lastMessage.invite.result.winnerName} كسب ${t.lastMessage.invite.gameName}`
                        : `🎮 دعوة لعبة ${t.lastMessage.invite?.gameName ?? ''}`
                    : t.lastMessage.text
                  : 'لا رسائل بعد'}
              </p>
            </div>
          </button>
        ))}
        {activeThreads.length === 0 && (
          <button
            onClick={() => goTab('chat')}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border border-dashed border-white/15 text-muted-foreground text-xs font-bold hover:bg-white/5 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            ابدأ محادثة مع صاحبك
          </button>
        )}
      </div>
    </div>
  )
}
