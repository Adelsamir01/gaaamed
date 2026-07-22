import { useEffect, useMemo, useState } from 'react'
import { Loader2, Target, Trophy } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { useOnline } from '@/online/OnlineContext'
import { GAMES } from '@/games'
import { statusLabel } from '@/data/friends'
import type { GameStats, PublicPlayerProfile } from '@/types'
import { cn } from '@/lib/utils'
import { AvatarCircle, LevelBar, StatusDot } from './components'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const arabicNumber = new Intl.NumberFormat('ar-EG')

function totalsFor(stats: Record<string, GameStats>) {
  const totals = Object.values(stats).reduce(
    (sum, game) => ({ played: sum.played + game.played, won: sum.won + game.won }),
    { played: 0, won: 0 },
  )
  return {
    ...totals,
    winRate: totals.played > 0 ? Math.round((totals.won / totals.played) * 100) : 0,
  }
}

interface Props {
  userId: string | null
  isCurrentUser?: boolean
  onClose: () => void
}

export default function PlayerProfileDialog({ userId, isCurrentUser = false, onClose }: Props) {
  const app = useApp()
  const { status, getUserProfile } = useOnline()
  const [remoteResult, setRemoteResult] = useState<{ userId: string; profile: PublicPlayerProfile | null } | null>(null)

  const localProfile = useMemo<PublicPlayerProfile | null>(() => {
    if (!userId || !isCurrentUser) return null
    return {
      userId,
      handle: app.profile.handle ?? '',
      name: app.profile.name,
      avatar: app.profile.avatar,
      xp: app.profile.xp,
      presence: status === 'online' ? 'online' : 'offline',
      stats: app.stats,
      totals: totalsFor(app.stats),
    }
  }, [app.profile.avatar, app.profile.handle, app.profile.name, app.profile.xp, app.stats, isCurrentUser, status, userId])

  useEffect(() => {
    if (!userId || isCurrentUser) return
    let cancelled = false
    void getUserProfile(userId).then((loaded) => {
      if (cancelled) return
      setRemoteResult({ userId, profile: loaded })
    })
    return () => {
      cancelled = true
    }
  }, [getUserProfile, isCurrentUser, userId])

  const remoteSettled = remoteResult?.userId === userId
  const profile = isCurrentUser ? localProfile : remoteSettled ? remoteResult.profile : null
  const loading = Boolean(userId && !isCurrentUser && !remoteSettled)

  const playedGames = useMemo(() => {
    if (!profile) return []
    return GAMES
      .map((game) => ({ game, stats: profile.stats[game.id] }))
      .filter((entry) => (entry.stats?.played ?? 0) > 0)
      .sort((a, b) => (b.stats?.played ?? 0) - (a.stats?.played ?? 0))
  }, [profile])

  const presenceText = profile?.activeGame
    ? `${profile.activeGame.emoji} بيلعب ${profile.activeGame.name}`
    : profile ? statusLabel[profile.presence] : ''

  return (
    <Dialog open={Boolean(userId)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[88dvh] max-w-[390px] flex-col overflow-hidden rounded-3xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>الملف الشخصي</DialogTitle>
          <DialogDescription>ملف اللاعب وإحصائيات ألعابه</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid min-h-72 place-items-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-xs font-bold">بنحمّل إحصائيات اللاعب…</p>
            </div>
          </div>
        ) : profile ? (
          <div className="overflow-y-auto p-5 no-scrollbar">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <AvatarCircle emoji={profile.avatar} size="xl" glow />
                <span className="absolute bottom-0 end-0 grid h-5 w-5 place-items-center rounded-full border-2 border-slate-950 bg-slate-950">
                  <StatusDot status={profile.presence} />
                </span>
              </div>
              <h2 className="mt-3 text-xl font-black">{profile.name}</h2>
              {profile.handle && <p className="mt-0.5 text-xs font-bold text-emerald-300" dir="ltr">@{profile.handle}</p>}
              <span className={cn(
                'mt-2 rounded-full border px-3 py-1 text-[10px] font-extrabold',
                profile.activeGame
                  ? 'border-amber-300/30 bg-amber-400/10 text-amber-200'
                  : profile.presence === 'online'
                    ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200'
                    : 'border-white/10 bg-white/5 text-muted-foreground',
              )}>
                {presenceText}
              </span>
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-white/5 p-4">
              <LevelBar xp={profile.xp} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'لعب', value: profile.totals.played, icon: Target, color: 'text-sky-300' },
                { label: 'فاز', value: profile.totals.won, icon: Trophy, color: 'text-amber-300' },
                { label: 'نسبة الفوز', value: `${profile.totals.winRate}٪`, icon: Trophy, color: 'text-emerald-300' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-2 py-3 text-center">
                  <item.icon className={cn('mx-auto mb-1 h-4 w-4', item.color)} />
                  <p className={cn('text-base font-black tabular-nums', item.color)}>{item.value}</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>

            <h3 className="mb-2 mt-5 text-sm font-extrabold">إحصائيات الألعاب 🎮</h3>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-2">
              {playedGames.map(({ game, stats }) => (
                <div key={game.id} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5">
                  <span className="text-2xl">{game.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold">{game.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      لعب <bdi>{arabicNumber.format(stats?.played ?? 0)}</bdi>
                      <span className="px-1.5">·</span>
                      فاز <bdi className="text-emerald-300">{arabicNumber.format(stats?.won ?? 0)}</bdi>
                    </p>
                  </div>
                  {stats?.bestScore !== undefined && (
                    <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-1 text-[9px] font-bold text-amber-200">
                      الأفضل {arabicNumber.format(stats.bestScore)}
                    </span>
                  )}
                </div>
              ))}
              {playedGames.length === 0 && (
                <p className="px-3 py-8 text-center text-xs font-bold text-muted-foreground">لسه مفيش مباريات مسجلة</p>
              )}
            </div>
          </div>
        ) : (
          <div className="grid min-h-72 place-items-center px-8 text-center">
            <div>
              <p className="text-3xl">🙈</p>
              <p className="mt-2 text-sm font-extrabold">معرفناش نحمّل الملف</p>
              <p className="mt-1 text-xs text-muted-foreground">تأكد إنك متصل وجرب تاني</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
