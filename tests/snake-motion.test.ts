import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceSampledTrail,
  advanceTrail,
  bodyRadiusForLength,
  cameraZoomForLength,
  headRadiusForLength,
  mergeFoodSnapshot,
  reconcileTrail,
  trailLength,
  turnAngleTowards,
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

test('sampled rendering keeps trail density bounded across high refresh rate frames', () => {
  let trail = [
    { x: 100, y: 100 },
    { x: 94, y: 100 },
    { x: 88, y: 100 },
    { x: 82, y: 100 },
  ]

  for (let frame = 0; frame < 240; frame += 1) {
    trail = advanceSampledTrail(trail, 0, 2, 120, 5)
  }

  assert.ok(trail.length <= 27)
  assert.ok(Math.abs(trailLength(trail) - 120) < 0.0001)
  assert.equal(trail[0].x, 580)
})

test('local steering prediction turns immediately while respecting the server turn rate', () => {
  const frameTurn = 6.2 / 60
  const firstFrame = turnAngleTowards(0, Math.PI / 2, frameTurn)
  assert.equal(firstFrame, frameTurn)

  let angle = 0
  for (let frame = 0; frame < 120; frame += 1) {
    angle = turnAngleTowards(angle, Math.PI / 2, frameTurn)
  }
  assert.ok(Math.abs(angle - Math.PI / 2) < 0.0001)
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

test('food patches update only changed arena items without mutating the prior snapshot', () => {
  const current = [{ id: 1, value: 'old' }, { id: 2, value: 'keep' }]
  const merged = mergeFoodSnapshot(current, undefined, [{ id: 3, value: 'new' }], [1])

  assert.deepEqual(merged, [{ id: 2, value: 'keep' }, { id: 3, value: 'new' }])
  assert.deepEqual(current, [{ id: 1, value: 'old' }, { id: 2, value: 'keep' }])
  assert.equal(mergeFoodSnapshot(current, undefined), current)
})
