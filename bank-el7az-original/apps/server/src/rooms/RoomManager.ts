import type { ClientMessage, GameState, LiveRoomStats, LiveStats, ServerMessage } from "@bank-el7az/shared";
import { ROOM_CODE_LENGTH } from "@bank-el7az/shared";
import { WebSocket } from "ws";
import { randomBytes, randomUUID } from "node:crypto";
import {
  GameError,
  addPlayer,
  attachStatsSink as attachGameStatsSink,
  buildProperty,
  buyProperty,
  createGameState,
  endTurn,
  leavePlayer,
  normalizeName,
  passProperty,
  payBail,
  reconnectPlayer,
  rollDice,
  sellProperty,
  setConnected,
  startGame
} from "../game/engine.js";
import type { StatsStore } from "../stats/StatsStore.js";

interface ClientContext {
  roomCode: string | null;
  playerId: string | null;
}

interface Room {
  state: GameState;
  socketsByPlayer: Map<string, Set<WebSocket>>;
  lastActiveAt: number;
}

const ROOM_TTL_MS = 1000 * 60 * 60 * 4;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly contexts = new WeakMap<WebSocket, ClientContext>();

  constructor(private readonly statsStore: StatsStore) {}

  register(ws: WebSocket): void {
    this.contexts.set(ws, { roomCode: null, playerId: null });
    this.send(ws, { type: "CONNECTED", payload: { serverTime: Date.now() } });
  }

  handleMessage(ws: WebSocket, message: ClientMessage): void {
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

  handleClose(ws: WebSocket): void {
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

  cleanup(): void {
    const now = Date.now();
    for (const [roomCode, room] of this.rooms) {
      if (now - room.lastActiveAt > ROOM_TTL_MS) {
        this.rooms.delete(roomCode);
        this.statsStore.recordRoomExpired();
      }
    }
  }

  getLiveStats(): LiveStats {
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

  private createRoom(ws: WebSocket, name: string): void {
    const roomCode = this.makeRoomCode();
    const playerId = randomUUID();
    const state = createGameState(roomCode, playerId, normalizeName(name));
    this.attachStatsSink(state);
    const room: Room = {
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

  private joinRoom(ws: WebSocket, rawRoomCode: string, name: string, existingPlayerId?: string): void {
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

  private attachSocket(ws: WebSocket, room: Room, playerId: string): void {
    const context = this.contexts.get(ws) ?? { roomCode: null, playerId: null };
    context.roomCode = room.state.roomCode;
    context.playerId = playerId;
    this.contexts.set(ws, context);

    const sockets = room.socketsByPlayer.get(playerId) ?? new Set<WebSocket>();
    sockets.add(ws);
    room.socketsByPlayer.set(playerId, sockets);
    room.lastActiveAt = Date.now();
  }

  private leaveRoom(ws: WebSocket): void {
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

  private withRoomPlayer(ws: WebSocket, callback: (room: Room, playerId: string) => void): void {
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

  private withReadyRoomPlayer(ws: WebSocket, callback: (room: Room, playerId: string) => void): void {
    this.withRoomPlayer(ws, (room, playerId) => {
      if (Date.now() < room.state.actionAvailableAt) {
        throw new GameError("استنى العربية توصل الأول.");
      }
      callback(room, playerId);
    });
  }

  private broadcast(room: Room): void {
    const message: ServerMessage = {
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

  private reject(ws: WebSocket, message: string): void {
    this.send(ws, {
      type: "ACTION_REJECTED",
      payload: { message }
    });
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    this.sendRaw(ws, JSON.stringify(message));
  }

  private sendRaw(ws: WebSocket, rawMessage: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(rawMessage);
    }
  }

  private attachStatsSink(state: GameState): void {
    attachGameStatsSink(state, {
      record: (event) => {
        this.statsStore.recordEngineEvent(event);
      }
    });
  }

  private getLiveRoomStats(room: Room, now: number): LiveRoomStats {
    const activePlayers = room.state.players.filter((player) => !player.bankrupt);
    const leader =
      activePlayers.length > 0
        ? activePlayers.reduce((best, player) => (player.cash > best.cash ? player : best), activePlayers[0]!)
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

  private makeRoomCode(): string {
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
