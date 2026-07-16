import type { GameStatus, TileKind } from "@bank-el7az/shared";

export type BankPaymentCategory = "tax" | "fate" | "bail" | "other";
export type PlayerPaymentCategory = "rent" | "fate";
export type PenaltySource = "tile" | "fate" | "bail" | "other";

interface EventBase {
  roomCode: string;
  at: number;
}

export type GameStatsEvent =
  | (EventBase & {
      type: "game_started";
      playerCount: number;
      players: Array<{ id: string; name: string; cash: number }>;
    })
  | (EventBase & {
      type: "dice_rolled";
      playerId: string;
      playerName: string;
      dieA: number;
      dieB: number;
      total: number;
      isDouble: boolean;
      fromTileId: number;
      toTileId: number;
    })
  | (EventBase & {
      type: "tile_landed";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      tileKind: TileKind;
      tileGroup?: string;
    })
  | (EventBase & {
      type: "start_bonus";
      playerId: string;
      playerName: string;
      amount: number;
    })
  | (EventBase & {
      type: "money_awarded";
      playerId: string;
      playerName: string;
      amount: number;
      label: string;
      fateTitle?: string;
    })
  | (EventBase & {
      type: "property_offered";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      tileKind: TileKind;
      tileGroup?: string;
      price: number;
    })
  | (EventBase & {
      type: "property_bought";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      tileKind: TileKind;
      tileGroup?: string;
      price: number;
    })
  | (EventBase & {
      type: "property_passed";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      tileKind: TileKind;
      tileGroup?: string;
      price: number;
    })
  | (EventBase & {
      type: "property_gifted";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      tileKind: TileKind;
      tileGroup?: string;
      price: number;
      fateTitle: string;
    })
  | (EventBase & {
      type: "building_built";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      tileGroup?: string;
      cost: number;
      buildingCount: number;
    })
  | (EventBase & {
      type: "property_sold";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      tileKind: TileKind;
      tileGroup?: string;
      saleValue: number;
      buildingCount: number;
    })
  | (EventBase & {
      type: "fate_drawn";
      playerId: string;
      playerName: string;
      title: string;
    })
  | (EventBase & {
      type: "tax_paid";
      playerId: string;
      playerName: string;
      tileId: number;
      tileName: string;
      title: string;
      amount: number;
    })
  | (EventBase & {
      type: "bank_paid";
      playerId: string;
      playerName: string;
      amount: number;
      category: BankPaymentCategory;
      label: string;
      tileId?: number;
      tileName?: string;
      fateTitle?: string;
    })
  | (EventBase & {
      type: "player_paid";
      payerId: string;
      payerName: string;
      recipientId: string;
      recipientName: string;
      amountCharged: number;
      amountPaid: number;
      category: PlayerPaymentCategory;
      label: string;
      tileId?: number;
      tileName?: string;
      fateTitle?: string;
    })
  | (EventBase & {
      type: "sent_to_penalty";
      playerId: string;
      playerName: string;
      source: PenaltySource;
      fateTitle?: string;
    })
  | (EventBase & {
      type: "fate_skip_turns";
      playerId: string;
      playerName: string;
      title: string;
      turns: number;
    })
  | (EventBase & {
      type: "turn_skipped";
      playerId: string;
      playerName: string;
      remainingSkips: number;
    })
  | (EventBase & {
      type: "bankrupt";
      playerId: string;
      playerName: string;
      label: string;
    })
  | (EventBase & {
      type: "game_finished";
      winnerId: string;
      winnerName: string;
      winnerCash: number;
      playerCount: number;
      players: Array<{ id: string; name: string }>;
      startedAt: number;
      durationMs: number;
      status: GameStatus;
    });

export interface GameStatsSink {
  record(event: GameStatsEvent): void;
}

export type GameStatsPayload = GameStatsEvent extends infer Event
  ? Event extends GameStatsEvent
    ? Omit<Event, "roomCode" | "at">
    : never
  : never;
