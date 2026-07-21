export const MATCH3_SIZE = 8
export const MATCH3_TYPES = 6

const SPECIAL_NONE = 'none'
const DIRECTIONS = [[0, 1], [1, 0]]

function normalizeSeed(seed) {
  const value = Number(seed) >>> 0
  return value || 0x9e3779b9
}

function random(state) {
  let value = state.rngState >>> 0
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.rngState = value >>> 0
  return state.rngState / 0x1_0000_0000
}

function makeCell(state, type, special = SPECIAL_NONE) {
  const cell = { id: state.nextId, type, special }
  state.nextId += 1
  return cell
}

function rowOf(index) {
  return Math.floor(index / MATCH3_SIZE)
}

function colOf(index) {
  return index % MATCH3_SIZE
}

function indexOf(row, col) {
  return row * MATCH3_SIZE + col
}

function adjacent(first, second) {
  return Math.abs(rowOf(first) - rowOf(second)) + Math.abs(colOf(first) - colOf(second)) === 1
}

function startsMatch(board, index, type) {
  const row = rowOf(index)
  const col = colOf(index)
  if (col >= 2 && board[index - 1]?.type === type && board[index - 2]?.type === type) return true
  if (row >= 2 && board[index - MATCH3_SIZE]?.type === type && board[index - MATCH3_SIZE * 2]?.type === type) return true
  return false
}

function fillFreshBoard(state) {
  const board = Array(MATCH3_SIZE * MATCH3_SIZE).fill(null)
  for (let index = 0; index < board.length; index += 1) {
    let type = Math.floor(random(state) * MATCH3_TYPES)
    for (let attempt = 0; attempt < MATCH3_TYPES * 2 && startsMatch(board, index, type); attempt += 1) {
      type = (type + 1 + Math.floor(random(state) * (MATCH3_TYPES - 1))) % MATCH3_TYPES
    }
    board[index] = makeCell(state, type)
  }
  return board
}

export function findMatch3Groups(board) {
  const groups = []

  for (let row = 0; row < MATCH3_SIZE; row += 1) {
    let start = 0
    while (start < MATCH3_SIZE) {
      const first = board[indexOf(row, start)]
      if (!first || first.type < 0) {
        start += 1
        continue
      }
      let end = start + 1
      while (end < MATCH3_SIZE && board[indexOf(row, end)]?.type === first.type) end += 1
      if (end - start >= 3) {
        groups.push({
          orientation: 'row',
          indices: Array.from({ length: end - start }, (_, offset) => indexOf(row, start + offset)),
        })
      }
      start = end
    }
  }

  for (let col = 0; col < MATCH3_SIZE; col += 1) {
    let start = 0
    while (start < MATCH3_SIZE) {
      const first = board[indexOf(start, col)]
      if (!first || first.type < 0) {
        start += 1
        continue
      }
      let end = start + 1
      while (end < MATCH3_SIZE && board[indexOf(end, col)]?.type === first.type) end += 1
      if (end - start >= 3) {
        groups.push({
          orientation: 'col',
          indices: Array.from({ length: end - start }, (_, offset) => indexOf(start + offset, col)),
        })
      }
      start = end
    }
  }

  return groups
}

function swapCells(board, first, second) {
  ;[board[first], board[second]] = [board[second], board[first]]
}

export function findMatch3Move(board) {
  for (let row = 0; row < MATCH3_SIZE; row += 1) {
    for (let col = 0; col < MATCH3_SIZE; col += 1) {
      const first = indexOf(row, col)
      for (const [rowDelta, colDelta] of DIRECTIONS) {
        const nextRow = row + rowDelta
        const nextCol = col + colDelta
        if (nextRow >= MATCH3_SIZE || nextCol >= MATCH3_SIZE) continue
        const second = indexOf(nextRow, nextCol)
        const firstCell = board[first]
        const secondCell = board[second]
        if (!firstCell || !secondCell) continue
        if (firstCell.special === 'rainbow' || secondCell.special === 'rainbow') return [first, second]
        if (firstCell.special !== SPECIAL_NONE && secondCell.special !== SPECIAL_NONE) return [first, second]
        swapCells(board, first, second)
        const valid = findMatch3Groups(board).length > 0
        swapCells(board, first, second)
        if (valid) return [first, second]
      }
    }
  }
  return null
}

function cloneState(state) {
  return {
    ...state,
    board: state.board.map((cell) => (cell ? { ...cell } : null)),
    collected: [...state.collected],
  }
}

export function createMatch3Game(seed = Date.now(), options = {}) {
  const state = {
    board: [],
    score: 0,
    movesRemaining: options.moves === null ? null : Math.max(1, Number(options.moves) || 30),
    collected: Array(MATCH3_TYPES).fill(0),
    totalCleared: 0,
    nextId: 1,
    rngState: normalizeSeed(seed),
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    state.board = fillFreshBoard(state)
    if (findMatch3Groups(state.board).length === 0 && findMatch3Move(state.board)) return state
  }
  return state
}

function specialForSwap(groups, preferred, fallback) {
  const candidate = groups.some((group) => group.indices.includes(preferred)) ? preferred : fallback
  const through = groups.filter((group) => group.indices.includes(candidate))
  if (through.length === 0) return null
  if (through.some((group) => group.indices.length >= 5)) return { index: candidate, special: 'rainbow' }
  if (through.some((group) => group.orientation === 'row') && through.some((group) => group.orientation === 'col')) {
    return { index: candidate, special: 'bomb' }
  }
  const four = through.find((group) => group.indices.length >= 4)
  if (four) return { index: candidate, special: four.orientation }
  return null
}

function addRow(clear, row) {
  for (let col = 0; col < MATCH3_SIZE; col += 1) clear.add(indexOf(row, col))
}

function addColumn(clear, col) {
  for (let row = 0; row < MATCH3_SIZE; row += 1) clear.add(indexOf(row, col))
}

function expandSpecials(board, clear) {
  const queue = [...clear]
  const expanded = new Set()
  while (queue.length > 0) {
    const index = queue.shift()
    if (expanded.has(index)) continue
    expanded.add(index)
    const cell = board[index]
    if (!cell || cell.special === SPECIAL_NONE || cell.special === 'rainbow') continue
    const before = clear.size
    if (cell.special === 'row') addRow(clear, rowOf(index))
    else if (cell.special === 'col') addColumn(clear, colOf(index))
    else if (cell.special === 'bomb') {
      const centerRow = rowOf(index)
      const centerCol = colOf(index)
      for (let row = centerRow - 1; row <= centerRow + 1; row += 1) {
        for (let col = centerCol - 1; col <= centerCol + 1; col += 1) {
          if (row >= 0 && row < MATCH3_SIZE && col >= 0 && col < MATCH3_SIZE) clear.add(indexOf(row, col))
        }
      }
    }
    if (clear.size > before) {
      for (const added of clear) if (!expanded.has(added) && !queue.includes(added)) queue.push(added)
    }
  }
}

function collapseAndFill(state) {
  for (let col = 0; col < MATCH3_SIZE; col += 1) {
    const kept = []
    for (let row = MATCH3_SIZE - 1; row >= 0; row -= 1) {
      const cell = state.board[indexOf(row, col)]
      if (cell) kept.push(cell)
    }
    let cursor = 0
    for (let row = MATCH3_SIZE - 1; row >= 0; row -= 1) {
      state.board[indexOf(row, col)] = cursor < kept.length
        ? kept[cursor++]
        : makeCell(state, Math.floor(random(state) * MATCH3_TYPES))
    }
  }
}

function rebuildIfStuck(state) {
  if (findMatch3Move(state.board)) return false
  for (let attempt = 0; attempt < 40; attempt += 1) {
    state.board = fillFreshBoard(state)
    if (findMatch3Groups(state.board).length === 0 && findMatch3Move(state.board)) return true
  }
  return true
}

function directSpecialClear(board, first, second) {
  const firstCell = board[first]
  const secondCell = board[second]
  const clear = new Set()
  if (firstCell.special === 'rainbow' || secondCell.special === 'rainbow') {
    const rainbowIndex = firstCell.special === 'rainbow' ? first : second
    const targetIndex = rainbowIndex === first ? second : first
    const target = board[targetIndex]
    clear.add(rainbowIndex)
    clear.add(targetIndex)
    if (target?.special === 'rainbow') {
      for (let index = 0; index < board.length; index += 1) if (board[index]) clear.add(index)
    } else if (target) {
      for (let index = 0; index < board.length; index += 1) {
        if (board[index]?.type === target.type) clear.add(index)
      }
    }
    return clear
  }
  if (firstCell.special !== SPECIAL_NONE && secondCell.special !== SPECIAL_NONE) {
    clear.add(first)
    clear.add(second)
    return clear
  }
  return null
}

export function applyMatch3Swap(currentState, rawFirst, rawSecond) {
  const first = Number(rawFirst)
  const second = Number(rawSecond)
  if (
    !Number.isInteger(first) || !Number.isInteger(second) ||
    first < 0 || second < 0 || first >= MATCH3_SIZE * MATCH3_SIZE || second >= MATCH3_SIZE * MATCH3_SIZE ||
    !adjacent(first, second) || !currentState.board[first] || !currentState.board[second] ||
    currentState.movesRemaining === 0
  ) return { accepted: false, state: currentState, scoreDelta: 0, cleared: 0, cascades: 0, createdSpecial: null, reshuffled: false }

  const state = cloneState(currentState)
  swapCells(state.board, first, second)
  let groups = findMatch3Groups(state.board)
  let directClear = directSpecialClear(state.board, first, second)
  if (groups.length === 0 && !directClear) {
    return { accepted: false, state: currentState, scoreDelta: 0, cleared: 0, cascades: 0, createdSpecial: null, reshuffled: false }
  }

  if (state.movesRemaining !== null) state.movesRemaining = Math.max(0, state.movesRemaining - 1)
  let scoreDelta = 0
  let totalCleared = 0
  let cascades = 0
  let createdSpecial = null

  while ((groups.length > 0 || directClear) && cascades < 14) {
    cascades += 1
    const clear = directClear ?? new Set(groups.flatMap((group) => group.indices))
    let created = null
    if (cascades === 1 && !directClear) created = specialForSwap(groups, second, first)
    if (created && state.board[created.index]?.special === SPECIAL_NONE) {
      const cell = state.board[created.index]
      cell.special = created.special
      if (created.special === 'rainbow') cell.type = -1
      clear.delete(created.index)
      createdSpecial = created.special
    }

    expandSpecials(state.board, clear)
    const collectedThisCascade = Array(MATCH3_TYPES).fill(0)
    let clearedThisCascade = 0
    for (const index of clear) {
      const cell = state.board[index]
      if (!cell) continue
      if (cell.type >= 0 && cell.type < MATCH3_TYPES) collectedThisCascade[cell.type] += 1
      state.board[index] = null
      clearedThisCascade += 1
    }
    for (let type = 0; type < MATCH3_TYPES; type += 1) state.collected[type] += collectedThisCascade[type]
    totalCleared += clearedThisCascade
    scoreDelta += clearedThisCascade * 90 * cascades
    if (created) scoreDelta += created.special === 'rainbow' ? 600 : created.special === 'bomb' ? 450 : 300
    collapseAndFill(state)
    directClear = null
    groups = findMatch3Groups(state.board)
  }

  state.score += scoreDelta
  state.totalCleared += totalCleared
  const reshuffled = rebuildIfStuck(state)
  return { accepted: true, state, scoreDelta, cleared: totalCleared, cascades, createdSpecial, reshuffled }
}
