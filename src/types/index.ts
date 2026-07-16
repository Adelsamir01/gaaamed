export interface Profile {
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

export type FriendStatus = 'online' | 'playing' | 'offline'

export interface Friend {
  id: string
  name: string
  avatar: string
  xp: number
  status: FriendStatus
  playingGame?: string
}

export interface ChatMessage {
  id: string
  senderId: string // 'me' أو معرف صديق/بوت
  senderName: string
  senderAvatar: string
  text: string
  time: number
}

export interface ChatThread {
  id: string
  name: string
  avatar: string
  members: number
  messages: ChatMessage[]
  unread: number
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
