import assert from 'node:assert/strict'
import test from 'node:test'
import { FrameBudgetController } from '../src/lib/frameBudget.ts'

test('frame budget lowers quality when sustained p95 misses 60 fps badly', () => {
  const budget = new FrameBudgetController({ sampleCount: 30 })
  let sample = null
  for (let index = 0; index < 30; index += 1) sample = budget.record(index < 27 ? 17 : 36)
  assert.equal(sample?.changed, true)
  assert.equal(sample?.quality, 'balanced')

  for (let index = 0; index < 30; index += 1) sample = budget.record(36)
  assert.equal(sample?.quality, 'low')
})

test('frame budget only restores quality after several stable windows', () => {
  const budget = new FrameBudgetController({ initialQuality: 'low', sampleCount: 30 })
  let sample = null
  for (let window = 0; window < 3; window += 1) {
    for (let index = 0; index < 30; index += 1) sample = budget.record(16.7)
    assert.equal(sample?.quality, 'low')
  }
  for (let index = 0; index < 30; index += 1) sample = budget.record(16.7)
  assert.equal(sample?.changed, true)
  assert.equal(sample?.quality, 'balanced')
})

test('invalid and suspended-tab frame intervals are ignored', () => {
  const budget = new FrameBudgetController({ sampleCount: 30 })
  assert.equal(budget.record(Number.NaN), null)
  assert.equal(budget.record(500), null)
  assert.equal(budget.quality, 'high')
})
