import type { GameProps } from '@/games'

/**
 * The registry requires a local component for every game. سيطر currently
 * launches directly into its public arena, so this is only a safe fallback
 * for stale navigation state.
 */
export default function PaperGame({ onExit }: GameProps) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div className="glass max-w-sm rounded-3xl p-6">
        <div className="text-5xl">🟪</div>
        <h2 className="mt-3 text-xl font-black">سيطر لعبة ساحة عامة</h2>
        <p className="mt-2 text-sm font-semibold leading-7 text-muted-foreground">
          ادخل من اختيار أونلاين عشان تلعب فورًا مع باقي اللاعبين.
        </p>
        <button type="button" onClick={onExit} className="mt-5 min-h-12 rounded-2xl bg-sky-400 px-6 font-black text-slate-950">
          ارجع واختار الساحة
        </button>
      </div>
    </div>
  )
}
