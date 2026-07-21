import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  TRIVIA_ANSWER_KEY,
  applyMemoryFlip,
  createMemoryGame,
  createMatch3Battle,
  createTriviaGame,
  finishMatch3Battle,
  finishTriviaGame,
  match3Snapshot,
  memorySnapshot,
  resolveTriviaQuestion,
  settleMemoryMiss,
  submitMatch3Swap,
  submitTriviaAnswer,
} from './competitive-games.js'
import { findMatch3Move } from '../src/games/match3/engine.js'

test('server trivia answer key stays aligned with the client question bank', () => {
  const source = fs.readFileSync(new URL('../src/data/trivia.ts', import.meta.url), 'utf8')
  const clientAnswers = [...source.matchAll(/correct:\s*(\d)/g)].map((match) => Number(match[1]))
  assert.deepEqual([...TRIVIA_ANSWER_KEY], clientAnswers)
})

test('memory hides cards and enforces turn, matching, and miss handoff', () => {
  const game = createMemoryGame(() => 0.42)
  const start = memorySnapshot(game)
  assert.equal(start.cards.every((card) => card.emoji === null), true)
  assert.equal(applyMemoryFlip(game, game.activeSlot === 1 ? 2 : 1, 0).accepted, false)

  const pairByEmoji = new Map()
  for (let index = 0; index < game.deck.length; index++) {
    const prior = pairByEmoji.get(game.deck[index])
    if (prior !== undefined) {
      const active = game.activeSlot
      assert.equal(applyMemoryFlip(game, active, prior).accepted, true)
      const match = applyMemoryFlip(game, active, index)
      assert.equal(match.effect, 'match')
      assert.equal(game.scores.get(active), 1)
      assert.equal(game.activeSlot, active, 'a match keeps the turn')
      break
    }
    pairByEmoji.set(game.deck[index], index)
  }

  const hidden = game.deck.map((_, index) => index).filter((index) => !game.matched.has(index))
  const first = hidden[0]
  const second = hidden.find((index) => game.deck[index] !== game.deck[first])
  const active = game.activeSlot
  applyMemoryFlip(game, active, first)
  const miss = applyMemoryFlip(game, active, second)
  assert.equal(miss.effect, 'miss')
  assert.equal(game.resolving, true)
  assert.equal(settleMemoryMiss(game), true)
  assert.equal(game.activeSlot, active === 1 ? 2 : 1)
})

test('trivia awards a double-correct question to the faster server timestamp', () => {
  const game = createTriviaGame(() => 0, () => 0.5)
  game.questionIds[0] = 0
  game.startAt = 1_000
  assert.equal(submitTriviaAnswer(game, 1, 0, TRIVIA_ANSWER_KEY[0], 999), false, 'pre-answering is rejected')
  assert.equal(submitTriviaAnswer(game, 1, 0, TRIVIA_ANSWER_KEY[0], 1_700), true)
  assert.equal(submitTriviaAnswer(game, 2, 0, TRIVIA_ANSWER_KEY[0], 2_100), true)
  const result = resolveTriviaQuestion(game)
  assert.equal(result.winnerSlot, 1)
  assert.deepEqual(result.scores, { 1: 1, 2: 0 })
  assert.equal(game.correctCounts.get(1), 1)
  assert.equal(game.correctCounts.get(2), 1)
})

test('trivia overall tie is broken by cumulative correct-answer time', () => {
  const game = createTriviaGame(() => 0, () => 0.5)
  game.scores.set(1, 5)
  game.scores.set(2, 5)
  game.correctCounts.set(1, 7)
  game.correctCounts.set(2, 7)
  game.totalCorrectMs.set(1, 18_000)
  game.totalCorrectMs.set(2, 19_000)
  const end = finishTriviaGame(game)
  assert.equal(end.winnerSlot, 1)
  assert.equal(end.tieBreak, 'time')
})

test('match-three battle gives both players the same fair board and validates timing server-side', () => {
  const now = 10_000
  const game = createMatch3Battle(() => now, () => 0.4242)
  const firstState = game.states.get(1)
  const secondState = game.states.get(2)
  assert.deepEqual(firstState, secondState)
  assert.equal(match3Snapshot(game, 1, now).state, firstState)
  assert.equal(submitMatch3Swap(game, 1, 0, 1, game.startAt - 1).reason, 'not_started')

  const move = findMatch3Move(firstState.board)
  assert.ok(move)
  const result = submitMatch3Swap(game, 1, move[0], move[1], game.startAt + 20)
  assert.equal(result.accepted, true)
  assert.ok(game.states.get(1).score > 0)
  assert.equal(game.states.get(2).score, 0, 'one player cannot mutate the opponent board')

  const end = finishMatch3Battle(game)
  assert.equal(end.winnerSlot, 1)
  assert.equal(submitMatch3Swap(game, 2, move[0], move[1], game.startAt + 40).reason, 'ended')
})
