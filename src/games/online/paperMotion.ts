export interface PaperPoint {
  x: number
  y: number
}

export interface TerritoryPatch {
  revision: number
  owner: number
  ranges: number[]
}

export function angleDifference(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export function predictionTargetAngle(
  authoritativeTarget: number,
  desiredTarget: number,
  acknowledgedSequence: number,
  latestInputSequence: number,
): number {
  return latestInputSequence > acknowledgedSequence ? desiredTarget : authoritativeTarget
}

export function advancePaperPosition(
  point: PaperPoint,
  angle: number,
  targetAngle: number,
  speed: number,
  turnRate: number,
  elapsedSeconds: number,
): PaperPoint & { angle: number } {
  const elapsed = Math.max(0, Math.min(0.1, elapsedSeconds))
  const difference = angleDifference(angle, targetAngle)
  const maximumTurn = turnRate * elapsed
  const nextAngle = angle + Math.max(-maximumTurn, Math.min(maximumTurn, difference))
  return {
    x: point.x + Math.cos(nextAngle) * speed * elapsed,
    y: point.y + Math.sin(nextAngle) * speed * elapsed,
    angle: nextAngle,
  }
}

export function reconcilePaperPosition(current: PaperPoint, authoritative: PaperPoint, factor: number): PaperPoint {
  const amount = Math.max(0, Math.min(1, factor))
  return {
    x: current.x + (authoritative.x - current.x) * amount,
    y: current.y + (authoritative.y - current.y) * amount,
  }
}

export function decodeOwnershipRle(encoded: number[], expectedLength: number): Uint16Array {
  const output = new Uint16Array(Math.max(0, expectedLength))
  let cursor = 0
  for (let index = 0; index + 1 < encoded.length && cursor < output.length; index += 2) {
    const owner = Math.max(0, Math.floor(Number(encoded[index]) || 0))
    const count = Math.max(0, Math.floor(Number(encoded[index + 1]) || 0))
    output.fill(owner, cursor, Math.min(output.length, cursor + count))
    cursor += count
  }
  return output
}

export function applyTerritoryPatches(current: Uint16Array, patches: TerritoryPatch[]): Uint16Array {
  if (patches.length === 0) return current
  const next = current.slice()
  for (const patch of patches) {
    const owner = Math.max(0, Math.floor(Number(patch.owner) || 0))
    for (let index = 0; index + 1 < patch.ranges.length; index += 2) {
      const start = Math.max(0, Math.floor(Number(patch.ranges[index]) || 0))
      const length = Math.max(0, Math.floor(Number(patch.ranges[index + 1]) || 0))
      next.fill(owner, start, Math.min(next.length, start + length))
    }
  }
  return next
}

export function cellIndexAt(point: PaperPoint, gridSize: number, cellSize: number): number {
  const column = Math.floor(point.x / cellSize)
  const row = Math.floor(point.y / cellSize)
  if (column < 0 || row < 0 || column >= gridSize || row >= gridSize) return -1
  return row * gridSize + column
}

export function cellCenter(index: number, gridSize: number, cellSize: number): PaperPoint {
  return {
    x: (index % gridSize + 0.5) * cellSize,
    y: (Math.floor(index / gridSize) + 0.5) * cellSize,
  }
}
