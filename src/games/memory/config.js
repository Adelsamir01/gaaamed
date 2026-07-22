export const MEMORY_EMOJIS = Object.freeze([
  '🐪', '🌴', '🕌', '☕', '🌙', '⭐', '🏺', '🐎',
  '🧿', '🥭', '🪘', '🚤', '🐈', '🌊', '🪁', '🦅',
])

export const MEMORY_LEVELS = Object.freeze({
  easy: Object.freeze({ difficulty: 'easy', pairs: 8, columns: 4, label: 'سهل', boardLabel: '٤×٤' }),
  medium: Object.freeze({ difficulty: 'medium', pairs: 10, columns: 5, label: 'متوسط', boardLabel: '٥×٤' }),
  hard: Object.freeze({ difficulty: 'hard', pairs: 15, columns: 6, label: 'صعب', boardLabel: '٦×٥' }),
})

export function normalizeMemoryDifficulty(value) {
  return value === 'medium' || value === 'hard' ? value : 'easy'
}

export function memoryLevel(value) {
  return MEMORY_LEVELS[normalizeMemoryDifficulty(value)]
}

export function buildMemoryDeck(value, random = Math.random) {
  const level = memoryLevel(value)
  const deck = [...Array(level.pairs).keys(), ...Array(level.pairs).keys()]
  for (let index = deck.length - 1; index > 0; index--) {
    const swapWith = Math.floor(random() * (index + 1))
    ;[deck[index], deck[swapWith]] = [deck[swapWith], deck[index]]
  }
  return deck
}
