import {
  ACTION_UNLOCK_BUFFER_MS,
  BOARD_TILES,
  CAR_MOVEMENT_OFFSET_MS,
  CAR_STEP_MS,
  DICE_THROW_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PENALTY_BAIL,
  PENALTY_TILE_ID,
  START_BONUS,
  STARTING_CASH,
  SYNC_PLAYBACK_DELAY_MS,
  calculateRent,
  canAddBuilding,
  findOwner,
  getBuildingCost,
  getPropertySellValue,
  getTile,
  isOwnableTile,
  isPropertyTile,
  isTaxTile
} from "@bank-el7az/shared";
import type { BoardTile, DiceRoll, GameState, OwnableTile, Player, PlayerColor } from "@bank-el7az/shared";
import { randomUUID } from "node:crypto";
import type {
  BankPaymentCategory,
  GameStatsEvent,
  GameStatsPayload,
  GameStatsSink,
  PenaltySource,
  PlayerPaymentCategory
} from "../stats/events.js";

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

const PLAYER_COLORS: PlayerColor[] = ["red", "blue", "green", "gold", "purple", "teal"];
const moneyFormatter = new Intl.NumberFormat("ar-EG");

type RandomSource = () => number;
const statsSinks = new WeakMap<GameState, GameStatsSink>();
const gameStartedAtByState = new WeakMap<GameState, number>();

export function attachStatsSink(state: GameState, sink: GameStatsSink): void {
  statsSinks.set(state, sink);
}

interface FateCard {
  title: string;
  apply: (state: GameState, player: Player, rng: RandomSource, title: string) => void;
}

interface TaxEvent {
  title: string;
  amount: number;
}

const FATE_CARDS: FateCard[] = [
  {
    title: "مكافأة شغلانة",
    apply: (state, player, _rng, title) => {
      player.cash += 160;
      emitStats(state, {
        type: "money_awarded",
        playerId: player.id,
        playerName: player.name,
        amount: 160,
        label: title,
        fateTitle: title
      });
      addLog(state, `${player.name} كسب ${money(160)} من شغلانة حلوة.`);
    }
  },
  {
    title: "محافظة هدية",
    apply: (state, player, rng, title) => {
      const availableTiles = BOARD_TILES.filter(
        (tile): tile is OwnableTile => isOwnableTile(tile) && !findOwner(state.players, tile.id)
      );
      const giftedTile = availableTiles[Math.floor(rng() * availableTiles.length)];
      if (!giftedTile) {
        player.cash += 120;
        emitStats(state, {
          type: "money_awarded",
          playerId: player.id,
          playerName: player.name,
          amount: 120,
          label: title,
          fateTitle: title
        });
        addLog(state, `${player.name} ملقاش محافظة فاضية وخد ${money(120)} بدلها.`);
        return;
      }
      player.properties.push(giftedTile.id);
      emitStats(state, {
        type: "property_gifted",
        playerId: player.id,
        playerName: player.name,
        ...tileStatsFields(giftedTile),
        price: giftedTile.price,
        fateTitle: title
      });
      addLog(state, `${player.name} خد ${giftedTile.name} هدية من كارت الحظ.`);
    }
  },
  {
    title: "غرامة مفاجئة",
    apply: (state, player, _rng, title) => {
      payBank(state, player, 130, `دفع ${money(130)} غرامة مفاجئة`, {
        category: "fate",
        label: title,
        fateTitle: title
      });
    }
  },
  {
    title: "رجوع للبداية",
    apply: (state, player) => {
      player.position = 0;
      player.cash += START_BONUS;
      emitStats(state, {
        type: "start_bonus",
        playerId: player.id,
        playerName: player.name,
        amount: START_BONUS
      });
      addLog(state, `${player.name} رجع للبداية وخد ${money(START_BONUS)}.`);
    }
  },
  {
    title: "عزومة على حسابك",
    apply: (state, player, _rng, title) => {
      for (const rival of activePlayers(state)) {
        if (rival.id !== player.id) {
          payPlayer(state, player, rival, 45, `دفع لـ ${rival.name} ${money(45)} عزومة حظ`, {
            category: "fate",
            label: title,
            fateTitle: title
          });
        }
      }
    }
  },
  {
    title: "لقطة حلوة",
    apply: (state, player, _rng, title) => {
      for (const rival of activePlayers(state)) {
        if (rival.id !== player.id) {
          payPlayer(state, rival, player, 25, `دفع لـ ${player.name} ${money(25)} بسبب صفقة حلوة`, {
            category: "fate",
            label: title,
            fateTitle: title
          });
        }
      }
    }
  },
  {
    title: "مصاريف صيانة",
    apply: (state, player, _rng, title) => {
      const amount = player.properties.length * 40;
      if (amount === 0) {
        addLog(state, `${player.name} معندوش محافظات، فعدى من مصاريف الصيانة.`);
        return;
      }
      payBank(state, player, amount, `دفع ${money(amount)} مصاريف صيانة`, {
        category: "fate",
        label: title,
        fateTitle: title
      });
    }
  },
  {
    title: "تفتيش مفاجئ",
    apply: (state, player, _rng, title) => {
      addLog(state, `${player.name} طلعله تفتيش مفاجئ.`);
      sendToPenalty(state, player, "fate", title);
    }
  },
  {
    title: "تعطيل مصالح",
    apply: (state, player, _rng, title) => {
      player.skipTurns += 2;
      emitStats(state, {
        type: "fate_skip_turns",
        playerId: player.id,
        playerName: player.name,
        title,
        turns: 2
      });
      addLog(state, `${player.name} اتعطلت مصالحه وهيفوت دورين.`);
    }
  }
];

const TRAFFIC_VIOLATIONS: TaxEvent[] = [
  { title: "مخالفة ركن غلط", amount: 60 },
  { title: "مخالفة سرعة", amount: 100 },
  { title: "مخالفة حزام", amount: 80 },
  { title: "مخالفة إشارة", amount: 140 },
  { title: "مخالفة انتظار صف تاني", amount: 120 }
];

const GOVERNMENT_FEES: TaxEvent[] = [
  { title: "رسوم مرافق", amount: 90 },
  { title: "رسوم تسجيل", amount: 130 },
  { title: "رسوم صيانة طريق", amount: 160 },
  { title: "رسوم خدمات", amount: 110 },
  { title: "رسوم تنمية", amount: 190 }
];

export function createGameState(roomCode: string, hostId: string, hostName: string): GameState {
  const now = Date.now();
  const host = createPlayer(hostId, hostName, PLAYER_COLORS[0]);
  return {
    roomCode,
    hostId,
    status: "lobby",
    players: [host],
    currentPlayerId: null,
    turnPhase: "roll",
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
        createdAt: now
      }
    ]
  };
}

export function addPlayer(state: GameState, playerId: string, name: string): Player {
  if (state.status !== "lobby") {
    throw new GameError("اللعبة بدأت خلاص.");
  }
  if (state.players.length >= MAX_PLAYERS) {
    throw new GameError(`الأوضة تشيل لحد ${MAX_PLAYERS} لاعيبة.`);
  }

  const color = PLAYER_COLORS[state.players.length] ?? "teal";
  const player = createPlayer(playerId, name, color);
  state.players.push(player);
  addLog(state, `${player.name} دخل الأوضة.`);
  touch(state);
  return player;
}

export function reconnectPlayer(state: GameState, playerId: string, name: string): Player {
  const player = getPlayer(state, playerId);
  player.name = normalizeName(name);
  player.connected = true;
  addLog(state, `${player.name} رجع تاني.`);
  touch(state);
  return player;
}

export function setConnected(state: GameState, playerId: string, connected: boolean): void {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.bankrupt) {
    return;
  }
  player.connected = connected;
  addLog(state, `${player.name} ${connected ? "رجع تاني" : "فصل"}.`);
  touch(state);
}

export function startGame(state: GameState, playerId: string): void {
  assertHost(state, playerId);
  if (state.status !== "lobby") {
    throw new GameError("اللعبة شغالة بالفعل.");
  }
  if (state.players.length < MIN_PLAYERS) {
    throw new GameError(`لازم ${MIN_PLAYERS} لاعيبة على الأقل عشان نبدأ.`);
  }

  state.status = "playing";
  state.currentPlayerId = state.players[0]?.id ?? null;
  state.turnPhase = "roll";
  state.pendingPurchase = null;
  gameStartedAtByState.set(state, Date.now());
  addLog(state, "اللعبة بدأت. ارمي الزهر لأول حركة.");
  emitStats(state, {
    type: "game_started",
    playerCount: state.players.length,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      cash: player.cash
    }))
  });
  touch(state);
}

export function rollDice(state: GameState, playerId: string, rng: RandomSource = Math.random): DiceRoll {
  assertTurn(state, playerId);
  if (state.turnPhase !== "roll") {
    throw new GameError("مينفعش ترمي دلوقتي.");
  }

  const player = getPlayer(state, playerId);
  const startPosition = player.position;
  const roll = makeRoll(rng);
  state.lastRoll = roll;
  addLog(state, `${player.name} رمى ${formatNumber(roll.dieA)} + ${formatNumber(roll.dieB)}.`);
  emitStats(state, {
    type: "dice_rolled",
    playerId: player.id,
    playerName: player.name,
    dieA: roll.dieA,
    dieB: roll.dieB,
    total: roll.total,
    isDouble: roll.isDouble,
    fromTileId: startPosition,
    toTileId: (startPosition + roll.total) % BOARD_TILES.length
  });

  if (player.inPenalty) {
    resolvePenaltyRoll(state, player, roll, rng);
  } else {
    movePlayer(state, player, roll.total);
    resolveLanding(state, player, roll.total, rng);
  }

  checkWinner(state);
  advanceIfTurnComplete(state);
  touch(state);
  scheduleActionLockForMove(state, startPosition, player.position);
  return roll;
}

export function buyProperty(state: GameState, playerId: string): void {
  assertTurn(state, playerId);
  if (state.turnPhase !== "buy" || !state.pendingPurchase) {
    throw new GameError("مفيش محافظة متاحة للشراء دلوقتي.");
  }
  if (state.pendingPurchase.playerId !== playerId) {
    throw new GameError("اللاعب اللي وقف هنا بس يقدر يشتري.");
  }

  const player = getPlayer(state, playerId);
  const tile = getTile(state.pendingPurchase.tileId);
  if (!isOwnableTile(tile)) {
    throw new GameError("الخانة دي مش للبيع.");
  }
  if (findOwner(state.players, tile.id)) {
    throw new GameError("المحافظة دي ليها مالك بالفعل.");
  }
  if (player.cash < tile.price) {
    throw new GameError("فلوسك مش مكفية للشراء.");
  }

  player.cash -= tile.price;
  player.properties.push(tile.id);
  state.pendingPurchase = null;
  state.turnPhase = "end";
  addLog(state, `${player.name} اشترى ${tile.name} بـ ${money(tile.price)}.`);
  emitStats(state, {
    type: "property_bought",
    playerId: player.id,
    playerName: player.name,
    ...tileStatsFields(tile),
    price: tile.price
  });
  advanceIfTurnComplete(state);
  touch(state);
}

export function passProperty(state: GameState, playerId: string): void {
  assertTurn(state, playerId);
  if (state.turnPhase !== "buy" || !state.pendingPurchase) {
    throw new GameError("مفيش قرار شراء تتخطاه.");
  }
  const tile = getTile(state.pendingPurchase.tileId);
  state.pendingPurchase = null;
  state.turnPhase = "end";
  addLog(state, `${getPlayer(state, playerId).name} ساب ${tile.name} للبنك.`);
  if (isOwnableTile(tile)) {
    const player = getPlayer(state, playerId);
    emitStats(state, {
      type: "property_passed",
      playerId: player.id,
      playerName: player.name,
      ...tileStatsFields(tile),
      price: tile.price
    });
  }
  advanceIfTurnComplete(state);
  touch(state);
}

export function buildProperty(state: GameState, playerId: string, tileId: number): void {
  assertActivePlayer(state, playerId);
  const player = getPlayer(state, playerId);
  const tile = getTile(tileId);
  if (!isPropertyTile(tile)) {
    throw new GameError("البناء على المحافظات بس.");
  }
  if (!player.properties.includes(tile.id)) {
    throw new GameError("لازم تكون مالك المحافظة عشان تبني عليها.");
  }
  if (!canAddBuilding(tile, player, state.buildingsByTile)) {
    throw new GameError("لازم تملك المجموعة ولسه فيها مكان لمبنى جديد.");
  }

  const cost = getBuildingCost(tile);
  if (player.cash < cost) {
    throw new GameError("فلوسك مش مكفية للبناء.");
  }

  const nextBuildingCount = (state.buildingsByTile[tile.id] ?? 0) + 1;
  player.cash -= cost;
  state.buildingsByTile[tile.id] = nextBuildingCount;
  addLog(state, `${player.name} بنى مبنى رقم ${formatNumber(nextBuildingCount)} على ${tile.name} بـ ${money(cost)}.`);
  emitStats(state, {
    type: "building_built",
    playerId: player.id,
    playerName: player.name,
    tileId: tile.id,
    tileName: tile.name,
    tileGroup: tile.group,
    cost,
    buildingCount: nextBuildingCount
  });
  touch(state);
}

export function sellProperty(state: GameState, playerId: string, tileId: number): void {
  assertActivePlayer(state, playerId);
  const player = getPlayer(state, playerId);
  const tile = getTile(tileId);
  if (!isOwnableTile(tile)) {
    throw new GameError("الخانة دي مش ملكية تتباع.");
  }
  if (!player.properties.includes(tile.id)) {
    throw new GameError("مينفعش تبيع حاجة مش بتاعتك.");
  }

  const saleValue = getPropertySellValue(tile, state.buildingsByTile);
  const buildingCount = state.buildingsByTile[tile.id] ?? 0;
  player.properties = player.properties.filter((propertyId) => propertyId !== tile.id);
  delete state.buildingsByTile[tile.id];
  player.cash += saleValue;
  addLog(
    state,
    buildingCount > 0
      ? `${player.name} باع ${tile.name} للبنك ورجع ${formatNumber(buildingCount)} مباني بـ ${money(saleValue)}.`
      : `${player.name} باع ${tile.name} للبنك بـ ${money(saleValue)}.`
  );
  emitStats(state, {
    type: "property_sold",
    playerId: player.id,
    playerName: player.name,
    ...tileStatsFields(tile),
    saleValue,
    buildingCount
  });
  touch(state);
}

export function payBail(state: GameState, playerId: string): void {
  assertTurn(state, playerId);
  if (state.turnPhase !== "roll") {
    throw new GameError("الكفالة تتدفع قبل رمية الزهر بس.");
  }
  const player = getPlayer(state, playerId);
  if (!player.inPenalty) {
    throw new GameError("إنت مش في القسم.");
  }
  payBank(state, player, PENALTY_BAIL, `دفع ${money(PENALTY_BAIL)} كفالة`, {
    category: "bail",
    label: "كفالة القسم"
  });
  if (!player.bankrupt) {
    player.inPenalty = false;
    player.penaltyTurns = 0;
  } else {
    state.turnPhase = "end";
  }
  checkWinner(state);
  advanceIfTurnComplete(state);
  touch(state);
}

export function endTurn(state: GameState, playerId: string): void {
  assertTurn(state, playerId);
  if (state.status !== "playing") {
    throw new GameError("اللعبة مش شغالة.");
  }
  if (state.turnPhase !== "end") {
    throw new GameError("خلص القرار الحالي الأول.");
  }
  advanceTurn(state);
  touch(state);
}

export function normalizeName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "لاعب";
  }
  return trimmed.slice(0, 24);
}

export function leavePlayer(state: GameState, playerId: string): void {
  const player = getPlayer(state, playerId);
  const playerName = player.name;

  if (state.status === "lobby") {
    state.players = state.players.filter((candidate) => candidate.id !== playerId);
    if (state.hostId === playerId && state.players[0]) {
      state.hostId = state.players[0].id;
    }
    addLog(state, `${playerName} خرج من الأوضة.`);
    touch(state);
    return;
  }

  player.bankrupt = true;
  player.connected = false;
  player.cash = 0;
  clearPlayerBuildings(state, player);
  player.properties = [];
  player.inPenalty = false;
  player.penaltyTurns = 0;
  if (state.pendingPurchase?.playerId === playerId) {
    state.pendingPurchase = null;
  }
  if (state.currentPlayerId === playerId) {
    state.turnPhase = "end";
  }
  addLog(state, `${playerName} خرج من اللعبة.`);
  checkWinner(state);
  advanceIfTurnComplete(state);
  touch(state);
}

function createPlayer(id: string, name: string, color: PlayerColor): Player {
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
    skipTurns: 0
  };
}

function assertHost(state: GameState, playerId: string): void {
  if (state.hostId !== playerId) {
    throw new GameError("صاحب الأوضة بس يقدر يعمل كده.");
  }
}

function assertTurn(state: GameState, playerId: string): void {
  if (state.status !== "playing") {
    throw new GameError("اللعبة مش شغالة.");
  }
  if (state.currentPlayerId !== playerId) {
    throw new GameError("الدور مش عليك.");
  }
}

function assertActivePlayer(state: GameState, playerId: string): void {
  if (state.status !== "playing") {
    throw new GameError("اللعبة مش شغالة.");
  }
  const player = getPlayer(state, playerId);
  if (player.bankrupt) {
    throw new GameError("اللاعب مفلس ومينفعش يعمل كده.");
  }
}

function getPlayer(state: GameState, playerId: string): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new GameError("لاعب غير معروف.");
  }
  return player;
}

function makeRoll(rng: RandomSource): DiceRoll {
  const dieA = Math.floor(rng() * 6) + 1;
  const dieB = Math.floor(rng() * 6) + 1;
  return {
    dieA,
    dieB,
    total: dieA + dieB,
    isDouble: dieA === dieB
  };
}

function resolvePenaltyRoll(state: GameState, player: Player, roll: DiceRoll, rng: RandomSource): void {
  if (roll.isDouble) {
    player.inPenalty = false;
    player.penaltyTurns = 0;
    addLog(state, `${player.name} جاب دوبل وخرج من القسم.`);
    movePlayer(state, player, roll.total);
    resolveLanding(state, player, roll.total, rng);
    return;
  }

  player.penaltyTurns += 1;
  if (player.penaltyTurns >= 3) {
    payBank(state, player, PENALTY_BAIL, `دفع ${money(PENALTY_BAIL)} بعد ٣ أدوار في القسم`, {
      category: "bail",
      label: "كفالة بعد ٣ أدوار"
    });
    if (!player.bankrupt) {
      player.inPenalty = false;
      player.penaltyTurns = 0;
      movePlayer(state, player, roll.total);
      resolveLanding(state, player, roll.total, rng);
    } else {
      state.turnPhase = "end";
    }
    return;
  }

  addLog(state, `${player.name} لسه في القسم.`);
  state.turnPhase = "end";
}

function movePlayer(state: GameState, player: Player, steps: number): void {
  const nextPosition = player.position + steps;
  if (nextPosition >= BOARD_TILES.length) {
    player.cash += START_BONUS;
    emitStats(state, {
      type: "start_bonus",
      playerId: player.id,
      playerName: player.name,
      amount: START_BONUS
    });
    addLog(state, `${player.name} عدى البداية وخد ${money(START_BONUS)}.`);
  }
  player.position = nextPosition % BOARD_TILES.length;
}

function resolveLanding(
  state: GameState,
  player: Player,
  diceTotal: number,
  rng: RandomSource
): void {
  if (player.bankrupt || state.status === "finished") {
    return;
  }

  const tile = getTile(player.position);
  addLog(state, `${player.name} وقف على ${tile.name}.`);
  emitStats(state, {
    type: "tile_landed",
    playerId: player.id,
    playerName: player.name,
    ...tileStatsFields(tile)
  });

  if (isOwnableTile(tile)) {
    const owner = findOwner(state.players, tile.id);
    if (!owner) {
      state.pendingPurchase = {
        playerId: player.id,
        tileId: tile.id,
        price: tile.price
      };
      state.turnPhase = "buy";
      emitStats(state, {
        type: "property_offered",
        playerId: player.id,
        playerName: player.name,
        ...tileStatsFields(tile),
        price: tile.price
      });
      addLog(state, `${tile.name} متاحة للشراء بـ ${money(tile.price)}.`);
      return;
    }

    if (owner.id === player.id) {
      addLog(state, `${player.name} مالك ${tile.name} بالفعل.`);
      state.turnPhase = "end";
      return;
    }

    const rent = calculateRent(tile, owner, diceTotal, state.buildingsByTile);
    payPlayer(state, player, owner, rent, `هاتو الفلوس اللي عليكوو: دفع لـ ${owner.name} ${money(rent)} إيجار ${tile.name}`, {
      category: "rent",
      label: `إيجار ${tile.name}`,
      tileId: tile.id,
      tileName: tile.name
    });
    state.turnPhase = "end";
    return;
  }

  if (isTaxTile(tile)) {
    const event = drawTaxEvent(tile.name, rng);
    emitStats(state, {
      type: "tax_paid",
      playerId: player.id,
      playerName: player.name,
      tileId: tile.id,
      tileName: tile.name,
      title: event.title,
      amount: event.amount
    });
    payBank(state, player, event.amount, `${event.title} ${money(event.amount)} في ${tile.name}`, {
      category: "tax",
      label: event.title,
      tileId: tile.id,
      tileName: tile.name
    });
    state.turnPhase = "end";
    return;
  }

  if (tile.kind === "fate") {
    drawFate(state, player, rng);
    if (player.bankrupt) {
      state.turnPhase = "end";
    } else if (state.turnPhase !== "end") {
      state.turnPhase = "end";
    }
    return;
  }

  if (tile.kind === "goToPenalty") {
    sendToPenalty(state, player, "tile");
    return;
  }

  state.turnPhase = "end";
}

function drawFate(state: GameState, player: Player, rng: RandomSource): void {
  const card = FATE_CARDS[Math.floor(rng() * FATE_CARDS.length)] ?? FATE_CARDS[0];
  addLog(state, `${player.name} سحب "${card.title}".`);
  emitStats(state, {
    type: "fate_drawn",
    playerId: player.id,
    playerName: player.name,
    title: card.title
  });
  card.apply(state, player, rng, card.title);
  checkWinner(state);
}

function drawTaxEvent(tileName: string, rng: RandomSource): TaxEvent {
  const events = tileName === "مخالفة" ? TRAFFIC_VIOLATIONS : GOVERNMENT_FEES;
  return events[Math.floor(rng() * events.length)] ?? events[0]!;
}

function sendToPenalty(state: GameState, player: Player, source: PenaltySource = "other", fateTitle?: string): void {
  player.position = PENALTY_TILE_ID;
  player.inPenalty = true;
  player.penaltyTurns = 0;
  state.pendingPurchase = null;
  state.turnPhase = "end";
  emitStats(state, {
    type: "sent_to_penalty",
    playerId: player.id,
    playerName: player.name,
    source,
    fateTitle
  });
  addLog(state, `${player.name} راح القسم.`);
}

function payBank(
  state: GameState,
  player: Player,
  amount: number,
  reason: string,
  meta: {
    category?: BankPaymentCategory;
    label?: string;
    tileId?: number;
    tileName?: string;
    fateTitle?: string;
  } = {}
): void {
  player.cash -= amount;
  emitStats(state, {
    type: "bank_paid",
    playerId: player.id,
    playerName: player.name,
    amount,
    category: meta.category ?? "other",
    label: meta.label ?? reason,
    tileId: meta.tileId,
    tileName: meta.tileName,
    fateTitle: meta.fateTitle
  });
  addLog(state, `${player.name} ${reason}.`);
  if (player.cash < 0) {
    bankrupt(state, player, reason);
  }
}

function payPlayer(
  state: GameState,
  payer: Player,
  recipient: Player,
  amount: number,
  reason: string,
  meta: {
    category?: PlayerPaymentCategory;
    label?: string;
    tileId?: number;
    tileName?: string;
    fateTitle?: string;
  } = {}
): void {
  const paid = Math.min(Math.max(payer.cash, 0), amount);
  payer.cash -= amount;
  recipient.cash += paid;
  emitStats(state, {
    type: "player_paid",
    payerId: payer.id,
    payerName: payer.name,
    recipientId: recipient.id,
    recipientName: recipient.name,
    amountCharged: amount,
    amountPaid: paid,
    category: meta.category ?? "fate",
    label: meta.label ?? reason,
    tileId: meta.tileId,
    tileName: meta.tileName,
    fateTitle: meta.fateTitle
  });
  addLog(state, `${payer.name} ${reason}.`);
  if (payer.cash < 0) {
    bankrupt(state, payer, reason);
  }
}

function bankrupt(state: GameState, player: Player, reason: string): void {
  if (player.bankrupt) {
    return;
  }

  player.bankrupt = true;
  player.connected = false;
  player.cash = 0;
  clearPlayerBuildings(state, player);
  player.properties = [];
  player.inPenalty = false;
  player.penaltyTurns = 0;
  player.skipTurns = 0;
  if (state.pendingPurchase?.playerId === player.id) {
    state.pendingPurchase = null;
  }
  emitStats(state, {
    type: "bankrupt",
    playerId: player.id,
    playerName: player.name,
    label: reason
  });
  addLog(state, `${player.name} أفلس بعد ما ${reason}.`);
  checkWinner(state);
}

function advanceTurn(state: GameState): void {
  const players = activePlayers(state);
  if (players.length <= 1) {
    checkWinner(state);
    return;
  }

  const currentIndex = state.players.findIndex((player) => player.id === state.currentPlayerId);
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset + state.players.length) % state.players.length];
    if (candidate && !candidate.bankrupt) {
      if (candidate.skipTurns > 0) {
        candidate.skipTurns -= 1;
        emitStats(state, {
          type: "turn_skipped",
          playerId: candidate.id,
          playerName: candidate.name,
          remainingSkips: candidate.skipTurns
        });
        addLog(state, `${candidate.name} فوت دور بسبب كارت الحظ.`);
        continue;
      }
      state.currentPlayerId = candidate.id;
      state.turnPhase = "roll";
      state.pendingPurchase = null;
      addLog(state, `الدور على ${candidate.name}.`);
      return;
    }
  }

  const fallback = state.players.find((player) => !player.bankrupt);
  if (fallback) {
    state.currentPlayerId = fallback.id;
    state.turnPhase = "roll";
    state.pendingPurchase = null;
    addLog(state, `الدور على ${fallback.name}.`);
  }
}

function advanceIfTurnComplete(state: GameState): void {
  if (state.status === "playing" && state.turnPhase === "end") {
    advanceTurn(state);
  }
}

function activePlayers(state: GameState): Player[] {
  return state.players.filter((player) => !player.bankrupt);
}

function checkWinner(state: GameState): void {
  if (state.status !== "playing") {
    return;
  }
  const players = activePlayers(state);
  if (players.length === 1) {
    const winner = players[0];
    state.status = "finished";
    state.winnerId = winner.id;
    state.currentPlayerId = null;
    state.turnPhase = "end";
    state.pendingPurchase = null;
    emitStats(state, {
      type: "game_finished",
      winnerId: winner.id,
      winnerName: winner.name,
      winnerCash: winner.cash,
      playerCount: state.players.length,
      players: state.players.map((player) => ({ id: player.id, name: player.name })),
      startedAt: gameStartedAtByState.get(state) ?? state.createdAt,
      durationMs: Date.now() - (gameStartedAtByState.get(state) ?? state.createdAt),
      status: state.status
    });
    addLog(state, `${winner.name} كسب بنك الحظ.`);
  }
}

function addLog(state: GameState, message: string): void {
  state.log = [
    {
      id: randomUUID(),
      message,
      createdAt: Date.now()
    },
    ...state.log
  ].slice(0, 60);
}

function touch(state: GameState): void {
  state.updatedAt = Date.now();
  state.actionAvailableAt = Math.max(state.actionAvailableAt, state.updatedAt);
}

function scheduleActionLockForMove(state: GameState, startPosition: number, targetPosition: number): void {
  const steps = clockwiseDistance(startPosition, targetPosition);
  const movementDoneAt = state.updatedAt + SYNC_PLAYBACK_DELAY_MS + CAR_MOVEMENT_OFFSET_MS + steps * CAR_STEP_MS;
  const diceDoneAt = state.updatedAt + SYNC_PLAYBACK_DELAY_MS + DICE_THROW_MS;
  state.actionAvailableAt = Math.max(movementDoneAt, diceDoneAt) + ACTION_UNLOCK_BUFFER_MS;
}

function clockwiseDistance(startPosition: number, targetPosition: number): number {
  return (targetPosition - startPosition + BOARD_TILES.length) % BOARD_TILES.length;
}

function clearPlayerBuildings(state: GameState, player: Player): void {
  for (const tileId of player.properties) {
    delete state.buildingsByTile[tileId];
  }
}

function emitStats(state: GameState, event: GameStatsPayload): void {
  statsSinks.get(state)?.record({
    ...event,
    roomCode: state.roomCode,
    at: Date.now()
  } as GameStatsEvent);
}

function tileStatsFields(tile: BoardTile): {
  tileId: number;
  tileName: string;
  tileKind: BoardTile["kind"];
  tileGroup?: string;
} {
  return {
    tileId: tile.id,
    tileName: tile.name,
    tileKind: tile.kind,
    tileGroup: isOwnableTile(tile) ? tile.group : undefined
  };
}

function money(amount: number): string {
  return `${moneyFormatter.format(amount)} جنيه`;
}

function formatNumber(value: number): string {
  return moneyFormatter.format(value);
}
