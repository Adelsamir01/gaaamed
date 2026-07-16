export type GameStatus = "lobby" | "playing" | "finished";

export type TurnPhase = "roll" | "buy" | "end";

export type PlayerColor =
  | "red"
  | "blue"
  | "green"
  | "gold"
  | "purple"
  | "teal";

export type TileKind =
  | "start"
  | "property"
  | "transport"
  | "utility"
  | "tax"
  | "fate"
  | "penalty"
  | "goToPenalty"
  | "freeRest";

export type PropertyGroup =
  | "oldCairo"
  | "westCoast"
  | "centralDelta"
  | "eastDelta"
  | "canal"
  | "middleEgypt"
  | "upperEgypt"
  | "southValley"
  | "redSea"
  | "transport"
  | "utility";

export interface TileBase<K extends TileKind> {
  id: number;
  kind: K;
  name: string;
  shortName: string;
  description: string;
}

export type StartTile = TileBase<"start">;
export type FateTile = TileBase<"fate">;
export type PenaltyTile = TileBase<"penalty">;
export type GoToPenaltyTile = TileBase<"goToPenalty">;
export type FreeRestTile = TileBase<"freeRest">;

export interface PropertyTile extends TileBase<"property"> {
  kind: "property";
  group: Exclude<PropertyGroup, "transport" | "utility">;
  price: number;
  rent: number;
  color: string;
}

export interface TransportTile extends TileBase<"transport"> {
  kind: "transport";
  group: "transport";
  price: number;
  rent: number;
}

export interface UtilityTile extends TileBase<"utility"> {
  kind: "utility";
  group: "utility";
  price: number;
  rent: number;
}

export type OwnableTile = PropertyTile | TransportTile | UtilityTile;

export interface TaxTile extends TileBase<"tax"> {
  kind: "tax";
  amount: number;
}

export type BoardTile =
  | StartTile
  | FateTile
  | PenaltyTile
  | GoToPenaltyTile
  | FreeRestTile
  | PropertyTile
  | TransportTile
  | UtilityTile
  | TaxTile;

export interface Player {
  id: string;
  name: string;
  color: PlayerColor;
  position: number;
  cash: number;
  properties: number[];
  connected: boolean;
  bankrupt: boolean;
  inPenalty: boolean;
  penaltyTurns: number;
  skipTurns: number;
}

export type BuildingsByTile = Record<number, number>;

export interface PendingPurchase {
  playerId: string;
  tileId: number;
  price: number;
}

export interface DiceRoll {
  dieA: number;
  dieB: number;
  total: number;
  isDouble: boolean;
}

export interface GameLogEntry {
  id: string;
  message: string;
  createdAt: number;
}

export interface GameState {
  roomCode: string;
  hostId: string;
  status: GameStatus;
  players: Player[];
  currentPlayerId: string | null;
  turnPhase: TurnPhase;
  pendingPurchase: PendingPurchase | null;
  buildingsByTile: BuildingsByTile;
  lastRoll: DiceRoll | null;
  winnerId: string | null;
  createdAt: number;
  updatedAt: number;
  actionAvailableAt: number;
  log: GameLogEntry[];
}
