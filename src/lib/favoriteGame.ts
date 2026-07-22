import type { GameStats } from '@/types'

export const FAVORITE_GAME_PLAY_THRESHOLD = 10

interface GameCandidate {
  id: string
}

/** Pick this player's most-played registered game after the strict play threshold. */
export function selectFavoriteGame<T extends GameCandidate>(
  games: readonly T[],
  stats: Readonly<Record<string, GameStats>>,
): { game: T; played: number } | null {
  let favorite: { game: T; played: number } | null = null

  for (const game of games) {
    const rawPlayed = Number(stats[game.id]?.played)
    const played = Number.isFinite(rawPlayed) ? Math.max(0, Math.floor(rawPlayed)) : 0
    if (played <= FAVORITE_GAME_PLAY_THRESHOLD) continue
    if (!favorite || played > favorite.played) favorite = { game, played }
  }

  return favorite
}
