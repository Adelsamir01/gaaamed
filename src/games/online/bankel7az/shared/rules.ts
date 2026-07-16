import {
  BOARD_TILES,
  BUILDING_PRICE_RATE,
  BUILDING_SELL_RATE,
  MAX_BUILDINGS_PER_PROPERTY,
  PROPERTY_SELL_RATE
} from "./board.js";
import type { BoardTile, BuildingsByTile, OwnableTile, Player, PropertyTile, TaxTile } from "./types.js";

export function getTile(tileId: number): BoardTile {
  const tile = BOARD_TILES[tileId];
  if (!tile) {
    throw new Error(`Unknown tile ${tileId}`);
  }
  return tile;
}

export function isOwnableTile(tile: BoardTile): tile is OwnableTile {
  return tile.kind === "property" || tile.kind === "transport" || tile.kind === "utility";
}

export function isPropertyTile(tile: BoardTile): tile is PropertyTile {
  return tile.kind === "property";
}

export function isTaxTile(tile: BoardTile): tile is TaxTile {
  return tile.kind === "tax";
}

export function findOwner(players: Player[], tileId: number): Player | null {
  return players.find((player) => player.properties.includes(tileId) && !player.bankrupt) ?? null;
}

export function ownsFullPropertyGroup(tile: PropertyTile, owner: Player): boolean {
  const groupTiles = BOARD_TILES.filter(
    (candidate): candidate is PropertyTile =>
      candidate.kind === "property" && candidate.group === tile.group
  );
  return groupTiles.every((candidate) => owner.properties.includes(candidate.id));
}

export function countOwnedByGroup(owner: Player, group: OwnableTile["group"]): number {
  return BOARD_TILES.filter(
    (tile) => isOwnableTile(tile) && tile.group === group && owner.properties.includes(tile.id)
  ).length;
}

export function calculateRent(
  tile: OwnableTile,
  owner: Player,
  lastDiceTotal: number,
  buildingsByTile: BuildingsByTile = {}
): number {
  if (tile.kind === "transport") {
    const ownedRoutes = countOwnedByGroup(owner, "transport");
    return tile.rent * 2 ** Math.max(ownedRoutes - 1, 0);
  }

  if (tile.kind === "utility") {
    const ownedUtilities = countOwnedByGroup(owner, "utility");
    return lastDiceTotal * (ownedUtilities >= 2 ? 10 : 4);
  }

  const buildingCount = buildingsByTile[tile.id] ?? 0;
  if (buildingCount > 0) {
    return Math.round(tile.rent * (2 + buildingCount * 1.45));
  }

  if (ownsFullPropertyGroup(tile, owner)) {
    return Math.round(tile.rent * 1.75);
  }

  return tile.rent;
}

export function getBuildingCost(tile: PropertyTile): number {
  return roundToTen(tile.price * BUILDING_PRICE_RATE);
}

export function getPropertySellValue(tile: OwnableTile, buildingsByTile: BuildingsByTile = {}): number {
  const buildingCount = buildingsByTile[tile.id] ?? 0;
  const buildingValue = tile.kind === "property" ? getBuildingCost(tile) * buildingCount * BUILDING_SELL_RATE : 0;
  return roundToTen(tile.price * PROPERTY_SELL_RATE + buildingValue);
}

export function canAddBuilding(tile: PropertyTile, owner: Player, buildingsByTile: BuildingsByTile = {}): boolean {
  return ownsFullPropertyGroup(tile, owner) && (buildingsByTile[tile.id] ?? 0) < MAX_BUILDINGS_PER_PROPERTY;
}

function roundToTen(value: number): number {
  return Math.round(value / 10) * 10;
}
