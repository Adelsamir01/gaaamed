import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Copy, Crown, Loader2, LogIn, Play, Plus, RefreshCw, Wifi, WifiOff, X, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useOnline } from '@/online/OnlineContext'
import { useApp } from '@/store/AppContext'
import { getGame, ONLINE_GAMES } from '@/games'
import { DEFAULT_ROUNDS, ROUND_OPTIONS, gameUsesRounds, type GameResult } from '@/types'
import { AvatarCircle } from './components'
import GameResults from './GameResults'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import {
  AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function OnlineLobby({ onBack }: { onBack: () => void }) {
  const online = useOnline()
  const { profile, finishGame } = useApp()
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [joinCode, setJoinCode] = useState('')
  const [result, setResult] = useState<GameResult | null>(null)
  // منتقي إنشاء الغرفة: اللعبة المختارة ذات الجولات + عدد الجولات
  const [pickedGame, setPickedGame] = useState<string | null>(null)
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS)

  // إعادة اللعب: عند العودة لمرحلة اللعب امسح النتيجة
  useEffect(() => {
    if (online.phase === 'playing') setResult(null)
  }, [online.phase, online.matchId])

  const game = online.gameId ? getGame(online.gameId) : undefined

  const copyCode = () => {
    if (!online.code) return
    navigator.clipboard?.writeText(online.code).catch(() => {})
    sounds.pop()
    toast.success('تم نسخ الرمز! 📋')
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
          onExit={() => {
            online.leaveRoom()
            setResult(null)
            setMode('menu')
          }}
          replayLabel={online.rematchTheirs && !online.rematchMine ? 'وافق على إعادة اللعب 🔄' : 'طلب إعادة اللعب 🔄'}
          exitLabel="خروج من الغرفة"
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
            onClick={online.leaveRoom}
            className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
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
          <GameComp
            config={{ mode: 'bot', difficulty: 'medium' }}
            onFinish={(r) => {
              finishGame(r)
              setResult(r)
            }}
          />
        </motion.div>
      </div>
    )
  }

  // ===== بنك الحظ: مكوّن اللعبة يدير اللوبي واللعب بنفسه عبر نفق bank =====
  // الغلاف fixed ليملأ شاشة الهاتف كلها (اللوحة تتقيد بأقرب سلف مُحوَّل — الحاوية max-w-420 كانت تحبسها)
  if (game?.id === 'bank-el7az' && (online.phase === 'waiting' || online.phase === 'ready' || online.phase === 'playing')) {
    const BankComp = game.onlineComponent ?? game.component
    return (
      <div className="fixed inset-0 z-40">
        <BankComp
          config={{ mode: 'bot', difficulty: 'medium' }}
          onFinish={(r) => {
            finishGame(r)
            setResult(r)
          }}
        />
      </div>
    )
  }

  // ===== غرفة شخبطة (قائمة لاعبين حتى 8) =====
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
          <button onClick={online.leaveRoom} className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
            مغادرة الغرفة
          </button>
          {statusDot}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
          <div className="text-6xl mb-2">{game.emoji}</div>
          <h1 className="text-xl font-black mb-1">{game.name}</h1>
          <p className="text-sm text-muted-foreground mb-5">شارك الرمز مع أصدقائك — حتى ٨ لاعبين</p>
          {online.roomSettings?.rounds != null && (
            <p className="text-xs font-bold text-emerald-300 -mt-3 mb-5">
              {ROUND_AR[online.roomSettings.rounds] ?? online.roomSettings.rounds} جولات رسم وتخمين 🏆
            </p>
          )}

          {/* الرمز */}
          <button onClick={copyCode} className="glass rounded-3xl px-8 py-4 mb-5 text-center hover:bg-white/10 transition-colors">
            <p className="text-[11px] text-muted-foreground mb-1">رمز الغرفة — اضغط للنسخ</p>
            <div className="flex items-center gap-3" dir="ltr">
              {online.code?.split('').map((d, i) => (
                <span key={i} className="text-4xl font-black text-gradient tabular-nums">{d}</span>
              ))}
              <Copy className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>

          {/* قائمة اللاعبين */}
          <div className="w-full mb-5">
            <p className="text-xs font-bold text-muted-foreground mb-2">اللاعبون ({list.length} / 8)</p>
            <div className="grid grid-cols-2 gap-2">
              <AnimatePresence>
                {list.map((p) => (
                  <motion.div
                    key={p.slot}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="glass rounded-2xl p-3 flex items-center gap-2.5"
                  >
                    <AvatarCircle emoji={p.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold truncate">
                        {p.name} {p.slot === online.slot && <span className="text-emerald-300">(أنت)</span>}
                      </p>
                      {p.slot === 1 && (
                        <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          المضيف
                        </span>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {list.length < 2 && (
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
              )}
            </div>
          </div>

          {isHost ? (
            online.autoStartRoom ? (
              <div className="w-full glass rounded-2xl py-4 text-center font-bold text-emerald-300 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {canStart ? 'جارٍ البدء تلقائيًا… ⚡' : 'تبدأ تلقائيًا أول ما ينضم صاحبك ⚡'}
              </div>
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
              {canStart ? `ابدأ اللعب (${list.length} لاعبين)` : 'تحتاج لاعبَين على الأقل…'}
            </motion.button>
            )
          ) : (
            <div className="w-full glass rounded-2xl py-4 text-center font-bold text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {online.autoStartRoom ? 'جارٍ البدء تلقائيًا… ⚡' : 'بانتظار المضيف لبدء اللعبة…'}
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  // ===== الغرفة (انتظار / جاهز) =====
  if ((online.phase === 'waiting' || online.phase === 'ready') && game) {
    return (
      <div className="px-4 pt-4 pb-10">
        <div className="flex items-center justify-between mb-6">
          <button onClick={online.leaveRoom} className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            <ChevronRight className="w-4 h-4" />
            مغادرة الغرفة
          </button>
          {statusDot}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
          <div className="text-6xl mb-2">{game.emoji}</div>
          <h1 className="text-xl font-black mb-1">{game.name}</h1>
          <p className="text-sm text-muted-foreground mb-6">الغرفة جاهزة — شارك الرمز مع صديقك</p>
          {gameUsesRounds(game.id) && online.roomSettings?.rounds != null && (
            <p className="text-xs font-bold text-emerald-300 -mt-4 mb-6">
              أفضل من {ROUND_AR[online.roomSettings.rounds] ?? online.roomSettings.rounds} جولات 🏆
            </p>
          )}

          {/* الرمز */}
          <button onClick={copyCode} className="glass rounded-3xl px-8 py-5 mb-6 text-center hover:bg-white/10 transition-colors">
            <p className="text-[11px] text-muted-foreground mb-1">رمز الغرفة — اضغط للنسخ</p>
            <div className="flex items-center gap-3" dir="ltr">
              {online.code?.split('').map((d, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="text-4xl font-black text-gradient tabular-nums"
                >
                  {d}
                </motion.span>
              ))}
              <Copy className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>

          {/* اللاعبان */}
          <div className="w-full grid grid-cols-2 gap-3 mb-6">
            <div className="glass rounded-2xl p-4 flex flex-col items-center gap-1.5">
              <AvatarCircle emoji={profile.avatar} glow />
              <p className="text-sm font-extrabold truncate max-w-full">{profile.name}</p>
              <span className="text-[10px] font-bold text-amber-300 flex items-center gap-1">
                <Crown className="w-3 h-3" />
                {online.slot === 1 ? 'المضيف' : 'لاعب'}
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
                  <p className="text-xs text-muted-foreground font-bold">بانتظار الخصم…</p>
                </>
              )}
            </div>
          </div>

          {online.autoStartRoom ? (
            <div className="w-full glass rounded-2xl py-4 text-center font-bold text-emerald-300 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {online.opponent ? 'جارٍ البدء تلقائيًا… ⚡' : 'تبدأ المباراة تلقائيًا أول ما ينضم خصمك ⚡'}
            </div>
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
              {online.opponent ? 'ابدأ اللعب' : 'بانتظار انضمام لاعب…'}
            </motion.button>
          ) : (
            <div className="w-full glass rounded-2xl py-4 text-center font-bold text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              بانتظار المضيف لبدء اللعبة…
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  // ===== القائمة الرئيسية للأونلاين =====
  return (
    <div className="px-4 pt-4 pb-10">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="w-4 h-4" />
          عودة للألعاب
        </button>
        {statusDot}
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-center mb-6">
          <div className="text-6xl mb-2">🌐</div>
          <h1 className="text-2xl font-black">العب أونلاين</h1>
          <p className="text-sm text-muted-foreground mt-1">تحدَّ أصدقاءك على أجهزتهم عبر الشبكة</p>
        </div>

        {online.status !== 'online' && (
          <div className="glass rounded-2xl p-3.5 mb-4 flex items-center gap-2.5 text-sm">
            {online.status === 'offline' ? <WifiOff className="w-5 h-5 text-red-400 shrink-0" /> : <Wifi className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />}
            <span className="text-muted-foreground font-bold">
              {online.status === 'offline' ? 'الخادم غير متاح — تأكد من تشغيله ثم أعد الاتصال' : 'جارٍ الاتصال بالخادم…'}
            </span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {mode === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-3">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  sounds.click()
                  setMode('create')
                }}
                disabled={online.status !== 'online'}
                className="glass rounded-3xl p-5 flex items-center gap-4 text-start hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center glow-emerald shrink-0">
                  <Plus className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <p className="font-extrabold text-lg">إنشاء غرفة</p>
                  <p className="text-xs text-muted-foreground mt-0.5">اختر لعبة واحصل على رمز تشاركه مع صديقك</p>
                </div>
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  sounds.click()
                  setMode('join')
                }}
                disabled={online.status !== 'online'}
                className="glass rounded-3xl p-5 flex items-center gap-4 text-start hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-center glow-amber shrink-0">
                  <LogIn className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <p className="font-extrabold text-lg">انضمام لغرفة</p>
                  <p className="text-xs text-muted-foreground mt-0.5">أدخل رمز الغرفة المكوّن من ٤ أرقام</p>
                </div>
              </motion.button>

              {/* المباراة السريعة */}
              <div className="glass rounded-3xl p-4 mt-1">
                <p className="font-extrabold flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-amber-400" />
                  مباراة سريعة ⚡
                </p>
                <p className="text-[11px] text-muted-foreground mb-3">نوصلك بلاعب متاح فورًا في نفس اللعبة</p>
                {online.quickMatchGame ? (
                  <div className="rounded-2xl bg-amber-400/10 border border-amber-400/40 p-4 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-amber-300 animate-spin shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-extrabold text-amber-200">
                        يبحث عن خصم في {getGame(online.quickMatchGame)?.name}…
                      </p>
                      <p className="text-[10px] text-muted-foreground">هنبدأ فورًا أول ما نلاقي لاعب</p>
                    </div>
                    <button
                      onClick={() => {
                        sounds.click()
                        online.quickMatchCancel()
                      }}
                      className="w-9 h-9 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/15 transition-colors shrink-0"
                      aria-label="إلغاء البحث"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {ONLINE_GAMES.map((g) => (
                      <motion.button
                        key={g.id}
                        whileTap={{ scale: 0.94 }}
                        onClick={() => {
                          sounds.pop()
                          online.quickMatch(g.id)
                        }}
                        disabled={online.status !== 'online'}
                        className="rounded-2xl bg-white/5 border border-white/10 py-3 flex flex-col items-center gap-1 hover:bg-white/10 transition-colors disabled:opacity-50"
                      >
                        <span className="text-2xl">{g.emoji}</span>
                        <span className="text-[10px] font-extrabold">{g.name}</span>
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {mode === 'create' && (
            <motion.div key="create" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <button onClick={() => { setMode('menu'); setPickedGame(null) }} className="text-xs font-bold text-emerald-300 mb-3">‹ عودة</button>
              <h2 className="font-extrabold mb-3">اختر اللعبة 🎮</h2>
              <div className="flex flex-col gap-2.5">
                {ONLINE_GAMES.map((g) => {
                  const usesRounds = gameUsesRounds(g.id)
                  const selected = pickedGame === g.id
                  return (
                    <motion.button
                      key={g.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        if (usesRounds) {
                          // الألعاب ذات الجولات: اختر اللعبة أولًا ثم عدد الجولات قبل الإنشاء
                          sounds.click()
                          setPickedGame(selected ? null : g.id)
                        } else {
                          sounds.pop()
                          online.createRoom(g.id, profile.name, profile.avatar)
                        }
                      }}
                      className={cn(
                        'glass rounded-2xl p-4 flex items-center gap-3 text-start transition-colors',
                        selected ? 'border-emerald-400/60 bg-emerald-500/10 glow-emerald' : 'hover:bg-white/10',
                      )}
                    >
                      <span className="text-3xl">{g.emoji}</span>
                      <div className="flex-1">
                        <p className="font-extrabold text-sm">{g.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{g.description}</p>
                      </div>
                      {usesRounds && (
                        <span className={cn('text-[10px] font-extrabold shrink-0', selected ? 'text-emerald-300' : 'text-muted-foreground')}>
                          {selected ? '▼ اختر الجولات' : '٣/٥/٧ جولات'}
                        </span>
                      )}
                    </motion.button>
                  )
                })}
              </div>

              {/* منتقي عدد الجولات — يظهر فقط للألعاب ذات الجولات (حجر ورقة مقص / سرعة البرق / شخبطة) */}
              <AnimatePresence>
                {pickedGame && (
                  <motion.div
                    key="rounds"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="glass rounded-3xl p-4 mt-3"
                  >
                    <p className="font-extrabold text-sm mb-1">عدد الجولات 🏆</p>
                    <p className="text-[11px] text-muted-foreground mb-3">
                      {pickedGame === 'shakhbata'
                        ? 'كم جولة رسم وتخمين ستلعبونها'
                        : 'أفضل من سلسلة — الأول يجمع أغلب الجولات يفوز بالمباراة'}
                    </p>
                    <RoundsStepper value={rounds} onChange={setRounds} />
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        sounds.pop()
                        online.createRoom(pickedGame, profile.name, profile.avatar, { rounds })
                      }}
                      disabled={online.status !== 'online'}
                      className="w-full mt-3 py-3.5 rounded-2xl font-extrabold bg-gradient-to-l from-emerald-500 to-teal-500 text-white glow-emerald hover:from-emerald-400 hover:to-teal-400 transition-all disabled:opacity-50"
                    >
                      إنشاء الغرفة 🚀
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {mode === 'join' && (
            <motion.div key="join" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <button onClick={() => setMode('menu')} className="text-xs font-bold text-emerald-300 mb-3">‹ عودة</button>
              <h2 className="font-extrabold mb-3">أدخل رمز الغرفة 🔢</h2>
              <div className="glass rounded-3xl p-5">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="٠٠٠٠"
                  inputMode="numeric"
                  dir="ltr"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-center text-3xl font-black tracking-[0.5em] placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 tabular-nums"
                />
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => {
                    if (joinCode.length !== 4) {
                      toast.error('الرمز مكوّن من ٤ أرقام')
                      return
                    }
                    sounds.pop()
                    online.joinRoom(joinCode, profile.name, profile.avatar)
                  }}
                  disabled={joinCode.length !== 4 || online.status !== 'online'}
                  className={cn(
                    'w-full mt-4 py-3.5 rounded-2xl font-extrabold transition-all',
                    joinCode.length === 4 && online.status === 'online'
                      ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white glow-emerald'
                      : 'bg-white/10 text-muted-foreground cursor-not-allowed',
                  )}
                >
                  انضمام 🚀
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <OpponentLeftDialog open={online.phase === 'opponent_left'} onClose={() => { online.leaveRoom(); setMode('menu') }} />
    </div>
  )
}

function OpponentLeftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-[360px] rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>غادر الخصم الغرفة 😢</AlertDialogTitle>
          <AlertDialogDescription>انتهت المباراة لأن اللاعب الآخر غادر أو انقطع اتصاله.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose} className="w-full rounded-2xl">
            العودة إلى الردهة
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** أرقام الجولات بالأرقام العربية المشرقية */
export const ROUND_AR: Record<number, string> = { 3: '٣', 5: '٥', 7: '٧' }

/** منتقي عدد الجولات (٣/٥/٧) — مقطّع RTL بتصميم الزمرد الداكن، مشترك بين إنشاء الغرفة ودعوة المحادثة */
export function RoundsStepper({ value, onChange }: { value: number; onChange: (rounds: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="عدد الجولات">
      {ROUND_OPTIONS.map((r) => {
        const active = value === r
        return (
          <motion.button
            key={r}
            type="button"
            role="radio"
            aria-checked={active}
            whileTap={{ scale: 0.94 }}
            onClick={() => {
              sounds.click()
              onChange(r)
            }}
            className={cn(
              'rounded-2xl py-3 flex flex-col items-center gap-0.5 border transition-all',
              active
                ? 'bg-gradient-to-l from-emerald-500 to-teal-500 text-white border-emerald-300/60 glow-emerald'
                : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:border-emerald-400/30',
            )}
          >
            <span className="text-xl font-black tabular-nums">{ROUND_AR[r]}</span>
            <span className="text-[10px] font-bold">{r === DEFAULT_ROUNDS ? 'جولات (افتراضي)' : 'جولات'}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
