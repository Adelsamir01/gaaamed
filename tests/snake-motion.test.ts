import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceTrail,
  bodyRadiusForLength,
  cameraZoomForLength,
  headRadiusForLength,
  reconcileTrail,
  trailLength,
} from '../src/games/online/snakeMotion.ts'

test('advancing a snake moves the head continuously while preserving body length', () => {
  const trail = [
    { x: 100, y: 100 },
    { x: 50, y: 100 },
    { x: 0, y: 100 },
  ]
  const moved = advanceTrail(trail, 0, 2, 100)

  assert.deepEqual(moved[0], { x: 102, y: 100 })
  assert.ok(Math.abs(trailLength(moved) - 100) < 0.0001)
  assert.ok(moved.length > trail.length)
})

test('reconciliation corrects snapshots gradually instead of snapping the whole body', () => {
  const current = [{ x: 10, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }]
  const target = [{ x: 20, y: 0 }, { x: 15, y: 0 }, { x: 10, y: 0 }]
  const reconciled = reconcileTrail(current, target, 0.25)

  assert.equal(reconciled[0].x, 12.5)
  assert.equal(reconciled[1].x, 7.5)
  assert.ok(reconciled[0].x > current[0].x && reconciled[0].x < target[0].x)
})

test('long snakes grow thicker while their own camera zooms out smoothly', () => {
  const shortBody = bodyRadiusForLength(128)
  const longBody = bodyRadiusForLength(1_000)

  assert.ok(longBody > shortBody * 2)
  assert.ok(headRadiusForLength(1_000) > headRadiusForLength(128))
  assert.equal(cameraZoomForLength(128), 1)
  assert.ok(cameraZoomForLength(1_000) < 0.7)
  assert.ok(cameraZoomForLength(100_000) >= 0.62)
})
