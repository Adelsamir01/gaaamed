import type { ClientMessage, GameState, ServerMessage } from "./shared/index.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOnline } from "@/online/OnlineContext";

// نقل كامل من apps/client/src/net/useGameSocket.ts مع تكييف النقل فقط:
// بدل سوكيت مستقل، تُرسل رسائل البروتوكول الأصلية عبر نفق ديدوس {type:'bank', msg}
type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface StoredSession {
  roomCode: string;
  playerId: string;
  name: string;
}

const SESSION_KEY = "bank-el7az-session";

export function useGameSocket(options: { name?: string } = {}) {
  const online = useOnline();
  const { sendRaw, subscribe } = online;
  const playerName = options.name?.trim() || localStorage.getItem("bank-el7az-name") || "لاعب";
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const sessionRef = useRef<StoredSession | null>(loadSession());
  const stateRef = useRef<GameState | null>(null);
  const pendingNameRef = useRef<string>(playerName);
  const clockOffsetRef = useRef(0);
  const hasClockOffsetRef = useRef(false);
  const pingSentAtRef = useRef<number | null>(null);
  const sendRawRef = useRef(sendRaw);
  const onlineStatusRef = useRef(online.status);
  const dedosCodeRef = useRef<string | null>(null);
  const slotRef = useRef<number | null>(null);
  const nameRef = useRef(playerName);
  // حارس ضد ازدواج طلبات الدخول التلقائي (مفتاحه code:slot)
  const joinRequestRef = useRef<string | null>(null);
  stateRef.current = state;
  sendRawRef.current = sendRaw;
  onlineStatusRef.current = online.status;
  dedosCodeRef.current = online.code;
  slotRef.current = online.slot;
  nameRef.current = playerName;

  const status: ConnectionStatus =
    online.status === "online" ? "connected" : online.status === "connecting" ? "connecting" : "disconnected";

  const updateClockOffset = useCallback((nextOffsetMs: number) => {
    const smoothedOffset = hasClockOffsetRef.current
      ? clockOffsetRef.current * 0.75 + nextOffsetMs * 0.25
      : nextOffsetMs;
    hasClockOffsetRef.current = true;
    clockOffsetRef.current = smoothedOffset;
    setClockOffsetMs(Math.round(smoothedOffset));
  }, []);

  const send = useCallback(
    (message: ClientMessage) => {
      if (onlineStatusRef.current !== "online") {
        setError("الاتصال بيرجع تاني.");
        return;
      }
      sendRawRef.current({ type: "bank", msg: message as unknown as Record<string, unknown> });
    },
    []
  );

  useEffect(() => {
    function sendPing() {
      if (onlineStatusRef.current !== "online") {
        return;
      }
      pingSentAtRef.current = Date.now();
      sendRawRef.current({ type: "bank", msg: { type: "PING" } });
    }

    function handleBankMessage(message: ServerMessage) {
      if (message.type === "CONNECTED") {
        // للساعة فقط — الدخول التلقائي مسؤولية useEffect بالأسفل (إصلاح سباق CONNECTED قبل الاشتراك)
        updateClockOffset(message.payload.serverTime - Date.now());
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
        setPlayerId(message.payload.playerId);
        setState(message.payload.state);
        setError(null);
        return;
      }

      if (message.type === "LEFT_ROOM") {
        clearSession();
        sessionRef.current = null;
        joinRequestRef.current = null;
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
        }
        setError(message.payload.message);
        window.setTimeout(() => setError(null), 3500);
      }
    }

    const unsubscribe = subscribe((ev) => {
      if (ev.kind === "bank") {
        handleBankMessage(ev.msg as ServerMessage);
      }
    });

    sendPing();
    const pingTimer = window.setInterval(sendPing, 2500);

    return () => {
      unsubscribe();
      window.clearInterval(pingTimer);
    };
  }, [subscribe, updateClockOffset]);

  // الدخول التلقائي لغرفة البنك بمجرد توفر الاتصال + غرفة ديدوس —
  // لا يعتمد على رسالة CONNECTED (كانت تصل أحيانًا قبل اشتراك الـ hook فيضيع الطلب)
  const dedosCode = online.code;
  const dedosSlot = online.slot;
  useEffect(() => {
    if (status !== "connected") return;
    if (stateRef.current) return;
    if (!dedosCode && dedosSlot !== 1) return; // لا غرفة ديدوس بعد
    const key = `${dedosCode ?? "host"}:${dedosSlot ?? "?"}`;
    if (joinRequestRef.current === key) return;
    joinRequestRef.current = key;

    const session = sessionRef.current;
    if (session && dedosCode && session.roomCode === dedosCode) {
      pendingNameRef.current = session.name;
      sendRawRef.current({
        type: "bank",
        msg: {
          type: "JOIN_ROOM",
          payload: { roomCode: session.roomCode, name: session.name, playerId: session.playerId }
        }
      });
      return;
    }
    const name = nameRef.current;
    pendingNameRef.current = name;
    if (dedosSlot === 1) {
      sendRawRef.current({ type: "bank", msg: { type: "CREATE_ROOM", payload: { name } } });
    } else if (dedosCode) {
      sendRawRef.current({ type: "bank", msg: { type: "JOIN_ROOM", payload: { roomCode: dedosCode, name } } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dedosCode, dedosSlot]);

  const leaveRoom = useCallback(() => {
    send({ type: "LEAVE_ROOM" });
    clearSession();
    sessionRef.current = null;
    joinRequestRef.current = null;
    setPlayerId(null);
    setState(null);
    setError(null);
  }, [send]);

  return {
    status,
    state,
    playerId,
    error,
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

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
