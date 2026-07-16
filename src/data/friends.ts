import type { Friend, FriendStatus } from '@/types'

export const FRIENDS_SEED: Friend[] = [
  { id: 'f1', name: 'سارة', avatar: '🦋', xp: 1240, status: 'online' },
  { id: 'f2', name: 'محمد', avatar: '🦁', xp: 2310, status: 'playing', playingGame: 'إكس أو' },
  { id: 'f3', name: 'فاطمة', avatar: '🌸', xp: 860, status: 'offline' },
  { id: 'f4', name: 'خالد', avatar: '🦅', xp: 1575, status: 'online' },
  { id: 'f5', name: 'نورة', avatar: '🌙', xp: 640, status: 'playing', playingGame: 'لعبة الذاكرة' },
  { id: 'f6', name: 'عمر', avatar: '🐺', xp: 1920, status: 'offline' },
  { id: 'f7', name: 'ليلى', avatar: '🦚', xp: 430, status: 'online' },
  { id: 'f8', name: 'يوسف', avatar: '🐬', xp: 1105, status: 'offline' },
  { id: 'f9', name: 'ريم', avatar: '🌺', xp: 980, status: 'online' },
  { id: 'f10', name: 'أحمد', avatar: '🐯', xp: 2780, status: 'playing', playingGame: 'أسئلة ثقافية' },
]

export const statusLabel: Record<FriendStatus, string> = {
  online: 'متصل',
  playing: 'يلعب الآن',
  offline: 'غير متصل',
}

export const AVATAR_OPTIONS = [
  '😎', '🦊', '🐼', '🦁', '🐸', '🦄', '🐯', '🦉',
  '🐺', '🦋', '🌙', '⭐', '🔥', '⚡', '🌸', '🍉',
  '🎮', '🚀', '🎧', '🏆', '🐬', '🦅', '🌺', '🐎',
]
