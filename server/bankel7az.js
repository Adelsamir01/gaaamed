/**
 * ============================================================
 * بنك الحظ — نقل كامل ١:١ من المشروع الأصلي (bank-el7az-original)
 * المصدر:
 *  - packages/shared/src/{types,board,rules,stats,events}.ts
 *  - apps/server/src/game/engine.ts
 *  - apps/server/src/rooms/RoomManager.ts
 *  - apps/server/src/stats/StatsStore.ts
 *  - apps/server/src/websocket/validation.ts
 * التحويل TS→JS فقط (إزالة الأنواع) — كل ثابت ومعادلة ونص كما هو:
 *  إيجار النقل rent * 2^(owned-1)، المرافق diceTotal * (10|4)،
 *  الإيجار بالمباني rent*(2+buildings*1.45)، المجموعة الكاملة ×1.75،
 *  roundToTen، MAX_BUILDINGS_PER_PROPERTY=3، الكفالة ١٠٠، الإفلاس — الكل.
 * الانحرافات الموثقة الوحيدة (إضافية، لا تغيّر منطقًا):
 *  1) RoomManager.createRoom يقبل forcedCode اختياري (كود قييمد ذو ٤ أرقام).
 *  2) مسار ملف الإحصائيات الافتراضي server/data/bank-stats.json.
 * ============================================================
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

// ============================================================
// [packages/shared/src/board.ts] — ثوابت وبيانات اللوحة (حرفيًا)
// ============================================================
export const STARTING_CASH = 1000
export const START_BONUS = 250
export const MAX_PLAYERS = 6
export const MIN_PLAYERS = 2
export const PENALTY_BAIL = 100
export const ROOM_CODE_LENGTH = 5
export const MAX_BUILDINGS_PER_PROPERTY = 3
export const BUILDING_PRICE_RATE = 0.42
export const PROPERTY_SELL_RATE = 0.58
export const BUILDING_SELL_RATE = 0.5
export const SYNC_PLAYBACK_DELAY_MS = 300
export const CAR_MOVEMENT_OFFSET_MS = 140
export const CAR_STEP_MS = 110
export const DICE_THROW_MS = 560
export const ACTION_UNLOCK_BUFFER_MS = 100

export const GROUP_NAMES = {
  oldCairo: 'القاهرة الكبرى',
  westCoast: 'الساحل الغربي',
  centralDelta: 'وسط الدلتا',
  eastDelta: 'شرق الدلتا',
  canal: 'مدن القناة',
  middleEgypt: 'شمال الصعيد',
  upperEgypt: 'وسط الصعيد',
  southValley: 'جنوب الوادي',
  redSea: 'سينا والبحر الأحمر',
  transport: 'محافظات',
  utility: 'محافظات',
}

function property(id, name, group, color, price, rent, shortName = name) {
  return {
    id,
    kind: 'property',
    name,
    shortName,
    description: `${name} من مجموعة ${GROUP_NAMES[group]}. امتلاك التلات محافظات بيفتح البناء ويقوي الإيجار.`,
    group,
    color,
    price,
    rent,
  }
}

function special(id, kind, name, description) {
  return { id, kind, name, shortName: name === 'كارت حظ' ? 'حظ' : name, description }
}

function tax(id, name, description, amount) {
  return { id, kind: 'tax', name, shortName: name, description, amount }
}

export const BOARD_TILES = [
  special(0, 'start', 'البداية', 'كل ما تعدي البداية خد ٢٥٠ جنيه.'),

  property(1, 'القاهرة', 'oldCairo', '#9f342d', 90, 7),
  property(2, 'الجيزة', 'oldCairo', '#9f342d', 110, 9),
  property(3, 'القليوبية', 'oldCairo', '#9f342d', 130, 12),
  special(4, 'fate', 'كارت حظ', 'اسحب كارت وشوف النصيب.'),

  property(5, 'الإسكندرية', 'westCoast', '#2563c7', 140, 13, 'إسكندرية'),
  property(6, 'البحيرة', 'westCoast', '#2563c7', 160, 16),
  property(7, 'مطروح', 'westCoast', '#2563c7', 180, 19),
  tax(8, 'مخالفة', 'مخالفة عشوائية حسب اللي هيطلعلك.', 100),

  property(9, 'كفر الشيخ', 'centralDelta', '#16834f', 190, 20),
  property(10, 'الغربية', 'centralDelta', '#16834f', 210, 23),
  property(11, 'المنوفية', 'centralDelta', '#16834f', 230, 27),
  special(12, 'penalty', 'القسم', 'زيارة بس، إلا لو كارت دخلك هنا.'),

  property(13, 'الدقهلية', 'eastDelta', '#b87900', 230, 26),
  property(14, 'الشرقية', 'eastDelta', '#b87900', 250, 30),
  property(15, 'دمياط', 'eastDelta', '#b87900', 270, 34),
  special(16, 'fate', 'كارت حظ', 'اسحب كارت وشوف الحكاية.'),

  property(17, 'بورسعيد', 'canal', '#c52b71', 280, 35),
  property(18, 'الإسماعيلية', 'canal', '#c52b71', 300, 40, 'إسماعيلية'),
  property(19, 'السويس', 'canal', '#c52b71', 320, 46),
  special(20, 'freeRest', 'استراحة', 'استراحة على القهوة. مفيش دفع.'),

  property(21, 'الفيوم', 'middleEgypt', '#087f99', 320, 43),
  property(22, 'بني سويف', 'middleEgypt', '#087f99', 350, 50),
  property(23, 'المنيا', 'middleEgypt', '#087f99', 380, 58),
  tax(24, 'رسوم', 'رسوم عشوائية حسب الورقة اللي تطلع.', 150),

  property(25, 'أسيوط', 'upperEgypt', '#dd5519', 390, 60),
  property(26, 'الوادي الجديد', 'upperEgypt', '#dd5519', 420, 70),
  property(27, 'سوهاج', 'upperEgypt', '#dd5519', 450, 82),
  special(28, 'fate', 'كارت حظ', 'اسحب كارت وشوف ربنا كاتب إيه.'),

  property(29, 'قنا', 'southValley', '#7138b8', 460, 78),
  property(30, 'الأقصر', 'southValley', '#7138b8', 500, 92),
  property(31, 'أسوان', 'southValley', '#7138b8', 540, 108),
  special(32, 'goToPenalty', 'تفتيش', 'روح على القسم فورًا.'),

  property(33, 'شمال سيناء', 'redSea', '#087267', 560, 100, 'شمال سينا'),
  property(34, 'جنوب سيناء', 'redSea', '#087267', 610, 120, 'جنوب سينا'),
  property(35, 'البحر الأحمر', 'redSea', '#087267', 660, 145),
  special(36, 'fate', 'كارت حظ', 'اسحب كارت وعيش اللحظة.'),
  tax(37, 'مصاريف', 'مصاريف طارئة بتتحدد وقتها.', 120),
]

export const PENALTY_TILE_ID = 12

// ============================================================
// [packages/shared/src/rules.ts] — قواعد الحساب (حرفيًا)
// ============================================================
export function getTile(tileId) {
  const tile = BOARD_TILES[tileId]
  if (!tile) {
    throw new Error(`Unknown tile ${tileId}`)
  }
  return tile
}

export function isOwnableTile(tile) {
  return tile.kind === 'property' || tile.kind === 'transport' || tile.kind === 'utility'
}

export function isPropertyTile(tile) {
  return tile.kind === 'property'
}

export function isTaxTile(tile) {
  return tile.kind === 'tax'
}

export function findOwner(players, tileId) {
  return players.find((player) => player.properties.includes(tileId) && !player.bankrupt) ?? null
}

export function ownsFullPropertyGroup(tile, owner) {
  const groupTiles = BOARD_TILES.filter(
    (candidate) => candidate.kind === 'property' && candidate.group === tile.group,
  )
  return groupTiles.every((candidate) => owner.properties.includes(candidate.id))
}

export function countOwnedByGroup(owner, group) {
  return BOARD_TILES.filter((tile) => isOwnableTile(tile) && tile.group === group && owner.properties.includes(tile.id)).length
}

export function calculateRent(tile, owner, lastDiceTotal, buildingsByTile = {}) {
  if (tile.kind === 'transport') {
    const ownedRoutes = countOwnedByGroup(owner, 'transport')
    return tile.rent * 2 ** Math.max(ownedRoutes - 1, 0)
  }

  if (tile.kind === 'utility') {
    const ownedUtilities = countOwnedByGroup(owner, 'utility')
    return lastDiceTotal * (ownedUtilities >= 2 ? 10 : 4)
  }

  const buildingCount = buildingsByTile[tile.id] ?? 0
  if (buildingCount > 0) {
    return Math.round(tile.rent * (2 + buildingCount * 1.45))
  }

  if (ownsFullPropertyGroup(tile, owner)) {
    return Math.round(tile.rent * 1.75)
  }

  return tile.rent
}

export function getBuildingCost(tile) {
  return roundToTen(tile.price * BUILDING_PRICE_RATE)
}

export function getPropertySellValue(tile, buildingsByTile = {}) {
  const buildingCount = buildingsByTile[tile.id] ?? 0
  const buildingValue = tile.kind === 'property' ? getBuildingCost(tile) * buildingCount * BUILDING_SELL_RATE : 0
  return roundToTen(tile.price * PROPERTY_SELL_RATE + buildingValue)
}

export function canAddBuilding(tile, owner, buildingsByTile = {}) {
  return ownsFullPropertyGroup(tile, owner) && (buildingsByTile[tile.id] ?? 0) < MAX_BUILDINGS_PER_PROPERTY
}

function roundToTen(value) {
  return Math.round(value / 10) * 10
}

// ============================================================
// [apps/server/src/game/engine.ts] — المحرك المرجعي (منطق حرفي)
// ============================================================
export class GameError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GameError'
  }
}

const PLAYER_COLORS = ['red', 'blue', 'green', 'gold', 'purple', 'teal']
const moneyFormatter = new Intl.NumberFormat('ar-EG')

const statsSinks = new WeakMap()
const gameStartedAtByState = new WeakMap()

export function attachStatsSink(state, sink) {
  statsSinks.set(state, sink)
}

const FATE_CARDS = [
  {
    title: 'مكافأة شغلانة',
    apply: (state, player, _rng, title) => {
      player.cash += 160
      emitStats(state, {
        type: 'money_awarded',
        playerId: player.id,
        playerName: player.name,
        amount: 160,
        label: title,
        fateTitle: title,
      })
      addLog(state, `${player.name} كسب ${money(160)} من شغلانة حلوة.`)
    },
  },
  {
    title: 'محافظة هدية',
    apply: (state, player, rng, title) => {
      const availableTiles = BOARD_TILES.filter((tile) => isOwnableTile(tile) && !findOwner(state.players, tile.id))
      const giftedTile = availableTiles[Math.floor(rng() * availableTiles.length)]
      if (!giftedTile) {
        player.cash += 120
        emitStats(state, {
          type: 'money_awarded',
          playerId: player.id,
          playerName: player.name,
          amount: 120,
          label: title,
          fateTitle: title,
        })
        addLog(state, `${player.name} ملقاش محافظة فاضية وخد ${money(120)} بدلها.`)
        return
      }
      player.properties.push(giftedTile.id)
      emitStats(state, {
        type: 'property_gifted',
        playerId: player.id,
        playerName: player.name,
        ...tileStatsFields(giftedTile),
        price: giftedTile.price,
        fateTitle: title,
      })
      addLog(state, `${player.name} خد ${giftedTile.name} هدية من كارت الحظ.`)
    },
  },
  {
    title: 'غرامة مفاجئة',
    apply: (state, player, _rng, title) => {
      payBank(state, player, 130, `دفع ${money(130)} غرامة مفاجئة`, {
        category: 'fate',
        label: title,
        fateTitle: title,
      })
    },
  },
  {
    title: 'رجوع للبداية',
    apply: (state, player) => {
      player.position = 0
      player.cash += START_BONUS
      emitStats(state, {
        type: 'start_bonus',
        playerId: player.id,
        playerName: player.name,
        amount: START_BONUS,
      })
      addLog(state, `${player.name} رجع للبداية وخد ${money(START_BONUS)}.`)
    },
  },
  {
    title: 'عزومة على حسابك',
    apply: (state, player, _rng, title) => {
      for (const rival of activePlayers(state)) {
        if (rival.id !== player.id) {
          payPlayer(state, player, rival, 45, `دفع لـ ${rival.name} ${money(45)} عزومة حظ`, {
            category: 'fate',
            label: title,
            fateTitle: title,
          })
        }
      }
    },
  },
  {
    title: 'لقطة حلوة',
    apply: (state, player, _rng, title) => {
      for (const rival of activePlayers(state)) {
        if (rival.id !== player.id) {
          payPlayer(state, rival, player, 25, `دفع لـ ${player.name} ${money(25)} بسبب صفقة حلوة`, {
            category: 'fate',
            label: title,
            fateTitle: title,
          })
        }
      }
    },
  },
  {
    title: 'مصاريف صيانة',
    apply: (state, player, _rng, title) => {
      const amount = player.properties.length * 40
      if (amount === 0) {
        addLog(state, `${player.name} معندوش محافظات، فعدى من مصاريف الصيانة.`)
        return
      }
      payBank(state, player, amount, `دفع ${money(amount)} مصاريف صيانة`, {
        category: 'fate',
        label: title,
        fateTitle: title,
      })
    },
  },
  {
    title: 'تفتيش مفاجئ',
    apply: (state, player, _rng, title) => {
      addLog(state, `${player.name} طلعله تفتيش مفاجئ.`)
      sendToPenalty(state, player, 'fate', title)
    },
  },
  {
    title: 'تعطيل مصالح',
    apply: (state, player, _rng, title) => {
      player.skipTurns += 2
      emitStats(state, {
        type: 'fate_skip_turns',
        playerId: player.id,
        playerName: player.name,
        title,
        turns: 2,
      })
      addLog(state, `${player.name} اتعطلت مصالحه وهيفوت دورين.`)
    },
  },
]

const TRAFFIC_VIOLATIONS = [
  { title: 'مخالفة ركن غلط', amount: 60 },
  { title: 'مخالفة سرعة', amount: 100 },
  { title: 'مخالفة حزام', amount: 80 },
  { title: 'مخالفة إشارة', amount: 140 },
  { title: 'مخالفة انتظار صف تاني', amount: 120 },
]

const GOVERNMENT_FEES = [
  { title: 'رسوم مرافق', amount: 90 },
  { title: 'رسوم تسجيل', amount: 130 },
  { title: 'رسوم صيانة طريق', amount: 160 },
  { title: 'رسوم خدمات', amount: 110 },
  { title: 'رسوم تنمية', amount: 190 },
]

export function createGameState(roomCode, hostId, hostName) {
  const now = Date.now()
  const host = createPlayer(hostId, hostName, PLAYER_COLORS[0])
  return {
    roomCode,
    hostId,
    status: 'lobby',
    players: [host],
    currentPlayerId: null,
    turnPhase: 'roll',
    pendingPurchase: null,
    buildingsByTile: {},
    lastRoll: null,
    winnerId: null,
    createdAt: now,
    updatedAt: now,
    actionAvailableAt: now,
    log: [
      {
        id: randomUUID(),
        message: `${host.name} فتح أوضة ${roomCode}.`,
        createdAt: now,
      },
    ],
  }
}

export function addPlayer(state, playerId, name) {
  if (state.status !== 'lobby') {
    throw new GameError('اللعبة بدأت خلاص.')
  }
  if (state.players.length >= MAX_PLAYERS) {
    throw new GameError(`الأوضة تشيل لحد ${MAX_PLAYERS} لاعيبة.`)
  }

  const color = PLAYER_COLORS[state.players.length] ?? 'teal'
  const player = createPlayer(playerId, name, color)
  state.players.push(player)
  addLog(state, `${player.name} دخل الأوضة.`)
  touch(state)
  return player
}

export function reconnectPlayer(state, playerId, name) {
  const player = getPlayer(state, playerId)
  player.name = normalizeName(name)
  player.connected = true
  addLog(state, `${player.name} رجع تاني.`)
  touch(state)
  return player
}

export function setConnected(state, playerId, connected) {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player || player.bankrupt) {
    return
  }
  player.connected = connected
  addLog(state, `${player.name} ${connected ? 'رجع تاني' : 'فصل'}.`)
  touch(state)
}

export function startGame(state, playerId) {
  assertHost(state, playerId)
  if (state.status !== 'lobby') {
    throw new GameError('اللعبة شغالة بالفعل.')
  }
  if (state.players.length < MIN_PLAYERS) {
    throw new GameError(`لازم ${MIN_PLAYERS} لاعيبة على الأقل عشان نبدأ.`)
  }

  state.status = 'playing'
  state.currentPlayerId = state.players[0]?.id ?? null
  state.turnPhase = 'roll'
  state.pendingPurchase = null
  gameStartedAtByState.set(state, Date.now())
  addLog(state, 'اللعبة بدأت. ارمي الزهر لأول حركة.')
  emitStats(state, {
    type: 'game_started',
    playerCount: state.players.length,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      cash: player.cash,
    })),
  })
  touch(state)
}

export function rollDice(state, playerId, rng = Math.random) {
  assertTurn(state, playerId)
  if (state.turnPhase !== 'roll') {
    throw new GameError('مينفعش ترمي دلوقتي.')
  }

  const player = getPlayer(state, playerId)
  const startPosition = player.position
  const roll = makeRoll(rng)
  state.lastRoll = roll
  addLog(state, `${player.name} رمى ${formatNumber(roll.dieA)} + ${formatNumber(roll.dieB)}.`)
  emitStats(state, {
    type: 'dice_rolled',
    playerId: player.id,
    playerName: player.name,
    dieA: roll.dieA,
    dieB: roll.dieB,
    total: roll.total,
    isDouble: roll.isDouble,
    fromTileId: startPosition,
    toTileId: (startPosition + roll.total) % BOARD_TILES.length,
  })

  if (player.inPenalty) {
    resolvePenaltyRoll(state, player, roll, rng)
  } else {
    movePlayer(state, player, roll.total)
    resolveLanding(state, player, roll.total, rng)
  }

  checkWinner(state)
  advanceIfTurnComplete(state)
  touch(state)
  scheduleActionLockForMove(state, startPosition, player.position)
  return roll
}

export function buyProperty(state, playerId) {
  assertTurn(state, playerId)
  if (state.turnPhase !== 'buy' || !state.pendingPurchase) {
    throw new GameError('مفيش محافظة متاحة للشراء دلوقتي.')
  }
  if (state.pendingPurchase.playerId !== playerId) {
    throw new GameError('اللاعب اللي وقف هنا بس يقدر يشتري.')
  }

  const player = getPlayer(state, playerId)
  const tile = getTile(state.pendingPurchase.tileId)
  if (!isOwnableTile(tile)) {
    throw new GameError('الخانة دي مش للبيع.')
  }
  if (findOwner(state.players, tile.id)) {
    throw new GameError('المحافظة دي ليها مالك بالفعل.')
  }
  if (player.cash < tile.price) {
    throw new GameError('فلوسك مش مكفية للشراء.')
  }

  player.cash -= tile.price
  player.properties.push(tile.id)
  state.pendingPurchase = null
  state.turnPhase = 'end'
  addLog(state, `${player.name} اشترى ${tile.name} بـ ${money(tile.price)}.`)
  emitStats(state, {
    type: 'property_bought',
    playerId: player.id,
    playerName: player.name,
    ...tileStatsFields(tile),
    price: tile.price,
  })
  advanceIfTurnComplete(state)
  touch(state)
}

export function passProperty(state, playerId) {
  assertTurn(state, playerId)
  if (state.turnPhase !== 'buy' || !state.pendingPurchase) {
    throw new GameError('مفيش قرار شراء تتخطاه.')
  }
  const tile = getTile(state.pendingPurchase.tileId)
  state.pendingPurchase = null
  state.turnPhase = 'end'
  addLog(state, `${getPlayer(state, playerId).name} ساب ${tile.name} للبنك.`)
  if (isOwnableTile(tile)) {
    const player = getPlayer(state, playerId)
    emitStats(state, {
      type: 'property_passed',
      playerId: player.id,
      playerName: player.name,
      ...tileStatsFields(tile),
      price: tile.price,
    })
  }
  advanceIfTurnComplete(state)
  touch(state)
}

export function buildProperty(state, playerId, tileId) {
  assertActivePlayer(state, playerId)
  const player = getPlayer(state, playerId)
  const tile = getTile(tileId)
  if (!isPropertyTile(tile)) {
    throw new GameError('البناء على المحافظات بس.')
  }
  if (!player.properties.includes(tile.id)) {
    throw new GameError('لازم تكون مالك المحافظة عشان تبني عليها.')
  }
  if (!canAddBuilding(tile, player, state.buildingsByTile)) {
    throw new GameError('لازم تملك المجموعة ولسه فيها مكان لمبنى جديد.')
  }

  const cost = getBuildingCost(tile)
  if (player.cash < cost) {
    throw new GameError('فلوسك مش مكفية للبناء.')
  }

  const nextBuildingCount = (state.buildingsByTile[tile.id] ?? 0) + 1
  player.cash -= cost
  state.buildingsByTile[tile.id] = nextBuildingCount
  addLog(state, `${player.name} بنى مبنى رقم ${formatNumber(nextBuildingCount)} على ${tile.name} بـ ${money(cost)}.`)
  emitStats(state, {
    type: 'building_built',
    playerId: player.id,
    playerName: player.name,
    tileId: tile.id,
    tileName: tile.name,
    tileGroup: tile.group,
    cost,
    buildingCount: nextBuildingCount,
  })
  touch(state)
}

export function sellProperty(state, playerId, tileId) {
  assertActivePlayer(state, playerId)
  const player = getPlayer(state, playerId)
  const tile = getTile(tileId)
  if (!isOwnableTile(tile)) {
    throw new GameError('الخانة دي مش ملكية تتباع.')
  }
  if (!player.properties.includes(tile.id)) {
    throw new GameError('مينفعش تبيع حاجة مش بتاعتك.')
  }

  const saleValue = getPropertySellValue(tile, state.buildingsByTile)
  const buildingCount = state.buildingsByTile[tile.id] ?? 0
  player.properties = player.properties.filter((propertyId) => propertyId !== tile.id)
  delete state.buildingsByTile[tile.id]
  player.cash += saleValue
  addLog(
    state,
    buildingCount > 0
      ? `${player.name} باع ${tile.name} للبنك ورجع ${formatNumber(buildingCount)} مباني بـ ${money(saleValue)}.`
      : `${player.name} باع ${tile.name} للبنك بـ ${money(saleValue)}.`,
  )
  emitStats(state, {
    type: 'property_sold',
    playerId: player.id,
    playerName: player.name,
    ...tileStatsFields(tile),
    saleValue,
    buildingCount,
  })
  touch(state)
}

export function payBail(state, playerId) {
  assertTurn(state, playerId)
  if (state.turnPhase !== 'roll') {
    throw new GameError('الكفالة تتدفع قبل رمية الزهر بس.')
  }
  const player = getPlayer(state, playerId)
  if (!player.inPenalty) {
    throw new GameError('إنت مش في القسم.')
  }
  payBank(state, player, PENALTY_BAIL, `دفع ${money(PENALTY_BAIL)} كفالة`, {
    category: 'bail',
    label: 'كفالة القسم',
  })
  if (!player.bankrupt) {
    player.inPenalty = false
    player.penaltyTurns = 0
  } else {
    state.turnPhase = 'end'
  }
  checkWinner(state)
  advanceIfTurnComplete(state)
  touch(state)
}

export function endTurn(state, playerId) {
  assertTurn(state, playerId)
  if (state.status !== 'playing') {
    throw new GameError('اللعبة مش شغالة.')
  }
  if (state.turnPhase !== 'end') {
    throw new GameError('خلص القرار الحالي الأول.')
  }
  advanceTurn(state)
  touch(state)
}

export function normalizeName(name) {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    return 'لاعب'
  }
  return trimmed.slice(0, 24)
}

export function leavePlayer(state, playerId) {
  const player = getPlayer(state, playerId)
  const playerName = player.name

  if (state.status === 'lobby') {
    state.players = state.players.filter((candidate) => candidate.id !== playerId)
    if (state.hostId === playerId && state.players[0]) {
      state.hostId = state.players[0].id
    }
    addLog(state, `${playerName} خرج من الأوضة.`)
    touch(state)
    return
  }

  player.bankrupt = true
  player.connected = false
  player.cash = 0
  clearPlayerBuildings(state, player)
  player.properties = []
  player.inPenalty = false
  player.penaltyTurns = 0
  if (state.pendingPurchase?.playerId === playerId) {
    state.pendingPurchase = null
  }
  if (state.currentPlayerId === playerId) {
    state.turnPhase = 'end'
  }
  addLog(state, `${playerName} خرج من اللعبة.`)
  checkWinner(state)
  advanceIfTurnComplete(state)
  touch(state)
}

function createPlayer(id, name, color) {
  return {
    id,
    name: normalizeName(name),
    color,
    position: 0,
    cash: STARTING_CASH,
    properties: [],
    connected: true,
    bankrupt: false,
    inPenalty: false,
    penaltyTurns: 0,
    skipTurns: 0,
  }
}

function assertHost(state, playerId) {
  if (state.hostId !== playerId) {
    throw new GameError('صاحب الأوضة بس يقدر يعمل كده.')
  }
}

function assertTurn(state, playerId) {
  if (state.status !== 'playing') {
    throw new GameError('اللعبة مش شغالة.')
  }
  if (state.currentPlayerId !== playerId) {
    throw new GameError('الدور مش عليك.')
  }
}

function assertActivePlayer(state, playerId) {
  if (state.status !== 'playing') {
    throw new GameError('اللعبة مش شغالة.')
  }
  const player = getPlayer(state, playerId)
  if (player.bankrupt) {
    throw new GameError('اللاعب مفلس ومينفعش يعمل كده.')
  }
}

function getPlayer(state, playerId) {
  const player = state.players.find((candidate) => candidate.id === playerId)
  if (!player) {
    throw new GameError('لاعب غير معروف.')
  }
  return player
}

function makeRoll(rng) {
  const dieA = Math.floor(rng() * 6) + 1
  const dieB = Math.floor(rng() * 6) + 1
  return {
    dieA,
    dieB,
    total: dieA + dieB,
    isDouble: dieA === dieB,
  }
}

function resolvePenaltyRoll(state, player, roll, rng) {
  if (roll.isDouble) {
    player.inPenalty = false
    player.penaltyTurns = 0
    addLog(state, `${player.name} جاب دوبل وخرج من القسم.`)
    movePlayer(state, player, roll.total)
    resolveLanding(state, player, roll.total, rng)
    return
  }

  player.penaltyTurns += 1
  if (player.penaltyTurns >= 3) {
    payBank(state, player, PENALTY_BAIL, `دفع ${money(PENALTY_BAIL)} بعد ٣ أدوار في القسم`, {
      category: 'bail',
      label: 'كفالة بعد ٣ أدوار',
    })
    if (!player.bankrupt) {
      player.inPenalty = false
      player.penaltyTurns = 0
      movePlayer(state, player, roll.total)
      resolveLanding(state, player, roll.total, rng)
    } else {
      state.turnPhase = 'end'
    }
    return
  }

  addLog(state, `${player.name} لسه في القسم.`)
  state.turnPhase = 'end'
}

function movePlayer(state, player, steps) {
  const nextPosition = player.position + steps
  if (nextPosition >= BOARD_TILES.length) {
    player.cash += START_BONUS
    emitStats(state, {
      type: 'start_bonus',
      playerId: player.id,
      playerName: player.name,
      amount: START_BONUS,
    })
    addLog(state, `${player.name} عدى البداية وخد ${money(START_BONUS)}.`)
  }
  player.position = nextPosition % BOARD_TILES.length
}

function resolveLanding(state, player, diceTotal, rng) {
  if (player.bankrupt || state.status === 'finished') {
    return
  }

  const tile = getTile(player.position)
  addLog(state, `${player.name} وقف على ${tile.name}.`)
  emitStats(state, {
    type: 'tile_landed',
    playerId: player.id,
    playerName: player.name,
    ...tileStatsFields(tile),
  })

  if (isOwnableTile(tile)) {
    const owner = findOwner(state.players, tile.id)
    if (!owner) {
      state.pendingPurchase = {
        playerId: player.id,
        tileId: tile.id,
        price: tile.price,
      }
      state.turnPhase = 'buy'
      emitStats(state, {
        type: 'property_offered',
        playerId: player.id,
        playerName: player.name,
        ...tileStatsFields(tile),
        price: tile.price,
      })
      addLog(state, `${tile.name} متاحة للشراء بـ ${money(tile.price)}.`)
      return
    }

    if (owner.id === player.id) {
      addLog(state, `${player.name} مالك ${tile.name} بالفعل.`)
      state.turnPhase = 'end'
      return
    }

    const rent = calculateRent(tile, owner, diceTotal, state.buildingsByTile)
    payPlayer(state, player, owner, rent, `هاتو الفلوس اللي عليكوو: دفع لـ ${owner.name} ${money(rent)} إيجار ${tile.name}`, {
      category: 'rent',
      label: `إيجار ${tile.name}`,
      tileId: tile.id,
      tileName: tile.name,
    })
    state.turnPhase = 'end'
    return
  }

  if (isTaxTile(tile)) {
    const event = drawTaxEvent(tile.name, rng)
    emitStats(state, {
      type: 'tax_paid',
      playerId: player.id,
      playerName: player.name,
      tileId: tile.id,
      tileName: tile.name,
      title: event.title,
      amount: event.amount,
    })
    payBank(state, player, event.amount, `${event.title} ${money(event.amount)} في ${tile.name}`, {
      category: 'tax',
      label: event.title,
      tileId: tile.id,
      tileName: tile.name,
    })
    state.turnPhase = 'end'
    return
  }

  if (tile.kind === 'fate') {
    drawFate(state, player, rng)
    if (player.bankrupt) {
      state.turnPhase = 'end'
    } else if (state.turnPhase !== 'end') {
      state.turnPhase = 'end'
    }
    return
  }

  if (tile.kind === 'goToPenalty') {
    sendToPenalty(state, player, 'tile')
    return
  }

  state.turnPhase = 'end'
}

function drawFate(state, player, rng) {
  const card = FATE_CARDS[Math.floor(rng() * FATE_CARDS.length)] ?? FATE_CARDS[0]
  addLog(state, `${player.name} سحب "${card.title}".`)
  emitStats(state, {
    type: 'fate_drawn',
    playerId: player.id,
    playerName: player.name,
    title: card.title,
  })
  card.apply(state, player, rng, card.title)
  checkWinner(state)
}

function drawTaxEvent(tileName, rng) {
  const events = tileName === 'مخالفة' ? TRAFFIC_VIOLATIONS : GOVERNMENT_FEES
  return events[Math.floor(rng() * events.length)] ?? events[0]
}

function sendToPenalty(state, player, source = 'other', fateTitle) {
  player.position = PENALTY_TILE_ID
  player.inPenalty = true
  player.penaltyTurns = 0
  state.pendingPurchase = null
  state.turnPhase = 'end'
  emitStats(state, {
    type: 'sent_to_penalty',
    playerId: player.id,
    playerName: player.name,
    source,
    fateTitle,
  })
  addLog(state, `${player.name} راح القسم.`)
}

function payBank(state, player, amount, reason, meta = {}) {
  player.cash -= amount
  emitStats(state, {
    type: 'bank_paid',
    playerId: player.id,
    playerName: player.name,
    amount,
    category: meta.category ?? 'other',
    label: meta.label ?? reason,
    tileId: meta.tileId,
    tileName: meta.tileName,
    fateTitle: meta.fateTitle,
  })
  addLog(state, `${player.name} ${reason}.`)
  if (player.cash < 0) {
    bankrupt(state, player, reason)
  }
}

function payPlayer(state, payer, recipient, amount, reason, meta = {}) {
  const paid = Math.min(Math.max(payer.cash, 0), amount)
  payer.cash -= amount
  recipient.cash += paid
  emitStats(state, {
    type: 'player_paid',
    payerId: payer.id,
    payerName: payer.name,
    recipientId: recipient.id,
    recipientName: recipient.name,
    amountCharged: amount,
    amountPaid: paid,
    category: meta.category ?? 'fate',
    label: meta.label ?? reason,
    tileId: meta.tileId,
    tileName: meta.tileName,
    fateTitle: meta.fateTitle,
  })
  addLog(state, `${payer.name} ${reason}.`)
  if (payer.cash < 0) {
    bankrupt(state, payer, reason)
  }
}

function bankrupt(state, player, reason) {
  if (player.bankrupt) {
    return
  }

  player.bankrupt = true
  player.connected = false
  player.cash = 0
  clearPlayerBuildings(state, player)
  player.properties = []
  player.inPenalty = false
  player.penaltyTurns = 0
  player.skipTurns = 0
  if (state.pendingPurchase?.playerId === player.id) {
    state.pendingPurchase = null
  }
  emitStats(state, {
    type: 'bankrupt',
    playerId: player.id,
    playerName: player.name,
    label: reason,
  })
  addLog(state, `${player.name} أفلس بعد ما ${reason}.`)
  checkWinner(state)
}

function advanceTurn(state) {
  const players = activePlayers(state)
  if (players.length <= 1) {
    checkWinner(state)
    return
  }

  const currentIndex = state.players.findIndex((player) => player.id === state.currentPlayerId)
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset + state.players.length) % state.players.length]
    if (candidate && !candidate.bankrupt) {
      if (candidate.skipTurns > 0) {
        candidate.skipTurns -= 1
        emitStats(state, {
          type: 'turn_skipped',
          playerId: candidate.id,
          playerName: candidate.name,
          remainingSkips: candidate.skipTurns,
        })
        addLog(state, `${candidate.name} فوت دور بسبب كارت الحظ.`)
        continue
      }
      state.currentPlayerId = candidate.id
      state.turnPhase = 'roll'
      state.pendingPurchase = null
      addLog(state, `الدور على ${candidate.name}.`)
      return
    }
  }

  const fallback = state.players.find((player) => !player.bankrupt)
  if (fallback) {
    state.currentPlayerId = fallback.id
    state.turnPhase = 'roll'
    state.pendingPurchase = null
    addLog(state, `الدور على ${fallback.name}.`)
  }
}

function advanceIfTurnComplete(state) {
  if (state.status === 'playing' && state.turnPhase === 'end') {
    advanceTurn(state)
  }
}

function activePlayers(state) {
  return state.players.filter((player) => !player.bankrupt)
}

function checkWinner(state) {
  if (state.status !== 'playing') {
    return
  }
  const players = activePlayers(state)
  if (players.length === 1) {
    const winner = players[0]
    state.status = 'finished'
    state.winnerId = winner.id
    state.currentPlayerId = null
    state.turnPhase = 'end'
    state.pendingPurchase = null
    emitStats(state, {
      type: 'game_finished',
      winnerId: winner.id,
      winnerName: winner.name,
      winnerCash: winner.cash,
      playerCount: state.players.length,
      players: state.players.map((player) => ({ id: player.id, name: player.name })),
      startedAt: gameStartedAtByState.get(state) ?? state.createdAt,
      durationMs: Date.now() - (gameStartedAtByState.get(state) ?? state.createdAt),
      status: state.status,
    })
    addLog(state, `${winner.name} كسب بنك الحظ.`)
  }
}

function addLog(state, message) {
  state.log = [
    {
      id: randomUUID(),
      message,
      createdAt: Date.now(),
    },
    ...state.log,
  ].slice(0, 60)
}

function touch(state) {
  state.updatedAt = Date.now()
  state.actionAvailableAt = Math.max(state.actionAvailableAt, state.updatedAt)
}

function scheduleActionLockForMove(state, startPosition, targetPosition) {
  const steps = clockwiseDistance(startPosition, targetPosition)
  const movementDoneAt = state.updatedAt + SYNC_PLAYBACK_DELAY_MS + CAR_MOVEMENT_OFFSET_MS + steps * CAR_STEP_MS
  const diceDoneAt = state.updatedAt + SYNC_PLAYBACK_DELAY_MS + DICE_THROW_MS
  state.actionAvailableAt = Math.max(movementDoneAt, diceDoneAt) + ACTION_UNLOCK_BUFFER_MS
}

function clockwiseDistance(startPosition, targetPosition) {
  return (targetPosition - startPosition + BOARD_TILES.length) % BOARD_TILES.length
}

function clearPlayerBuildings(state, player) {
  for (const tileId of player.properties) {
    delete state.buildingsByTile[tileId]
  }
}

function emitStats(state, event) {
  statsSinks.get(state)?.record({
    ...event,
    roomCode: state.roomCode,
    at: Date.now(),
  })
}

function tileStatsFields(tile) {
  return {
    tileId: tile.id,
    tileName: tile.name,
    tileKind: tile.kind,
    tileGroup: isOwnableTile(tile) ? tile.group : undefined,
  }
}

function money(amount) {
  return `${moneyFormatter.format(amount)} جنيه`
}

function formatNumber(value) {
  return moneyFormatter.format(value)
}
// ---------------------------------------------------------------------------
// StatsStore (نقل حرفي من apps/server/src/stats/StatsStore.ts)
// ---------------------------------------------------------------------------
const STATS_VERSION = 1;
const MAX_RECENT_GAMES = 30;

class StatsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.lastError = null;
    this.stats = this.load();
    this.write();
  }

  getSnapshot(live) {
    return {
      generatedAt: Date.now(),
      persistent: this.stats,
      live,
      storage: {
        filePath: this.filePath,
        lastError: this.lastError
      }
    };
  }

  recordRoomCreated(roomCode, hostName, hostCash) {
    const at = Date.now();
    this.stats.totals.roomsCreated += 1;
    this.stats.totals.playersJoined += 1;
    const player = this.player(hostName, at);
    player.roomsCreated += 1;
    player.joins += 1;
    player.highestCash = Math.max(player.highestCash, hostCash);
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordPlayerJoined(playerName, cash) {
    const at = Date.now();
    this.stats.totals.playersJoined += 1;
    const player = this.player(playerName, at);
    player.joins += 1;
    player.highestCash = Math.max(player.highestCash, cash);
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordReconnect(playerName, cash) {
    const at = Date.now();
    this.stats.totals.reconnects += 1;
    const player = this.player(playerName, at);
    player.reconnects += 1;
    player.highestCash = Math.max(player.highestCash, cash);
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordDisconnect(playerName) {
    const at = Date.now();
    this.stats.totals.disconnects += 1;
    const player = this.player(playerName, at);
    player.disconnects += 1;
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordLeave(playerName) {
    const at = Date.now();
    this.stats.totals.leaves += 1;
    const player = this.player(playerName, at);
    player.leaves += 1;
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordRoomExpired() {
    const at = Date.now();
    this.stats.totals.roomsExpired += 1;
    this.touchAndWrite(at);
  }

  recordEngineEvent(event) {
    switch (event.type) {
      case "game_started":
        this.stats.totals.gamesStarted += 1;
        this.stats.activeGames[event.roomCode] = {
          roomCode: event.roomCode,
          startedAt: event.at,
          playerCount: event.playerCount,
          turns: 0,
          rolls: 0,
          propertiesBought: 0,
          rentPaid: 0,
          bankruptcies: 0
        };
        for (const eventPlayer of event.players) {
          const player = this.player(eventPlayer.name, event.at);
          player.gamesStarted += 1;
          player.highestCash = Math.max(player.highestCash, eventPlayer.cash);
          player.lastSeenAt = event.at;
        }
        break;

      case "dice_rolled":
        this.stats.totals.rolls += 1;
        increment(this.stats.diceFaces, event.dieA);
        increment(this.stats.diceFaces, event.dieB);
        increment(this.stats.diceTotals, event.total);
        if (event.isDouble) {
          this.stats.totals.doubles += 1;
        }
        this.withActiveGame(event.roomCode, (game) => {
          game.rolls += 1;
          game.turns += 1;
        });
        this.player(event.playerName, event.at).rolls += 1;
        if (event.isDouble) {
          this.player(event.playerName, event.at).doubles += 1;
        }
        break;

      case "tile_landed":
        this.stats.totals.tilesLanded += 1;
        this.tile(event).lands += 1;
        this.player(event.playerName, event.at).tilesLanded += 1;
        break;

      case "start_bonus":
        this.stats.totals.startPasses += 1;
        this.stats.money.startBonuses += event.amount;
        this.stats.money.earnedFromBank += event.amount;
        this.player(event.playerName, event.at).startPasses += 1;
        this.player(event.playerName, event.at).moneyEarned += event.amount;
        break;

      case "money_awarded":
        this.stats.money.earnedFromBank += event.amount;
        if (event.fateTitle) {
          this.fate(event.fateTitle).moneyIn += event.amount;
        }
        this.player(event.playerName, event.at).moneyEarned += event.amount;
        break;

      case "property_offered":
        this.stats.totals.propertiesOffered += 1;
        this.tile(event).offers += 1;
        break;

      case "property_bought":
        this.stats.totals.propertiesBought += 1;
        this.stats.money.spentBuying += event.price;
        this.tile(event).purchases += 1;
        this.tile(event).purchaseValue += event.price;
        this.withActiveGame(event.roomCode, (game) => {
          game.propertiesBought += 1;
        });
        this.updateMoneyRecord("biggestPurchase", {
          amount: event.price,
          playerName: event.playerName,
          roomCode: event.roomCode,
          label: event.tileName,
          at: event.at
        });
        this.player(event.playerName, event.at).propertiesBought += 1;
        this.player(event.playerName, event.at).moneySpent += event.price;
        break;

      case "property_passed":
        this.stats.totals.propertiesPassed += 1;
        this.tile(event).passes += 1;
        break;

      case "property_gifted":
        this.stats.totals.propertiesGifted += 1;
        this.stats.money.giftedPropertyValue += event.price;
        this.tile(event).gifted += 1;
        this.tile(event).giftedValue += event.price;
        this.fate(event.fateTitle).giftedProperties += 1;
        this.player(event.playerName, event.at).propertiesGifted += 1;
        this.player(event.playerName, event.at).moneyEarned += event.price;
        break;

      case "building_built":
        this.stats.totals.buildingsBuilt += 1;
        this.stats.money.spentBuilding += event.cost;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "property",
          tileGroup: event.tileGroup
        }).builds += 1;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "property",
          tileGroup: event.tileGroup
        }).buildSpend += event.cost;
        this.updateMoneyRecord("biggestBuild", {
          amount: event.cost,
          playerName: event.playerName,
          roomCode: event.roomCode,
          label: event.tileName,
          at: event.at
        });
        this.player(event.playerName, event.at).buildingsBuilt += 1;
        this.player(event.playerName, event.at).moneySpent += event.cost;
        break;

      case "property_sold":
        this.stats.totals.propertiesSold += 1;
        this.stats.money.soldToBank += event.saleValue;
        this.stats.money.earnedFromBank += event.saleValue;
        this.tile(event).sells += 1;
        this.tile(event).sellValue += event.saleValue;
        this.player(event.playerName, event.at).propertiesSold += 1;
        this.player(event.playerName, event.at).moneyEarned += event.saleValue;
        break;

      case "fate_drawn":
        this.stats.totals.fateCardsDrawn += 1;
        this.fate(event.title).count += 1;
        break;

      case "tax_paid":
        this.stats.totals.taxPayments += 1;
        this.stats.money.paidTax += event.amount;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "tax"
        }).taxPayments += 1;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "tax"
        }).taxPaid += event.amount;
        this.tax(event.title, event.amount).count += 1;
        this.tax(event.title, event.amount).totalAmount += event.amount;
        this.tax(event.title, event.amount).highestAmount = Math.max(
          this.tax(event.title, event.amount).highestAmount,
          event.amount
        );
        this.player(event.playerName, event.at).taxPaid += event.amount;
        break;

      case "bank_paid":
        this.stats.totals.bankPayments += 1;
        this.stats.money.paidBank += event.amount;
        if (event.category === "bail") {
          this.stats.totals.bailPayments += 1;
          this.stats.money.paidBail += event.amount;
          this.player(event.playerName, event.at).bailPaid += event.amount;
        }
        if (event.category === "fate" && event.fateTitle) {
          this.fate(event.fateTitle).moneyOut += event.amount;
        }
        this.updateMoneyRecord("biggestBankPayment", {
          amount: event.amount,
          playerName: event.playerName,
          roomCode: event.roomCode,
          label: event.label,
          at: event.at
        });
        this.player(event.playerName, event.at).bankPaid += event.amount;
        this.player(event.playerName, event.at).moneySpent += event.amount;
        break;

      case "player_paid":
        this.stats.totals.playerPayments += 1;
        this.stats.money.playerTransfers += event.amountPaid;
        if (event.category === "rent") {
          this.stats.totals.rentPayments += 1;
          this.stats.money.paidRentCharged += event.amountCharged;
          this.stats.money.paidRentActual += event.amountPaid;
          this.stats.money.receivedRent += event.amountPaid;
          if (event.tileId !== undefined && event.tileName) {
            const tile = this.tile({
              tileId: event.tileId,
              tileName: event.tileName,
              tileKind: "property"
            });
            tile.rentPayments += 1;
            tile.rentCharged += event.amountCharged;
            tile.rentPaid += event.amountPaid;
          }
          this.withActiveGame(event.roomCode, (game) => {
            game.rentPaid += event.amountPaid;
          });
          this.updateMoneyRecord("biggestRent", {
            amount: event.amountCharged,
            playerName: event.payerName,
            roomCode: event.roomCode,
            label: event.tileName ?? event.label,
            at: event.at
          });
          this.player(event.payerName, event.at).rentPaid += event.amountPaid;
          this.player(event.recipientName, event.at).rentReceived += event.amountPaid;
        }
        if (event.category === "fate" && event.fateTitle) {
          if (event.amountPaid > 0) {
            this.fate(event.fateTitle).moneyIn += event.amountPaid;
            this.fate(event.fateTitle).moneyOut += event.amountPaid;
          }
        }
        this.player(event.payerName, event.at).moneySpent += event.amountPaid;
        this.player(event.recipientName, event.at).moneyEarned += event.amountPaid;
        break;

      case "sent_to_penalty":
        this.stats.totals.sentToPenalty += 1;
        this.tile({
          tileId: 10,
          tileName: "القسم",
          tileKind: "penalty"
        }).sentToPenalty += 1;
        if (event.fateTitle) {
          this.fate(event.fateTitle).sentToPenalty += 1;
        }
        this.player(event.playerName, event.at).sentToPenalty += 1;
        break;

      case "fate_skip_turns":
        this.fate(event.title).skipTurns += event.turns;
        break;

      case "turn_skipped":
        this.stats.totals.turnsSkipped += 1;
        this.player(event.playerName, event.at).turnsSkipped += 1;
        break;

      case "bankrupt":
        this.stats.totals.bankruptcies += 1;
        this.withActiveGame(event.roomCode, (game) => {
          game.bankruptcies += 1;
        });
        this.player(event.playerName, event.at).bankruptcies += 1;
        break;

      case "game_finished":
        this.stats.totals.gamesFinished += 1;
        this.player(event.winnerName, event.at).gamesWon += 1;
        this.player(event.winnerName, event.at).highestCash = Math.max(
          this.player(event.winnerName, event.at).highestCash,
          event.winnerCash
        );
        for (const eventPlayer of event.players) {
          this.player(eventPlayer.name, event.at).gamesFinished += 1;
        }
        this.updateMoneyRecord("richestWinner", {
          amount: event.winnerCash,
          playerName: event.winnerName,
          roomCode: event.roomCode,
          label: "رصيد الفائز",
          at: event.at
        });
        this.updateDurationRecords(event.roomCode, event.winnerName, event.playerCount, event.durationMs, event.at);
        this.addRecentGame(event);
        delete this.stats.activeGames[event.roomCode];
        break;
    }

    this.touchAndWrite(event.at);
  }

  addRecentGame(event) {
    const activeGame = this.stats.activeGames[event.roomCode];
    this.stats.recentGames = [
      {
        roomCode: event.roomCode,
        startedAt: event.startedAt,
        finishedAt: event.at,
        durationMs: event.durationMs,
        playerCount: event.playerCount,
        winnerName: event.winnerName,
        turns: activeGame?.turns ?? 0,
        rolls: activeGame?.rolls ?? 0,
        propertiesBought: activeGame?.propertiesBought ?? 0,
        rentPaid: activeGame?.rentPaid ?? 0,
        bankruptcies: activeGame?.bankruptcies ?? 0
      },
      ...this.stats.recentGames
    ].slice(0, MAX_RECENT_GAMES);
  }

  updateDurationRecords(roomCode, winnerName, playerCount, durationMs, finishedAt) {
    const record = { roomCode, winnerName, playerCount, durationMs, finishedAt };
    if (!this.stats.records.longestGame || durationMs > this.stats.records.longestGame.durationMs) {
      this.stats.records.longestGame = record;
    }
    if (!this.stats.records.shortestGame || durationMs < this.stats.records.shortestGame.durationMs) {
      this.stats.records.shortestGame = record;
    }
  }

  updateMoneyRecord(key, record) {
    const current = this.stats.records[key];
    if (!current || record.amount > current.amount) {
      this.stats.records[key] = record;
    }
  }

  withActiveGame(roomCode, callback) {
    const game = this.stats.activeGames[roomCode];
    if (game) {
      callback(game);
    }
  }

  player(name, at) {
    const key = normalizeKey(name);
    this.stats.players[key] ??= {
      name,
      roomsCreated: 0,
      joins: 0,
      reconnects: 0,
      disconnects: 0,
      leaves: 0,
      gamesStarted: 0,
      gamesFinished: 0,
      gamesWon: 0,
      rolls: 0,
      doubles: 0,
      tilesLanded: 0,
      startPasses: 0,
      propertiesBought: 0,
      propertiesGifted: 0,
      buildingsBuilt: 0,
      propertiesSold: 0,
      rentPaid: 0,
      rentReceived: 0,
      bankPaid: 0,
      taxPaid: 0,
      bailPaid: 0,
      moneySpent: 0,
      moneyEarned: 0,
      sentToPenalty: 0,
      turnsSkipped: 0,
      bankruptcies: 0,
      highestCash: 0,
      lastSeenAt: at
    };
    return this.stats.players[key];
  }

  tile(event) {
    const key = String(event.tileId);
    this.stats.tiles[key] ??= emptyTileStats(event.tileId, event.tileName, event.tileKind, event.tileGroup);
    return this.stats.tiles[key];
  }

  fate(title) {
    this.stats.fateCards[title] ??= {
      title,
      count: 0,
      moneyIn: 0,
      moneyOut: 0,
      giftedProperties: 0,
      sentToPenalty: 0,
      skipTurns: 0
    };
    return this.stats.fateCards[title];
  }

  tax(title, amount) {
    this.stats.taxEvents[title] ??= {
      title,
      count: 0,
      totalAmount: 0,
      highestAmount: amount
    };
    return this.stats.taxEvents[title];
  }

  touchAndWrite(at) {
    this.stats.updatedAt = at;
    this.write();
  }

  load() {
    try {
      if (!existsSync(this.filePath)) {
        return createEmptyStats();
      }
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
      return normalizeStats(parsed);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown stats load error";
      return createEmptyStats();
    }
  }

  write() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(this.stats, null, 2)}\n`, "utf8");
      renameSync(temporaryPath, this.filePath);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown stats write error";
    }
  }
}

// انحراف موثّق: المسار الافتراضي داخل ديدوس (server/data/bank-stats.json) بدل data/stats.json
function resolveStatsFilePath() {
  const fromEnv = process.env.STATS_FILE_PATH ?? process.env.STATS_FILE;
  if (fromEnv && fromEnv.trim()) {
    return resolve(fromEnv.trim());
  }
  return fileURLToPath(new URL("./data/bank-stats.json", import.meta.url));
}

function createEmptyStats() {
  const now = Date.now();
  const stats = {
    version: STATS_VERSION,
    createdAt: now,
    updatedAt: now,
    totals: {
      roomsCreated: 0,
      roomsExpired: 0,
      gamesStarted: 0,
      gamesFinished: 0,
      playersJoined: 0,
      reconnects: 0,
      disconnects: 0,
      leaves: 0,
      rolls: 0,
      doubles: 0,
      turnsSkipped: 0,
      tilesLanded: 0,
      startPasses: 0,
      propertiesOffered: 0,
      propertiesBought: 0,
      propertiesPassed: 0,
      propertiesGifted: 0,
      buildingsBuilt: 0,
      propertiesSold: 0,
      fateCardsDrawn: 0,
      taxPayments: 0,
      rentPayments: 0,
      bankPayments: 0,
      playerPayments: 0,
      bailPayments: 0,
      sentToPenalty: 0,
      bankruptcies: 0
    },
    money: {
      spentBuying: 0,
      spentBuilding: 0,
      paidRentCharged: 0,
      paidRentActual: 0,
      receivedRent: 0,
      paidBank: 0,
      paidTax: 0,
      paidBail: 0,
      earnedFromBank: 0,
      startBonuses: 0,
      soldToBank: 0,
      giftedPropertyValue: 0,
      playerTransfers: 0
    },
    diceFaces: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [String(index + 1), 0])),
    diceTotals: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [String(index + 2), 0])),
    tiles: Object.fromEntries(
      BOARD_TILES.map((tile) => [
        String(tile.id),
        emptyTileStats(
          tile.id,
          tile.name,
          tile.kind,
          "group" in tile ? String(tile.group) : undefined
        )
      ])
    ),
    players: {},
    fateCards: {},
    taxEvents: {},
    activeGames: {},
    recentGames: [],
    records: {
      biggestRent: null,
      biggestPurchase: null,
      biggestBuild: null,
      biggestBankPayment: null,
      richestWinner: null,
      longestGame: null,
      shortestGame: null
    }
  };
  return stats;
}

function normalizeStats(parsed) {
  const base = createEmptyStats();
  const stats = {
    ...base,
    ...parsed,
    version: STATS_VERSION,
    totals: { ...base.totals, ...parsed.totals },
    money: { ...base.money, ...parsed.money },
    diceFaces: { ...base.diceFaces, ...parsed.diceFaces },
    diceTotals: { ...base.diceTotals, ...parsed.diceTotals },
    tiles: migrateTileStats(base.tiles, parsed.tiles),
    players: { ...base.players, ...parsed.players },
    fateCards: { ...base.fateCards, ...parsed.fateCards },
    taxEvents: { ...base.taxEvents, ...parsed.taxEvents },
    activeGames: { ...base.activeGames, ...parsed.activeGames },
    recentGames: parsed.recentGames ?? base.recentGames,
    records: { ...base.records, ...parsed.records }
  };
  return stats;
}

function migrateTileStats(currentTiles, storedTiles) {
  if (!storedTiles) {
    return currentTiles;
  }

  const usedStoredKeys = new Set();
  const storedEntries = Object.entries(storedTiles);
  return Object.fromEntries(
    Object.entries(currentTiles).map(([currentKey, current]) => {
      const samePosition = storedTiles[currentKey];
      let matchKey;
      let previous;

      if (samePosition?.name === current.name && samePosition.kind === current.kind) {
        matchKey = currentKey;
        previous = samePosition;
      } else {
        const matchingEntry = storedEntries.find(
          ([storedKey, stored]) =>
            !usedStoredKeys.has(storedKey) && stored.name === current.name && stored.kind === current.kind
        );
        matchKey = matchingEntry?.[0];
        previous = matchingEntry?.[1];
      }

      if (matchKey) {
        usedStoredKeys.add(matchKey);
      }

      return [
        currentKey,
        {
          ...current,
          ...previous,
          tileId: current.tileId,
          name: current.name,
          kind: current.kind,
          group: current.group
        }
      ];
    })
  );
}

function emptyTileStats(tileId, name, kind, group) {
  return {
    tileId,
    name,
    kind,
    group,
    lands: 0,
    offers: 0,
    purchases: 0,
    passes: 0,
    purchaseValue: 0,
    gifted: 0,
    giftedValue: 0,
    rentPayments: 0,
    rentCharged: 0,
    rentPaid: 0,
    builds: 0,
    buildSpend: 0,
    sells: 0,
    sellValue: 0,
    taxPayments: 0,
    taxPaid: 0,
    sentToPenalty: 0
  };
}

function increment(map, key) {
  const stringKey = String(key);
  map[stringKey] = (map[stringKey] ?? 0) + 1;
}

function normalizeKey(value) {
  return value.trim().replace(/\s+/g, " ") || "لاعب";
}
// ---------------------------------------------------------------------------
// RoomManager (نقل حرفي من apps/server/src/rooms/RoomManager.ts)
// انحراف موثّق: createRoom يقبل forcedCode اختياريًا + دالة عامة createRoomDirect
// ---------------------------------------------------------------------------
const ROOM_TTL_MS = 1000 * 60 * 60 * 4;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

class RoomManager {
  constructor(statsStore) {
    this.statsStore = statsStore;
    this.rooms = new Map();
    this.contexts = new WeakMap();
  }

  register(ws) {
    this.contexts.set(ws, { roomCode: null, playerId: null });
    this.send(ws, { type: "CONNECTED", payload: { serverTime: Date.now() } });
  }

  handleMessage(ws, message) {
    try {
      switch (message.type) {
        case "CREATE_ROOM":
          this.createRoom(ws, message.payload.name);
          break;
        case "JOIN_ROOM":
          this.joinRoom(ws, message.payload.roomCode, message.payload.name, message.payload.playerId);
          break;
        case "START_GAME":
          this.withRoomPlayer(ws, (room, playerId) => {
            startGame(room.state, playerId);
            this.broadcast(room);
          });
          break;
        case "ROLL_DICE":
          this.withReadyRoomPlayer(ws, (room, playerId) => {
            rollDice(room.state, playerId);
            this.broadcast(room);
          });
          break;
        case "BUY_PROPERTY":
          this.withReadyRoomPlayer(ws, (room, playerId) => {
            buyProperty(room.state, playerId);
            this.broadcast(room);
          });
          break;
        case "PASS_PROPERTY":
          this.withReadyRoomPlayer(ws, (room, playerId) => {
            passProperty(room.state, playerId);
            this.broadcast(room);
          });
          break;
        case "BUILD_PROPERTY":
          this.withReadyRoomPlayer(ws, (room, playerId) => {
            buildProperty(room.state, playerId, message.payload.tileId);
            this.broadcast(room);
          });
          break;
        case "SELL_PROPERTY":
          this.withReadyRoomPlayer(ws, (room, playerId) => {
            sellProperty(room.state, playerId, message.payload.tileId);
            this.broadcast(room);
          });
          break;
        case "PAY_BAIL":
          this.withReadyRoomPlayer(ws, (room, playerId) => {
            payBail(room.state, playerId);
            this.broadcast(room);
          });
          break;
        case "END_TURN":
          this.withReadyRoomPlayer(ws, (room, playerId) => {
            endTurn(room.state, playerId);
            this.broadcast(room);
          });
          break;
        case "LEAVE_ROOM":
          this.leaveRoom(ws);
          break;
        case "PING":
          this.send(ws, { type: "PONG", payload: { serverTime: Date.now() } });
          break;
        default:
          this.reject(ws, "رسالة غير مفهومة.");
      }
    } catch (error) {
      this.reject(ws, error instanceof Error ? error.message : "العملية فشلت.");
    }
  }

  handleClose(ws) {
    const context = this.contexts.get(ws);
    if (!context?.roomCode || !context.playerId) {
      return;
    }

    const room = this.rooms.get(context.roomCode);
    if (!room) {
      return;
    }

    const sockets = room.socketsByPlayer.get(context.playerId);
    sockets?.delete(ws);
    if (!sockets || sockets.size === 0) {
      room.socketsByPlayer.delete(context.playerId);
      const player = room.state.players.find((candidate) => candidate.id === context.playerId);
      if (player) {
        this.statsStore.recordDisconnect(player.name);
      }
      setConnected(room.state, context.playerId, false);
      this.broadcast(room);
    }
  }

  cleanup() {
    const now = Date.now();
    for (const [roomCode, room] of this.rooms) {
      if (now - room.lastActiveAt > ROOM_TTL_MS) {
        this.rooms.delete(roomCode);
        this.statsStore.recordRoomExpired();
      }
    }
  }

  getLiveStats() {
    const now = Date.now();
    const rooms = Array.from(this.rooms.values()).map((room) => this.getLiveRoomStats(room, now));
    return {
      activeRooms: rooms.length,
      lobbyRooms: rooms.filter((room) => room.status === "lobby").length,
      playingRooms: rooms.filter((room) => room.status === "playing").length,
      finishedRooms: rooms.filter((room) => room.status === "finished").length,
      connectedPlayers: rooms.reduce((sum, room) => sum + room.connectedPlayers, 0),
      connectedSockets: rooms.reduce((sum, room) => sum + room.socketCount, 0),
      rooms
    };
  }

  createRoom(ws, name, forcedCode) {
    const roomCode = forcedCode ?? this.makeRoomCode();
    const playerId = randomUUID();
    const state = createGameState(roomCode, playerId, normalizeName(name));
    this.attachStatsSink(state);
    const room = {
      state,
      socketsByPlayer: new Map(),
      lastActiveAt: Date.now()
    };

    this.rooms.set(roomCode, room);
    this.attachSocket(ws, room, playerId);
    const host = state.players[0];
    if (host) {
      this.statsStore.recordRoomCreated(roomCode, host.name, host.cash);
    }
    this.send(ws, {
      type: "ROOM_CREATED",
      payload: {
        roomCode,
        playerId,
        state
      }
    });
  }

  createRoomDirect(ws, name, forcedCode) {
    this.createRoom(ws, name, forcedCode);
  }

  joinRoom(ws, rawRoomCode, name, existingPlayerId) {
    const roomCode = rawRoomCode.trim().toUpperCase();
    const room = this.rooms.get(roomCode);
    if (!room) {
      throw new GameError("الأوضة مش موجودة.");
    }

    const existingPlayer =
      existingPlayerId && room.state.players.find((player) => player.id === existingPlayerId);
    const player = existingPlayer
      ? reconnectPlayer(room.state, existingPlayer.id, name)
      : addPlayer(room.state, randomUUID(), name);

    this.attachSocket(ws, room, player.id);
    if (existingPlayer) {
      this.statsStore.recordReconnect(player.name, player.cash);
    } else {
      this.statsStore.recordPlayerJoined(player.name, player.cash);
    }
    this.send(ws, {
      type: "JOINED_ROOM",
      payload: {
        roomCode,
        playerId: player.id,
        state: room.state
      }
    });
    this.broadcast(room);
  }

  attachSocket(ws, room, playerId) {
    const context = this.contexts.get(ws) ?? { roomCode: null, playerId: null };
    context.roomCode = room.state.roomCode;
    context.playerId = playerId;
    this.contexts.set(ws, context);

    const sockets = room.socketsByPlayer.get(playerId) ?? new Set();
    sockets.add(ws);
    room.socketsByPlayer.set(playerId, sockets);
    room.lastActiveAt = Date.now();
  }

  leaveRoom(ws) {
    const context = this.contexts.get(ws);
    if (!context?.roomCode || !context.playerId) {
      this.send(ws, { type: "LEFT_ROOM", payload: { message: "رجعت للّوبي." } });
      return;
    }

    const roomCode = context.roomCode;
    const playerId = context.playerId;
    const room = this.rooms.get(roomCode);
    const playerName = room?.state.players.find((player) => player.id === playerId)?.name;

    context.roomCode = null;
    context.playerId = null;
    this.contexts.set(ws, context);

    if (!room) {
      this.send(ws, { type: "LEFT_ROOM", payload: { message: "رجعت للّوبي." } });
      return;
    }

    const sockets = room.socketsByPlayer.get(playerId);
    sockets?.delete(ws);
    if (!sockets || sockets.size === 0) {
      room.socketsByPlayer.delete(playerId);
      if (playerName) {
        this.statsStore.recordLeave(playerName);
      }
      leavePlayer(room.state, playerId);
    }

    this.send(ws, { type: "LEFT_ROOM", payload: { message: "رجعت للّوبي." } });
    if (room.state.status === "lobby" && room.state.players.length === 0) {
      this.rooms.delete(roomCode);
      return;
    }
    this.broadcast(room);
  }

  withRoomPlayer(ws, callback) {
    const context = this.contexts.get(ws);
    if (!context?.roomCode || !context.playerId) {
      throw new GameError("ادخل أوضة الأول.");
    }

    const room = this.rooms.get(context.roomCode);
    if (!room) {
      throw new GameError("الأوضة اتقفلت.");
    }

    room.lastActiveAt = Date.now();
    callback(room, context.playerId);
  }

  withReadyRoomPlayer(ws, callback) {
    this.withRoomPlayer(ws, (room, playerId) => {
      if (Date.now() < room.state.actionAvailableAt) {
        throw new GameError("استنى العربية توصل الأول.");
      }
      callback(room, playerId);
    });
  }

  broadcast(room) {
    const message = {
      type: "GAME_STATE",
      payload: {
        state: room.state
      }
    };
    const rawMessage = JSON.stringify(message);

    for (const sockets of room.socketsByPlayer.values()) {
      for (const socket of sockets) {
        this.sendRaw(socket, rawMessage);
      }
    }
  }

  reject(ws, message) {
    this.send(ws, {
      type: "ACTION_REJECTED",
      payload: { message }
    });
  }

  send(ws, message) {
    this.sendRaw(ws, JSON.stringify(message));
  }

  sendRaw(ws, rawMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(rawMessage);
    }
  }

  attachStatsSink(state) {
    attachStatsSink(state, {
      record: (event) => {
        this.statsStore.recordEngineEvent(event);
      }
    });
  }

  getLiveRoomStats(room, now) {
    const activePlayers = room.state.players.filter((player) => !player.bankrupt);
    const leader =
      activePlayers.length > 0
        ? activePlayers.reduce((best, player) => (player.cash > best.cash ? player : best), activePlayers[0])
        : null;
    const currentPlayer = room.state.players.find((player) => player.id === room.state.currentPlayerId) ?? null;
    const winner = room.state.players.find((player) => player.id === room.state.winnerId) ?? null;
    const socketCount = Array.from(room.socketsByPlayer.values()).reduce((sum, sockets) => sum + sockets.size, 0);

    return {
      roomCode: room.state.roomCode,
      status: room.state.status,
      playerCount: room.state.players.length,
      connectedPlayers: room.socketsByPlayer.size,
      socketCount,
      createdAt: room.state.createdAt,
      updatedAt: room.state.updatedAt,
      lastActiveAt: room.lastActiveAt,
      ageMs: now - room.state.createdAt,
      currentPlayerName: currentPlayer?.name ?? null,
      turnPhase: room.state.turnPhase,
      propertiesOwned: room.state.players.reduce((sum, player) => sum + player.properties.length, 0),
      buildings: Object.values(room.state.buildingsByTile).reduce((sum, count) => sum + count, 0),
      totalCash: room.state.players.reduce((sum, player) => sum + player.cash, 0),
      leaderName: leader?.name ?? null,
      leaderCash: leader?.cash ?? 0,
      winnerName: winner?.name ?? null
    };
  }

  makeRoomCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      const code = Array.from(bytes, (byte) => ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length]).join("");
      if (!this.rooms.has(code)) {
        return code;
      }
    }
    throw new GameError("معرفتش أطلع كود أوضة.");
  }
}

// ---------------------------------------------------------------------------
// validation (نقل حرفي من apps/server/src/websocket/validation.ts)
// ---------------------------------------------------------------------------
function parseClientMessage(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }

  switch (value.type) {
    case "CREATE_ROOM":
      if (hasPayloadName(value)) {
        return { type: "CREATE_ROOM", payload: { name: value.payload.name } };
      }
      return null;
    case "JOIN_ROOM":
      if (
        isRecord(value.payload) &&
        typeof value.payload.roomCode === "string" &&
        typeof value.payload.name === "string"
      ) {
        return {
          type: "JOIN_ROOM",
          payload: {
            roomCode: value.payload.roomCode,
            name: value.payload.name,
            playerId: typeof value.payload.playerId === "string" ? value.payload.playerId : undefined
          }
        };
      }
      return null;
    case "START_GAME":
    case "ROLL_DICE":
    case "BUY_PROPERTY":
    case "PASS_PROPERTY":
    case "PAY_BAIL":
    case "END_TURN":
    case "LEAVE_ROOM":
    case "PING":
      return { type: value.type };
    case "BUILD_PROPERTY":
    case "SELL_PROPERTY":
      if (isRecord(value.payload) && typeof value.payload.tileId === "number") {
        return { type: value.type, payload: { tileId: value.payload.tileId } };
      }
      return null;
    default:
      return null;
  }
}

function hasPayloadName(value) {
  return isRecord(value.payload) && typeof value.payload.name === "string";
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

export { RoomManager, StatsStore, parseClientMessage, resolveStatsFilePath };
