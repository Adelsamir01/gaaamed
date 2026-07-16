import {
  BOARD_TILES,
  type ActiveGameStats,
  type FateCardStats,
  type LiveStats,
  type MoneyRecord,
  type PersistentStats,
  type PlayerStats,
  type StatsSnapshot,
  type TaxEventStats,
  type TileStats
} from "@bank-el7az/shared";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { GameStatsEvent } from "./events.js";

const STATS_VERSION = 1;
const MAX_RECENT_GAMES = 30;

export class StatsStore {
  private stats: PersistentStats;
  private lastError: string | null = null;

  constructor(private readonly filePath: string) {
    this.stats = this.load();
    this.write();
  }

  getSnapshot(live: LiveStats): StatsSnapshot {
    return {
      generatedAt: Date.now(),
      persistent: this.stats,
      live,
      storage: {
        filePath: this.filePath,
        lastError: this.lastError
      }
    };
  }

  recordRoomCreated(roomCode: string, hostName: string, hostCash: number): void {
    const at = Date.now();
    this.stats.totals.roomsCreated += 1;
    this.stats.totals.playersJoined += 1;
    const player = this.player(hostName, at);
    player.roomsCreated += 1;
    player.joins += 1;
    player.highestCash = Math.max(player.highestCash, hostCash);
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordPlayerJoined(playerName: string, cash: number): void {
    const at = Date.now();
    this.stats.totals.playersJoined += 1;
    const player = this.player(playerName, at);
    player.joins += 1;
    player.highestCash = Math.max(player.highestCash, cash);
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordReconnect(playerName: string, cash: number): void {
    const at = Date.now();
    this.stats.totals.reconnects += 1;
    const player = this.player(playerName, at);
    player.reconnects += 1;
    player.highestCash = Math.max(player.highestCash, cash);
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordDisconnect(playerName: string): void {
    const at = Date.now();
    this.stats.totals.disconnects += 1;
    const player = this.player(playerName, at);
    player.disconnects += 1;
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordLeave(playerName: string): void {
    const at = Date.now();
    this.stats.totals.leaves += 1;
    const player = this.player(playerName, at);
    player.leaves += 1;
    player.lastSeenAt = at;
    this.touchAndWrite(at);
  }

  recordRoomExpired(): void {
    const at = Date.now();
    this.stats.totals.roomsExpired += 1;
    this.touchAndWrite(at);
  }

  recordEngineEvent(event: GameStatsEvent): void {
    switch (event.type) {
      case "game_started":
        this.stats.totals.gamesStarted += 1;
        this.stats.activeGames[event.roomCode] = {
          roomCode: event.roomCode,
          startedAt: event.at,
          playerCount: event.playerCount,
          turns: 0,
          rolls: 0,
          propertiesBought: 0,
          rentPaid: 0,
          bankruptcies: 0
        };
        for (const eventPlayer of event.players) {
          const player = this.player(eventPlayer.name, event.at);
          player.gamesStarted += 1;
          player.highestCash = Math.max(player.highestCash, eventPlayer.cash);
          player.lastSeenAt = event.at;
        }
        break;

      case "dice_rolled":
        this.stats.totals.rolls += 1;
        increment(this.stats.diceFaces, event.dieA);
        increment(this.stats.diceFaces, event.dieB);
        increment(this.stats.diceTotals, event.total);
        if (event.isDouble) {
          this.stats.totals.doubles += 1;
        }
        this.withActiveGame(event.roomCode, (game) => {
          game.rolls += 1;
          game.turns += 1;
        });
        this.player(event.playerName, event.at).rolls += 1;
        if (event.isDouble) {
          this.player(event.playerName, event.at).doubles += 1;
        }
        break;

      case "tile_landed":
        this.stats.totals.tilesLanded += 1;
        this.tile(event).lands += 1;
        this.player(event.playerName, event.at).tilesLanded += 1;
        break;

      case "start_bonus":
        this.stats.totals.startPasses += 1;
        this.stats.money.startBonuses += event.amount;
        this.stats.money.earnedFromBank += event.amount;
        this.player(event.playerName, event.at).startPasses += 1;
        this.player(event.playerName, event.at).moneyEarned += event.amount;
        break;

      case "money_awarded":
        this.stats.money.earnedFromBank += event.amount;
        if (event.fateTitle) {
          this.fate(event.fateTitle).moneyIn += event.amount;
        }
        this.player(event.playerName, event.at).moneyEarned += event.amount;
        break;

      case "property_offered":
        this.stats.totals.propertiesOffered += 1;
        this.tile(event).offers += 1;
        break;

      case "property_bought":
        this.stats.totals.propertiesBought += 1;
        this.stats.money.spentBuying += event.price;
        this.tile(event).purchases += 1;
        this.tile(event).purchaseValue += event.price;
        this.withActiveGame(event.roomCode, (game) => {
          game.propertiesBought += 1;
        });
        this.updateMoneyRecord("biggestPurchase", {
          amount: event.price,
          playerName: event.playerName,
          roomCode: event.roomCode,
          label: event.tileName,
          at: event.at
        });
        this.player(event.playerName, event.at).propertiesBought += 1;
        this.player(event.playerName, event.at).moneySpent += event.price;
        break;

      case "property_passed":
        this.stats.totals.propertiesPassed += 1;
        this.tile(event).passes += 1;
        break;

      case "property_gifted":
        this.stats.totals.propertiesGifted += 1;
        this.stats.money.giftedPropertyValue += event.price;
        this.tile(event).gifted += 1;
        this.tile(event).giftedValue += event.price;
        this.fate(event.fateTitle).giftedProperties += 1;
        this.player(event.playerName, event.at).propertiesGifted += 1;
        this.player(event.playerName, event.at).moneyEarned += event.price;
        break;

      case "building_built":
        this.stats.totals.buildingsBuilt += 1;
        this.stats.money.spentBuilding += event.cost;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "property",
          tileGroup: event.tileGroup
        }).builds += 1;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "property",
          tileGroup: event.tileGroup
        }).buildSpend += event.cost;
        this.updateMoneyRecord("biggestBuild", {
          amount: event.cost,
          playerName: event.playerName,
          roomCode: event.roomCode,
          label: event.tileName,
          at: event.at
        });
        this.player(event.playerName, event.at).buildingsBuilt += 1;
        this.player(event.playerName, event.at).moneySpent += event.cost;
        break;

      case "property_sold":
        this.stats.totals.propertiesSold += 1;
        this.stats.money.soldToBank += event.saleValue;
        this.stats.money.earnedFromBank += event.saleValue;
        this.tile(event).sells += 1;
        this.tile(event).sellValue += event.saleValue;
        this.player(event.playerName, event.at).propertiesSold += 1;
        this.player(event.playerName, event.at).moneyEarned += event.saleValue;
        break;

      case "fate_drawn":
        this.stats.totals.fateCardsDrawn += 1;
        this.fate(event.title).count += 1;
        break;

      case "tax_paid":
        this.stats.totals.taxPayments += 1;
        this.stats.money.paidTax += event.amount;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "tax"
        }).taxPayments += 1;
        this.tile({
          tileId: event.tileId,
          tileName: event.tileName,
          tileKind: "tax"
        }).taxPaid += event.amount;
        this.tax(event.title, event.amount).count += 1;
        this.tax(event.title, event.amount).totalAmount += event.amount;
        this.tax(event.title, event.amount).highestAmount = Math.max(
          this.tax(event.title, event.amount).highestAmount,
          event.amount
        );
        this.player(event.playerName, event.at).taxPaid += event.amount;
        break;

      case "bank_paid":
        this.stats.totals.bankPayments += 1;
        this.stats.money.paidBank += event.amount;
        if (event.category === "bail") {
          this.stats.totals.bailPayments += 1;
          this.stats.money.paidBail += event.amount;
          this.player(event.playerName, event.at).bailPaid += event.amount;
        }
        if (event.category === "fate" && event.fateTitle) {
          this.fate(event.fateTitle).moneyOut += event.amount;
        }
        this.updateMoneyRecord("biggestBankPayment", {
          amount: event.amount,
          playerName: event.playerName,
          roomCode: event.roomCode,
          label: event.label,
          at: event.at
        });
        this.player(event.playerName, event.at).bankPaid += event.amount;
        this.player(event.playerName, event.at).moneySpent += event.amount;
        break;

      case "player_paid":
        this.stats.totals.playerPayments += 1;
        this.stats.money.playerTransfers += event.amountPaid;
        if (event.category === "rent") {
          this.stats.totals.rentPayments += 1;
          this.stats.money.paidRentCharged += event.amountCharged;
          this.stats.money.paidRentActual += event.amountPaid;
          this.stats.money.receivedRent += event.amountPaid;
          if (event.tileId !== undefined && event.tileName) {
            const tile = this.tile({
              tileId: event.tileId,
              tileName: event.tileName,
              tileKind: "property"
            });
            tile.rentPayments += 1;
            tile.rentCharged += event.amountCharged;
            tile.rentPaid += event.amountPaid;
          }
          this.withActiveGame(event.roomCode, (game) => {
            game.rentPaid += event.amountPaid;
          });
          this.updateMoneyRecord("biggestRent", {
            amount: event.amountCharged,
            playerName: event.payerName,
            roomCode: event.roomCode,
            label: event.tileName ?? event.label,
            at: event.at
          });
          this.player(event.payerName, event.at).rentPaid += event.amountPaid;
          this.player(event.recipientName, event.at).rentReceived += event.amountPaid;
        }
        if (event.category === "fate" && event.fateTitle) {
          if (event.amountPaid > 0) {
            this.fate(event.fateTitle).moneyIn += event.amountPaid;
            this.fate(event.fateTitle).moneyOut += event.amountPaid;
          }
        }
        this.player(event.payerName, event.at).moneySpent += event.amountPaid;
        this.player(event.recipientName, event.at).moneyEarned += event.amountPaid;
        break;

      case "sent_to_penalty":
        this.stats.totals.sentToPenalty += 1;
        this.tile({
          tileId: 10,
          tileName: "القسم",
          tileKind: "penalty"
        }).sentToPenalty += 1;
        if (event.fateTitle) {
          this.fate(event.fateTitle).sentToPenalty += 1;
        }
        this.player(event.playerName, event.at).sentToPenalty += 1;
        break;

      case "fate_skip_turns":
        this.fate(event.title).skipTurns += event.turns;
        break;

      case "turn_skipped":
        this.stats.totals.turnsSkipped += 1;
        this.player(event.playerName, event.at).turnsSkipped += 1;
        break;

      case "bankrupt":
        this.stats.totals.bankruptcies += 1;
        this.withActiveGame(event.roomCode, (game) => {
          game.bankruptcies += 1;
        });
        this.player(event.playerName, event.at).bankruptcies += 1;
        break;

      case "game_finished":
        this.stats.totals.gamesFinished += 1;
        this.player(event.winnerName, event.at).gamesWon += 1;
        this.player(event.winnerName, event.at).highestCash = Math.max(
          this.player(event.winnerName, event.at).highestCash,
          event.winnerCash
        );
        for (const eventPlayer of event.players) {
          this.player(eventPlayer.name, event.at).gamesFinished += 1;
        }
        this.updateMoneyRecord("richestWinner", {
          amount: event.winnerCash,
          playerName: event.winnerName,
          roomCode: event.roomCode,
          label: "رصيد الفائز",
          at: event.at
        });
        this.updateDurationRecords(event.roomCode, event.winnerName, event.playerCount, event.durationMs, event.at);
        this.addRecentGame(event);
        delete this.stats.activeGames[event.roomCode];
        break;
    }

    this.touchAndWrite(event.at);
  }

  private addRecentGame(event: Extract<GameStatsEvent, { type: "game_finished" }>): void {
    const activeGame = this.stats.activeGames[event.roomCode];
    this.stats.recentGames = [
      {
        roomCode: event.roomCode,
        startedAt: event.startedAt,
        finishedAt: event.at,
        durationMs: event.durationMs,
        playerCount: event.playerCount,
        winnerName: event.winnerName,
        turns: activeGame?.turns ?? 0,
        rolls: activeGame?.rolls ?? 0,
        propertiesBought: activeGame?.propertiesBought ?? 0,
        rentPaid: activeGame?.rentPaid ?? 0,
        bankruptcies: activeGame?.bankruptcies ?? 0
      },
      ...this.stats.recentGames
    ].slice(0, MAX_RECENT_GAMES);
  }

  private updateDurationRecords(
    roomCode: string,
    winnerName: string,
    playerCount: number,
    durationMs: number,
    finishedAt: number
  ): void {
    const record = { roomCode, winnerName, playerCount, durationMs, finishedAt };
    if (!this.stats.records.longestGame || durationMs > this.stats.records.longestGame.durationMs) {
      this.stats.records.longestGame = record;
    }
    if (!this.stats.records.shortestGame || durationMs < this.stats.records.shortestGame.durationMs) {
      this.stats.records.shortestGame = record;
    }
  }

  private updateMoneyRecord(key: keyof Pick<
    PersistentStats["records"],
    "biggestRent" | "biggestPurchase" | "biggestBuild" | "biggestBankPayment" | "richestWinner"
  >, record: MoneyRecord): void {
    const current = this.stats.records[key];
    if (!current || record.amount > current.amount) {
      this.stats.records[key] = record;
    }
  }

  private withActiveGame(roomCode: string, callback: (game: ActiveGameStats) => void): void {
    const game = this.stats.activeGames[roomCode];
    if (game) {
      callback(game);
    }
  }

  private player(name: string, at: number): PlayerStats {
    const key = normalizeKey(name);
    this.stats.players[key] ??= {
      name,
      roomsCreated: 0,
      joins: 0,
      reconnects: 0,
      disconnects: 0,
      leaves: 0,
      gamesStarted: 0,
      gamesFinished: 0,
      gamesWon: 0,
      rolls: 0,
      doubles: 0,
      tilesLanded: 0,
      startPasses: 0,
      propertiesBought: 0,
      propertiesGifted: 0,
      buildingsBuilt: 0,
      propertiesSold: 0,
      rentPaid: 0,
      rentReceived: 0,
      bankPaid: 0,
      taxPaid: 0,
      bailPaid: 0,
      moneySpent: 0,
      moneyEarned: 0,
      sentToPenalty: 0,
      turnsSkipped: 0,
      bankruptcies: 0,
      highestCash: 0,
      lastSeenAt: at
    };
    return this.stats.players[key]!;
  }

  private tile(event: { tileId: number; tileName: string; tileKind: TileStats["kind"]; tileGroup?: string }): TileStats {
    const key = String(event.tileId);
    this.stats.tiles[key] ??= emptyTileStats(event.tileId, event.tileName, event.tileKind, event.tileGroup);
    return this.stats.tiles[key]!;
  }

  private fate(title: string): FateCardStats {
    this.stats.fateCards[title] ??= {
      title,
      count: 0,
      moneyIn: 0,
      moneyOut: 0,
      giftedProperties: 0,
      sentToPenalty: 0,
      skipTurns: 0
    };
    return this.stats.fateCards[title]!;
  }

  private tax(title: string, amount: number): TaxEventStats {
    this.stats.taxEvents[title] ??= {
      title,
      count: 0,
      totalAmount: 0,
      highestAmount: amount
    };
    return this.stats.taxEvents[title]!;
  }

  private touchAndWrite(at: number): void {
    this.stats.updatedAt = at;
    this.write();
  }

  private load(): PersistentStats {
    try {
      if (!existsSync(this.filePath)) {
        return createEmptyStats();
      }
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<PersistentStats>;
      return normalizeStats(parsed);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown stats load error";
      return createEmptyStats();
    }
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      writeFileSync(temporaryPath, `${JSON.stringify(this.stats, null, 2)}\n`, "utf8");
      renameSync(temporaryPath, this.filePath);
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Unknown stats write error";
    }
  }
}

export function resolveStatsFilePath(): string {
  return resolve(process.env.STATS_FILE_PATH ?? process.env.STATS_FILE ?? "data/stats.json");
}

function createEmptyStats(): PersistentStats {
  const now = Date.now();
  const stats: PersistentStats = {
    version: STATS_VERSION,
    createdAt: now,
    updatedAt: now,
    totals: {
      roomsCreated: 0,
      roomsExpired: 0,
      gamesStarted: 0,
      gamesFinished: 0,
      playersJoined: 0,
      reconnects: 0,
      disconnects: 0,
      leaves: 0,
      rolls: 0,
      doubles: 0,
      turnsSkipped: 0,
      tilesLanded: 0,
      startPasses: 0,
      propertiesOffered: 0,
      propertiesBought: 0,
      propertiesPassed: 0,
      propertiesGifted: 0,
      buildingsBuilt: 0,
      propertiesSold: 0,
      fateCardsDrawn: 0,
      taxPayments: 0,
      rentPayments: 0,
      bankPayments: 0,
      playerPayments: 0,
      bailPayments: 0,
      sentToPenalty: 0,
      bankruptcies: 0
    },
    money: {
      spentBuying: 0,
      spentBuilding: 0,
      paidRentCharged: 0,
      paidRentActual: 0,
      receivedRent: 0,
      paidBank: 0,
      paidTax: 0,
      paidBail: 0,
      earnedFromBank: 0,
      startBonuses: 0,
      soldToBank: 0,
      giftedPropertyValue: 0,
      playerTransfers: 0
    },
    diceFaces: Object.fromEntries(Array.from({ length: 6 }, (_, index) => [String(index + 1), 0])),
    diceTotals: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [String(index + 2), 0])),
    tiles: Object.fromEntries(
      BOARD_TILES.map((tile) => [
        String(tile.id),
        emptyTileStats(
          tile.id,
          tile.name,
          tile.kind,
          "group" in tile ? String(tile.group) : undefined
        )
      ])
    ),
    players: {},
    fateCards: {},
    taxEvents: {},
    activeGames: {},
    recentGames: [],
    records: {
      biggestRent: null,
      biggestPurchase: null,
      biggestBuild: null,
      biggestBankPayment: null,
      richestWinner: null,
      longestGame: null,
      shortestGame: null
    }
  };
  return stats;
}

function normalizeStats(parsed: Partial<PersistentStats>): PersistentStats {
  const base = createEmptyStats();
  const stats: PersistentStats = {
    ...base,
    ...parsed,
    version: STATS_VERSION,
    totals: { ...base.totals, ...parsed.totals },
    money: { ...base.money, ...parsed.money },
    diceFaces: { ...base.diceFaces, ...parsed.diceFaces },
    diceTotals: { ...base.diceTotals, ...parsed.diceTotals },
    tiles: migrateTileStats(base.tiles, parsed.tiles),
    players: { ...base.players, ...parsed.players },
    fateCards: { ...base.fateCards, ...parsed.fateCards },
    taxEvents: { ...base.taxEvents, ...parsed.taxEvents },
    activeGames: { ...base.activeGames, ...parsed.activeGames },
    recentGames: parsed.recentGames ?? base.recentGames,
    records: { ...base.records, ...parsed.records }
  };
  return stats;
}

function migrateTileStats(
  currentTiles: Record<string, TileStats>,
  storedTiles: Record<string, TileStats> | undefined
): Record<string, TileStats> {
  if (!storedTiles) {
    return currentTiles;
  }

  const usedStoredKeys = new Set<string>();
  const storedEntries = Object.entries(storedTiles);
  return Object.fromEntries(
    Object.entries(currentTiles).map(([currentKey, current]) => {
      const samePosition = storedTiles[currentKey];
      let matchKey: string | undefined;
      let previous: TileStats | undefined;

      if (samePosition?.name === current.name && samePosition.kind === current.kind) {
        matchKey = currentKey;
        previous = samePosition;
      } else {
        const matchingEntry = storedEntries.find(
          ([storedKey, stored]) =>
            !usedStoredKeys.has(storedKey) && stored.name === current.name && stored.kind === current.kind
        );
        matchKey = matchingEntry?.[0];
        previous = matchingEntry?.[1];
      }

      if (matchKey) {
        usedStoredKeys.add(matchKey);
      }

      return [
        currentKey,
        {
          ...current,
          ...previous,
          tileId: current.tileId,
          name: current.name,
          kind: current.kind,
          group: current.group
        }
      ];
    })
  );
}

function emptyTileStats(tileId: number, name: string, kind: TileStats["kind"], group?: string): TileStats {
  return {
    tileId,
    name,
    kind,
    group,
    lands: 0,
    offers: 0,
    purchases: 0,
    passes: 0,
    purchaseValue: 0,
    gifted: 0,
    giftedValue: 0,
    rentPayments: 0,
    rentCharged: 0,
    rentPaid: 0,
    builds: 0,
    buildSpend: 0,
    sells: 0,
    sellValue: 0,
    taxPayments: 0,
    taxPaid: 0,
    sentToPenalty: 0
  };
}

function increment(map: Record<string, number>, key: string | number): void {
  const stringKey = String(key);
  map[stringKey] = (map[stringKey] ?? 0) + 1;
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, " ") || "لاعب";
}
