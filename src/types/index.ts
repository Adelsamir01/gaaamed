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

/** صديق من خادم جااامد (بيانات حقيقية) */
export interface ServerFriend {
  userId: string
  handle: string
  name: string
  avatar: string
  presence: Presence
}

export interface PublicUserCard {
  userId: string
  handle: string
  name: string
  avatar: string
}

export interface GameInvite {
  gameId: string
  roomCode: string
  gameName: string
  gameEmoji: string
}

export interface ServerChatMessage {
  id: string
  senderId: string
  senderName: string
  senderAvatar: string
  text: string
  kind: 'text' | 'game_invite'
  invite?: GameInvite | null
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
  mode: 'bot' | 'twoPlayer'
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
