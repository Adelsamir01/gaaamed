import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Crown, Loader2, Play, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { getGame } from '@/games'
import { DEFAULT_ROUNDS, ROUND_OPTIONS, gameUsesRounds, type GameResult } from '@/types'
import { AvatarCircle } from './components'
import GameResults from './GameResults'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface OnlineLobbyProps {
  onBack: () => void
  /** When present, entering this screen immediately searches for this exact game. */
  quickGameId?: string
  friendThreadId?: string | null
  onFriendMatchFinished?: (threadId: string) => void
}

export default function OnlineLobby({
  onBack,
  quickGameId,
  friendThreadId,
  onFriendMatchFinished,
}: OnlineLobbyProps) {
  const online = useOnline()
  const { profile, finishGame } = useApp()
  const { quickMatch, status } = online
  const [result, setResult] = useState<GameResult | null>(null)
  const queuedGameRef = useRef<string | null>(null)

  // A game's Online button is the matchmaking action. There is no intermediate
  // room menu and no second game picker.
  useEffect(() => {
    if (!quickGameId) return
    if (status !== 'online') {
      queuedGameRef.current = null
      return
    }
    if (queuedGameRef.current === quickGameId) return
    queuedGameRef.current = quickGameId
    quickMatch(quickGameId)
  }, [quickGameId, quickMatch, status])

  // إعادة اللعب: عند العودة لمرحلة اللعب امسح النتيجة
  useEffect(() => {
    if (online.phase === 'playing') setResult(null)
  }, [online.phase, online.matchId])

  const game = online.gameId ? getGame(online.gameId) : undefined
  const requestedGame = quickGameId ? getGame(quickGameId) : undefined

  const exitOnline = () => {
    online.leaveRoom()
    setResult(null)
    if (friendThreadId && onFriendMatchFinished) {
      onFriendMatchFinished(friendThreadId)
      return
    }
    onBack()
  }

  const handleGameFinished = (gameResult: GameResult) => {
    finishGame(gameResult)
    if (friendThreadId && onFriendMatchFinished) {
      onFriendMatchFinished(friendThreadId)
      return
    }
    setResult(gameResult)
  }

  const statusDot = (
    <div className="flex items-center gap-2 text-xs font-bold">
      <span
        className={cn(
          'w-2.5 h-2.5 rounded-full',
          online.status === 'online' ? 'bg-emerald-400 animate-pulse' : online.status === 'connecting' ? 'bg-amber-400 animate-pulse' : 'bg-red-400',
        )}
      />
      <span className="text-muted-foreground">
        {online.status === 'online' ? 'متصل' : online.status === 'connecting' ? 'يتصل…' : 'غير متصل'}
      </span>
      {online.status === 'offline' && (
        <button onClick={online.reconnect} className="text-emerald-300 flex items-center gap-1 hover:underline">
          <RefreshCw className="w-3 h-3" />
          إعادة الاتصال
        </button>
      )}
    </div>
  )

  // ===== شاشة النتائج =====
  if (result && online.phase !== 'opponent_left') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-4">
        {(online.rematchMine || online.rematchTheirs) && (
          <p className="mb-3 text-sm font-bold text-amber-300">
            {online.rematchMine && !online.rematchTheirs && '⏳ بانتظار موافقة الخصم على الإعادة…'}
            {online.rematchTheirs && !online.rematchMine && '🔄 الخصم يريد إعادة اللعب! اضغط الزر للموافقة'}
          </p>
        )}
        <GameResults
          result={result}
          onReplay={online.requestRematch}
          onExit={exitOnline}
          replayLabel={online.rematchTheirs && !online.rematchMine ? 'وافق على إعادة اللعب 🔄' : 'طلب إعادة اللعب 🔄'}
          exitLabel="الخروج"
          hideReplay={result.gameId === 'shakhbata' || result.gameId === 'bank-el7az'}
        />
      </div>
    )
  }

  // ===== شاشة اللعب =====
  if (online.phase === 'playing' && game) {
    const GameComp = game.onlineComponent ?? game.component
    return (
      <div className="min-h-dvh flex flex-col">
        <div className="px-4 pt-4 flex items-center gap-2">
          <button
            onClick={exitOnline}
            className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
            انسحاب
          </button>
          <span className="flex-1 text-center font-extrabold">
            {game.emoji} {game.name}
          </span>
          <span className="w-16">{statusDot}</span>
        </div>
        <motion.div key={online.matchId} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 px-4 pb-8">
          <GameComp config={{ mode: 'bot', difficulty: 'medium' }} onFinish={handleGameFinished} onExit={exitOnline} />
        </motion.div>
      </div>
    )
  }

  // بنك الحظ يدير شاشة التجهيز واللعب بنفسه عبر نفق bank.
  if (game?.id === 'bank-el7az' && (online.phase === 'waiting' || online.phase === 'ready' || online.phase === 'playing')) {
    const BankComp = game.onlineComponent ?? game.component
    return (
      <div className="fixed inset-0 z-40">
        <BankComp config={{ mode: 'bot', difficulty: 'medium' }} onFinish={handleGameFinished} onExit={exitOnline} />
      </div>
    )
  }

  // Quick matching briefly reaches ready while the server starts the match.
  // Keep that transition private instead of exposing the internal session code.
  if (online.fromQuickMatch && online.phase === 'ready' && game) {
    return (
      <MatchTransition
        emoji={game.emoji}
        name={game.name}
        opponentName={online.opponent?.name}
        statusDot={statusDot}
        onExit={exitOnline}
      />
    )
  }

  // ===== تجهيز شخبطة من دعوة أصدقاء/مجموعة (حتى ٨ لاعبين) =====
  if ((online.phase === 'waiting' || online.phase === 'ready') && game?.id === 'shakhbata') {
    const list = [...online.players]
    if (online.slot !== null && !list.some((p) => p.slot === online.slot)) {
      list.unshift({ id: online.slot, slot: online.slot, name: profile.name, avatar: profile.avatar })
    }
    const isHost = online.slot === 1
    const canStart = list.length >= 2
    return (
      <div className="px-4 pt-4 pb-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={exitOnline} className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
            خروج
          </button>
          {statusDot}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
          <div className="text-6xl mb-2">{game.emoji}</div>
          <h1 className="text-xl font-black mb-1">{game.name}</h1>
          <p className="text-sm text-muted-foreground mb-5">مستنيين أصحاب الدعوة — حتى ٨ لاعبين</p>
          {online.roomSettings?.rounds != null && (
            <p className="text-xs font-bold text-emerald-300 -mt-3 mb-5">
              {ROUND_AR[online.roomSettings.rounds] ?? online.roomSettings.rounds} جولات رسم وتخمين 🏆
            </p>
          )}

          <div className="w-full mb-5">
            <p className="text-xs font-bold text-muted-foreground mb-2">
              اللاعبون (<bdi className="bidi-number">{list.length} / 8</bdi>)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <AnimatePresence>
                {list.map((player) => (
                  <motion.div
                    key={player.slot}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="glass rounded-2xl p-3 flex items-center gap-2.5"
                  >
                    <AvatarCircle emoji={player.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold truncate">
                        {player.name} {player.slot === online.slot && <span className="text-emerald-300">(أنت)</span>}
                      </p>
                      {player.slot === 1 && (
                        <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          صاحب الدعوة
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {list.length < 2 && <WaitingPlayerCard />}
            </div>
          </div>

          {isHost ? (
            online.autoStartRoom ? (
              <AutoStartNotice ready={canStart} />
            ) : (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  sounds.pop()
                  online.startGame()
                }}
                disabled={!canStart}
                className={cn(
                  'w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all',
                  canStart
                    ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white glow-emerald hover:from-emerald-400 hover:to-teal-400'
                    : 'bg-white/10 text-muted-foreground cursor-not-allowed',
                )}
              >
                <Play className="w-5 h-5 fill-current" />
                {canStart ? `ابدأ اللعب (${list.length} لاعبين)` : 'تحتاج للاعبَين على الأقل…'}
              </motion.button>
            )
          ) : (
            <div className="w-full glass rounded-2xl py-4 text-center font-bold text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {online.autoStartRoom ? 'جارٍ البدء تلقائيًا… ⚡' : 'بانتظار صاحب الدعوة لبدء اللعبة…'}
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  // ===== تجهيز تحدٍ وصل من دردشة =====
  if ((online.phase === 'waiting' || online.phase === 'ready') && game) {
    return (
      <div className="px-4 pt-4 pb-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={exitOnline} className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
            خروج
          </button>
          {statusDot}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
          <div className="text-6xl mb-2">{game.emoji}</div>
          <h1 className="text-xl font-black mb-1">{game.name}</h1>
          <p className="text-sm text-muted-foreground mb-6">التحدي جاهز — مستنيين صاحب الدعوة</p>
          {gameUsesRounds(game.id) && online.roomSettings?.rounds != null && (
            <p className="text-xs font-bold text-emerald-300 -mt-4 mb-6">
              أفضل من {ROUND_AR[online.roomSettings.rounds] ?? online.roomSettings.rounds} جولات 🏆
            </p>
          )}

          <div className="w-full grid grid-cols-2 gap-3 mb-6">
            <div className="glass rounded-2xl p-4 flex flex-col items-center gap-1.5">
              <AvatarCircle emoji={profile.avatar} glow />
              <p className="text-sm font-extrabold truncate max-w-full">{profile.name}</p>
              <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                <Crown className="w-3 h-3" />
                {online.slot === 1 ? 'صاحب الدعوة' : 'لاعب'}
              </span>
            </div>
            <div className="glass rounded-2xl p-4 flex flex-col items-center gap-1.5 justify-center">
              {online.opponent ? (
                <>
                  <AvatarCircle emoji={online.opponent.avatar} glow />
                  <p className="text-sm font-extrabold truncate max-w-full">{online.opponent.name}</p>
                  <span className="text-[10px] font-bold text-emerald-300">انضم! ✓</span>
                </>
              ) : (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.6 }}
                    className="w-11 h-11 rounded-full bg-white/10 border border-dashed border-white/30 flex items-center justify-center text-xl"
                  >
                    ⏳
                  </motion.div>
                  <p className="text-xs text-muted-foreground font-bold">بانتظار اللاعب…</p>
                </>
              )}
            </div>
          </div>

          {online.autoStartRoom ? (
            <AutoStartNotice ready={Boolean(online.opponent)} />
          ) : online.slot === 1 ? (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                sounds.pop()
                online.startGame()
              }}
              disabled={!online.opponent}
              className={cn(
                'w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all',
                online.opponent
                  ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white glow-emerald hover:from-emerald-400 hover:to-teal-400'
                  : 'bg-white/10 text-muted-foreground cursor-not-allowed',
              )}
            >
              <Play className="w-5 h-5 fill-current" />
              {online.opponent ? 'ابدأ اللعب' : 'بانتظار انضمام اللاعب…'}
            </motion.button>
          ) : (
            <div className="w-full glass rounded-2xl py-4 text-center font-bold text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              بانتظار صاحب الدعوة لبدء اللعبة…
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  // The only idle state is either a game-specific quick search or the short
  // hand-off while a chat invitation is being opened.
  return (
    <div className="min-h-dvh px-4 pt-4 pb-10 flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <button onClick={exitOnline} className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-4 h-4" />
          {quickGameId ? 'إلغاء البحث' : 'رجوع للمحادثة'}
        </button>
        {statusDot}
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col items-center justify-center text-center pb-20">
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          className="text-7xl mb-5"
        >
          {requestedGame?.emoji ?? '🎮'}
        </motion.div>
        <h1 className="text-2xl font-black mb-2">
          {quickGameId ? 'بندور لك على خصم' : 'جارٍ فتح دعوة اللعبة…'}
        </h1>
        <p className="text-sm text-muted-foreground max-w-xs leading-6 mb-7">
          {requestedGame
            ? `مباراة سريعة في ${requestedGame.name} — هتبدأ تلقائيًا أول ما نلاقي لاعب`
            : 'بنجهّز التحدي مع أصحابك'}
        </p>

        {online.status === 'online' ? (
          <div className="glass rounded-full px-5 py-3 flex items-center gap-3 text-sm font-extrabold text-emerald-200">
            <Loader2 className="w-5 h-5 animate-spin" />
            جاري البحث…
          </div>
        ) : (
          <div className="glass rounded-2xl p-4 max-w-xs flex items-center gap-3 text-start">
            {online.status === 'offline'
              ? <WifiOff className="w-6 h-6 text-red-400 shrink-0" />
              : <Wifi className="w-6 h-6 text-amber-400 shrink-0 animate-pulse" />}
            <span className="text-sm text-muted-foreground font-bold">
              {online.status === 'offline' ? 'الخادم غير متاح حاليًا. اضغط إعادة الاتصال بالأعلى.' : 'جارٍ الاتصال بالخادم…'}
            </span>
          </div>
        )}
      </motion.div>

      <OpponentLeftDialog open={online.phase === 'opponent_left'} onClose={exitOnline} />
    </div>
  )
}

function MatchTransition({
  emoji,
  name,
  opponentName,
  statusDot,
  onExit,
}: {
  emoji: string
  name: string
  opponentName?: string
  statusDot: React.ReactNode
  onExit: () => void
}) {
  return (
    <div className="min-h-dvh px-4 pt-4 flex flex-col">
      <div className="flex items-center justify-between">
        <button onClick={onExit} className="min-h-11 flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-4 h-4" />
          خروج
        </button>
        {statusDot}
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col items-center justify-center text-center pb-16">
        <div className="text-7xl mb-5">{emoji}</div>
        <h1 className="text-2xl font-black mb-2">لقينا لك خصم! ⚡</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {opponentName ? `${opponentName} جاهز يلعب ${name}` : `${name} هتبدأ حالًا`}
        </p>
        <div className="glass rounded-full px-5 py-3 flex items-center gap-3 text-sm font-extrabold text-emerald-200">
          <Loader2 className="w-5 h-5 animate-spin" />
          بنبدأ المباراة…
        </div>
      </motion.div>
    </div>
  )
}

function WaitingPlayerCard() {
  return (
    <div className="glass rounded-2xl p-3 flex items-center gap-2.5 border-dashed">
      <motion.div
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 1.6 }}
        className="w-9 h-9 rounded-full bg-white/10 border border-dashed border-white/30 flex items-center justify-center"
      >
        ⏳
      </motion.div>
      <p className="text-xs text-muted-foreground font-bold">بانتظار لاعبين…</p>
    </div>
  )
}

function AutoStartNotice({ ready }: { ready: boolean }) {
  return (
    <div className="w-full glass rounded-2xl py-4 text-center font-bold text-emerald-300 flex items-center justify-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      {ready ? 'جارٍ البدء تلقائيًا… ⚡' : 'تبدأ تلقائيًا أول ما ينضم اللاعب ⚡'}
    </div>
  )
}

function OpponentLeftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-[360px] rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>غادر اللاعب الآخر 😢</AlertDialogTitle>
          <AlertDialogDescription>انتهت المباراة لأن اللاعب الآخر غادر أو انقطع اتصاله.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose} className="w-full rounded-2xl">
            العودة للألعاب
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** أرقام الجولات بالأرقام العربية المشرقية */
export const ROUND_AR: Record<number, string> = { 3: '٣', 5: '٥', 7: '٧' }

/** منتقي عدد الجولات (٣/٥/٧) المستخدم عند إرسال دعوة لعبة من المحادثة. */
export function RoundsStepper({ value, onChange }: { value: number; onChange: (rounds: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="عدد الجولات">
      {ROUND_OPTIONS.map((roundCount) => {
        const active = value === roundCount
        return (
          <motion.button
            key={roundCount}
            type="button"
            role="radio"
            aria-checked={active}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              sounds.click()
              onChange(roundCount)
            }}
            className={cn(
              'rounded-2xl py-3 flex flex-col items-center gap-0.5 border transition-all',
              active
                ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white border-emerald-300/60 glow-emerald'
                : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:border-emerald-400/30',
            )}
          >
            <span className="text-xl font-black tabular-nums">{ROUND_AR[roundCount]}</span>
            <span className="text-[10px] font-bold">{roundCount === DEFAULT_ROUNDS ? 'جولات (افتراضي)' : 'جولات'}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
