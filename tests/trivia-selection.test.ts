import assert from 'node:assert/strict'
import test from 'node:test'
import { selectTriviaQuestionIds, TRIVIA_RECENT_LIMIT } from '../src/data/trivia.ts'

test('offline trivia excludes recent questions and returns a unique full round', () => {
  const recent = Array.from({ length: 30 }, (_, id) => id)
  const { selectedIds, nextRecentIds } = selectTriviaQuestionIds(200, 10, recent, () => 0.42)

  assert.equal(selectedIds.length, 10)
  assert.equal(new Set(selectedIds).size, 10)
  assert.equal(selectedIds.some((id) => recent.includes(id)), false)
  assert.deepEqual(nextRecentIds.slice(0, 10), selectedIds)
  assert.ok(nextRecentIds.length <= TRIVIA_RECENT_LIMIT)
})

test('selection safely relaxes old history when the bank cannot otherwise fill a round', () => {
  const { selectedIds } = selectTriviaQuestionIds(12, 10, Array.from({ length: 10 }, (_, id) => id), () => 0.5)
  assert.equal(selectedIds.length, 10)
  assert.equal(new Set(selectedIds).size, 10)
})
