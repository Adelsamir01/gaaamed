export interface Profile {
  userId?: string
  handle?: string
  name: string
  avatar: string
  xp: number
  coins: number
}

export interface GameStats {
  played: number
  won: number
  bestScore?: number
}

export type Presence = 'online' | 'playing' | 'offline'

/** صديق من خادم ديدوس (بيانات حقيقية) */
export interface ServerFriend {
  userId: string
  handle: string
  name: string
  avatar: string
  xp: number
  presence: Presence
  /** The game this friend is currently playing, whether local or online. */
  activeGame?: {
    gameId: string
    name: string
    emoji: string
  } | null
  /** The exact pending chat invitation this friend currently has open. */
  activeInvite?: {
    threadId: string
    messageId: string
    roomCode: string
    gameId: string
  } | null
}

export interface PublicUserCard {
  userId: string
  handle: string
  name: string
  avatar: string
  xp: number
}

export interface GameInvite {
  gameId: string
  roomCode: string
  gameName: string
  gameEmoji: string
  /** إعدادات غرفة الدعوة (عدد الجولات) — تُملأ من الخادم */
  settings?: RoomSettings | null
  /** Persisted final result, replacing the join action after a friend match ends. */
  result?: GameInviteResult | null
}

export type GameInviteResult =
  | {
      kind: 'winner'
      winnerId: string | null
      winnerName: string
      winnerAvatar: string
      completedAt: number
    }
  | {
      kind: 'draw'
      completedAt: number
    }

/** إعدادات غرفة أونلاين — عدد الجولات ومستوى لوحة الألعاب التي تدعمه. */
export interface RoomSettings {
  rounds?: number
  difficulty?: Difficulty
}

/** خيارات الجولات المتاحة في منتقي الإعدادات */
export const ROUND_OPTIONS = [3, 5, 7] as const
export const DEFAULT_ROUNDS = 5

/** الألعاب التي لها مفهوم جولات قابل للاختيار (حجر ورقة مقص / سرعة البرق / شخبطة) */
const ROUNDS_GAMES: ReadonlySet<string> = new Set(['rps', 'reaction', 'shakhbata'])
export function gameUsesRounds(gameId: string | null | undefined): boolean {
  return !!gameId && ROUNDS_GAMES.has(gameId)
}

export interface ServerChatMessage {
  id: string
  senderId: string
  senderName: string
  senderAvatar: string
  text: string
  kind: 'text' | 'game_invite'
  invite?: GameInvite | null
  /** User IDs that currently reacted to this message with a heart. */
  heartUserIds?: string[]
  time: number
}

export interface ServerThread {
  id: string
  kind: 'dm' | 'group'
  name: string
  avatar: string
  memberIds: string[]
  members: number
  lastMessage: ServerChatMessage | null
  unread: number
  updatedAt: number
}

export interface Settings {
  sound: boolean
}

export type GameOutcome = 'win' | 'loss' | 'draw'

export interface GameResult {
  gameId: string
  outcome: GameOutcome
  /** Global winner metadata used to persist results for group friend matches. */
  winnerName?: string
  winnerSlot?: number
  /** نقاط رقمية اختيارية (مثل عدد الإجابات الصحيحة أو زمن رد الفعل) */
  score?: number
  /** أفضل نتيجة للحفظ (زمن أقل أفضل في سرعة البرق) */
  bestCandidate?: number
  /** كلما قل الرقم كان أفضل (للألعاب الزمنية) */
  lowerIsBetter?: boolean
  coinsEarned: number
  xpEarned: number
  /** سطر وصف يظهر في شاشة النتائج */
  summary: string
  detail?: string
}

export type GameCategory = 'ذكاء' | 'ذاكرة' | 'معلومات' | 'سرعة' | 'أونلاين'

export type Difficulty = 'easy' | 'medium' | 'hard'

export interface GameConfig {
  mode: 'solo' | 'bot' | 'twoPlayer'
  difficulty: Difficulty
}

export interface TriviaQuestion {
  q: string
  options: string[]
  correct: number
}

export const XP_PER_LEVEL = 100

export function levelFromXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function xpProgress(xp: number): number {
  return xp % XP_PER_LEVEL
}
