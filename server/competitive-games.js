/** Server-authoritative state machines for the competitive games. */

import { applyMatch3Swap, createMatch3Game } from '../src/games/match3/engine.js'
import { buildMemoryDeck, memoryLevel, MEMORY_EMOJIS, normalizeMemoryDifficulty } from '../src/games/memory/config.js'
import { TRIVIA_QUESTIONS, selectTriviaQuestionIds } from '../src/data/trivia.ts'

export { MEMORY_EMOJIS }

// The server derives its authoritative answers from the exact bank packaged in
// the app, so adding questions can never shift client/server answer indexes.
export const TRIVIA_ANSWER_KEY = Object.freeze(TRIVIA_QUESTIONS.map((question) => question.correct))
export { TRIVIA_QUESTIONS }

export const TRIVIA_ROUND_COUNT = 10
export const TRIVIA_DURATION_MS = 15_000
export const TRIVIA_LEAD_IN_MS = 800
export const MATCH3_DURATION_MS = 75_000
export const MATCH3_LEAD_IN_MS = 1_200

let recentTriviaQuestionIds = []

export function createMemoryGame(difficulty = 'easy', random = Math.random) {
  const normalizedDifficulty = normalizeMemoryDifficulty(difficulty)
  return {
    difficulty: normalizedDifficulty,
    deck: buildMemoryDeck(normalizedDifficulty, random),
    matched: new Set(),
    selected: [],
    lastPair: [],
    activeSlot: random() < 0.5 ? 1 : 2,
    scores: new Map([[1, 0], [2, 0]]),
    moves: 0,
    resolving: false,
    ended: false,
  }
}

export function memorySnapshot(game) {
  const visible = new Set([...game.matched, ...game.selected])
  const level = memoryLevel(game.difficulty)
  return {
    difficulty: level.difficulty,
    pairs: level.pairs,
    columns: level.columns,
    cards: game.deck.map((emojiIndex, index) => ({
      index,
      emoji: visible.has(index) ? MEMORY_EMOJIS[emojiIndex] : null,
      matched: game.matched.has(index),
    })),
    selected: [...game.selected],
    lastPair: [...game.lastPair],
    activeSlot: game.activeSlot,
    scores: { 1: game.scores.get(1) || 0, 2: game.scores.get(2) || 0 },
    moves: game.moves,
    resolving: game.resolving,
    ended: game.ended,
  }
}

export function applyMemoryFlip(game, slot, rawIndex) {
  const index = Number(rawIndex)
  if (
    game.ended || game.resolving || slot !== game.activeSlot ||
    !Number.isInteger(index) || index < 0 || index >= game.deck.length ||
    game.matched.has(index) || game.selected.includes(index)
  ) return { accepted: false }

  game.selected.push(index)
  if (game.selected.length === 1) {
    game.lastPair = []
    return { accepted: true, effect: 'flip' }
  }

  game.moves += 1
  const [first, second] = game.selected
  game.lastPair = [first, second]
  if (game.deck[first] === game.deck[second]) {
    game.matched.add(first)
    game.matched.add(second)
    game.scores.set(slot, (game.scores.get(slot) || 0) + 1)
    game.selected = []
    if (game.matched.size === game.deck.length) game.ended = true
    return { accepted: true, effect: 'match', ended: game.ended }
  }

  game.resolving = true
  return { accepted: true, effect: 'miss' }
}

export function settleMemoryMiss(game) {
  if (!game.resolving || game.ended) return false
  game.selected = []
  game.lastPair = []
  game.resolving = false
  game.activeSlot = game.activeSlot === 1 ? 2 : 1
  return true
}

export function memoryWinner(game) {
  const first = game.scores.get(1) || 0
  const second = game.scores.get(2) || 0
  return first === second ? 0 : first > second ? 1 : 2
}

export function createMatch3Battle(now = Date.now, random = Math.random) {
  const seed = Math.floor(random() * 0xffff_ffff) >>> 0
  const startAt = now() + MATCH3_LEAD_IN_MS
  return {
    seed,
    startAt,
    endAt: startAt + MATCH3_DURATION_MS,
    states: new Map([
      [1, createMatch3Game(seed, { moves: null })],
      [2, createMatch3Game(seed, { moves: null })],
    ]),
    ended: false,
    result: null,
  }
}

export function match3Snapshot(game, slot, now = Date.now()) {
  return {
    state: game.states.get(slot) ?? null,
    scores: {
      1: game.states.get(1)?.score ?? 0,
      2: game.states.get(2)?.score ?? 0,
    },
    startAt: game.startAt,
    endAt: game.endAt,
    serverTime: now,
    ended: game.ended,
  }
}

export function submitMatch3Swap(game, slot, first, second, at = Date.now()) {
  if (game.ended) return { accepted: false, reason: 'ended' }
  if (at < game.startAt) return { accepted: false, reason: 'not_started' }
  if (at >= game.endAt) return { accepted: false, reason: 'time_up' }
  const state = game.states.get(slot)
  if (!state) return { accepted: false, reason: 'unknown_player' }
  const result = applyMatch3Swap(state, first, second)
  if (!result.accepted) return { accepted: false, reason: 'invalid_swap' }
  game.states.set(slot, result.state)
  return result
}

export function finishMatch3Battle(game) {
  if (game.result) return game.result
  game.ended = true
  const scores = {
    1: game.states.get(1)?.score ?? 0,
    2: game.states.get(2)?.score ?? 0,
  }
  const winnerSlot = scores[1] === scores[2] ? 0 : scores[1] > scores[2] ? 1 : 2
  game.result = { winnerSlot, scores, durationMs: MATCH3_DURATION_MS }
  return game.result
}

export function createTriviaGame(now = Date.now, random = Math.random) {
  const selection = selectTriviaQuestionIds(
    TRIVIA_ANSWER_KEY.length,
    TRIVIA_ROUND_COUNT,
    recentTriviaQuestionIds,
    random,
  )
  recentTriviaQuestionIds = selection.nextRecentIds
  return {
    questionIds: selection.selectedIds,
    index: 0,
    startAt: now() + TRIVIA_LEAD_IN_MS,
    durationMs: TRIVIA_DURATION_MS,
    answers: new Map(),
    scores: new Map([[1, 0], [2, 0]]),
    correctCounts: new Map([[1, 0], [2, 0]]),
    totalCorrectMs: new Map([[1, 0], [2, 0]]),
    phase: 'question',
    lastResult: null,
    ended: false,
  }
}

export function triviaQuestionSnapshot(game, viewerSlot) {
  return {
    index: game.index,
    total: game.questionIds.length,
    questionId: game.questionIds[game.index],
    startAt: game.startAt,
    durationMs: game.durationMs,
    answeredSlots: [...game.answers.keys()],
    myAnswer: game.answers.get(viewerSlot)?.option ?? null,
    scores: { 1: game.scores.get(1) || 0, 2: game.scores.get(2) || 0 },
  }
}

export function submitTriviaAnswer(game, slot, rawQuestionIndex, rawOption, at = Date.now()) {
  const questionIndex = Number(rawQuestionIndex)
  const option = Number(rawOption)
  if (
    game.ended || game.phase !== 'question' || questionIndex !== game.index ||
    game.answers.has(slot) || !Number.isInteger(option) || option < 0 || option > 3 ||
    at < game.startAt || at > game.startAt + game.durationMs + 300
  ) return false

  const elapsedMs = Math.max(0, Math.min(game.durationMs, at - game.startAt))
  const questionId = game.questionIds[game.index]
  const correct = TRIVIA_ANSWER_KEY[questionId] === option
  game.answers.set(slot, { option, correct, elapsedMs })
  return true
}

export function resolveTriviaQuestion(game) {
  if (game.ended || game.phase !== 'question') return game.lastResult
  game.phase = 'result'
  const answer1 = game.answers.get(1) ?? { option: null, correct: false, elapsedMs: null }
  const answer2 = game.answers.get(2) ?? { option: null, correct: false, elapsedMs: null }
  let winnerSlot = 0

  for (const [slot, answer] of [[1, answer1], [2, answer2]]) {
    if (!answer.correct) continue
    game.correctCounts.set(slot, (game.correctCounts.get(slot) || 0) + 1)
    game.totalCorrectMs.set(slot, (game.totalCorrectMs.get(slot) || 0) + answer.elapsedMs)
  }

  if (answer1.correct && answer2.correct) {
    if (answer1.elapsedMs < answer2.elapsedMs) winnerSlot = 1
    else if (answer2.elapsedMs < answer1.elapsedMs) winnerSlot = 2
    else {
      game.scores.set(1, (game.scores.get(1) || 0) + 1)
      game.scores.set(2, (game.scores.get(2) || 0) + 1)
    }
  } else if (answer1.correct) winnerSlot = 1
  else if (answer2.correct) winnerSlot = 2

  if (winnerSlot) game.scores.set(winnerSlot, (game.scores.get(winnerSlot) || 0) + 1)
  game.lastResult = {
    index: game.index,
    total: game.questionIds.length,
    questionId: game.questionIds[game.index],
    correctOption: TRIVIA_ANSWER_KEY[game.questionIds[game.index]],
    answers: { 1: answer1, 2: answer2 },
    winnerSlot,
    scores: { 1: game.scores.get(1) || 0, 2: game.scores.get(2) || 0 },
  }
  return game.lastResult
}

export function advanceTriviaQuestion(game, now = Date.now()) {
  if (game.phase !== 'result' || game.index + 1 >= game.questionIds.length) return false
  game.index += 1
  game.startAt = now + TRIVIA_LEAD_IN_MS
  game.answers.clear()
  game.phase = 'question'
  game.lastResult = null
  return true
}

export function finishTriviaGame(game) {
  game.ended = true
  const scores = { 1: game.scores.get(1) || 0, 2: game.scores.get(2) || 0 }
  const correctCounts = { 1: game.correctCounts.get(1) || 0, 2: game.correctCounts.get(2) || 0 }
  const totalCorrectMs = { 1: game.totalCorrectMs.get(1) || 0, 2: game.totalCorrectMs.get(2) || 0 }
  let winnerSlot = scores[1] === scores[2] ? 0 : scores[1] > scores[2] ? 1 : 2
  let tieBreak = 'score'
  if (!winnerSlot && correctCounts[1] !== correctCounts[2]) {
    winnerSlot = correctCounts[1] > correctCounts[2] ? 1 : 2
    tieBreak = 'correct'
  } else if (!winnerSlot && totalCorrectMs[1] !== totalCorrectMs[2]) {
    winnerSlot = totalCorrectMs[1] < totalCorrectMs[2] ? 1 : 2
    tieBreak = 'time'
  } else if (!winnerSlot) tieBreak = 'draw'
  return { winnerSlot, scores, correctCounts, totalCorrectMs, total: game.questionIds.length, tieBreak }
}
