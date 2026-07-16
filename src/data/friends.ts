import type { Presence } from '@/types'

export const statusLabel: Record<Presence, string> = {
  online: 'متصل',
  playing: 'يلعب الآن',
  offline: 'غير متصل',
}

export const AVATAR_OPTIONS = [
  '😎', '🦊', '🐼', '🦁', '🐸', '🦄', '🐯', '🦉',
  '🐺', '🦋', '🌙', '⭐', '🔥', '⚡', '🌸', '🍉',
  '🎮', '🚀', '🎧', '🏆', '🐬', '🦅', '🌺', '🐎',
]
