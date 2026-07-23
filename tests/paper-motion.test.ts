import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advancePaperPosition,
  applyTerritoryPatches,
  cellCenter,
  cellIndexAt,
  decodeOwnershipRle,
  predictionTargetAngle,
  reconcilePaperPosition,
} from '../src/games/online/paperMotion.ts'

test('paper movement advances locally while respecting the turn-rate limit', () => {
  const next = advancePaperPosition({ x: 100, y: 100 }, 0, Math.PI, 150, 7.4, 0.05)

  assert.ok(Math.abs(next.angle) <= 7.4 * 0.05 + 0.0001)
  assert.ok(Math.hypot(next.x - 100, next.y - 100) > 7.4)
})

test('authoritative corrections blend instead of snapping the player', () => {
  const corrected = reconcilePaperPosition({ x: 10, y: 20 }, { x: 30, y: 40 }, 0.25)

  assert.deepEqual(corrected, { x: 15, y: 25 })
})

test('unacknowledged steering is predicted instead of fighting the local direction', () => {
  assert.equal(predictionTargetAngle(0, Math.PI / 2, 4, 5), Math.PI / 2)
  assert.equal(predictionTargetAngle(0, Math.PI / 2, 5, 5), 0)
})

test('ownership full states and compact patches produce the same local grid', () => {
  const owners = decodeOwnershipRle([0, 3, 2, 2, 0, 3], 8)
  const patched = applyTerritoryPatches(owners, [{ revision: 2, owner: 4, ranges: [1, 3, 6, 2] }])

  assert.deepEqual([...owners], [0, 0, 0, 2, 2, 0, 0, 0])
  assert.deepEqual([...patched], [0, 4, 4, 4, 2, 0, 4, 4])
  assert.notEqual(patched, owners)
})

test('world points convert to stable territory cells', () => {
  const point = cellCenter(17, 8, 20)
  assert.deepEqual(point, { x: 30, y: 50 })
  assert.equal(cellIndexAt(point, 8, 20), 17)
  assert.equal(cellIndexAt({ x: -1, y: 10 }, 8, 20), -1)
})
