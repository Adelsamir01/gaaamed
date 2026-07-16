import type { ClientMessage } from "@bank-el7az/shared";

export function parseClientMessage(raw: string): ClientMessage | null {
  let value: unknown;
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

function hasPayloadName(value: Record<string, unknown>): value is { payload: { name: string } } {
  return isRecord(value.payload) && typeof value.payload.name === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
