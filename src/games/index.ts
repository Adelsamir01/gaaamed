import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameCategory, GameConfig, GameResult } from '@/types'

// Games are large, independent experiences. Loading them only when selected
// keeps the home screen fast and avoids retaining every game in memory.
const TicTacToe = lazy(() => import('./tictactoe/TicTacToe'))
const MemoryGame = lazy(() => import('./memory/MemoryGame'))
const TriviaGame = lazy(() => import('./trivia/TriviaGame'))
const RpsGame = lazy(() => import('./rps/RpsGame'))
const ReactionGame = lazy(() => import('./reaction/ReactionGame'))
const OnlineTicTacToe = lazy(() => import('./online/OnlineTicTacToe'))
const ConnectFour = lazy(() => import('./online/ConnectFour'))
const OnlineRps = lazy(() => import('./online/OnlineRps'))
const OnlineReaction = lazy(() => import('./online/OnlineReaction'))
const Shakhbata = lazy(() => import('./online/Shakhbata'))
const BankEl7az = lazy(() => import('./online/bankel7az/App'))

export interface GameProps {
  config: GameConfig
  onFinish: (result: GameResult) => void
}

type GameComponent = LazyExoticComponent<ComponentType<GameProps>>

export interface GameDef {
  id: string
  name: string
  description: string
  emoji: string
  category: GameCategory
  howToPlay: string[]
  supportsBot: boolean
  supportsTwoPlayer: boolean
  difficulties?: boolean
  online?: boolean
  /** نسخة الأونلاين من نفس اللعبة (للألعاب التي تدعم الوضعين) */
  onlineComponent?: GameComponent
  component: GameComponent
}

export const GAMES: GameDef[] = [
  {
    id: 'tictactoe',
    name: 'إكس أو',
    description: 'اللعبة الكلاسيكية الأشهر — صفّ ثلاثة رموز قبل خصمك',
    emoji: '⭕',
    category: 'ذكاء',
    howToPlay: [
      'يتناوب اللاعبان على وضع رمزيهما (✕ و ◯) في شبكة ٣×٣',
      'أول من يصفّ ثلاثة رموز متطابقة أفقيًا أو عموديًا أو قطريًا يفوز بالجولة',
      'الفائز بثلاث جولات أولًا يفوز بالمباراة',
    ],
    supportsBot: true,
    supportsTwoPlayer: true,
    difficulties: true,
    online: true,
    onlineComponent: OnlineTicTacToe,
    component: TicTacToe,
  },
  {
    id: 'memory',
    name: 'لعبة الذاكرة',
    description: 'اقلب البطاقات وطابق الأزواج الثمانية بأقل عدد من الحركات',
    emoji: '🧠',
    category: 'ذاكرة',
    howToPlay: [
      'اضغط على أي بطاقة لقلبها وكشف رمزها',
      'اقلب بطاقة ثانية — إن تطابقتا بقيتا مكشوفتين',
      'أكمل الأزواج الثمانية بأقل عدد من الحركات لتحصل على عملات أكثر',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    component: MemoryGame,
  },
  {
    id: 'trivia',
    name: 'أسئلة ثقافية',
    description: '١٠ أسئلة معلومات عامة — أجب بسرعة وحافظ على سلسلة إجاباتك',
    emoji: '📚',
    category: 'معلومات',
    howToPlay: [
      'لكل سؤال ٤ خيارات و١٥ ثانية فقط للإجابة',
      'كل إجابة صحيحة تكسبك ٥ عملات',
      'كل ٣ إجابات صحيحة متتالية تمنحك عملتين إضافيتين 🔥',
      'راجع أخطاءك في النهاية لتتعلم منها',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    component: TriviaGame,
  },
  {
    id: 'rps',
    name: 'حجر ورقة مقص',
    description: 'تحدي الحظ والتوقع ضد الكمبيوتر — الأفضل من ٥ جولات',
    emoji: '✂️',
    category: 'سرعة',
    howToPlay: [
      'اختر: حجر 🪨 أو ورقة 📄 أو مقص ✂️',
      'الحجر يكسر المقص، والمقص يقص الورقة، والورقة تغلف الحجر',
      'أول من يفوز بثلاث جولات يفوز بالمباراة',
    ],
    supportsBot: true,
    supportsTwoPlayer: false,
    difficulties: true,
    online: true,
    onlineComponent: OnlineRps,
    component: RpsGame,
  },
  {
    id: 'reaction',
    name: 'سرعة البرق',
    description: 'اختبر سرعة ردة فعلك — اضغط فور تحول اللون إلى الأخضر',
    emoji: '⚡',
    category: 'سرعة',
    howToPlay: [
      'اضغط للبدء ثم انتظر اللون الأخضر',
      'اضغط بأسرع ما يمكن فور ظهور "اضغط الآن!"',
      'الضغط المبكر جدًا يعني إنذارًا وإعادة الجولة',
      'خمس جولات — يُحسب متوسطك وأفضل محاولة',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    online: true,
    onlineComponent: OnlineReaction,
    component: ReactionGame,
  },
  // ===== ألعاب الأونلاين =====
  {
    id: 'connect4',
    name: 'أربعة تربح',
    description: 'أسقط الأقراص في الأعمدة وصفّ أربعة قبل خصمك — أونلاين',
    emoji: '🔴',
    category: 'أونلاين',
    howToPlay: [
      'اضغط على أي عمود لإسقاط قرصك فيه',
      'الأحمر (صاحب الغرفة) يبدأ أولًا ثم يتناوبان',
      'أول من يصفّ أربعة أقراص أفقيًا أو عموديًا أو قطريًا يفوز',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    online: true,
    component: ConnectFour,
  },
  {
    id: 'shakhbata',
    name: 'شخبطة',
    description: 'ارسم وخمّن مع أصدقائك — حتى ٨ لاعبين في الغرفة',
    emoji: '🎨',
    category: 'أونلاين',
    howToPlay: [
      'كل لاعب يرسم مرة واحدة في المباراة',
      'الرسام يختار كلمة من ٣ خيارات ويرسمها بدون كتابتها',
      'الباقي يخمّنون في الدردشة — الأسرع يأخذ نقاطًا أكثر',
      'تصلك تلميحات حروف مع مرور الوقت — والرسام يكسب نقاطًا مع كل تخمين صحيح',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    online: true,
    component: Shakhbata,
  },
  {
    id: 'bank-el7az',
    name: 'بنك الحظ',
    description: 'لعبة محافظات مصرية أونلاين — ارمِ الزهر واشترِ وابنِ حتى يفلس خصومك',
    emoji: '🏦',
    category: 'أونلاين',
    howToPlay: [
      'ارمِ الزهر وتحرك حول اللوحة — ٢٧ محافظة في ٩ مجموعات',
      'اشترِ المحافظات وأكمل المجموعة الواحدة لتفتح البناء (حتى ٣ مبانٍ)',
      'اللي يقف على ملكك يدفع إيجار — والمباني ترفع الإيجار',
      'كروت الحظ والضرائب والقسم تقلب الموازين — آخر لاعب واقف يكسب',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    online: true,
    component: BankEl7az,
  },
]

export function getGame(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id)
}

export const ONLINE_GAMES = GAMES.filter((g) => g.online)

export const CATEGORIES: Array<'الكل' | GameCategory> = ['الكل', 'أونلاين', 'ذكاء', 'ذاكرة', 'معلومات', 'سرعة']
