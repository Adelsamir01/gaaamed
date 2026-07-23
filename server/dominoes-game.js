function otherSlot(slot) {
  return slot === 1 ? 2 : 1
}

function pipTotal(tiles) {
  return tiles.reduce((total, tile) => total + tile.a + tile.b, 0)
}

export function createDominoSet(maxPip = 6) {
  const tiles = []
  for (let a = 0; a <= maxPip; a += 1) {
    for (let b = a; b <= maxPip; b += 1) tiles.push({ id: `${a}-${b}`, a, b })
  }
  return tiles
}

export function shuffleDominoes(tiles, random = Math.random) {
  const shuffled = tiles.map((tile) => ({ ...tile }))
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }
  return shuffled
}

function openingRank(tile) {
  return (tile.a === tile.b ? 1_000 : 0) + (tile.a + tile.b) * 10 + Math.max(tile.a, tile.b)
}

function boardEnds(game) {
  return {
    left: game.board[0]?.left ?? -1,
    right: game.board.at(-1)?.right ?? -1,
  }
}

function legalSides(game, tile) {
  const ends = boardEnds(game)
  const sides = []
  if (tile.a === ends.left || tile.b === ends.left) sides.push('left')
  if (tile.a === ends.right || tile.b === ends.right) sides.push('right')
  return sides
}

function hasMove(game, slot) {
  return game.hands[slot].some((tile) => legalSides(game, tile).length > 0)
}

function orientTile(tile, side, matchingValue, slot) {
  if (side === 'left') {
    return tile.a === matchingValue
      ? { ...tile, left: tile.b, right: tile.a, playedBy: slot }
      : { ...tile, left: tile.a, right: tile.b, playedBy: slot }
  }
  return tile.a === matchingValue
    ? { ...tile, left: tile.a, right: tile.b, playedBy: slot }
    : { ...tile, left: tile.b, right: tile.a, playedBy: slot }
}

export function createDominoGame(random = Math.random) {
  const deck = shuffleDominoes(createDominoSet(), random)
  const hands = {
    1: deck.slice(0, 7),
    2: deck.slice(7, 14),
  }
  let openingSlot = 1
  let opening = hands[1][0]
  for (const slot of [1, 2]) {
    for (const tile of hands[slot]) {
      if (openingRank(tile) > openingRank(opening)) {
        openingSlot = slot
        opening = tile
      }
    }
  }
  hands[openingSlot] = hands[openingSlot].filter((tile) => tile.id !== opening.id)

  return {
    hands,
    boneyard: deck.slice(14),
    board: [{ ...opening, left: opening.a, right: opening.b, playedBy: openingSlot }],
    currentSlot: otherSlot(openingSlot),
    ended: false,
    winnerSlot: null,
    reason: null,
    points: 0,
    consecutivePasses: 0,
    turn: 1,
    lastAction: { kind: 'opening', slot: openingSlot, tileId: opening.id },
  }
}

export function dominoSnapshot(game, viewerSlot) {
  return {
    board: game.board.map((tile) => ({ ...tile })),
    hand: game.hands[viewerSlot].map((tile) => ({ ...tile })),
    handCounts: { 1: game.hands[1].length, 2: game.hands[2].length },
    boneyardCount: game.boneyard.length,
    currentSlot: game.currentSlot,
    ended: game.ended,
    winnerSlot: game.winnerSlot,
    reason: game.reason,
    points: game.points,
    consecutivePasses: game.consecutivePasses,
    turn: game.turn,
    lastAction: { ...game.lastAction },
  }
}

export function playDomino(game, slot, tileId, side) {
  if (game.ended) return { accepted: false, reason: 'ended' }
  if (game.currentSlot !== slot) return { accepted: false, reason: 'not_your_turn' }
  if (side !== 'left' && side !== 'right') return { accepted: false, reason: 'invalid_side' }
  const tile = game.hands[slot].find((candidate) => candidate.id === tileId)
  if (!tile) return { accepted: false, reason: 'invalid_tile' }
  if (!legalSides(game, tile).includes(side)) return { accepted: false, reason: 'illegal_move' }

  const ends = boardEnds(game)
  const placed = orientTile(tile, side, side === 'left' ? ends.left : ends.right, slot)
  game.hands[slot] = game.hands[slot].filter((candidate) => candidate.id !== tile.id)
  if (side === 'left') game.board.unshift(placed)
  else game.board.push(placed)
  game.consecutivePasses = 0
  game.turn += 1
  game.lastAction = { kind: 'play', slot, tileId: tile.id, side }

  if (game.hands[slot].length === 0) {
    game.ended = true
    game.winnerSlot = slot
    game.reason = 'empty-hand'
    game.points = pipTotal(game.hands[otherSlot(slot)])
  } else {
    game.currentSlot = otherSlot(slot)
  }
  return { accepted: true, ended: game.ended }
}

export function drawDomino(game, slot) {
  if (game.ended) return { accepted: false, reason: 'ended' }
  if (game.currentSlot !== slot) return { accepted: false, reason: 'not_your_turn' }
  if (hasMove(game, slot)) return { accepted: false, reason: 'has_move' }
  const tile = game.boneyard.shift()
  if (!tile) return { accepted: false, reason: 'empty_boneyard' }
  game.hands[slot].push(tile)
  game.lastAction = { kind: 'draw', slot, tileId: tile.id }
  return { accepted: true, playable: legalSides(game, tile).length > 0 }
}

export function passDomino(game, slot) {
  if (game.ended) return { accepted: false, reason: 'ended' }
  if (game.currentSlot !== slot) return { accepted: false, reason: 'not_your_turn' }
  if (hasMove(game, slot)) return { accepted: false, reason: 'has_move' }
  if (game.boneyard.length > 0) return { accepted: false, reason: 'must_draw' }

  game.consecutivePasses += 1
  game.turn += 1
  game.lastAction = { kind: 'pass', slot }
  if (game.consecutivePasses >= 2) {
    const totals = { 1: pipTotal(game.hands[1]), 2: pipTotal(game.hands[2]) }
    game.ended = true
    game.winnerSlot = totals[1] === totals[2] ? 0 : totals[1] < totals[2] ? 1 : 2
    game.reason = 'blocked'
    game.points = Math.abs(totals[1] - totals[2])
  } else {
    game.currentSlot = otherSlot(slot)
  }
  return { accepted: true, ended: game.ended }
}
