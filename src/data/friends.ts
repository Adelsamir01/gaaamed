import type { Presence, ServerFriend } from '@/types'

export const statusLabel: Record<Presence, string> = {
  online: 'متصل',
  playing: 'يلعب الآن',
  offline: 'غير متصل',
}

export function friendStatusLabel(friend: Pick<ServerFriend, 'presence' | 'activeGame'>): string {
  if (friend.presence === 'playing' && friend.activeGame) {
    return `${friend.activeGame.emoji} بيلعب ${friend.activeGame.name}`
  }
  return statusLabel[friend.presence]
}

export const AVATAR_OPTIONS = [
  '😎', '🦊', '🐼', '🦁', '🐸', '🦄', '🐯', '🦉',
  '🐺', '🦋', '🌙', '⭐', '🔥', '⚡', '🌸', '🍉',
  '🎮', '🚀', '🎧', '🏆', '🐬', '🦅', '🌺', '🐎',
  '🤖', '👾', '🐱', '🐶', '🐰', '🐻', '🐨', '🐵',
  '🦖', '🐙', '🦈', '🐳', '🌈', '🍕', '🍩', '⚽',
  '🎲', '🎸', '🛸', '💎',
]
