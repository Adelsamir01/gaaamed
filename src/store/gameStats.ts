import type { GameResult, GameStats } from '@/types'

export type GameStatsMap = Record<string, GameStats>

/** Records a session as soon as the player enters the offline game. */
export function recordGameStarted(stats: GameStatsMap, gameId: string): GameStatsMap {
  const previous = stats[gameId] ?? { played: 0, won: 0 }
  return {
    ...stats,
    [gameId]: { ...previous, played: previous.played + 1 },
  }
}

/**
 * Applies the result rewards to game statistics. Online games are counted here
 * when they finish; offline games pass `countAsPlayed: false` because their
 * session was already counted on entry.
 */
export function recordGameResult(
  stats: GameStatsMap,
  result: GameResult,
  { countAsPlayed = true }: { countAsPlayed?: boolean } = {},
): GameStatsMap {
  const previous = stats[result.gameId] ?? { played: 0, won: 0 }
  let bestScore = previous.bestScore

  if (result.bestCandidate !== undefined) {
    if (bestScore === undefined) bestScore = result.bestCandidate
    else if (result.lowerIsBetter) bestScore = Math.min(bestScore, result.bestCandidate)
    else bestScore = Math.max(bestScore, result.bestCandidate)
  }

  return {
    ...stats,
    [result.gameId]: {
      played: previous.played + (countAsPlayed ? 1 : 0),
      won: previous.won + (result.outcome === 'win' ? 1 : 0),
      bestScore,
    },
  }
}
