export interface SnakePoint {
  x: number
  y: number
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

function sampleTrail(points: SnakePoint[], distanceFromHead: number): SnakePoint {
  if (points.length === 0) return { x: 0, y: 0 }
  let travelled = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y)
    if (travelled + segmentLength >= distanceFromHead) {
      const ratio = segmentLength > 0 ? (distanceFromHead - travelled) / segmentLength : 0
      return {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      }
    }
    travelled += segmentLength
  }
  return { ...points.at(-1)! }
}

export function reconcileTrail(current: SnakePoint[], target: SnakePoint[], factor: number): SnakePoint[] {
  if (current.length === 0) return target.map((point) => ({ ...point }))
  if (target.length === 0) return current
  const safeFactor = clamp(factor, 0, 1)
  const reconciled: SnakePoint[] = []
  let distanceFromHead = 0

  for (let index = 0; index < current.length; index += 1) {
    if (index > 0) {
      distanceFromHead += Math.hypot(
        current[index].x - current[index - 1].x,
        current[index].y - current[index - 1].y,
      )
    }
    const targetPoint = sampleTrail(target, distanceFromHead)
    reconciled.push({
      x: current[index].x + (targetPoint.x - current[index].x) * safeFactor,
      y: current[index].y + (targetPoint.y - current[index].y) * safeFactor,
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
