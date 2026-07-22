import type { Presence, Profile, ServerFriend } from '@/types'

export interface LeaderboardEntry {
  userId: string
  handle?: string
  name: string
  avatar: string
  points: number
  presence?: Presence
  isMe: boolean
}

function safePoints(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0
}

/** Builds the friends leaderboard using the exact XP value shown in each row. */
export function buildLeaderboard(profile: Profile, friends: ServerFriend[]): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [
    {
      userId: profile.userId ?? 'current-player',
      handle: profile.handle,
      name: profile.name,
      avatar: profile.avatar,
      points: safePoints(profile.xp),
      isMe: true,
    },
    ...friends.map((friend) => ({
      userId: friend.userId,
      handle: friend.handle,
      name: friend.name,
      avatar: friend.avatar,
      points: safePoints(friend.xp),
      presence: friend.presence,
      isMe: false,
    })),
  ]

  return entries.sort((first, second) => {
    if (second.points !== first.points) return second.points - first.points
    if (first.isMe !== second.isMe) return first.isMe ? -1 : 1
    return first.name.localeCompare(second.name, 'ar')
  })
}
