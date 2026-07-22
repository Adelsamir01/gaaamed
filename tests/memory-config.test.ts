import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMemoryDeck, memoryLevel, normalizeMemoryDifficulty } from '../src/games/memory/config.js'

test('memory levels scale from the original board to phone-friendly larger boards', () => {
  assert.deepEqual(
    ['easy', 'medium', 'hard'].map((difficulty) => {
      const level = memoryLevel(difficulty)
      return [level.pairs, level.columns, buildMemoryDeck(difficulty, () => 0.42).length]
    }),
    [[8, 4, 16], [10, 5, 20], [15, 6, 30]],
  )
})

test('every memory deck contains exactly two of each selected symbol', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const deck = buildMemoryDeck(difficulty, () => 0.37)
    const counts = new Map<number, number>()
    for (const symbol of deck) counts.set(symbol, (counts.get(symbol) ?? 0) + 1)
    assert.equal([...counts.values()].every((count) => count === 2), true)
  }
})

test('invalid memory difficulty safely falls back to easy', () => {
  assert.equal(normalizeMemoryDifficulty('impossible'), 'easy')
  assert.equal(memoryLevel(undefined).pairs, 8)
})
