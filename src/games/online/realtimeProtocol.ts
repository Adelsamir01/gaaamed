export interface DecodedSnakePlayer {
  id: string
  name: string
  avatar: string
  hue: number
  score: number
  length: number
  bodyRadius: number
  headRadius: number
  isBot: boolean
  alive: boolean
  angle: number
  trail: Array<{ x: number; y: number }>
}

export interface DecodedSnakeFood {
  id: number
  x: number
  y: number
  hue: number
  radius: number
  value: number
  source: 'arena' | 'remains'
}

export interface DecodedPaperPlayer {
  id: string
  slot: number
  name: string
  avatar: string
  color: string
  isBot: boolean
  alive: boolean
  x: number
  y: number
  angle: number
  targetAngle: number
  trail: number[]
  score: number
  territoryCells: number
  kills: number
  lastInputSeq: number
}

export interface DecodedTerritoryPatch {
  revision: number
  owner: number
  ranges: number[]
}

function numeric(value: unknown, scale = 1) {
  const result = Number(value)
  return Number.isFinite(result) ? result / scale : 0
}

function numericArray(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : []
}

function decodeDeltaCells(value: unknown) {
  const compact = numericArray(value)
  if (compact.length < 2) return compact
  const cells = [compact[0]]
  for (let index = 1; index < compact.length; index += 1) cells.push(cells[index - 1] + compact[index])
  return cells
}

export function decodeCompactSnakePlayers(value: unknown): DecodedSnakePlayer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!Array.isArray(candidate) || candidate.length < 12 || !Array.isArray(candidate[11])) return []
    const trail = []
    for (let index = 0; index + 1 < candidate[11].length; index += 2) {
      trail.push({ x: numeric(candidate[11][index]), y: numeric(candidate[11][index + 1]) })
    }
    return [{
      id: String(candidate[0] ?? ''),
      name: String(candidate[1] ?? ''),
      avatar: String(candidate[2] ?? ''),
      hue: numeric(candidate[3]),
      score: numeric(candidate[4]),
      length: numeric(candidate[5], 10),
      bodyRadius: numeric(candidate[6], 100),
      headRadius: numeric(candidate[7], 100),
      isBot: candidate[8] === 1,
      alive: candidate[9] === 1,
      angle: numeric(candidate[10], 10_000),
      trail,
    }]
  })
}

export function decodeCompactSnakeFoods(value: unknown): DecodedSnakeFood[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!Array.isArray(candidate) || candidate.length < 7) return []
    return [{
      id: numeric(candidate[0]),
      x: numeric(candidate[1]),
      y: numeric(candidate[2]),
      hue: numeric(candidate[3]),
      radius: numeric(candidate[4], 10),
      value: numeric(candidate[5]),
      source: candidate[6] === 1 ? 'remains' as const : 'arena' as const,
    }]
  })
}

export function decodeCompactPaperPlayers(value: unknown): DecodedPaperPlayer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!Array.isArray(candidate) || candidate.length < 16) return []
    return [{
      id: String(candidate[0] ?? ''),
      slot: numeric(candidate[1]),
      name: String(candidate[2] ?? ''),
      avatar: String(candidate[3] ?? ''),
      color: String(candidate[4] ?? '#ffffff'),
      isBot: candidate[5] === 1,
      alive: candidate[6] === 1,
      x: numeric(candidate[7], 10),
      y: numeric(candidate[8], 10),
      angle: numeric(candidate[9], 10_000),
      targetAngle: numeric(candidate[10], 10_000),
      trail: decodeDeltaCells(candidate[11]),
      score: numeric(candidate[12]),
      territoryCells: numeric(candidate[13]),
      kills: numeric(candidate[14]),
      lastInputSeq: numeric(candidate[15]),
    }]
  })
}

export function decodeCompactTerritoryPatches(value: unknown): DecodedTerritoryPatch[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!Array.isArray(candidate) || candidate.length < 3) return []
    return [{
      revision: numeric(candidate[0]),
      owner: numeric(candidate[1]),
      ranges: numericArray(candidate[2]),
    }]
  })
}
