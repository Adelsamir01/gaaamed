import type { ClientMessage, GameState, ServerMessage } from "@bank-el7az/shared";
import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface StoredSession {
  roomCode: string;
  playerId: string;
  name: string;
}

const SESSION_KEY = "bank-el7az-session";

export function useGameSocket() {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<StoredSession | null>(loadSession());
  const pendingNameRef = useRef<string>("");
  const clockOffsetRef = useRef(0);
  const hasClockOffsetRef = useRef(false);
  const pingSentAtRef = useRef<number | null>(null);

  const updateClockOffset = useCallback((nextOffsetMs: number) => {
    const smoothedOffset = hasClockOffsetRef.current
      ? clockOffsetRef.current * 0.75 + nextOffsetMs * 0.25
      : nextOffsetMs;
    hasClockOffsetRef.current = true;
    clockOffsetRef.current = smoothedOffset;
    setClockOffsetMs(Math.round(smoothedOffset));
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("الاتصال بيرجع تاني.");
      return;
    }
    socket.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let shouldReconnect = true;

    function sendPing(socket: WebSocket) {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      pingSentAtRef.current = Date.now();
      socket.send(JSON.stringify({ type: "PING" } satisfies ClientMessage));
    }

    function stopPingTimer() {
      if (pingTimer) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    }

    function connect() {
      setStatus("connecting");
      const socket = new WebSocket(getWsUrl());
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setStatus("connected");
        setError(null);
        sendPing(socket);
        stopPingTimer();
        pingTimer = window.setInterval(() => sendPing(socket), 2500);
      });

      socket.addEventListener("message", (event) => {
        const message = parseServerMessage(event.data);
        if (!message) {
          return;
        }

        if (message.type === "CONNECTED") {
          updateClockOffset(message.payload.serverTime - Date.now());
          const session = sessionRef.current;
          if (session && !state) {
            socket.send(
              JSON.stringify({
                type: "JOIN_ROOM",
                payload: {
                  roomCode: session.roomCode,
                  name: session.name,
                  playerId: session.playerId
                }
              } satisfies ClientMessage)
            );
          }
          return;
        }

        if (message.type === "PONG") {
          const sentAt = pingSentAtRef.current;
          const receivedAt = Date.now();
          if (sentAt !== null) {
            const roundTripMs = Math.max(receivedAt - sentAt, 0);
            const clientMidpointMs = sentAt + roundTripMs / 2;
            updateClockOffset(message.payload.serverTime - clientMidpointMs);
            setLatencyMs(Math.round(roundTripMs));
          }
          return;
        }

        if (message.type === "ROOM_CREATED" || message.type === "JOINED_ROOM") {
          const session = {
            roomCode: message.payload.roomCode,
            playerId: message.payload.playerId,
            name: pendingNameRef.current || localStorage.getItem("bank-el7az-name") || "لاعب"
          };
          sessionRef.current = session;
          saveSession(session);
          setRoomCode(message.payload.roomCode);
          setPlayerId(message.payload.playerId);
          setState(message.payload.state);
          setError(null);
          return;
        }

        if (message.type === "LEFT_ROOM") {
          clearSession();
          sessionRef.current = null;
          setRoomCode(null);
          setPlayerId(null);
          setState(null);
          setError(null);
          return;
        }

        if (message.type === "GAME_STATE") {
          setState(message.payload.state);
          return;
        }

        if (message.type === "ACTION_REJECTED") {
          if (message.payload.message === "الأوضة مش موجودة.") {
            sessionRef.current = null;
            localStorage.removeItem(SESSION_KEY);
            setState(null);
            setPlayerId(null);
            setRoomCode(null);
          }
          setError(message.payload.message);
          window.setTimeout(() => setError(null), 3500);
        }
      });

      socket.addEventListener("close", () => {
        setStatus("disconnected");
        stopPingTimer();
        if (shouldReconnect) {
          reconnectTimer = window.setTimeout(connect, 1000);
        }
      });

      socket.addEventListener("error", () => {
        setError("في مشكلة في الاتصال.");
      });
    }

    connect();

    return () => {
      shouldReconnect = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      stopPingTimer();
      socketRef.current?.close();
    };
  }, [updateClockOffset]);

  const createRoom = useCallback(
    (name: string) => {
      const cleanName = name.trim() || "لاعب";
      pendingNameRef.current = cleanName;
      send({ type: "CREATE_ROOM", payload: { name: cleanName } });
    },
    [send]
  );

  const joinRoom = useCallback(
    (rawRoomCode: string, name: string) => {
      const cleanName = name.trim() || "لاعب";
      const cleanRoomCode = rawRoomCode.trim().toUpperCase();
      pendingNameRef.current = cleanName;
      const existingSession = sessionRef.current?.roomCode === cleanRoomCode ? sessionRef.current : null;
      send({
        type: "JOIN_ROOM",
        payload: {
          roomCode: cleanRoomCode,
          name: cleanName,
          playerId: existingSession?.playerId
        }
      });
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    send({ type: "LEAVE_ROOM" });
    clearSession();
    sessionRef.current = null;
    setRoomCode(null);
    setPlayerId(null);
    setState(null);
    setError(null);
  }, [send]);

  return {
    status,
    state,
    playerId,
    roomCode,
    error,
    createRoom,
    joinRoom,
    startGame: () => send({ type: "START_GAME" }),
    rollDice: () => send({ type: "ROLL_DICE" }),
    buyProperty: () => send({ type: "BUY_PROPERTY" }),
    passProperty: () => send({ type: "PASS_PROPERTY" }),
    buildProperty: (tileId: number) => send({ type: "BUILD_PROPERTY", payload: { tileId } }),
    sellProperty: (tileId: number) => send({ type: "SELL_PROPERTY", payload: { tileId } }),
    payBail: () => send({ type: "PAY_BAIL" }),
    endTurn: () => send({ type: "END_TURN" }),
    leaveRoom,
    clockOffsetMs,
    latencyMs
  };
}

function getWsUrl(): string {
  const explicitUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicitUrl) {
    return explicitUrl;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== "string") {
    return null;
  }
  try {
    return JSON.parse(raw) as ServerMessage;
  } catch {
    return null;
  }
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as StoredSession) : null;
    const invitedRoomCode = getInviteRoomCode();
    if (session && invitedRoomCode && session.roomCode !== invitedRoomCode) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function getInviteRoomCode(): string | null {
  const roomCode = new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{5}$/.test(roomCode) ? roomCode : null;
}

function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
