export const MATCH3_SIZE: 8
export const MATCH3_TYPES: 6

export type Match3Special = 'none' | 'row' | 'col' | 'bomb' | 'rainbow'

export interface Match3Cell {
  id: number
  type: number
  special: Match3Special
}

export interface Match3State {
  board: Array<Match3Cell | null>
  score: number
  movesRemaining: number | null
  collected: number[]
  totalCleared: number
  nextId: number
  rngState: number
}

export interface Match3Group {
  orientation: 'row' | 'col'
  indices: number[]
}

export interface Match3SwapResult {
  accepted: boolean
  state: Match3State
  scoreDelta: number
  cleared: number
  cascades: number
  createdSpecial: Match3Special | null
  reshuffled: boolean
  frames?: Match3AnimationFrame[]
}

export type Match3AnimationPhase = 'swap' | 'clear' | 'burst' | 'fall' | 'shuffle'

export interface Match3AnimationFrame {
  phase: Match3AnimationPhase
  state: Match3State
  cleared: number[]
  cascade: number
  scoreDelta: number
}

export function createMatch3Game(seed?: number, options?: { moves?: number | null }): Match3State
export function findMatch3Groups(board: Array<Match3Cell | null>): Match3Group[]
export function findMatch3Move(board: Array<Match3Cell | null>): [number, number] | null
export function applyMatch3Swap(state: Match3State, first: number, second: number): Match3SwapResult
