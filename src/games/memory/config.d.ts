import type { Difficulty } from '@/types'

export interface MemoryLevel {
  difficulty: Difficulty
  pairs: number
  columns: number
  label: string
  boardLabel: string
}

export const MEMORY_EMOJIS: readonly string[]
export const MEMORY_LEVELS: Readonly<Record<Difficulty, MemoryLevel>>
export function normalizeMemoryDifficulty(value: unknown): Difficulty
export function memoryLevel(value: unknown): MemoryLevel
export function buildMemoryDeck(value: unknown, random?: () => number): number[]
