import type { ComponentType } from 'react'
import type { GameCategory, GameConfig, GameResult } from '@/types'
import TicTacToe from './tictactoe/TicTacToe'
import MemoryGame from './memory/MemoryGame'
import TriviaGame from './trivia/TriviaGame'
import RpsGame from './rps/RpsGame'
import ReactionGame from './reaction/ReactionGame'
import OnlineTicTacToe from './online/OnlineTicTacToe'
import ConnectFour from './online/ConnectFour'
import OnlineRps from './online/OnlineRps'
import OnlineReaction from './online/OnlineReaction'
import Shakhbata from './online/Shakhbata'

export interface GameProps {
  config: GameConfig
  onFinish: (result: GameResult) => void
}

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
  component: ComponentType<GameProps>
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
    component: ReactionGame,
  },
  // ===== ألعاب الأونلاين =====
  {
    id: 'tictactoe-online',
    name: 'إكس أو أونلاين',
    description: 'تحدَّ صديقًا على جهاز آخر عبر الشبكة — من يصفّ الثلاثة أولًا؟',
    emoji: '🌐',
    category: 'أونلاين',
    howToPlay: [
      'أنشئ غرفة وشارك الرمز مع صديقك، أو انضم برمز غرفته',
      'صاحب الغرفة يلعب ✕ ويبدأ أولًا',
      'أول من يصفّ ثلاثة رموز متطابقة يفوز بالمباراة',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    online: true,
    component: OnlineTicTacToe,
  },
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
    id: 'rps-online',
    name: 'حجر ورقة مقص أونلاين',
    description: 'التحدي الكلاسيكي وجهًا لوجه ضد صديق — الأفضل من ٥ جولات',
    emoji: '🪨',
    category: 'أونلاين',
    howToPlay: [
      'اختر حجر أو ورقة أو مقص — اختيارك يبقى سرًا',
      'يكشف الخادم الاختيارين معًا في نفس اللحظة',
      'أول من يفوز بثلاث جولات يفوز بالمباراة',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    online: true,
    component: OnlineRps,
  },
  {
    id: 'reaction-online',
    name: 'سباق البرق',
    description: 'من يضغط أولًا بعد الإشارة؟ سباق ردة فعل مباشر — الأول إلى ٣',
    emoji: '⚡',
    category: 'أونلاين',
    howToPlay: [
      'انتظرا إشارة "اضغط الآن!" معًا في نفس الوقت',
      'أسرع لاعب يضغط يفوز بالجولة — الضغط المبكر خطأ!',
      'الخادم يحسم الفائز — أول ٣ جولات تكسب المباراة',
    ],
    supportsBot: false,
    supportsTwoPlayer: false,
    online: true,
    component: OnlineReaction,
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
]

export function getGame(id: string): GameDef | undefined {
  return GAMES.find((g) => g.id === id)
}

export const ONLINE_GAMES = GAMES.filter((g) => g.online)

export const CATEGORIES: Array<'الكل' | GameCategory> = ['الكل', 'أونلاين', 'ذكاء', 'ذاكرة', 'معلومات', 'سرعة']
