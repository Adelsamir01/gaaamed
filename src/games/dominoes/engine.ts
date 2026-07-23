import type { Difficulty } from '@/types'

export type DominoPlayer = 0 | 1
export type DominoSide = 'left' | 'right'
export type DominoEndReason = 'empty-hand' | 'blocked' | null

export interface DominoTile {
  id: string
  a: number
  b: number
}

export interface PlacedDomino extends DominoTile {
  left: number
  right: number
  playedBy: DominoPlayer
}

export interface DominoState {
  hands: [DominoTile[], DominoTile[]]
  boneyard: DominoTile[]
  board: PlacedDomino[]
  currentPlayer: DominoPlayer
  status: 'playing' | 'ended'
  winner: DominoPlayer | null
  endReason: DominoEndReason
  points: number
  consecutivePasses: number
  turn: number
  lastAction: {
    kind: 'opening' | 'play' | 'draw' | 'pass'
    player: DominoPlayer
    tileId?: string
  }
}

export interface DominoActionResult {
  accepted: boolean
  state: DominoState
  reason?: 'ended' | 'turn' | 'tile' | 'side' | 'has-move' | 'boneyard'
}

export interface DominoMove {
  tile: DominoTile
  side: DominoSide
}

function otherPlayer(player: DominoPlayer): DominoPlayer {
  return player === 0 ? 1 : 0
}

function pipTotal(tiles: DominoTile[]): number {
  return tiles.reduce((total, tile) => total + tile.a + tile.b, 0)
}

export function createDominoSet(maxPip = 6): DominoTile[] {
  const tiles: DominoTile[] = []
  for (let a = 0; a <= maxPip; a += 1) {
    for (let b = a; b <= maxPip; b += 1) {
      tiles.push({ id: `${a}-${b}`, a, b })
    }
  }
  return tiles
}

export function shuffleDominoes(
  tiles: DominoTile[],
  random: () => number = Math.random,
): DominoTile[] {
  const shuffled = tiles.map((tile) => ({ ...tile }))
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }
  return shuffled
}

function openingRank(tile: DominoTile): number {
  return (tile.a === tile.b ? 1_000 : 0) + (tile.a + tile.b) * 10 + Math.max(tile.a, tile.b)
}

function chooseOpening(hands: [DominoTile[], DominoTile[]]): { player: DominoPlayer; tile: DominoTile } {
  let best = { player: 0 as DominoPlayer, tile: hands[0][0] }
  for (const player of [0, 1] as const) {
    for (const tile of hands[player]) {
      if (openingRank(tile) > openingRank(best.tile)) best = { player, tile }
    }
  }
  return best
}

export function createDominoGame(random: () => number = Math.random): DominoState {
  const deck = shuffleDominoes(createDominoSet(), random)
  const hands: [DominoTile[], DominoTile[]] = [
    deck.slice(0, 7),
    deck.slice(7, 14),
  ]
  const boneyard = deck.slice(14)
  const opening = chooseOpening(hands)
  hands[opening.player] = hands[opening.player].filter((tile) => tile.id !== opening.tile.id)

  return {
    hands,
    boneyard,
    board: [{
      ...opening.tile,
      left: opening.tile.a,
      right: opening.tile.b,
      playedBy: opening.player,
    }],
    currentPlayer: otherPlayer(opening.player),
    status: 'playing',
    winner: null,
    endReason: null,
    points: 0,
    consecutivePasses: 0,
    turn: 1,
    lastAction: { kind: 'opening', player: opening.player, tileId: opening.tile.id },
  }
}

export function boardEnds(state: DominoState): { left: number; right: number } {
  const first = state.board[0]
  const last = state.board.at(-1)
  return {
    left: first?.left ?? -1,
    right: last?.right ?? -1,
  }
}

export function legalSides(state: DominoState, tile: DominoTile): DominoSide[] {
  if (state.board.length === 0) return ['left', 'right']
  const ends = boardEnds(state)
  const sides: DominoSide[] = []
  if (tile.a === ends.left || tile.b === ends.left) sides.push('left')
  if (tile.a === ends.right || tile.b === ends.right) sides.push('right')
  return sides
}

export function legalMoves(state: DominoState, player: DominoPlayer): DominoMove[] {
  return state.hands[player].flatMap((tile) => (
    legalSides(state, tile).map((side) => ({ tile, side }))
  ))
}

function orientTile(
  tile: DominoTile,
  side: DominoSide,
  matchingValue: number,
  player: DominoPlayer,
): PlacedDomino {
  if (side === 'left') {
    return tile.a === matchingValue
      ? { ...tile, left: tile.b, right: tile.a, playedBy: player }
      : { ...tile, left: tile.a, right: tile.b, playedBy: player }
  }
  return tile.a === matchingValue
    ? { ...tile, left: tile.a, right: tile.b, playedBy: player }
    : { ...tile, left: tile.b, right: tile.a, playedBy: player }
}

export function playDomino(
  state: DominoState,
  player: DominoPlayer,
  tileId: string,
  side: DominoSide,
): DominoActionResult {
  if (state.status !== 'playing') return { accepted: false, state, reason: 'ended' }
  if (state.currentPlayer !== player) return { accepted: false, state, reason: 'turn' }
  const tile = state.hands[player].find((candidate) => candidate.id === tileId)
  if (!tile) return { accepted: false, state, reason: 'tile' }
  if (!legalSides(state, tile).includes(side)) return { accepted: false, state, reason: 'side' }

  const ends = boardEnds(state)
  const placed = orientTile(tile, side, side === 'left' ? ends.left : ends.right, player)
  const hands: [DominoTile[], DominoTile[]] = [
    state.hands[0].filter((candidate) => candidate.id !== tileId),
    state.hands[1].filter((candidate) => candidate.id !== tileId),
  ]
  const board = side === 'left'
    ? [placed, ...state.board]
    : [...state.board, placed]

  if (hands[player].length === 0) {
    return {
      accepted: true,
      state: {
        ...state,
        hands,
        board,
        status: 'ended',
        winner: player,
        endReason: 'empty-hand',
        points: pipTotal(hands[otherPlayer(player)]),
        consecutivePasses: 0,
        turn: state.turn + 1,
        lastAction: { kind: 'play', player, tileId },
      },
    }
  }

  return {
    accepted: true,
    state: {
      ...state,
      hands,
      board,
      currentPlayer: otherPlayer(player),
      consecutivePasses: 0,
      turn: state.turn + 1,
      lastAction: { kind: 'play', player, tileId },
    },
  }
}

export function drawDomino(state: DominoState, player: DominoPlayer): DominoActionResult {
  if (state.status !== 'playing') return { accepted: false, state, reason: 'ended' }
  if (state.currentPlayer !== player) return { accepted: false, state, reason: 'turn' }
  if (legalMoves(state, player).length > 0) return { accepted: false, state, reason: 'has-move' }
  const tile = state.boneyard[0]
  if (!tile) return { accepted: false, state, reason: 'boneyard' }

  const hands: [DominoTile[], DominoTile[]] = [
    [...state.hands[0]],
    [...state.hands[1]],
  ]
  hands[player].push(tile)
  return {
    accepted: true,
    state: {
      ...state,
      hands,
      boneyard: state.boneyard.slice(1),
      lastAction: { kind: 'draw', player, tileId: tile.id },
    },
  }
}

export function passDomino(state: DominoState, player: DominoPlayer): DominoActionResult {
  if (state.status !== 'playing') return { accepted: false, state, reason: 'ended' }
  if (state.currentPlayer !== player) return { accepted: false, state, reason: 'turn' }
  if (legalMoves(state, player).length > 0) return { accepted: false, state, reason: 'has-move' }
  if (state.boneyard.length > 0) return { accepted: false, state, reason: 'boneyard' }

  const consecutivePasses = state.consecutivePasses + 1
  if (consecutivePasses >= 2) {
    const totals = [pipTotal(state.hands[0]), pipTotal(state.hands[1])]
    const winner: DominoPlayer | null = totals[0] === totals[1] ? null : totals[0] < totals[1] ? 0 : 1
    return {
      accepted: true,
      state: {
        ...state,
        status: 'ended',
        winner,
        endReason: 'blocked',
        points: Math.abs(totals[0] - totals[1]),
        consecutivePasses,
        turn: state.turn + 1,
        lastAction: { kind: 'pass', player },
      },
    }
  }

  return {
    accepted: true,
    state: {
      ...state,
      currentPlayer: otherPlayer(player),
      consecutivePasses,
      turn: state.turn + 1,
      lastAction: { kind: 'pass', player },
    },
  }
}

function botMoveScore(
  state: DominoState,
  player: DominoPlayer,
  move: DominoMove,
  difficulty: Difficulty,
): number {
  if (difficulty === 'easy') return 0
  const tile = move.tile
  const ends = boardEnds(state)
  const matching = move.side === 'left' ? ends.left : ends.right
  const nextValue = tile.a === matching ? tile.b : tile.a
  const remaining = state.hands[player].filter((candidate) => candidate.id !== tile.id)
  const followUps = remaining.filter((candidate) => candidate.a === nextValue || candidate.b === nextValue).length
  const base = tile.a + tile.b + (tile.a === tile.b ? 3 : 0)
  if (difficulty === 'medium') return base

  const flexibleTiles = remaining.filter((candidate) => (
    candidate.a === nextValue
    || candidate.b === nextValue
    || candidate.a === (move.side === 'left' ? ends.right : ends.left)
    || candidate.b === (move.side === 'left' ? ends.right : ends.left)
  )).length
  return base * 1.7 + followUps * 5 + flexibleTiles * 1.5
}

export function chooseBotMove(
  state: DominoState,
  player: DominoPlayer,
  difficulty: Difficulty,
  random: () => number = Math.random,
): DominoMove | null {
  const moves = legalMoves(state, player)
  if (moves.length === 0) return null
  if (difficulty === 'easy') {
    return moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))]
  }
  return [...moves].sort((first, second) => (
    botMoveScore(state, player, second, difficulty)
    - botMoveScore(state, player, first, difficulty)
    || first.tile.id.localeCompare(second.tile.id)
    || first.side.localeCompare(second.side)
  ))[0]
}

export function takeBotTurn(
  state: DominoState,
  player: DominoPlayer,
  difficulty: Difficulty,
  random: () => number = Math.random,
): DominoState {
  let next = state
  while (next.status === 'playing' && next.currentPlayer === player) {
    const move = chooseBotMove(next, player, difficulty, random)
    if (move) return playDomino(next, player, move.tile.id, move.side).state
    if (next.boneyard.length > 0) {
      next = drawDomino(next, player).state
      continue
    }
    return passDomino(next, player).state
  }
  return next
}

export function handPipTotal(state: DominoState, player: DominoPlayer): number {
  return pipTotal(state.hands[player])
}
