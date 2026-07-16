import { describe, expect, it } from "vitest";
import {
  addPlayer,
  buildProperty,
  buyProperty,
  createGameState,
  rollDice,
  sellProperty,
  startGame
} from "./engine.js";
import { BOARD_TILES, isPropertyTile, ownsFullPropertyGroup } from "@bank-el7az/shared";

describe("game engine", () => {
  it("lets the current player buy an unowned property", () => {
    const state = readyGame();
    const host = state.players[0]!;

    rollDice(state, host.id, sequence([0, 0.2]));
    buyProperty(state, host.id);

    expect(host.position).toBe(3);
    expect(host.properties).toContain(3);
    expect(host.cash).toBe(870);
    expect(state.currentPlayerId).toBe(state.players[1]?.id);
    expect(state.turnPhase).toBe("roll");
    expect(state.actionAvailableAt).toBeGreaterThan(state.updatedAt);
  });

  it("auto-passes the turn after charging rent to a rival", () => {
    const state = readyGame();
    const host = state.players[0]!;
    const rival = state.players[1]!;

    rollDice(state, host.id, sequence([0, 0.2]));
    buyProperty(state, host.id);
    rollDice(state, rival.id, sequence([0, 0.2]));

    expect(rival.cash).toBe(988);
    expect(host.cash).toBe(882);
    expect(state.currentPlayerId).toBe(host.id);
    expect(state.turnPhase).toBe("roll");
    expect(state.log.some((entry) => entry.message.includes("هاتو الفلوس اللي عليكوو"))).toBe(true);
  });

  it("pays the start bonus when a player passes Tahrir Start", () => {
    const state = readyGame();
    const host = state.players[0]!;
    host.position = 37;

    rollDice(state, host.id, sequence([0, 0]));

    expect(host.position).toBe(1);
    expect(host.cash).toBe(1250);
    expect(state.pendingPurchase?.tileId).toBe(1);
  });

  it("lets owners build after completing a group and raises rent", () => {
    const state = readyGame();
    const host = state.players[0]!;
    const rival = state.players[1]!;
    host.properties.push(1, 2, 3);

    buildProperty(state, host.id, 3);
    state.currentPlayerId = rival.id;
    rollDice(state, rival.id, sequence([0, 0.2]));

    expect(state.buildingsByTile[3]).toBe(1);
    expect(host.cash).toBe(991);
    expect(rival.cash).toBe(959);
  });

  it("lets owners sell a property back to the bank at a discount", () => {
    const state = readyGame();
    const host = state.players[0]!;
    host.cash = 100;
    host.properties.push(3);
    state.buildingsByTile[3] = 2;

    sellProperty(state, host.id, 3);

    expect(host.cash).toBe(230);
    expect(host.properties).not.toContain(3);
    expect(state.buildingsByTile[3]).toBeUndefined();
  });

  it("bankrupts a player and declares the winner", () => {
    const state = readyGame();
    const host = state.players[0]!;
    const rival = state.players[1]!;
    host.properties.push(3);
    rival.cash = 5;
    state.currentPlayerId = rival.id;

    rollDice(state, rival.id, sequence([0, 0.2]));

    expect(rival.bankrupt).toBe(true);
    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe(host.id);
  });

  it("keeps every property group contiguous and limited to three governorates", () => {
    const groups = new Map<string, number[]>();
    for (const tile of BOARD_TILES.filter(isPropertyTile)) {
      const ids = groups.get(tile.group) ?? [];
      ids.push(tile.id);
      groups.set(tile.group, ids);
    }

    expect(BOARD_TILES.filter(isPropertyTile)).toHaveLength(27);
    expect(groups.size).toBe(9);
    for (const ids of groups.values()) {
      expect(ids).toHaveLength(3);
      expect(ids[2]! - ids[0]!).toBe(2);
    }
  });

  it("only unlocks building after one player owns the complete color group", () => {
    const state = readyGame();
    const host = state.players[0]!;
    const cairo = BOARD_TILES[1]!;
    if (!isPropertyTile(cairo)) {
      throw new Error("Expected Cairo to be a property");
    }

    host.properties.push(1, 2);
    expect(ownsFullPropertyGroup(cairo, host)).toBe(false);
    expect(() => buildProperty(state, host.id, 1)).toThrow("لازم تملك المجموعة");

    host.properties.push(3);
    expect(ownsFullPropertyGroup(cairo, host)).toBe(true);
    expect(() => buildProperty(state, host.id, 1)).not.toThrow();
  });
});

function readyGame() {
  const state = createGameState("ABCDE", "host", "Host");
  addPlayer(state, "rival", "Rival");
  startGame(state, "host");
  return state;
}

function sequence(values: number[]) {
  let index = 0;
  return () => values[index++] ?? 0;
}
