import type { GameState } from "./types.js";

export type ClientMessage =
  | { type: "CREATE_ROOM"; payload: { name: string } }
  | { type: "JOIN_ROOM"; payload: { roomCode: string; name: string; playerId?: string } }
  | { type: "START_GAME" }
  | { type: "ROLL_DICE" }
  | { type: "BUY_PROPERTY" }
  | { type: "PASS_PROPERTY" }
  | { type: "BUILD_PROPERTY"; payload: { tileId: number } }
  | { type: "SELL_PROPERTY"; payload: { tileId: number } }
  | { type: "PAY_BAIL" }
  | { type: "END_TURN" }
  | { type: "LEAVE_ROOM" }
  | { type: "PING" };

export type ServerMessage =
  | { type: "CONNECTED"; payload: { serverTime: number } }
  | { type: "ROOM_CREATED"; payload: { roomCode: string; playerId: string; state: GameState } }
  | { type: "JOINED_ROOM"; payload: { roomCode: string; playerId: string; state: GameState } }
  | { type: "GAME_STATE"; payload: { state: GameState } }
  | { type: "ACTION_REJECTED"; payload: { message: string } }
  | { type: "LEFT_ROOM"; payload: { message: string } }
  | { type: "ROOM_CLOSED"; payload: { message: string } }
  | { type: "PONG"; payload: { serverTime: number } };
