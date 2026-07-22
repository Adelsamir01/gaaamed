export interface SnakePoint {
  x: number
  y: number
}

export function mergeFoodSnapshot<T extends { id: number }>(
  current: T[],
  full: T[] | undefined,
  upserts: T[] = [],
  removedIds: number[] = [],
): T[] {
  if (full) return full
  if (upserts.length === 0 && removedIds.length === 0) return current
  const byId = new Map(current.map((food) => [food.id, food]))
  for (const foodId of removedIds) byId.delete(foodId)
  for (const food of upserts) byId.set(food.id, food)
  return [...byId.values()]
}

const START_LENGTH = 128
const BASE_BODY_RADIUS = 8.5

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function angleDifference(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export function trailLength(points: SnakePoint[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
  }
  return total
}

export function trimTrail(points: SnakePoint[], maximumLength: number): SnakePoint[] {
  if (points.length < 2) return points
  const trimmed = [points[0]]
  let travelled = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y)
    if (travelled + segmentLength >= maximumLength) {
      const remaining = maximumLength - travelled
      const ratio = segmentLength > 0 ? remaining / segmentLength : 0
      trimmed.push({
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      })
      break
    }
    travelled += segmentLength
    trimmed.push(current)
  }

  return trimmed
}

export function advanceTrail(points: SnakePoint[], angle: number, distance: number, maximumLength: number): SnakePoint[] {
  const head = points[0]
  if (!head || distance <= 0) return points.map((point) => ({ ...point }))
  return trimTrail([{
    x: head.x + Math.cos(angle) * distance,
    y: head.y + Math.sin(angle) * distance,
  }, ...points], maximumLength)
}

export function reconcileTrail(current: SnakePoint[], target: SnakePoint[], factor: number): SnakePoint[] {
  if (current.length === 0) return target.map((point) => ({ ...point }))
  if (target.length === 0) return current
  const safeFactor = clamp(factor, 0, 1)
  const reconciled: SnakePoint[] = []
  let currentDistance = 0
  let targetIndex = 1
  let targetSegmentStart = 0
  let targetSegmentLength = target.length > 1
    ? Math.hypot(target[1].x - target[0].x, target[1].y - target[0].y)
    : 0

  for (let index = 0; index < current.length; index += 1) {
    if (index > 0) {
      currentDistance += Math.hypot(
        current[index].x - current[index - 1].x,
        current[index].y - current[index - 1].y,
      )
    }

    // Both distances only move from head to tail. Keeping the target cursor
    // here makes reconciliation O(current + target), instead of rescanning the
    // complete target trail for every body point.
    while (targetIndex < target.length && targetSegmentStart + targetSegmentLength < currentDistance) {
      targetSegmentStart += targetSegmentLength
      targetIndex += 1
      if (targetIndex < target.length) {
        targetSegmentLength = Math.hypot(
          target[targetIndex].x - target[targetIndex - 1].x,
          target[targetIndex].y - target[targetIndex - 1].y,
        )
      }
    }

    let targetX: number
    let targetY: number
    if (targetIndex >= target.length) {
      const tail = target[target.length - 1]
      targetX = tail.x
      targetY = tail.y
    } else {
      const previous = target[targetIndex - 1]
      const next = target[targetIndex]
      const ratio = targetSegmentLength > 0
        ? clamp((currentDistance - targetSegmentStart) / targetSegmentLength, 0, 1)
        : 0
      targetX = previous.x + (next.x - previous.x) * ratio
      targetY = previous.y + (next.y - previous.y) * ratio
    }
    reconciled.push({
      x: current[index].x + (targetX - current[index].x) * safeFactor,
      y: current[index].y + (targetY - current[index].y) * safeFactor,
    })
  }

  return reconciled
}

export function bodyRadiusForLength(length: number): number {
  const growth = Math.max(0, Number(length) - START_LENGTH)
  return BASE_BODY_RADIUS + Math.min(10.5, Math.sqrt(growth) * 0.32)
}

export function headRadiusForLength(length: number): number {
  return bodyRadiusForLength(length) + 2.5
}

export function cameraZoomForLength(length: number): number {
  const growth = Math.max(0, Number(length) - START_LENGTH)
  return clamp(1 / (1 + Math.sqrt(growth) * 0.018), 0.62, 1)
}
