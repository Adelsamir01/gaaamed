import { useEffect, useMemo, useState } from 'react'
import { Crown, Trophy, WifiOff } from 'lucide-react'
import type { GameDef } from '@/games'
import type { ServerLeaderboard, ServerLeaderboardEntry } from '@/types'
import { useApp } from '@/store/AppContext'
import { useOnline } from '@/online/OnlineContext'
import { AvatarCircle, StatusDot } from './components'
import PlayerProfileDialog from './PlayerProfileDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

const rankMarks = ['🥇', '🥈', '🥉']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  game?: GameDef
}

export default function LeaderboardDialog({ open, onOpenChange, game }: Props) {
  const { profile } = useApp()
  const { status, me, getLeaderboard } = useOnline()
  const boardKey = game?.id ?? 'global'
  const [loaded, setLoaded] = useState<{ key: string; board: ServerLeaderboard | null } | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)

  useEffect(() => {
    if (!open || status !== 'online' || !me) return
    let active = true
    void getLeaderboard(game?.id).then((board) => {
      if (active) setLoaded({ key: boardKey, board })
    })
    return () => {
      active = false
    }
  }, [boardKey, game?.id, getLeaderboard, me, open, status])

  const board = loaded?.key === boardKey ? loaded.board : null
  const loading = open && status === 'online' && !!me && loaded?.key !== boardKey
  const currentUserId = me?.userId ?? profile.userId
  const showPinnedRank = !!board?.me && !board.entries.some((entry) => entry.userId === board.me?.userId)
  const title = game ? `متصدرو ${game.name}` : 'متصدرو ديدوس'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[min(88dvh,680px)] max-w-[390px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-3xl p-4">
          <DialogHeader>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-amber-300/25 bg-amber-400/10 text-2xl">
              {game?.emoji ?? '🏆'}
            </div>
            <DialogTitle className="text-center">{title}</DialogTitle>
            <DialogDescription className="text-center">
              {game ? 'الترتيب حسب مرات الفوز، ثم نسبة الفوز وعدد المباريات' : 'ترتيب كل لاعبي ديدوس حسب نقاط الخبرة'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-col gap-2">
            {showPinnedRank && board?.me && (
              <div className="shrink-0 rounded-2xl border border-emerald-400/35 bg-emerald-500/10 p-1.5">
                <p className="px-2 pb-1 text-[9px] font-black text-emerald-300">ترتيبك بين {board.total.toLocaleString('ar-EG')} لاعب</p>
                <LeaderboardRow
                  entry={board.me}
                  current
                  gameBoard={!!game}
                  onClick={() => setSelectedPlayer(board.me!.userId)}
                />
              </div>
            )}

            <div className="min-h-0 space-y-1.5 overflow-y-auto overscroll-contain pe-1 [scrollbar-width:thin]">
              {board?.entries.map((entry) => (
                <LeaderboardRow
                  key={entry.userId}
                  entry={entry}
                  current={entry.userId === currentUserId}
                  gameBoard={!!game}
                  onClick={() => setSelectedPlayer(entry.userId)}
                />
              ))}

              {loading && Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex h-[58px] animate-pulse items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.035] px-3">
                  <span className="h-4 w-6 rounded bg-white/10" />
                  <span className="h-9 w-9 rounded-full bg-white/10" />
                  <span className="h-3 flex-1 rounded bg-white/10" />
                  <span className="h-3 w-14 rounded bg-white/10" />
                </div>
              ))}

              {status !== 'online' && (
                <div className="flex min-h-48 flex-col items-center justify-center text-center">
                  <WifiOff className="h-9 w-9 text-white/25" />
                  <p className="mt-3 text-sm font-black">الترتيب محتاج اتصال بالإنترنت</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">هنعرضه تلقائيًا أول ما الاتصال يرجع</p>
                </div>
              )}

              {!loading && status === 'online' && board && board.entries.length === 0 && (
                <div className="flex min-h-48 flex-col items-center justify-center text-center">
                  <Trophy className="h-10 w-10 text-amber-300/35" />
                  <p className="mt-3 text-sm font-black">لسه مفيش ترتيب للعبة دي</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">العب أول مباراة وخليك أول المتصدرين</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PlayerProfileDialog
        userId={selectedPlayer}
        isCurrentUser={selectedPlayer === currentUserId}
        onClose={() => setSelectedPlayer(null)}
      />
    </>
  )
}

function LeaderboardRow({
  entry,
  current,
  gameBoard,
  onClick,
}: {
  entry: ServerLeaderboardEntry
  current: boolean
  gameBoard: boolean
  onClick: () => void
}) {
  const detail = useMemo(() => {
    if (!gameBoard) return `مستوى ${Math.floor(entry.points / 100) + 1}`
    return `${(entry.played ?? 0).toLocaleString('ar-EG')} مباراة · نسبة فوز ${(entry.winRate ?? 0).toLocaleString('ar-EG')}٪`
  }, [entry.played, entry.points, entry.winRate, gameBoard])

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[58px] w-full items-center gap-2.5 rounded-2xl border px-2.5 text-start transition-colors',
        current
          ? 'border-emerald-400/35 bg-emerald-500/10'
          : 'border-white/[0.07] bg-white/[0.035] hover:bg-white/[0.07]',
      )}
    >
      <span className="w-7 shrink-0 text-center text-sm font-black text-muted-foreground">
        {rankMarks[entry.rank - 1] ?? entry.rank.toLocaleString('ar-EG')}
      </span>
      <div className="relative shrink-0">
        <AvatarCircle emoji={entry.avatar} size="sm" />
        <span className="absolute -bottom-0.5 -end-0.5 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-slate-950 bg-slate-950">
          <StatusDot status={entry.presence} />
        </span>
      </div>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-extrabold">{entry.name}{current ? ' (أنت)' : ''}</span>
        <span className="block truncate text-[9px] font-bold text-muted-foreground" dir="ltr">@{entry.handle}</span>
      </span>
      <span className="shrink-0 text-end">
        <span className="flex items-center justify-end gap-1 text-xs font-black text-emerald-300">
          {entry.rank === 1 && <Crown className="h-3.5 w-3.5 text-amber-300" />}
          {entry.points.toLocaleString('ar-EG')} {gameBoard ? 'فوز' : 'نقطة'}
        </span>
        <span className="block text-[9px] font-bold text-muted-foreground">{detail}</span>
      </span>
    </button>
  )
}
