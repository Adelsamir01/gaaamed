import type { GameStatus, TileKind } from "./types.js";

export type NumberMap = Record<string, number>;

export interface MoneyStats {
  spentBuying: number;
  spentBuilding: number;
  paidRentCharged: number;
  paidRentActual: number;
  receivedRent: number;
  paidBank: number;
  paidTax: number;
  paidBail: number;
  earnedFromBank: number;
  startBonuses: number;
  soldToBank: number;
  giftedPropertyValue: number;
  playerTransfers: number;
}

export interface TotalStats {
  roomsCreated: number;
  roomsExpired: number;
  gamesStarted: number;
  gamesFinished: number;
  playersJoined: number;
  reconnects: number;
  disconnects: number;
  leaves: number;
  rolls: number;
  doubles: number;
  turnsSkipped: number;
  tilesLanded: number;
  startPasses: number;
  propertiesOffered: number;
  propertiesBought: number;
  propertiesPassed: number;
  propertiesGifted: number;
  buildingsBuilt: number;
  propertiesSold: number;
  fateCardsDrawn: number;
  taxPayments: number;
  rentPayments: number;
  bankPayments: number;
  playerPayments: number;
  bailPayments: number;
  sentToPenalty: number;
  bankruptcies: number;
}

export interface TileStats {
  tileId: number;
  name: string;
  kind: TileKind;
  group?: string;
  lands: number;
  offers: number;
  purchases: number;
  passes: number;
  purchaseValue: number;
  gifted: number;
  giftedValue: number;
  rentPayments: number;
  rentCharged: number;
  rentPaid: number;
  builds: number;
  buildSpend: number;
  sells: number;
  sellValue: number;
  taxPayments: number;
  taxPaid: number;
  sentToPenalty: number;
}

export interface PlayerStats {
  name: string;
  roomsCreated: number;
  joins: number;
  reconnects: number;
  disconnects: number;
  leaves: number;
  gamesStarted: number;
  gamesFinished: number;
  gamesWon: number;
  rolls: number;
  doubles: number;
  tilesLanded: number;
  startPasses: number;
  propertiesBought: number;
  propertiesGifted: number;
  buildingsBuilt: number;
  propertiesSold: number;
  rentPaid: number;
  rentReceived: number;
  bankPaid: number;
  taxPaid: number;
  bailPaid: number;
  moneySpent: number;
  moneyEarned: number;
  sentToPenalty: number;
  turnsSkipped: number;
  bankruptcies: number;
  highestCash: number;
  lastSeenAt: number;
}

export interface FateCardStats {
  title: string;
  count: number;
  moneyIn: number;
  moneyOut: number;
  giftedProperties: number;
  sentToPenalty: number;
  skipTurns: number;
}

export interface TaxEventStats {
  title: string;
  count: number;
  totalAmount: number;
  highestAmount: number;
}

export interface GameRecordStats {
  biggestRent: MoneyRecord | null;
  biggestPurchase: MoneyRecord | null;
  biggestBuild: MoneyRecord | null;
  biggestBankPayment: MoneyRecord | null;
  richestWinner: MoneyRecord | null;
  longestGame: DurationRecord | null;
  shortestGame: DurationRecord | null;
}

export interface MoneyRecord {
  amount: number;
  playerName: string;
  roomCode: string;
  label: string;
  at: number;
}

export interface DurationRecord {
  durationMs: number;
  roomCode: string;
  winnerName: string;
  playerCount: number;
  finishedAt: number;
}

export interface RecentGameSummary {
  roomCode: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  playerCount: number;
  winnerName: string;
  turns: number;
  rolls: number;
  propertiesBought: number;
  rentPaid: number;
  bankruptcies: number;
}

export interface ActiveGameStats {
  roomCode: string;
  startedAt: number;
  playerCount: number;
  turns: number;
  rolls: number;
  propertiesBought: number;
  rentPaid: number;
  bankruptcies: number;
}

export interface PersistentStats {
  version: 1;
  createdAt: number;
  updatedAt: number;
  totals: TotalStats;
  money: MoneyStats;
  diceFaces: NumberMap;
  diceTotals: NumberMap;
  tiles: Record<string, TileStats>;
  players: Record<string, PlayerStats>;
  fateCards: Record<string, FateCardStats>;
  taxEvents: Record<string, TaxEventStats>;
  activeGames: Record<string, ActiveGameStats>;
  recentGames: RecentGameSummary[];
  records: GameRecordStats;
}

export interface LiveRoomStats {
  roomCode: string;
  status: GameStatus;
  playerCount: number;
  connectedPlayers: number;
  socketCount: number;
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  ageMs: number;
  currentPlayerName: string | null;
  turnPhase: string;
  propertiesOwned: number;
  buildings: number;
  totalCash: number;
  leaderName: string | null;
  leaderCash: number;
  winnerName: string | null;
}

export interface LiveStats {
  activeRooms: number;
  lobbyRooms: number;
  playingRooms: number;
  finishedRooms: number;
  connectedPlayers: number;
  connectedSockets: number;
  rooms: LiveRoomStats[];
}

export interface StatsSnapshot {
  generatedAt: number;
  persistent: PersistentStats;
  live: LiveStats;
  storage: {
    filePath: string;
    lastError: string | null;
  };
}
