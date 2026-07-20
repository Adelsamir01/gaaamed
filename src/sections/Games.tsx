import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Globe, Search, UserRound, Users } from 'lucide-react'
import { useApp } from '@/store/AppContext'
import { GAMES, CATEGORIES } from '@/games'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import type { GameCategory } from '@/types'

export default function Games({ openGame, openOnline }: { openGame: (id: string) => void; openOnline: () => void }) {
  const { stats } = useApp()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<'الكل' | GameCategory>('الكل')

  const filtered = useMemo(
    () =>
      GAMES.filter(
        (g) =>
          (category === 'الكل' || g.category === category) &&
          (query.trim() === '' || g.name.includes(query.trim()) || g.description.includes(query.trim())),
      ),
    [query, category],
  )

  return (
    <div className="px-4 pt-6 tab-page">
      <h1 className="text-2xl font-black mb-1">الألعاب 🎮</h1>
      <p className="text-sm text-muted-foreground mb-4">اختر لعبتك وابدأ التحدي</p>

      {/* بطاقة اللعب أونلاين */}
      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.98 }}
        onClick={openOnline}
        className="w-full mb-4 rounded-3xl overflow-hidden relative glass text-start"
      >
        <div className="absolute inset-0 bg-gradient-to-l from-teal-600/40 via-emerald-600/25 to-transparent" />
        <div className="relative p-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center glow-emerald shrink-0">
            <Globe className="w-7 h-7 text-emerald-300" />
          </div>
          <div className="flex-1">
            <p className="font-black text-lg">🌐 العب أونلاين</p>
            <p className="text-xs text-slate-300 mt-0.5">غرف برمز، مباراة سريعة، وتحديات مباشرة مع أصدقائك</p>
          </div>
          <span className="text-xs font-extrabold bg-emerald-400 text-emerald-950 rounded-full px-3 py-1.5 shrink-0">العب الآن</span>
        </div>
      </motion.button>

      {/* البحث */}
      <div className="relative mb-4">
        <Search className="absolute top-1/2 -translate-y-1/2 start-4 w-4 h-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن لعبة…"
          className="w-full glass rounded-2xl ps-11 pe-4 py-3 font-bold placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
        />
      </div>

      {/* التصنيفات */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-5 -mx-4 px-4">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => {
              sounds.click()
              setCategory(c)
            }}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all border',
              category === c
                ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200 glow-emerald'
                : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* بطاقات الألعاب */}
      <div className="flex flex-col gap-3">
        {filtered.map((g, i) => {
          const s = stats[g.id]
          return (
            <motion.button
              key={g.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                sounds.click()
                openGame(g.id)
              }}
              className="glass rounded-3xl p-4 flex items-center gap-4 text-start hover:bg-white/10 transition-colors overflow-hidden"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 flex items-center justify-center text-4xl shrink-0">
                {g.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold">{g.name}</h3>
                  <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 rounded-full px-2 py-0.5">
                    {g.category}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{g.description}</p>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {g.singlePlayer && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-400/30 rounded-full px-2 py-0.5">
                      <UserRound className="w-3 h-3" />
                      فردي
                    </span>
                  )}
                  {g.supportsBot && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-sky-300 bg-sky-500/10 border border-sky-400/30 rounded-full px-2 py-0.5">
                      <Bot className="w-3 h-3" />
                      كمبيوتر
                    </span>
                  )}
                  {g.supportsTwoPlayer && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-violet-300 bg-violet-500/10 border border-violet-400/30 rounded-full px-2 py-0.5">
                      <Users className="w-3 h-3" />
                      لاعبان
                    </span>
                  )}
                  {g.online && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-400/30 rounded-full px-2 py-0.5">
                      <Globe className="w-3 h-3" />
                      أونلاين
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  لعبت <bdi className="bidi-number tabular-nums">{s?.played ?? 0}</bdi> مرة
                </p>
              </div>
            </motion.button>
          )
        })}
        {filtered.length === 0 && (
          <div className="glass rounded-3xl p-8 text-center text-muted-foreground">
            <div className="text-4xl mb-2">🔍</div>
            <p className="font-bold">لا توجد ألعاب مطابقة لبحثك</p>
          </div>
        )}
      </div>
    </div>
  )
}
