import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Building2, Coins, Dice5, ShoppingCart, Users } from 'lucide-react'
import type { GameProps } from '@/games'
import type { Difficulty } from '@/types'
import { BOARD_TILES, PENALTY_BAIL, STARTING_CASH, START_BONUS } from '@/games/online/bankel7az/shared/board'
import { calculateRent, canAddBuilding, findOwner, getBuildingCost, isOwnableTile, isPropertyTile } from '@/games/online/bankel7az/shared/rules'
import type { BuildingsByTile, DiceRoll, Player } from '@/games/online/bankel7az/shared/types'
import { sounds } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const MAX_TURNS = 24

interface Decision {
  kind: 'buy' | 'build'
  tileId: number
  price: number
}

type Phase = 'ready' | 'moving' | 'decision' | 'over'

const BOT_BUY_BUFFER: Record<Difficulty, number> = { easy: 500, medium: 300, hard: 160 }
const BOT_BUY_CHANCE: Record<Difficulty, number> = { easy: 0.45, medium: 0.75, hard: 0.94 }

function createPlayers(againstBot: boolean): Player[] {
  return [
    {
      id: 'p1', name: 'اللاعب ١', color: 'red', position: 0, cash: STARTING_CASH, properties: [],
      connected: true, bankrupt: false, inPenalty: false, penaltyTurns: 0, skipTurns: 0,
    },
    {
      id: 'p2', name: againstBot ? 'الكمبيوتر' : 'اللاعب ٢', color: 'blue', position: 0, cash: STARTING_CASH, properties: [],
      connected: true, bankrupt: false, inPenalty: false, penaltyTurns: 0, skipTurns: 0,
    },
  ]
}

function tilePlacement(id: number): { gridColumn: number; gridRow: number } {
  if (id <= 10) return { gridColumn: id + 1, gridRow: 1 }
  if (id <= 18) return { gridColumn: 11, gridRow: id - 9 }
  if (id <= 29) return { gridColumn: 30 - id, gridRow: 10 }
  return { gridColumn: 1, gridRow: 39 - id }
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

export default function BankEl7azLocal({ config, onFinish }: GameProps) {
  const againstBot = config.mode === 'bot'
  const [players, setPlayers] = useState<Player[]>(() => createPlayers(againstBot))
  const [turnIndex, setTurnIndex] = useState(0)
  const [turnsPlayed, setTurnsPlayed] = useState(0)
  const [phase, setPhase] = useState<Phase>('ready')
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [buildings, setBuildings] = useState<BuildingsByTile>({})
  const [message, setMessage] = useState('ابدأ وارمِ الزهر')
  const finishedRef = useRef(false)
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const playersRef = useRef(players)
  const buildingsRef = useRef(buildings)
  playersRef.current = players
  buildingsRef.current = buildings

  const currentPlayer = players[turnIndex] ?? players[0]!
  const currentTile = BOARD_TILES[currentPlayer.position] ?? BOARD_TILES[0]!
  const humanTurn = !againstBot || turnIndex === 0

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
    if (outcome === 'win') sounds.win()
    else if (outcome === 'loss') sounds.lose()
    setMessage(outcome === 'draw' ? 'تعادل في الثروة! 🤝' : first > second ? 'اللاعب ١ هو أغنى لاعب! 🏆' : `${againstBot ? 'الكمبيوتر' : 'اللاعب ٢'} كسب المباراة!`)
    queue(() => {
      onFinish({
        gameId: 'bank-el7az',
        outcome,
        score: first,
        bestCandidate: first,
        coinsEarned: outcome === 'win' ? 55 : outcome === 'draw' ? 22 : 10,
        xpEarned: outcome === 'win' ? 75 : outcome === 'draw' ? 35 : 18,
        summary: `ثروتك النهائية ${first} جنيه مقابل ${second} جنيه 🏦`,
        detail: 'المباراة المحلية حُسبت بالنقد وقيمة المحافظات والمباني.',
      })
    }, 1_450)
  }, [againstBot, onFinish, queue])

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
    setMessage(`دور ${nextPlayers[nextIndex]?.name ?? 'اللاعب التالي'}`)
  }, [finishGame, turnIndex, turnsPlayed])

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
      setMessage(`${tile.name}: دفعت ${Math.min(player.cash, tile.amount)} جنيه`)
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
      setMessage(card.text)
      setPlayers(updated)
      queue(() => finishTurn(updated), 1_050)
      return
    }

    if (tile.kind === 'goToPenalty') {
      const updated = applyPayment(movedPlayers, playerIndex, PENALTY_BAIL)
      updated[playerIndex]!.position = 12
      setMessage(`روحت القسم ودفعت ${PENALTY_BAIL} جنيه`)
      setPlayers(updated)
      queue(() => finishTurn(updated), 1_050)
      return
    }

    if (isOwnableTile(tile)) {
      if (!owner && player.cash >= tile.price) {
        setPlayers(movedPlayers)
        setDecision({ kind: 'buy', tileId: tile.id, price: tile.price })
        setMessage(`${tile.name} متاحة بـ ${tile.price} جنيه`)
        setPhase('decision')
        return
      }

      if (owner && owner.id !== player.id) {
        const ownerIndex = movedPlayers.findIndex((item) => item.id === owner.id)
        const rent = calculateRent(tile, owner, diceTotal, buildingsRef.current)
        const paidPlayers = applyPayment(movedPlayers, playerIndex, rent, ownerIndex)
        setMessage(`دفعت ${Math.min(player.cash, rent)} جنيه إيجار لـ ${owner.name}`)
        setPlayers(paidPlayers)
        queue(() => finishTurn(paidPlayers), 1_050)
        return
      }

      if (owner?.id === player.id && isPropertyTile(tile) && canAddBuilding(tile, player, buildingsRef.current)) {
        const price = getBuildingCost(tile)
        if (player.cash >= price) {
          setPlayers(movedPlayers)
          setDecision({ kind: 'build', tileId: tile.id, price })
          setMessage(`تقدر تبني في ${tile.name} بـ ${price} جنيه`)
          setPhase('decision')
          return
        }
      }
    }

    setPlayers(movedPlayers)
    setMessage(tile.kind === 'start' ? 'نورت البداية!' : tile.kind === 'freeRest' ? 'استراحة على القهوة ☕' : `وقفت في ${tile.name}`)
    queue(() => finishTurn(movedPlayers), 850)
  }, [applyPayment, finishTurn, queue])

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
    setMessage(`${player.name} رمى ${roll.total}${passedStart ? ` وعدّى البداية +${START_BONUS}` : ''}`)
    setPlayers(nextPlayers)
    queue(() => resolveLanding(nextPlayers, turnIndex, roll.total), 700)
  }, [phase, players, queue, resolveLanding, turnIndex])

  const handleDecision = useCallback((accept: boolean) => {
    if (!decision || phase !== 'decision') return
    const nextPlayers = players.map((player) => ({ ...player, properties: [...player.properties] }))
    const player = nextPlayers[turnIndex]!
    const tile = BOARD_TILES[decision.tileId]
    if (accept && tile && player.cash >= decision.price) {
      player.cash -= decision.price
      if (decision.kind === 'buy') {
        player.properties.push(decision.tileId)
        setMessage(`${player.name} اشترى ${tile.name} 🎉`)
        sounds.correct()
      } else {
        const nextBuildings = { ...buildingsRef.current, [decision.tileId]: (buildingsRef.current[decision.tileId] ?? 0) + 1 }
        buildingsRef.current = nextBuildings
        setBuildings(nextBuildings)
        setMessage(`${player.name} بنى في ${tile.name} 🏠`)
        sounds.correct()
      }
    } else {
      setMessage(`${player.name} قرر يحتفظ بفلوسه`)
    }
    setPlayers(nextPlayers)
    setDecision(null)
    setPhase('moving')
    queue(() => finishTurn(nextPlayers), 650)
  }, [decision, finishTurn, phase, players, queue, turnIndex])

  useEffect(() => {
    if (!againstBot || turnIndex !== 1 || phase !== 'ready') return
    const timer = setTimeout(rollDice, 650)
    return () => clearTimeout(timer)
  }, [againstBot, phase, rollDice, turnIndex])

  useEffect(() => {
    if (!againstBot || turnIndex !== 1 || phase !== 'decision' || !decision) return
    const bot = players[1]!
    const accept = bot.cash - decision.price >= BOT_BUY_BUFFER[config.difficulty] && Math.random() <= BOT_BUY_CHANCE[config.difficulty]
    const timer = setTimeout(() => handleDecision(accept), 650)
    return () => clearTimeout(timer)
  }, [againstBot, config.difficulty, decision, handleDecision, phase, players, turnIndex])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const ownership = useMemo(() => new Map(players.flatMap((player, index) => player.properties.map((tileId) => [tileId, index] as const))), [players])

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <div className="w-full grid grid-cols-2 gap-2">
        {players.map((player, index) => (
          <div key={player.id} className={cn('glass rounded-2xl p-2.5 border transition-all', turnIndex === index && phase !== 'over' ? index === 0 ? 'border-red-400/60' : 'border-sky-400/60' : 'border-white/10', player.bankrupt && 'opacity-50')}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{index === 0 ? '🚗' : againstBot ? '🤖' : '🚙'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black truncate">{player.name}</p>
                <p className="text-[10px] text-muted-foreground">{player.properties.length} محافظة · {player.bankrupt ? 'أفلس' : `${player.cash} جنيه`}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="relative w-full max-w-[370px] aspect-[11/10] grid gap-[2px] rounded-3xl overflow-hidden border border-white/10 bg-slate-950/70 p-1" style={{ gridTemplateColumns: 'repeat(11, minmax(0, 1fr))', gridTemplateRows: 'repeat(10, minmax(0, 1fr))' }}>
        {BOARD_TILES.map((tile) => {
          const ownerIndex = ownership.get(tile.id)
          const buildingCount = buildings[tile.id] ?? 0
          const playersHere = players.map((player, index) => ({ player, index })).filter(({ player }) => player.position === tile.id && !player.bankrupt)
          return (
            <div
              key={tile.id}
              className={cn('relative min-w-0 rounded-[5px] border flex flex-col items-center justify-center overflow-hidden px-px text-center', currentPlayer.position === tile.id && 'ring-1 ring-emerald-300 z-10', ownerIndex === 0 ? 'border-red-400/70 bg-red-500/15' : ownerIndex === 1 ? 'border-sky-400/70 bg-sky-500/15' : 'border-white/10 bg-slate-800/90')}
              style={{ ...tilePlacement(tile.id), borderTopColor: tile.kind === 'property' ? tile.color : undefined }}
              title={tile.name}
            >
              <span className="text-[6px] leading-tight font-bold line-clamp-2">{tile.shortName}</span>
              {tile.kind === 'property' && <span className="text-[5px] text-amber-200">{tile.price}</span>}
              {buildingCount > 0 && <span className="absolute top-0 end-0 text-[6px]">{'🏠'.repeat(buildingCount)}</span>}
              <span className="absolute bottom-0 flex text-[7px] leading-none">
                {playersHere.map(({ index }) => <span key={index}>{index === 0 ? '🔴' : '🔵'}</span>)}
              </span>
            </div>
          )
        })}

        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-emerald-950/70 border border-emerald-400/20 p-2 flex flex-col items-center justify-center text-center gap-1.5" style={{ gridColumn: '2 / 11', gridRow: '2 / 10' }}>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {againstBot ? <Bot className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
            دور {turnsPlayed + 1} من {MAX_TURNS}
          </div>
          <p className="font-black text-sm line-clamp-2">{message}</p>
          <div className="min-h-10 flex items-center justify-center gap-2">
            {lastRoll ? (
              <>
                <DiceFace value={lastRoll.dieA} />
                <DiceFace value={lastRoll.dieB} />
                <bdi className="font-black text-amber-300 bidi-number">= {lastRoll.total}</bdi>
              </>
            ) : <Dice5 className="w-8 h-8 text-emerald-300" />}
          </div>
          <div className="text-[9px] text-slate-300 flex items-center gap-1">
            <span>{currentTile.name}</span>
            {isOwnableTile(currentTile) && <><Coins className="w-3 h-3 text-amber-300" /><span>{currentTile.price}</span></>}
          </div>

          {phase === 'ready' && humanTurn && (
            <button type="button" onClick={rollDice} className="min-h-11 px-6 rounded-2xl bg-gradient-to-l from-emerald-500 to-teal-500 font-black flex items-center gap-2 glow-emerald">
              <Dice5 className="w-5 h-5" /> ارمِ الزهر
            </button>
          )}
          {phase === 'ready' && !humanTurn && <p className="text-xs text-sky-300 animate-pulse">الكمبيوتر بيفكر…</p>}
          {phase === 'moving' && <p className="text-xs text-amber-300 animate-pulse">جاري تنفيذ الحركة…</p>}
          {phase === 'decision' && decision && humanTurn && (
            <div className="flex gap-2">
              <button type="button" onClick={() => handleDecision(true)} className="min-h-10 px-3 rounded-xl bg-emerald-500 font-black text-xs flex items-center gap-1">
                {decision.kind === 'buy' ? <ShoppingCart className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                {decision.kind === 'buy' ? 'اشتري' : 'ابني'} {decision.price}
              </button>
              <button type="button" onClick={() => handleDecision(false)} className="min-h-10 px-3 rounded-xl bg-white/10 font-bold text-xs">عدّي</button>
            </div>
          )}
          {phase === 'decision' && !humanTurn && <p className="text-xs text-sky-300 animate-pulse">الكمبيوتر بيقرر…</p>}
        </div>
      </div>

      <div className="w-full grid grid-cols-2 gap-2 text-xs">
        {players.map((player) => (
          <div key={player.id} className="glass rounded-2xl px-3 py-2 flex items-center justify-between">
            <span className="font-bold truncate">ثروة {player.name}</span>
            <bdi className="bidi-number tabular-nums font-black text-amber-300">{playerWealth(player, buildings)}</bdi>
          </div>
        ))}
      </div>
    </div>
  )
}

function DiceFace({ value }: { value: number }) {
  return <span className="w-9 h-9 rounded-xl bg-white text-slate-950 grid place-items-center text-lg font-black shadow-lg">{value}</span>
}
