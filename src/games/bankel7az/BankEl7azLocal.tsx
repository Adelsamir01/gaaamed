import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameProps } from '@/games'
import type { Difficulty } from '@/types'
import { useApp } from '@/store/AppContext'
import { BOARD_TILES, PENALTY_BAIL, STARTING_CASH, START_BONUS } from '@/games/online/bankel7az/shared/board'
import {
  calculateRent,
  canAddBuilding,
  findOwner,
  getBuildingCost,
  getPropertySellValue,
  isOwnableTile,
  isPropertyTile,
} from '@/games/online/bankel7az/shared/rules'
import type {
  BuildingsByTile,
  DiceRoll,
  GameLogEntry,
  GameState,
  Player,
} from '@/games/online/bankel7az/shared/types'
import { BankGameScreen } from '@/games/online/bankel7az/App'
import { useBankDisplayMode } from '@/games/online/bankel7az/displayMode'
import { sounds } from '@/lib/sounds'

const MAX_TURNS = 24

interface Decision {
  tileId: number
  price: number
}

type Phase = 'ready' | 'moving' | 'decision' | 'over'

const BOT_BUY_BUFFER: Record<Difficulty, number> = { easy: 500, medium: 300, hard: 160 }
const BOT_BUY_CHANCE: Record<Difficulty, number> = { easy: 0.45, medium: 0.75, hard: 0.94 }
const BOT_BUILD_CHANCE: Record<Difficulty, number> = { easy: 0.2, medium: 0.55, hard: 0.82 }

function createPlayers(againstBot: boolean, playerName: string): Player[] {
  return [
    {
      id: 'p1', name: playerName || 'اللاعب ١', color: 'red', position: 0, cash: STARTING_CASH, properties: [],
      connected: true, bankrupt: false, inPenalty: false, penaltyTurns: 0, skipTurns: 0,
    },
    {
      id: 'p2', name: againstBot ? 'الكمبيوتر' : 'اللاعب ٢', color: 'blue', position: 0, cash: STARTING_CASH, properties: [],
      connected: true, bankrupt: false, inPenalty: false, penaltyTurns: 0, skipTurns: 0,
    },
  ]
}

function propertyValue(player: Player, buildings: BuildingsByTile): number {
  return player.properties.reduce((total, tileId) => {
    const tile = BOARD_TILES[tileId]
    if (!tile || !isOwnableTile(tile)) return total
    const buildingValue = isPropertyTile(tile) ? (buildings[tile.id] ?? 0) * getBuildingCost(tile) : 0
    return total + tile.price + buildingValue
  }, 0)
}

function playerWealth(player: Player, buildings: BuildingsByTile): number {
  return player.cash + propertyValue(player, buildings)
}

export default function BankEl7azLocal({ config, onFinish, onExit }: GameProps) {
  useBankDisplayMode()
  const { profile } = useApp()
  const againstBot = config.mode === 'bot'
  const startedAtRef = useRef(Date.now())
  const logSequenceRef = useRef(1)
  const [players, setPlayers] = useState<Player[]>(() => createPlayers(againstBot, profile.name))
  const [turnIndex, setTurnIndex] = useState(0)
  const [turnsPlayed, setTurnsPlayed] = useState(0)
  const [phase, setPhase] = useState<Phase>('ready')
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [buildings, setBuildings] = useState<BuildingsByTile>({})
  const [winnerId, setWinnerId] = useState<string | null>(null)
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null)
  const [log, setLog] = useState<GameLogEntry[]>(() => [{
    id: 'local-0',
    message: 'ابدأ وارمِ الزهر',
    createdAt: startedAtRef.current,
  }])
  const finishedRef = useRef(false)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const playersRef = useRef(players)
  const buildingsRef = useRef(buildings)
  playersRef.current = players
  buildingsRef.current = buildings

  const currentPlayer = players[turnIndex] ?? players[0]!
  const humanTurn = !againstBot || turnIndex === 0
  const latestTimestamp = log[0]?.createdAt ?? startedAtRef.current

  const announce = useCallback((message: string) => {
    const createdAt = Date.now()
    const id = `local-${createdAt}-${logSequenceRef.current++}`
    setLog((current) => [{ id, message, createdAt }, ...current].slice(0, 12))
  }, [])

  const queue = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay)
    timersRef.current.push(timer)
  }, [])

  const finishGame = useCallback((finalPlayers: Player[], finalBuildings: BuildingsByTile) => {
    if (finishedRef.current) return
    finishedRef.current = true
    setPhase('over')
    const first = playerWealth(finalPlayers[0]!, finalBuildings)
    const second = playerWealth(finalPlayers[1]!, finalBuildings)
    const outcome = first === second ? 'draw' : first > second ? 'win' : 'loss'
    const finalWinnerId = first === second ? null : first > second ? finalPlayers[0]!.id : finalPlayers[1]!.id
    setWinnerId(finalWinnerId)
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    announce(outcome === 'draw' ? 'تعادل في الثروة! 🤝' : first > second ? `${finalPlayers[0]!.name} أغنى لاعب! 🏆` : `${finalPlayers[1]!.name} كسب المباراة! 🏆`)
    queue(() => {
      onFinish({
        gameId: 'bank-el7az',
        outcome,
        score: first,
        bestCandidate: first,
        coinsEarned: outcome === 'win' ? 55 : outcome === 'draw' ? 22 : 10,
        xpEarned: outcome === 'win' ? 75 : outcome === 'draw' ? 35 : 18,
        summary: `ثروتك النهائية ${first} جنيه مقابل ${second} جنيه 🏦`,
        detail: 'المباراة المحلية اتحسبت بالنقد وقيمة المحافظات والمباني.',
      })
    }, 1_450)
  }, [announce, onFinish, queue])

  const finishTurn = useCallback((nextPlayers = playersRef.current) => {
    setPlayers(nextPlayers)
    const nextTurns = turnsPlayed + 1
    setTurnsPlayed(nextTurns)
    setDecision(null)
    const activePlayers = nextPlayers.filter((player) => !player.bankrupt)
    if (activePlayers.length <= 1 || nextTurns >= MAX_TURNS) {
      finishGame(nextPlayers, buildingsRef.current)
      return
    }
    const nextIndex = turnIndex === 0 ? 1 : 0
    setTurnIndex(nextIndex)
    setLastRoll(null)
    setPhase('ready')
    announce(`الدور على ${nextPlayers[nextIndex]?.name ?? 'اللاعب التالي'}`)
  }, [announce, finishGame, turnIndex, turnsPlayed])

  const applyPayment = useCallback((source: Player[], payerIndex: number, amount: number, receiverIndex?: number): Player[] => {
    const next = source.map((player) => ({ ...player, properties: [...player.properties] }))
    const payer = next[payerIndex]
    if (!payer) return next
    const paid = Math.min(payer.cash, amount)
    payer.cash -= paid
    if (receiverIndex !== undefined && next[receiverIndex]) next[receiverIndex]!.cash += paid
    if (paid < amount || payer.cash <= 0) payer.bankrupt = true
    return next
  }, [])

  const resolveLanding = useCallback((movedPlayers: Player[], playerIndex: number, diceTotal: number) => {
    const player = movedPlayers[playerIndex]!
    const tile = BOARD_TILES[player.position]!
    const owner = isOwnableTile(tile) ? findOwner(movedPlayers, tile.id) : null

    if (tile.kind === 'tax') {
      const charged = applyPayment(movedPlayers, playerIndex, tile.amount)
      announce(`${tile.name}: دفعت ${Math.min(player.cash, tile.amount)} جنيه`)
      setPlayers(charged)
      queue(() => finishTurn(charged), 900)
      return
    }

    if (tile.kind === 'fate') {
      const cards = [
        { amount: 180, text: 'كسبت جمعية! خد ١٨٠ جنيه' },
        { amount: 100, text: 'بعت حاجة قديمة وخدت ١٠٠ جنيه' },
        { amount: -120, text: 'تصليح العربية كلفك ١٢٠ جنيه' },
        { amount: -80, text: 'عزومة مفاجئة: ادفع ٨٠ جنيه' },
      ]
      const card = cards[Math.floor(Math.random() * cards.length)]!
      let updated = movedPlayers.map((item) => ({ ...item, properties: [...item.properties] }))
      if (card.amount >= 0) updated[playerIndex]!.cash += card.amount
      else updated = applyPayment(updated, playerIndex, Math.abs(card.amount))
      announce(card.text)
      setPlayers(updated)
      queue(() => finishTurn(updated), 1_050)
      return
    }

    if (tile.kind === 'goToPenalty') {
      const updated = applyPayment(movedPlayers, playerIndex, PENALTY_BAIL)
      updated[playerIndex]!.position = 12
      announce(`روحت القسم ودفعت ${PENALTY_BAIL} جنيه`)
      setPlayers(updated)
      queue(() => finishTurn(updated), 1_050)
      return
    }

    if (isOwnableTile(tile)) {
      if (!owner && player.cash >= tile.price) {
        setPlayers(movedPlayers)
        setDecision({ tileId: tile.id, price: tile.price })
        setSelectedTileId(tile.id)
        announce(`${tile.name} متاحة بـ ${tile.price} جنيه`)
        setPhase('decision')
        return
      }

      if (owner && owner.id !== player.id) {
        const ownerIndex = movedPlayers.findIndex((item) => item.id === owner.id)
        const rent = calculateRent(tile, owner, diceTotal, buildingsRef.current)
        const paidPlayers = applyPayment(movedPlayers, playerIndex, rent, ownerIndex)
        announce(`دفعت ${Math.min(player.cash, rent)} جنيه إيجار لـ ${owner.name}`)
        setPlayers(paidPlayers)
        queue(() => finishTurn(paidPlayers), 1_050)
        return
      }

      if (
        againstBot && playerIndex === 1 && owner?.id === player.id && isPropertyTile(tile)
        && canAddBuilding(tile, player, buildingsRef.current)
      ) {
        const price = getBuildingCost(tile)
        if (player.cash - price >= BOT_BUY_BUFFER[config.difficulty] && Math.random() <= BOT_BUILD_CHANCE[config.difficulty]) {
          const updated = movedPlayers.map((item) => ({ ...item, properties: [...item.properties] }))
          updated[playerIndex]!.cash -= price
          const nextBuildings = { ...buildingsRef.current, [tile.id]: (buildingsRef.current[tile.id] ?? 0) + 1 }
          buildingsRef.current = nextBuildings
          setBuildings(nextBuildings)
          setPlayers(updated)
          announce(`${player.name} بنى في ${tile.name} 🏠`)
          queue(() => finishTurn(updated), 900)
          return
        }
      }
    }

    setPlayers(movedPlayers)
    announce(tile.kind === 'start' ? 'نورت البداية!' : tile.kind === 'freeRest' ? 'استراحة على القهوة ☕' : `وقفت في ${tile.name}`)
    queue(() => finishTurn(movedPlayers), 850)
  }, [againstBot, announce, applyPayment, config.difficulty, finishTurn, queue])

  const rollDice = useCallback(() => {
    if (phase !== 'ready' || finishedRef.current) return
    sounds.pop()
    const dieA = Math.floor(Math.random() * 6) + 1
    const dieB = Math.floor(Math.random() * 6) + 1
    const roll: DiceRoll = { dieA, dieB, total: dieA + dieB, isDouble: dieA === dieB }
    setLastRoll(roll)
    setPhase('moving')
    const nextPlayers = players.map((player) => ({ ...player, properties: [...player.properties] }))
    const player = nextPlayers[turnIndex]!
    const passedStart = player.position + roll.total >= BOARD_TILES.length
    player.position = (player.position + roll.total) % BOARD_TILES.length
    if (passedStart) player.cash += START_BONUS
    announce(`${player.name} رمى ${roll.total}${passedStart ? ` وعدّى البداية +${START_BONUS}` : ''}`)
    setPlayers(nextPlayers)
    queue(() => resolveLanding(nextPlayers, turnIndex, roll.total), 700)
  }, [announce, phase, players, queue, resolveLanding, turnIndex])

  const handleDecision = useCallback((accept: boolean) => {
    if (!decision || phase !== 'decision') return
    const nextPlayers = players.map((player) => ({ ...player, properties: [...player.properties] }))
    const player = nextPlayers[turnIndex]!
    const tile = BOARD_TILES[decision.tileId]
    if (accept && tile && player.cash >= decision.price) {
      player.cash -= decision.price
      player.properties.push(decision.tileId)
      announce(`${player.name} اشترى ${tile.name} 🎉`)
      sounds.correct()
    } else {
      announce(`${player.name} قرر يحتفظ بفلوسه`)
    }
    setPlayers(nextPlayers)
    setDecision(null)
    setPhase('moving')
    queue(() => finishTurn(nextPlayers), 650)
  }, [announce, decision, finishTurn, phase, players, queue, turnIndex])

  const buildProperty = useCallback((tileId: number) => {
    if (phase !== 'ready' || finishedRef.current) return
    const tile = BOARD_TILES[tileId]
    const player = players[turnIndex]
    if (!tile || !player || !isPropertyTile(tile) || !player.properties.includes(tileId)) return
    const price = getBuildingCost(tile)
    if (!canAddBuilding(tile, player, buildingsRef.current) || player.cash < price) return
    const updated = players.map((item) => ({ ...item, properties: [...item.properties] }))
    updated[turnIndex]!.cash -= price
    const nextBuildings = { ...buildingsRef.current, [tileId]: (buildingsRef.current[tileId] ?? 0) + 1 }
    buildingsRef.current = nextBuildings
    setBuildings(nextBuildings)
    setPlayers(updated)
    announce(`${player.name} بنى في ${tile.name} 🏠`)
    sounds.correct()
  }, [announce, phase, players, turnIndex])

  const sellProperty = useCallback((tileId: number) => {
    if (phase !== 'ready' || finishedRef.current) return
    const tile = BOARD_TILES[tileId]
    const player = players[turnIndex]
    if (!tile || !player || !isOwnableTile(tile) || !player.properties.includes(tileId)) return
    const saleValue = getPropertySellValue(tile, buildingsRef.current)
    const updated = players.map((item) => ({ ...item, properties: [...item.properties] }))
    updated[turnIndex]!.properties = updated[turnIndex]!.properties.filter((propertyId) => propertyId !== tileId)
    updated[turnIndex]!.cash += saleValue
    const nextBuildings = { ...buildingsRef.current }
    delete nextBuildings[tileId]
    buildingsRef.current = nextBuildings
    setBuildings(nextBuildings)
    setPlayers(updated)
    announce(`${player.name} باع ${tile.name} للبنك بـ ${saleValue} جنيه`)
  }, [announce, phase, players, turnIndex])

  useEffect(() => {
    if (!againstBot || turnIndex !== 1 || phase !== 'ready') return
    const timer = setTimeout(rollDice, 650)
    return () => clearTimeout(timer)
  }, [againstBot, phase, rollDice, turnIndex])

  useEffect(() => {
    if (!againstBot || turnIndex !== 1 || phase !== 'decision' || !decision) return
    const bot = players[1]!
    const accept = bot.cash - decision.price >= BOT_BUY_BUFFER[config.difficulty]
      && Math.random() <= BOT_BUY_CHANCE[config.difficulty]
    const timer = setTimeout(() => handleDecision(accept), 650)
    return () => clearTimeout(timer)
  }, [againstBot, config.difficulty, decision, handleDecision, phase, players, turnIndex])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const state = useMemo<GameState>(() => ({
    roomCode: 'LOCAL',
    hostId: 'p1',
    status: phase === 'over' ? 'finished' : 'playing',
    players,
    currentPlayerId: phase === 'over' ? null : currentPlayer.id,
    turnPhase: phase === 'ready' ? 'roll' : phase === 'decision' ? 'buy' : 'end',
    pendingPurchase: decision ? { playerId: currentPlayer.id, tileId: decision.tileId, price: decision.price } : null,
    buildingsByTile: buildings,
    lastRoll,
    winnerId,
    createdAt: startedAtRef.current,
    updatedAt: latestTimestamp,
    actionAvailableAt: phase === 'moving' ? latestTimestamp + 700 : latestTimestamp,
    log,
  }), [buildings, currentPlayer.id, decision, lastRoll, latestTimestamp, log, phase, players, winnerId])

  const activePlayerId = phase === 'over' ? 'p1' : humanTurn ? currentPlayer.id : null
  const selectedTile = selectedTileId === null ? null : BOARD_TILES[selectedTileId] ?? null

  return (
    <div className="bank-el7az-root" dir="rtl">
      <BankGameScreen
        state={state}
        playerId={activePlayerId}
        selectedTile={selectedTile}
        selectedTileId={selectedTileId}
        setSelectedTileId={(tileId) => setSelectedTileId((current) => current === tileId ? null : tileId)}
        status="local"
        error={null}
        clockOffsetMs={0}
        latencyMs={0}
        rollDice={rollDice}
        buyProperty={() => handleDecision(true)}
        passProperty={() => handleDecision(false)}
        buildProperty={buildProperty}
        sellProperty={sellProperty}
        payBail={() => undefined}
        leaveRoom={() => onExit?.()}
        sessionLabel={againstBot ? 'ضد الكمبيوتر — داخل الموبايل' : 'لاعبان على نفس الموبايل'}
        showNetworkInfo={false}
      />
    </div>
  )
}
