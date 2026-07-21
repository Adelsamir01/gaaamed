import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameCategory, GameConfig, GameResult } from '@/types'

// Games are large, independent experiences. Loading them only when selected
// keeps the home screen fast and avoids retaining every game in memory.
const TicTacToe = lazy(() => import('./tictactoe/TicTacToe'))
const MemoryGame = lazy(() => import('./memory/MemoryGame'))
const TriviaGame = lazy(() => import('./trivia/TriviaGame'))
const RpsGame = lazy(() => import('./rps/RpsGame'))
const ReactionGame = lazy(() => import('./reaction/ReactionGame'))
const SnakeGame = lazy(() => import('./snake/SnakeGame'))
const MinesweeperGame = lazy(() => import('./minesweeper/MinesweeperGame'))
const Match3Game = lazy(() => import('./match3/Match3Game'))
const OnlineMatch3 = lazy(() => import('./match3/OnlineMatch3'))
const OnlineTicTacToe = lazy(() => import('./online/OnlineTicTacToe'))
const ConnectFourLocal = lazy(() => import('./connect4/ConnectFourLocal'))
const OnlineConnectFour = lazy(() => import('./online/ConnectFour'))
const OnlineRps = lazy(() => import('./online/OnlineRps'))
const OnlineReaction = lazy(() => import('./online/OnlineReaction'))
const OnlineMemory = lazy(() => import('./online/OnlineMemory'))
const OnlineTrivia = lazy(() => import('./online/OnlineTrivia'))
const ShakhbataLocal = lazy(() => import('./shakhbata/ShakhbataLocal'))
const OnlineShakhbata = lazy(() => import('./online/Shakhbata'))
const BankEl7azLocal = lazy(() => import('./bankel7az/BankEl7azLocal'))
const OnlineBankEl7az = lazy(() => import('./online/bankel7az/App'))

export interface GameProps {
  config: GameConfig
  onFinish: (result: GameResult) => void
  onExit?: () => void
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
  singlePlayer?: boolean
  difficulties?: boolean
  online?: boolean
  /** Public drop-in arena; it does not use private rooms or two-player quick matching. */
  publicArena?: boolean
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
      'أونلاين: طابق زوجًا لتحتفظ بالدور، والخطأ ينقل الدور للخصم',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    singlePlayer: true,
    online: true,
    onlineComponent: OnlineMemory,
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
      'أونلاين: إذا أجبتما بشكل صحيح، النقطة للأسرع والتوقيت يكسر التعادل',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    singlePlayer: true,
    online: true,
    onlineComponent: OnlineTrivia,
    component: TriviaGame,
  },
  {
    id: 'match3',
    name: 'حلاوة',
    description: 'بدّل الحلويات، اصنع كومبوهات وصواريخ، وكمّل طلب الحلواني قبل ما تخلص الحركات',
    emoji: '🍬',
    category: 'ذكاء',
    howToPlay: [
      'اسحب أي قطعتين متجاورتين لتكوين صف أو عمود من ٣ حلويات متشابهة أو أكثر',
      'اجمع ٤ قطع لصناعة صاروخ، وشكل T أو L لقنبلة سكر، و٥ قطع لدوامة ألوان قوية',
      'في اللعب الفردي: حقق هدف النقاط واجمع طلب الحلواني قبل انتهاء الحركات',
      'أونلاين: تبدأ أنت وخصمك بنفس اللوحة؛ اصنع أعلى نقاط خلال ٧٥ ثانية لتفوز',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    singlePlayer: true,
    difficulties: true,
    online: true,
    onlineComponent: OnlineMatch3,
    component: Match3Game,
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
    singlePlayer: true,
    online: true,
    onlineComponent: OnlineReaction,
    component: ReactionGame,
  },
  {
    id: 'snake',
    name: 'الثعبان',
    description: 'ساحة دائرية ضخمة وسريعة — راقب الخريطة، اجمع الأكل الملون، وتصدر المنافسة',
    emoji: '🐍',
    category: 'سرعة',
    howToPlay: [
      'حط إصبعك في أي مكان داخل الساحة واسحب — الاتجاه يتغير فورًا وإصبعك ما زال على الشاشة',
      'اجمع الأكل الملون لزيادة طولك؛ القطع الأكبر تمنحك نقاطًا أكثر',
      'الساحة دائرة ضخمة لها سور واضح؛ راقب موقعك على الخريطة الصغيرة وابعد عن الحافة',
      'أونلاين: تموت فقط عندما يصطدم رأسك بجسم ثعبان آخر، ويصبح جسم الثعبان المهزوم أكلًا للجميع',
      'الثعبان سريع طول الوقت؛ في اللعب الفردي تجنّب جسمك، وفي الساحة العامة يمكنك عبور جسمك بأمان',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    singlePlayer: true,
    difficulties: true,
    online: true,
    publicArena: true,
    component: SnakeGame,
  },
  {
    id: 'minesweeper',
    name: 'كاسحة الألغام',
    description: 'اكشف المربعات الآمنة واستعمل الأرقام لتحدد أماكن كل الألغام قبل ما تنفجر',
    emoji: '💣',
    category: 'ذكاء',
    howToPlay: [
      'اكشف أي مربع للبدء — أول ضغطة آمنة دائمًا',
      'الرقم يخبرك بعدد الألغام الملامسة للمربع',
      'فعّل وضع العلم وحدد المربعات التي تشك أن بها لغمًا',
      'تكسب عندما تكشف كل المربعات الآمنة من غير لمس لغم',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    singlePlayer: true,
    difficulties: true,
    component: MinesweeperGame,
  },
  // ===== ألعاب الأونلاين =====
  {
    id: 'connect4',
    name: 'أربعة تربح',
    description: 'صفّ أربعة قبل خصمك — ضد الكمبيوتر، على نفس الجهاز، أو أونلاين',
    emoji: '🔴',
    category: 'أونلاين',
    howToPlay: [
      'اضغط على أي عمود لإسقاط قرصك فيه',
      'الأحمر يبدأ أولًا ثم يتناوب اللاعبان؛ اختر كمبيوتر أو نفس الجهاز أو أونلاين',
      'أول من يصفّ أربعة أقراص أفقيًا أو عموديًا أو قطريًا يفوز',
    ],
    supportsBot: true,
    supportsTwoPlayer: true,
    difficulties: true,
    online: true,
    onlineComponent: OnlineConnectFour,
    component: ConnectFourLocal,
  },
  {
    id: 'shakhbata',
    name: 'شخبطة',
    description: 'ارسم وخمّن على نفس الجهاز أو مع أصدقائك أونلاين — حتى ٨ لاعبين',
    emoji: '🎨',
    category: 'أونلاين',
    howToPlay: [
      'محليًا: اختاروا الكلمة بسرية ومرّروا الجهاز بين الرسام والمخمّن',
      'أونلاين: كل لاعب يرسم مرة واحدة في المباراة',
      'الرسام يختار كلمة من ٣ خيارات ويرسمها بدون كتابتها',
      'الباقي يخمّنون في الدردشة — الأسرع يأخذ نقاطًا أكثر',
      'تصلك تلميحات حروف مع مرور الوقت — والرسام يكسب نقاطًا مع كل تخمين صحيح',
    ],
    supportsBot: false,
    supportsTwoPlayer: true,
    online: true,
    onlineComponent: OnlineShakhbata,
    component: ShakhbataLocal,
  },
  {
    id: 'bank-el7az',
    name: 'بنك الحظ',
    description: 'لفّ محافظات مصر واشترِ وابنِ — ضد الكمبيوتر، على نفس الجهاز، أو أونلاين',
    emoji: '🏦',
    category: 'أونلاين',
    howToPlay: [
      'ارمِ الزهر وتحرك حول اللوحة — ٢٧ محافظة في ٩ مجموعات',
      'اشترِ المحافظات وأكمل المجموعة الواحدة لتفتح البناء (حتى ٣ مبانٍ)',
      'اللي يقف على ملكك يدفع إيجار — والمباني ترفع الإيجار',
      'كروت الحظ والضرائب والقسم تقلب الموازين — آخر لاعب واقف يكسب',
    ],
    supportsBot: true,
    supportsTwoPlayer: true,
    difficulties: true,
    online: true,
    onlineComponent: OnlineBankEl7az,
    component: BankEl7azLocal,
  },
]

export function getGame(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id)
}

export const ONLINE_GAMES = GAMES.filter((g) => g.online && !g.publicArena)

export const CATEGORIES: Array<'الكل' | GameCategory> = ['الكل', 'أونلاين', 'ذكاء', 'ذاكرة', 'معلومات', 'سرعة']
