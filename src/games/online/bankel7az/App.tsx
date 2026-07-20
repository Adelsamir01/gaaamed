import {
  BOARD_TILES,
  CAR_MOVEMENT_OFFSET_MS,
  CAR_STEP_MS,
  GROUP_NAMES,
  MAX_BUILDINGS_PER_PROPERTY,
  SYNC_PLAYBACK_DELAY_MS,
  calculateRent,
  canAddBuilding,
  getBuildingCost,
  getPropertySellValue,
  isOwnableTile,
  isPropertyTile,
  ownsFullPropertyGroup
} from "./shared/index.js";
import type { BoardTile, GameLogEntry, GameState, Player } from "./shared/index.js";
import type { PlayerStats, StatsSnapshot, TileStats } from "./shared/index.js";
import {
  Activity,
  Banknote,
  BarChart3,
  Building2,
  CarFront,
  Check,
  CircleDollarSign,
  Coffee,
  Dice5,
  House,
  Hourglass,
  Landmark,
  LogOut,
  Maximize2,
  Menu,
  Play,
  PlugZap,
  RefreshCcw,
  ReceiptText,
  Search,
  ShieldAlert,
  Share2,
  ShoppingBag,
  SkipForward,
  Sparkles,
  SquarePlus,
  TrafficCone,
  Trophy,
  Users,
  WalletCards,
  X
} from "lucide-react";
import type { CSSProperties, MutableRefObject, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useGameSocket } from "./useGameSocket.js";
import { useApp } from "@/store/AppContext";
import { useOnline } from "@/online/OnlineContext";
import { getServerUrl } from "@/online/client";
import type { GameResult } from "@/types";
import "./styles.css";

const numberFormatter = new Intl.NumberFormat("ar-EG");
const DICE_SOUND_URL = "/audio/dice.mp3";

const colorClass: Record<Player["color"], string> = {
  red: "player-red",
  blue: "player-blue",
  green: "player-green",
  gold: "player-gold",
  purple: "player-purple",
  teal: "player-teal"
};

const playerColorHex: Record<Player["color"], string> = {
  red: "#d94b45",
  blue: "#2f80ed",
  green: "#198754",
  gold: "#d69a2d",
  purple: "#7357c6",
  teal: "#0f6f78"
};

const governorateFlagByName: Record<string, string> = {
  القاهرة: "/governorates/cairo.png",
  الجيزة: "/governorates/giza.png",
  القليوبية: "/governorates/qalyubia.png",
  الإسكندرية: "/governorates/alexandria.png",
  البحيرة: "/governorates/beheira.png",
  مطروح: "/governorates/matruh.png",
  "كفر الشيخ": "/governorates/kafr-el-sheikh.png",
  الغربية: "/governorates/gharbia.png",
  المنوفية: "/governorates/menoufia.png",
  الدقهلية: "/governorates/dakahlia.png",
  الشرقية: "/governorates/sharqia.png",
  دمياط: "/governorates/damietta.png",
  بورسعيد: "/governorates/port-said.png",
  الإسماعيلية: "/governorates/ismailia.png",
  السويس: "/governorates/suez.png",
  الفيوم: "/governorates/fayoum.png",
  "بني سويف": "/governorates/beni-suef.png",
  المنيا: "/governorates/minya.jpg",
  أسيوط: "/governorates/asyut.png",
  "الوادي الجديد": "/governorates/new-valley.png",
  سوهاج: "/governorates/sohag.png",
  قنا: "/governorates/qena.png",
  الأقصر: "/governorates/luxor.png",
  أسوان: "/governorates/aswan.png",
  "شمال سيناء": "/governorates/north-sinai.png",
  "جنوب سيناء": "/governorates/south-sinai.png",
  "البحر الأحمر": "/governorates/red-sea.png"
};

// نقطة دخول ديدوس: المكوّن الافتراضي المسجَّل في src/games/index.ts
export default function BankEl7azGame({ onFinish, onExit }: { onFinish?: (result: GameResult) => void; onExit?: () => void }) {
  const { profile } = useApp();
  return (
    <div className="bank-el7az-root" dir="rtl">
      <GameApp playerName={profile.name} onFinishGame={onFinish} onExitGame={onExit} />
    </div>
  );
}

export function App() {
  // انحراف موثّق: صفحة الإحصائيات عبر الهاش بدل مسار /stats (ديدوس تملك التوجيه)
  if (window.location.hash === "#bank-stats") {
    return <StatsPage />;
  }

  return <GameApp />;
}

function GameApp({
  playerName,
  onFinishGame,
  onExitGame
}: {
  playerName?: string;
  onFinishGame?: (result: GameResult) => void;
  onExitGame?: () => void;
} = {}) {
  const game = useGameSocket({ name: playerName });
  const { fromQuickMatch, leaveRoom: leaveDedosMatch } = useOnline();
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const state = game.state;
  const selectedTile = selectedTileId === null ? null : BOARD_TILES[selectedTileId] ?? null;
  useGameAudio(state, game.clockOffsetMs);
  const shouldBlockSafari = isAppleMobile() && !isStandaloneMode();
  const finishReportedRef = useRef(false);
  const startGameRef = useRef(game.startGame);
  const autoStartFiredRef = useRef(false);
  startGameRef.current = game.startGame;

  function exitGame() {
    game.leaveRoom();
    if (onExitGame) onExitGame();
    else leaveDedosMatch();
  }

  // انحراف موثّق: إبلاغ ديدوس بنتيجة المباراة بعد لحظة من إعلان الفائز (عملات/XP)
  useEffect(() => {
    if (!onFinishGame || !state || state.status !== "finished" || finishReportedRef.current) {
      return;
    }
    finishReportedRef.current = true;
    const timer = window.setTimeout(() => {
      const iWon = state.winnerId === game.playerId;
      const winner = state.players.find((player) => player.id === state.winnerId) ?? null;
      onFinishGame({
        gameId: "bank-el7az",
        outcome: iWon ? "win" : "loss",
        coinsEarned: iWon ? 30 : 10,
        xpEarned: iWon ? 40 : 10,
        summary: iWon ? "فزت بلعبة بنك الحظ! 🏦" : `${winner?.name ?? "خصمك"} كسب بنك الحظ`,
        detail: winner ? `الفائز: ${winner.name} برصيد ${money(winner.cash)}` : undefined
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [onFinishGame, state, game.playerId]);

  // المباراة السريعة: المضيف يبدأ تلقائيًا فور اكتمال اللاعبين — بدون شاشة دعوات
  useEffect(() => {
    if (!fromQuickMatch || !state || state.status !== "lobby") return;
    if (state.hostId !== game.playerId || state.players.length < 2) return;
    const timer = window.setTimeout(() => {
      if (autoStartFiredRef.current) return;
      autoStartFiredRef.current = true;
      void enterImmersiveMode();
      startGameRef.current();
    }, 600);
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    if (!state) autoStartFiredRef.current = false;
  }, [state]);

  function toggleSelectedTile(tileId: number) {
    setSelectedTileId((currentTileId) => (currentTileId === tileId ? null : tileId));
  }

  if (shouldBlockSafari) {
    return <IphoneInstallGate />;
  }

  if (!state) {
    // داخل ديدوس الدخول تلقائي من غرفة ديدوس — شاشة انتظار بنفس هوية التطبيق
    return (
      <main className="gaa-lobby">
        <div className="gaa-lobby-card">
          <div className="gaa-emoji">🏦</div>
          <h1 className="gaa-title">بنك الحظ</h1>
          <p className="gaa-sub">لعبة محافظات مصرية أونلاين</p>
          <div className="gaa-waiting">
            <span className="gaa-spinner" />
            {game.status === "connected" ? "جارٍ دخول الأوضة…" : "جارٍ الاتصال بالخادم…"}
          </div>
          <ConnectionLine status={game.status} error={game.error} compact />
        </div>
      </main>
    );
  }

  if (state.status === "lobby") {
    return (
      <LobbyScreen
        state={state}
        playerId={game.playerId}
        startGame={game.startGame}
        status={game.status}
        error={game.error}
        quickMatch={fromQuickMatch}
      />
    );
  }

  return (
    <>
      <GameScreen
        state={state}
        playerId={game.playerId}
        selectedTile={selectedTile}
        selectedTileId={selectedTileId}
        setSelectedTileId={toggleSelectedTile}
        status={game.status}
        error={game.error}
        clockOffsetMs={game.clockOffsetMs}
        latencyMs={game.latencyMs}
        rollDice={game.rollDice}
        buyProperty={game.buyProperty}
        passProperty={game.passProperty}
        buildProperty={game.buildProperty}
        sellProperty={game.sellProperty}
        payBail={game.payBail}
        leaveRoom={exitGame}
      />
      <LandscapeGate />
    </>
  );
}

function StatsPage() {
  const [snapshot, setSnapshot] = useState<StatsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadStats() {
      try {
        const response = await fetch(getStatsHttpUrl(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error("معرفتش أجيب الإحصائيات");
        }
        const data = (await response.json()) as StatsSnapshot;
        if (isMounted) {
          setSnapshot(data);
          setError(null);
          setIsLoading(false);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "فيه مشكلة في تحميل الإحصائيات");
          setIsLoading(false);
        }
      }
    }

    void loadStats();
    const interval = window.setInterval(() => {
      void loadStats();
    }, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (isLoading) {
    return (
      <main className="stats-shell">
        <section className="stats-hero">
          <span className="brand-mark">حظ</span>
          <h1>الإحصائيات بتتحمل</h1>
        </section>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="stats-shell">
        <section className="stats-hero">
          <span className="brand-mark">حظ</span>
          <h1>مش قادر أفتح الإحصائيات</h1>
          <p>{error ?? "جرب تعمل تحديث للصفحة."}</p>
        </section>
      </main>
    );
  }

  const stats = snapshot.persistent;
  const tiles = Object.values(stats.tiles).sort(
    (first, second) =>
      second.lands +
      second.purchases +
      second.rentPaid +
      second.builds -
      (first.lands + first.purchases + first.rentPaid + first.builds)
  );
  const players = Object.values(stats.players).sort(
    (first, second) =>
      second.gamesWon - first.gamesWon ||
      second.moneyEarned - first.moneyEarned ||
      second.rolls - first.rolls
  );
  const fateCards = Object.values(stats.fateCards).sort((first, second) => second.count - first.count);
  const taxEvents = Object.values(stats.taxEvents).sort((first, second) => second.totalAmount - first.totalAmount);
  const diceTotals = Object.entries(stats.diceTotals).sort(([first], [second]) => Number(first) - Number(second));
  const diceFaces = Object.entries(stats.diceFaces).sort(([first], [second]) => Number(first) - Number(second));

  return (
    <main className="stats-shell">
      <section className="stats-hero">
        <div>
          <span className="stats-kicker">لوحة متابعة مخفية</span>
          <h1>إحصائيات بنك الحظ</h1>
          <p>آخر تحديث: {formatDateTime(snapshot.generatedAt)}</p>
        </div>
        <div className="stats-storage">
          <span>{snapshot.storage.lastError ? "التخزين فيه مشكلة" : "التخزين شغال"}</span>
          {snapshot.storage.lastError && <strong>{snapshot.storage.lastError}</strong>}
        </div>
      </section>

      <section className="stats-grid">
        <StatsCard icon={<Activity size={20} />} label="أوض شغالة دلوقتي" value={snapshot.live.activeRooms} />
        <StatsCard icon={<Users size={20} />} label="لاعبين دخلوا" value={stats.totals.playersJoined} />
        <StatsCard icon={<BarChart3 size={20} />} label="رميات زهر" value={stats.totals.rolls} />
        <StatsCard icon={<Trophy size={20} />} label="ألعاب خلصت" value={stats.totals.gamesFinished} />
        <StatsCard icon={<WalletCards size={20} />} label="فلوس اتحركت" value={stats.money.playerTransfers + stats.money.paidBank} moneyValue />
        <StatsCard icon={<Building2 size={20} />} label="مباني اتبنت" value={stats.totals.buildingsBuilt} />
      </section>

      <section className="stats-sections">
        <StatsPanel title="الملخص العام">
          <StatsList
            items={[
              ["أوض اتعملت", stats.totals.roomsCreated],
              ["أوض انتهت من غير نشاط", stats.totals.roomsExpired],
              ["ألعاب بدأت", stats.totals.gamesStarted],
              ["ألعاب خلصت", stats.totals.gamesFinished],
              ["إعادات اتصال", stats.totals.reconnects],
              ["فصل اتصال", stats.totals.disconnects],
              ["خروج من الأوضة", stats.totals.leaves],
              ["إفلاس", stats.totals.bankruptcies]
            ]}
          />
        </StatsPanel>

        <StatsPanel title="حركة الفلوس">
          <StatsList
            items={[
              ["شراء محافظات", stats.money.spentBuying, "money"],
              ["بناء", stats.money.spentBuilding, "money"],
              ["إيجار مطلوب", stats.money.paidRentCharged, "money"],
              ["إيجار مدفوع فعلا", stats.money.paidRentActual, "money"],
              ["دفعات للبنك", stats.money.paidBank, "money"],
              ["ضرايب ورسوم", stats.money.paidTax, "money"],
              ["كفالات", stats.money.paidBail, "money"],
              ["بيع للبنك", stats.money.soldToBank, "money"],
              ["مكافآت البداية", stats.money.startBonuses, "money"],
              ["محافظات هدية", stats.money.giftedPropertyValue, "money"]
            ]}
          />
        </StatsPanel>

        <StatsPanel title="اللعب والحركة">
          <StatsList
            items={[
              ["وقوف على خانات", stats.totals.tilesLanded],
              ["مرور على البداية", stats.totals.startPasses],
              ["محافظات اتعرضت للشراء", stats.totals.propertiesOffered],
              ["محافظات اتشرت", stats.totals.propertiesBought],
              ["محافظات اتسابِت", stats.totals.propertiesPassed],
              ["محافظات هدية", stats.totals.propertiesGifted],
              ["بيع للبنك", stats.totals.propertiesSold],
              ["دخول القسم", stats.totals.sentToPenalty],
              ["أدوار اتفوتت", stats.totals.turnsSkipped]
            ]}
          />
        </StatsPanel>

        <StatsPanel title="أرقام قياسية">
          <RecordsPanel snapshot={snapshot} />
        </StatsPanel>
      </section>

      <section className="stats-wide-grid">
        <StatsPanel title="توزيع الزهر">
          <div className="dice-stats">
            <div>
              <h3>مجموع الرمية</h3>
              {diceTotals.map(([total, count]) => (
                <StatsBar key={total} label={formatNumber(Number(total))} value={count} max={stats.totals.rolls} />
              ))}
            </div>
            <div>
              <h3>وشوش الزهر</h3>
              {diceFaces.map(([face, count]) => (
                <StatsBar key={face} label={formatNumber(Number(face))} value={count} max={Math.max(stats.totals.rolls * 2, 1)} />
              ))}
              <p className="stats-note">الدوبل: {formatNumber(stats.totals.doubles)} مرة</p>
            </div>
          </div>
        </StatsPanel>

        <StatsPanel title="الأوض اللي شغالة">
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>الكود</th>
                  <th>الحالة</th>
                  <th>اللاعبين</th>
                  <th>متصلين</th>
                  <th>الدور</th>
                  <th>الأغنى</th>
                  <th>الممتلكات</th>
                  <th>العمر</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.live.rooms.length === 0 ? (
                  <tr>
                    <td colSpan={8}>مفيش أوض شغالة دلوقتي.</td>
                  </tr>
                ) : (
                  snapshot.live.rooms.map((room) => (
                    <tr key={room.roomCode}>
                      <td>{room.roomCode}</td>
                      <td>{statusLabel(room.status)}</td>
                      <td>{formatNumber(room.playerCount)}</td>
                      <td>{formatNumber(room.connectedPlayers)}</td>
                      <td>{room.currentPlayerName ?? "مفيش"}</td>
                      <td>{room.leaderName ? `${room.leaderName} (${money(room.leaderCash)})` : "مفيش"}</td>
                      <td>{formatNumber(room.propertiesOwned)} / {formatNumber(room.buildings)} مباني</td>
                      <td>{formatDuration(room.ageMs)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </StatsPanel>
      </section>

      <StatsPanel title="إحصائيات المحافظات والخانات">
        <StatsTileTable tiles={tiles} />
      </StatsPanel>

      <section className="stats-wide-grid">
        <StatsPanel title="ترتيب اللاعبين">
          <StatsPlayerTable players={players} />
        </StatsPanel>

        <StatsPanel title="كروت الحظ والرسوم">
          <div className="stats-table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>العدد</th>
                  <th>دخل</th>
                  <th>دفع</th>
                  <th>هدايا</th>
                </tr>
              </thead>
              <tbody>
                {fateCards.length === 0 ? (
                  <tr>
                    <td colSpan={5}>لسه مفيش كروت حظ اتسحبت.</td>
                  </tr>
                ) : (
                  fateCards.map((card) => (
                    <tr key={card.title}>
                      <td>{card.title}</td>
                      <td>{formatNumber(card.count)}</td>
                      <td>{money(card.moneyIn)}</td>
                      <td>{money(card.moneyOut)}</td>
                      <td>{formatNumber(card.giftedProperties + card.sentToPenalty + card.skipTurns)}</td>
                    </tr>
                  ))
                )}
                {taxEvents.map((event) => (
                  <tr key={event.title}>
                    <td>{event.title}</td>
                    <td>{formatNumber(event.count)}</td>
                    <td>مفيش</td>
                    <td>{money(event.totalAmount)}</td>
                    <td>أعلى رقم {money(event.highestAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StatsPanel>
      </section>

      <StatsPanel title="آخر الألعاب اللي خلصت">
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>الأوضة</th>
                <th>الفايز</th>
                <th>لاعبين</th>
                <th>المدة</th>
                <th>رميات</th>
                <th>شراء</th>
                <th>إيجار</th>
                <th>خلصت</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentGames.length === 0 ? (
                <tr>
                  <td colSpan={8}>لسه مفيش ألعاب خلصت.</td>
                </tr>
              ) : (
                stats.recentGames.map((game) => (
                  <tr key={`${game.roomCode}-${game.finishedAt}`}>
                    <td>{game.roomCode}</td>
                    <td>{game.winnerName}</td>
                    <td>{formatNumber(game.playerCount)}</td>
                    <td>{formatDuration(game.durationMs)}</td>
                    <td>{formatNumber(game.rolls)}</td>
                    <td>{formatNumber(game.propertiesBought)}</td>
                    <td>{money(game.rentPaid)}</td>
                    <td>{formatDateTime(game.finishedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </StatsPanel>
    </main>
  );
}

function StatsCard({
  icon,
  label,
  value,
  moneyValue = false
}: {
  icon: ReactNode;
  label: string;
  value: number;
  moneyValue?: boolean;
}) {
  return (
    <article className="stats-card">
      <span>{icon}</span>
      <div>
        <strong>{moneyValue ? money(value) : formatNumber(value)}</strong>
        <p>{label}</p>
      </div>
    </article>
  );
}

function StatsPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="stats-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function StatsList({ items }: { items: Array<[string, number, "money"?]> }) {
  return (
    <dl className="stats-list">
      {items.map(([label, value, type]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{type === "money" ? money(value) : formatNumber(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatsBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <div className="stats-bar-row">
      <span>{label}</span>
      <div className="stats-bar-track">
        <b style={{ width: `${width}%` }} />
      </div>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

function RecordsPanel({ snapshot }: { snapshot: StatsSnapshot }) {
  const records = snapshot.persistent.records;
  return (
    <StatsList
      items={[
        ["أكبر إيجار", records.biggestRent?.amount ?? 0, "money"],
        ["أكبر شراء", records.biggestPurchase?.amount ?? 0, "money"],
        ["أكبر بناء", records.biggestBuild?.amount ?? 0, "money"],
        ["أكبر دفعة للبنك", records.biggestBankPayment?.amount ?? 0, "money"],
        ["أغنى فايز", records.richestWinner?.amount ?? 0, "money"]
      ]}
    />
  );
}

function StatsTileTable({ tiles }: { tiles: TileStats[] }) {
  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            <th>الخانة</th>
            <th>النوع</th>
            <th>وقوف</th>
            <th>اتعرضت</th>
            <th>شراء</th>
            <th>إيجار</th>
            <th>بناء</th>
            <th>بيع</th>
            <th>رسوم</th>
          </tr>
        </thead>
        <tbody>
          {tiles.map((tile) => (
            <tr key={tile.tileId}>
              <td>{tile.name}</td>
              <td>{tileKindLabel(tile.kind)}</td>
              <td>{formatNumber(tile.lands)}</td>
              <td>{formatNumber(tile.offers)}</td>
              <td>{formatNumber(tile.purchases)} / {money(tile.purchaseValue)}</td>
              <td>{formatNumber(tile.rentPayments)} / {money(tile.rentPaid)}</td>
              <td>{formatNumber(tile.builds)} / {money(tile.buildSpend)}</td>
              <td>{formatNumber(tile.sells)} / {money(tile.sellValue)}</td>
              <td>{formatNumber(tile.taxPayments)} / {money(tile.taxPaid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsPlayerTable({ players }: { players: PlayerStats[] }) {
  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            <th>اللاعب</th>
            <th>فوز</th>
            <th>ألعاب</th>
            <th>رميات</th>
            <th>شراء</th>
            <th>بناء</th>
            <th>إيجار دفعه</th>
            <th>إيجار قبضه</th>
            <th>آخر ظهور</th>
          </tr>
        </thead>
        <tbody>
          {players.length === 0 ? (
            <tr>
              <td colSpan={9}>لسه مفيش لاعيبة.</td>
            </tr>
          ) : (
            players.map((player) => (
              <tr key={player.name}>
                <td>{player.name}</td>
                <td>{formatNumber(player.gamesWon)}</td>
                <td>{formatNumber(player.gamesStarted)} / {formatNumber(player.gamesFinished)}</td>
                <td>{formatNumber(player.rolls)}</td>
                <td>{formatNumber(player.propertiesBought)}</td>
                <td>{formatNumber(player.buildingsBuilt)}</td>
                <td>{money(player.rentPaid)}</td>
                <td>{money(player.rentReceived)}</td>
                <td>{formatDateTime(player.lastSeenAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** شاشة انتظار بنك الحظ: تعرض المشاركين فقط؛ معرّف جلسة الشبكة يظل داخليًا. */
function LobbyScreen({
  state,
  playerId,
  startGame,
  status,
  error,
  quickMatch
}: {
  state: GameState;
  playerId: string | null;
  startGame: () => void;
  status: string;
  error: string | null;
  quickMatch: boolean;
}) {
  const isHost = playerId === state.hostId;
  const canStart = isHost && state.players.length >= 2;

  function startImmersiveGame() {
    void enterImmersiveMode();
    startGame();
  }

  return (
    <main className="gaa-lobby">
      <div className="gaa-lobby-card">
        <div className="gaa-emoji">🏦</div>
        <h1 className="gaa-title">بنك الحظ</h1>
        <p className="gaa-sub">
          {quickMatch ? "مباراة سريعة ⚡" : "تحدي أصحاب — حتى ٦ لاعبين"}
        </p>

        <div className="gaa-players-count">اللاعبون ({state.players.length} / 6)</div>
        <div className="gaa-players">
          {state.players.map((player) => (
            <div className="gaa-player" key={player.id}>
              <span
                className="gaa-player-avatar"
                style={{ background: playerColorHex[player.color] }}
              >
                {player.name.trim().charAt(0) || "؟"}
              </span>
              <div className="gaa-player-info">
                <strong>
                  {player.name} {player.id === playerId && <em>(أنت)</em>}
                </strong>
                <span>
                  {player.id === state.hostId ? "👑 المضيف" : player.connected ? "انضم! ✓" : "فاصل…"}
                </span>
              </div>
            </div>
          ))}
          {state.players.length < 2 && (
            <div className="gaa-player gaa-player-empty">
              <span className="gaa-player-avatar gaa-avatar-waiting">⏳</span>
              <div className="gaa-player-info">
                <strong>بانتظار لاعبين…</strong>
              </div>
            </div>
          )}
        </div>

        {quickMatch ? (
          <div className="gaa-waiting gaa-quick">
            <span className="gaa-spinner" />
            وجدنا لك خصمًا! جارٍ بدء المباراة…
          </div>
        ) : isHost ? (
          <button className="gaa-start" disabled={!canStart} onClick={startImmersiveGame}>
            <Play size={19} />
            {canStart ? `ابدأ اللعب (${state.players.length} لاعبين)` : "تحتاج لاعبَين على الأقل…"}
          </button>
        ) : (
          <div className="gaa-waiting">
            <span className="gaa-spinner" />
            بانتظار المضيف لبدء اللعبة…
          </div>
        )}

        <ConnectionLine status={status} error={error} compact />
      </div>
    </main>
  );
}

function GameScreen({
  state,
  playerId,
  selectedTile,
  selectedTileId,
  setSelectedTileId,
  status,
  error,
  clockOffsetMs,
  latencyMs,
  rollDice,
  buyProperty,
  passProperty,
  buildProperty,
  sellProperty,
  payBail,
  leaveRoom
}: {
  state: GameState;
  playerId: string | null;
  selectedTile: BoardTile | null;
  selectedTileId: number | null;
  setSelectedTileId: (tileId: number) => void;
  status: string;
  error: string | null;
  clockOffsetMs: number;
  latencyMs: number;
  rollDice: () => void;
  buyProperty: () => void;
  passProperty: () => void;
  buildProperty: (tileId: number) => void;
  sellProperty: (tileId: number) => void;
  payBail: () => void;
  leaveRoom: () => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const currentPlayer = state.players.find((player) => player.id === state.currentPlayerId) ?? null;
  const me = state.players.find((player) => player.id === playerId) ?? null;
  const isMyTurn = Boolean(playerId && state.currentPlayerId === playerId);
  const winner = state.players.find((player) => player.id === state.winnerId) ?? null;
  const latestEntry = state.log[0] ?? null;
  const boardEntry = state.log.find((entry) => !entry.message.startsWith("الدور على ")) ?? latestEntry;
  const serverNow = useServerNow(clockOffsetMs, state.actionAvailableAt);
  const isActionLocked = state.status === "playing" && serverNow < state.actionAvailableAt;

  return (
    <main className="app-shell game-shell board-first-shell">
      <GameBoard
        state={state}
        selectedTileId={selectedTileId}
        latestEntry={boardEntry}
        clockOffsetMs={clockOffsetMs}
        onSelectTile={setSelectedTileId}
      />

      <button className="game-menu-button" onClick={() => setIsMenuOpen(true)} aria-label="افتح القائمة">
        <Menu size={22} />
      </button>

      {isMenuOpen && (
        <button className="game-menu-backdrop" onClick={() => setIsMenuOpen(false)} aria-label="اقفل القائمة" />
      )}

      {selectedTile && (
        <div className="board-info-dock">
          <TilePanel
            state={state}
            tile={selectedTile}
            playerId={playerId}
            isActionLocked={isActionLocked}
            buildProperty={buildProperty}
            sellProperty={sellProperty}
          />
        </div>
      )}

      <div className="board-action-dock">
        <ActionBar
          state={state}
          me={me}
          isMyTurn={isMyTurn}
          status={status}
          error={error}
          isActionLocked={isActionLocked}
          rollDice={rollDice}
          buyProperty={buyProperty}
          passProperty={passProperty}
          payBail={payBail}
        />
      </div>

      <aside className={`game-menu-panel ${isMenuOpen ? "open" : ""}`} aria-hidden={!isMenuOpen}>
        <div className="menu-head">
          <div>
            <strong>بنك الحظ</strong>
            <span>مباراة أونلاين</span>
          </div>
          <button className="icon-button" onClick={() => setIsMenuOpen(false)} aria-label="اقفل القائمة">
            <X size={20} />
          </button>
        </div>

        <div className="turn-pill">
          {state.status === "finished" ? (
            <>
              <Check size={16} />
              {winner?.name ?? "الفايز"}
            </>
          ) : (
            <>
              <Hourglass size={16} />
              {currentPlayer ? `الدور على ${currentPlayer.name}` : "الدور"}
            </>
          )}
        </div>

        <div className="sync-pill">
          <PlugZap size={16} />
          تأخير الشبكة {formatNumber(latencyMs)} مللي
        </div>

        <button className="leave-room-button" onClick={leaveRoom}>
          <LogOut size={18} />
          خروج من المباراة
        </button>

        <PlayerPanel state={state} playerId={playerId} />
        <LogPanel state={state} />
      </aside>
    </main>
  );
}

function GameBoard({
  state,
  selectedTileId,
  latestEntry,
  clockOffsetMs,
  onSelectTile
}: {
  state: GameState;
  selectedTileId: number | null;
  latestEntry: GameLogEntry | null;
  clockOffsetMs: number;
  onSelectTile: (tileId: number) => void;
}) {
  const latestMessage = latestEntry?.message ?? "";
  const isRentAlert = latestMessage.includes("هاتو الفلوس اللي عليكوو");
  const diceDelayMs = getPlaybackDelayMs(state.updatedAt, clockOffsetMs);
  const messageDelayMs = getMessageDelayMs(state, clockOffsetMs);
  const displayedPositions = useAnimatedPlayerPositions(state.players, state.updatedAt, clockOffsetMs);
  const turnPlayer = state.players.find((player) => player.id === state.currentPlayerId) ?? null;

  return (
    <div className="board" aria-label="لوحة بنك الحظ">
      {BOARD_TILES.map((tile) => {
        const owner = state.players.find((player) => player.properties.includes(tile.id));
        const playersHere = state.players.filter(
          (player) => !player.bankrupt && (displayedPositions[player.id] ?? player.position) === tile.id
        );
        const flagSrc = governorateFlagByName[tile.name];
        const groupComplete = Boolean(isPropertyTile(tile) && owner && ownsFullPropertyGroup(tile, owner));
        const tileStyle = {
          ...tilePosition(tile.id),
          "--group-color": tile.kind === "property" ? tile.color : undefined,
          "--owner-color": owner ? playerColorHex[owner.color] : undefined
        } as CSSProperties;

        return (
          <button
            key={tile.id}
            className={`board-tile tile-${tile.kind} ${owner ? "owned" : ""} ${groupComplete ? "group-complete" : ""} ${
              selectedTileId === tile.id ? "selected" : ""
            }`}
            style={tileStyle}
            onClick={() => onSelectTile(tile.id)}
          >
            {tile.kind === "property" && <span className="property-band" />}
            <span className="tile-name">{tile.shortName}</span>
            {flagSrc ? (
              <img className="tile-flag" src={flagSrc} alt="" draggable={false} decoding="async" />
            ) : (
              <span className="tile-symbol">{tileIcon(tile)}</span>
            )}
            {isOwnableTile(tile) && <span className="tile-price">{money(tile.price)}</span>}
            {owner && <span className={`owner-dot ${colorClass[owner.color]}`} />}
            {groupComplete && (
              <span className="group-complete-mark" title="المجموعة كاملة والبناء متاح">
                <Check size={12} />
              </span>
            )}
            {isPropertyTile(tile) && (state.buildingsByTile[tile.id] ?? 0) > 0 && (
              <span className="building-stack" aria-label={`${formatNumber(state.buildingsByTile[tile.id] ?? 0)} مباني`}>
                {Array.from({ length: state.buildingsByTile[tile.id] ?? 0 }, (_, index) => (
                  <span key={index} />
                ))}
              </span>
            )}
            <span className="token-stack">
              {playersHere.map((player) => (
                <span
                  key={player.id}
                  className={`token mini car-token ${colorClass[player.color]} ${
                    (displayedPositions[player.id] ?? player.position) !== player.position ? "moving" : ""
                  }`}
                  title={player.name}
                >
                  <CarFront size={16} />
                </span>
              ))}
            </span>
          </button>
        );
      })}

      <div className="board-center">
        <div className="board-center-heading">
          <span>🏦 بنك الحظ</span>
          <small>{state.status === "finished" ? "الماتش خلص" : turnPlayer ? `الدور على ${turnPlayer.name}` : "لفّ مصر واكسب"}</small>
        </div>
        <div className="board-event-stage" aria-live="polite">
          {state.lastRoll && (
            <DiceShowcase
              roll={state.lastRoll}
              latestEntryId={latestEntry?.id ?? "بداية"}
              animationDelayMs={diceDelayMs}
            />
          )}
          {latestEntry && (
            <div
              key={latestEntry.id}
              className={`board-toast ${isRentAlert ? "money-toast" : ""}`}
              style={{ animationDelay: `${messageDelayMs}ms` }}
            >
              <strong>{latestEntry.message}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface MovementPlan {
  startPosition: number;
  targetPosition: number;
  startAt: number;
  steps: number;
}

function useAnimatedPlayerPositions(
  players: Player[],
  stateUpdatedAt: number,
  clockOffsetMs: number
): Record<string, number> {
  const [positions, setPositions] = useState<Record<string, number>>({});
  const plansRef = useRef<Record<string, MovementPlan>>({});
  const clockOffsetRef = useRef(clockOffsetMs);
  const playerIds = players.map((player) => player.id).join("|");
  const targetPositions = players.map((player) => `${player.id}:${player.position}`).join("|");

  useEffect(() => {
    clockOffsetRef.current = clockOffsetMs;
  }, [clockOffsetMs]);

  useEffect(() => {
    setPositions((currentPositions) => {
      const nextPositions: Record<string, number> = {};
      for (const player of players) {
        nextPositions[player.id] = currentPositions[player.id] ?? player.position;
      }
      return nextPositions;
    });
  }, [playerIds, players]);

  useEffect(() => {
    setPositions((currentPositions) => {
      const serverNow = Date.now() + clockOffsetRef.current;
      const activePlayerIds = new Set(players.map((player) => player.id));
      const nextPositions = { ...currentPositions };
      const nextPlans: Record<string, MovementPlan> = {};
      let changed = false;

      for (const [playerId, plan] of Object.entries(plansRef.current)) {
        if (activePlayerIds.has(playerId)) {
          nextPlans[playerId] = plan;
        }
      }

      for (const player of players) {
        const existingPlan = nextPlans[player.id];
        const displayedPosition = existingPlan
          ? resolveMovementPlanPosition(existingPlan, serverNow)
          : nextPositions[player.id] ?? player.position;

        if (displayedPosition === player.position) {
          nextPositions[player.id] = player.position;
          delete nextPlans[player.id];
          continue;
        }

        nextPositions[player.id] = displayedPosition;
        nextPlans[player.id] = {
          startPosition: displayedPosition,
          targetPosition: player.position,
          startAt: stateUpdatedAt + SYNC_PLAYBACK_DELAY_MS + CAR_MOVEMENT_OFFSET_MS,
          steps: clockwiseDistance(displayedPosition, player.position)
        };
        changed = true;
      }

      plansRef.current = nextPlans;
      return changed ? nextPositions : currentPositions;
    });
  }, [targetPositions, stateUpdatedAt, players]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const serverNow = Date.now() + clockOffsetRef.current;
      setPositions((currentPositions) => {
        const nextPositions = { ...currentPositions };
        const nextPlans = { ...plansRef.current };
        let changed = false;

        for (const [playerId, plan] of Object.entries(nextPlans)) {
          const nextPosition = resolveMovementPlanPosition(plan, serverNow);
          if (nextPositions[playerId] !== nextPosition) {
            nextPositions[playerId] = nextPosition;
            changed = true;
          }
          if (nextPosition === plan.targetPosition) {
            delete nextPlans[playerId];
          }
        }

        plansRef.current = nextPlans;
        return changed ? nextPositions : currentPositions;
      });
    }, 50);

    return () => window.clearInterval(timer);
  }, []);

  return positions;
}

function getPlaybackDelayMs(updatedAt: number, clockOffsetMs: number): number {
  return Math.round(updatedAt + SYNC_PLAYBACK_DELAY_MS - (Date.now() + clockOffsetMs));
}

function getMessageDelayMs(state: GameState, clockOffsetMs: number): number {
  return Math.max(0, Math.round(state.actionAvailableAt - (Date.now() + clockOffsetMs)));
}

function useServerNow(clockOffsetMs: number, actionAvailableAt: number): number {
  const [clientNow, setClientNow] = useState(() => Date.now());

  useEffect(() => {
    const serverNow = Date.now() + clockOffsetMs;
    if (serverNow >= actionAvailableAt) {
      setClientNow(Date.now());
      return;
    }

    let interval: number | null = null;
    let timeout: number | null = null;
    const stop = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
      if (timeout !== null) {
        window.clearTimeout(timeout);
        timeout = null;
      }
    };
    const tick = () => {
      setClientNow(Date.now());
      if (Date.now() + clockOffsetMs >= actionAvailableAt) {
        stop();
      }
    };
    interval = window.setInterval(tick, 50);
    timeout = window.setTimeout(tick, Math.max(actionAvailableAt - serverNow + 20, 20));
    return () => {
      stop();
    };
  }, [clockOffsetMs, actionAvailableAt]);

  return clientNow + clockOffsetMs;
}

function useGameAudio(state: GameState | null, clockOffsetMs: number): void {
  const contextRef = useRef<AudioContext | null>(null);
  const isUnlockedRef = useRef(false);
  const diceAudioRef = useRef<HTMLAudioElement | null>(null);
  const hasPrimedDiceAudioRef = useRef(false);
  const seenLogIdsRef = useRef<Set<string>>(new Set());
  const previousStateRef = useRef<GameState | null>(null);
  const lastRollLogIdRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    function unlockAudio() {
      const context = getAudioContext(contextRef);
      if (!context) {
        return;
      }
      void context.resume().then(() => {
        isUnlockedRef.current = context.state === "running";
      });
      if (hasPrimedDiceAudioRef.current) {
        return;
      }
      hasPrimedDiceAudioRef.current = true;
      const diceAudio = getDiceAudio(diceAudioRef);
      diceAudio.load();
      diceAudio.muted = true;
      void diceAudio
        .play()
        .then(() => {
          diceAudio.pause();
          diceAudio.currentTime = 0;
          diceAudio.muted = false;
        })
        .catch(() => {
          hasPrimedDiceAudioRef.current = false;
          diceAudio.muted = false;
        });
    }

    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }
      timersRef.current = [];
      if (diceAudioRef.current) {
        diceAudioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (!state) {
      previousStateRef.current = null;
      seenLogIdsRef.current = new Set();
      lastRollLogIdRef.current = null;
      return;
    }

    const previousState = previousStateRef.current;
    if (!previousState) {
      seenLogIdsRef.current = new Set(state.log.map((entry) => entry.id));
      previousStateRef.current = state;
      lastRollLogIdRef.current = newestRollLogId(state);
      return;
    }

    const rollLogId = newestRollLogId(state);
    if (rollLogId && rollLogId !== lastRollLogIdRef.current) {
      scheduleGameSound(timersRef, clockOffsetMs, state.updatedAt + SYNC_PLAYBACK_DELAY_MS, () => {
        playDiceSound(diceAudioRef, contextRef, isUnlockedRef);
      });

      const movement = findMovedPlayer(previousState, state);
      if (movement) {
        const steps = clockwiseDistance(movement.from, movement.to);
        if (steps > 0) {
          const durationMs = Math.min(steps * CAR_STEP_MS + 200, 1800);
          scheduleGameSound(
            timersRef,
            clockOffsetMs,
            state.updatedAt + SYNC_PLAYBACK_DELAY_MS + CAR_MOVEMENT_OFFSET_MS,
            () => {
              playCarSound(contextRef, isUnlockedRef, durationMs);
            }
          );
        }
      }
    }
    lastRollLogIdRef.current = rollLogId;

    const newEntries = state.log.filter((entry) => !seenLogIdsRef.current.has(entry.id)).reverse();
    for (const entry of newEntries) {
      seenLogIdsRef.current.add(entry.id);
      if (entry.message.includes("اشترى")) {
        playPurchaseSound(contextRef, isUnlockedRef);
      } else if (entry.message.includes("باع")) {
        playSellSound(contextRef, isUnlockedRef);
      } else if (entry.message.includes("بنى")) {
        playBuildSound(contextRef, isUnlockedRef);
      } else if (entry.message.includes("هاتو الفلوس")) {
        scheduleGameSound(timersRef, clockOffsetMs, state.actionAvailableAt, () => {
          playRentSound(contextRef, isUnlockedRef);
        });
      }
    }

    previousStateRef.current = state;
  }, [state, clockOffsetMs]);
}

function getAudioContext(contextRef: MutableRefObject<AudioContext | null>): AudioContext | null {
  if (contextRef.current) {
    return contextRef.current;
  }

  const AudioContextConstructor =
    window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  contextRef.current = new AudioContextConstructor();
  return contextRef.current;
}

function scheduleGameSound(
  timersRef: MutableRefObject<number[]>,
  clockOffsetMs: number,
  serverTimeMs: number,
  callback: () => void
): void {
  const delayMs = Math.max(serverTimeMs - (Date.now() + clockOffsetMs), 0);
  const timer = window.setTimeout(() => {
    timersRef.current = timersRef.current.filter((candidate) => candidate !== timer);
    callback();
  }, delayMs);
  timersRef.current.push(timer);
}

function newestRollLogId(state: GameState): string | null {
  return state.log.find((entry) => entry.message.includes("رمى "))?.id ?? null;
}

function findMovedPlayer(previousState: GameState, state: GameState): { from: number; to: number } | null {
  for (const player of state.players) {
    const previousPlayer = previousState.players.find((candidate) => candidate.id === player.id);
    if (previousPlayer && previousPlayer.position !== player.position) {
      return { from: previousPlayer.position, to: player.position };
    }
  }
  return null;
}

function playDiceSound(
  diceAudioRef: MutableRefObject<HTMLAudioElement | null>,
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>
): void {
  const diceAudio = getDiceAudio(diceAudioRef);
  diceAudio.pause();
  diceAudio.currentTime = 0;
  diceAudio.muted = false;
  diceAudio.volume = 0.78;
  void diceAudio.play().catch(() => {
    playFallbackDiceSound(contextRef, isUnlockedRef);
  });
}

function getDiceAudio(diceAudioRef: MutableRefObject<HTMLAudioElement | null>): HTMLAudioElement {
  if (!diceAudioRef.current) {
    const diceAudio = new Audio(DICE_SOUND_URL);
    diceAudio.preload = "auto";
    diceAudio.volume = 0.78;
    diceAudioRef.current = diceAudio;
  }
  return diceAudioRef.current;
}

function playFallbackDiceSound(
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>
): void {
  const context = playableAudioContext(contextRef, isUnlockedRef);
  if (!context) {
    return;
  }
  const start = context.currentTime;
  for (let index = 0; index < 6; index += 1) {
    playTone(context, 420 + index * 85, start + index * 0.055, 0.045, "square", 0.028);
    playTone(context, 920 - index * 58, start + index * 0.055 + 0.018, 0.03, "triangle", 0.02);
  }
}

function playCarSound(
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>,
  durationMs: number
): void {
  const context = playableAudioContext(contextRef, isUnlockedRef);
  if (!context) {
    return;
  }
  const start = context.currentTime;
  const durationSeconds = Math.max(durationMs / 1000, 0.28);
  playTone(context, 92, start, durationSeconds, "sawtooth", 0.018, 128);
  for (let time = 0.08; time < durationSeconds; time += 0.19) {
    playTone(context, 170, start + time, 0.035, "triangle", 0.012);
  }
}

function playPurchaseSound(
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>
): void {
  const context = playableAudioContext(contextRef, isUnlockedRef);
  if (!context) {
    return;
  }
  const start = context.currentTime;
  playTone(context, 660, start, 0.08, "triangle", 0.035);
  playTone(context, 880, start + 0.07, 0.08, "triangle", 0.032);
  playTone(context, 1180, start + 0.14, 0.12, "sine", 0.026);
}

function playSellSound(
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>
): void {
  const context = playableAudioContext(contextRef, isUnlockedRef);
  if (!context) {
    return;
  }
  const start = context.currentTime;
  playTone(context, 620, start, 0.08, "triangle", 0.03);
  playTone(context, 430, start + 0.08, 0.13, "sine", 0.026);
}

function playBuildSound(
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>
): void {
  const context = playableAudioContext(contextRef, isUnlockedRef);
  if (!context) {
    return;
  }
  const start = context.currentTime;
  playTone(context, 150, start, 0.045, "square", 0.036);
  playTone(context, 120, start + 0.1, 0.05, "square", 0.034);
  playTone(context, 740, start + 0.18, 0.11, "triangle", 0.022);
}

function playRentSound(
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>
): void {
  const context = playableAudioContext(contextRef, isUnlockedRef);
  if (!context) {
    return;
  }
  const start = context.currentTime;
  playTone(context, 220, start, 0.12, "sawtooth", 0.026, 160);
  playTone(context, 760, start + 0.1, 0.08, "triangle", 0.026);
  playTone(context, 980, start + 0.17, 0.08, "triangle", 0.022);
}

function playableAudioContext(
  contextRef: MutableRefObject<AudioContext | null>,
  isUnlockedRef: MutableRefObject<boolean>
): AudioContext | null {
  const context = contextRef.current;
  if (!context || !isUnlockedRef.current || context.state !== "running") {
    return null;
  }
  return context;
}

function playTone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  endFrequency = frequency
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.linearRampToValueAtTime(endFrequency, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function clockwiseDistance(startPosition: number, targetPosition: number): number {
  return (targetPosition - startPosition + BOARD_TILES.length) % BOARD_TILES.length;
}

function resolveMovementPlanPosition(plan: MovementPlan, serverNow: number): number {
  if (plan.steps === 0) {
    return plan.targetPosition;
  }

  const elapsedMs = serverNow - plan.startAt;
  if (elapsedMs <= 0) {
    return plan.startPosition;
  }

  const completedSteps = Math.min(plan.steps, Math.floor(elapsedMs / CAR_STEP_MS));
  return (plan.startPosition + completedSteps) % BOARD_TILES.length;
}

function tileIcon(tile: BoardTile) {
  if (tile.kind === "fate") {
    return <Sparkles size={24} />;
  }
  if (tile.kind === "tax" && tile.name === "مخالفة") {
    return <TrafficCone size={24} />;
  }
  if (tile.kind === "tax") {
    return <ReceiptText size={24} />;
  }
  if (tile.kind === "freeRest") {
    return <Coffee size={24} />;
  }
  if (tile.kind === "goToPenalty") {
    return <Search size={24} />;
  }
  if (tile.kind === "penalty") {
    return <ShieldAlert size={24} />;
  }
  if (tile.kind === "start") {
    return <Landmark size={24} />;
  }
  return <CircleDollarSign size={24} />;
}

function DiceShowcase({
  roll,
  latestEntryId,
  animationDelayMs
}: {
  roll: NonNullable<GameState["lastRoll"]>;
  latestEntryId: string;
  animationDelayMs: number;
}) {
  return (
    <div
      key={`${latestEntryId}-${roll.dieA}-${roll.dieB}`}
      className="dice-showcase"
      style={{ animationDelay: `${animationDelayMs}ms` }}
      aria-label="الزهر"
    >
      <span className="die-face">{formatNumber(roll.dieA)}</span>
      <span className="die-face second">{formatNumber(roll.dieB)}</span>
    </div>
  );
}

function PlayerPanel({ state, playerId }: { state: GameState; playerId: string | null }) {
  return (
    <section className="panel">
      <h2>
        <Users size={17} />
        اللاعيبة
      </h2>
      <div className="player-list tight">
        {state.players.map((player) => (
          <article
            className={`player-row ${player.id === state.currentPlayerId ? "active" : ""}`}
            key={player.id}
          >
            <span className={`token ${colorClass[player.color]}`} />
            <div>
              <strong>
                {player.name}
                {player.id === playerId ? " (إنت)" : ""}
              </strong>
              <span>
                {money(player.cash)} · {formatNumber(player.properties.length)} محافظات
                {player.bankrupt ? " · مفلس" : player.inPenalty ? " · في القسم" : ""}
                {player.skipTurns > 0 ? ` · هيفوت ${formatNumber(player.skipTurns)} دور` : ""}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TilePanel({
  state,
  tile,
  playerId,
  isActionLocked,
  buildProperty,
  sellProperty
}: {
  state: GameState;
  tile: BoardTile;
  playerId: string | null;
  isActionLocked: boolean;
  buildProperty: (tileId: number) => void;
  sellProperty: (tileId: number) => void;
}) {
  const owner = state.players.find((player) => player.properties.includes(tile.id));
  const me = state.players.find((player) => player.id === playerId) ?? null;
  const flagSrc = governorateFlagByName[tile.name];
  const buildingCount = state.buildingsByTile[tile.id] ?? 0;
  const currentRent = isOwnableTile(tile) && owner ? calculateRent(tile, owner, state.lastRoll?.total ?? 7, state.buildingsByTile) : null;
  const buildingCost = isPropertyTile(tile) ? getBuildingCost(tile) : null;
  const groupSize = isPropertyTile(tile)
    ? BOARD_TILES.filter((candidate) => isPropertyTile(candidate) && candidate.group === tile.group).length
    : 0;
  const groupOwnedCount = isPropertyTile(tile) && owner
    ? BOARD_TILES.filter(
        (candidate) => isPropertyTile(candidate) && candidate.group === tile.group && owner.properties.includes(candidate.id)
      ).length
    : 0;
  const groupComplete = Boolean(isPropertyTile(tile) && owner && ownsFullPropertyGroup(tile, owner));
  const saleValue = isOwnableTile(tile) ? getPropertySellValue(tile, state.buildingsByTile) : null;
  const isMine = Boolean(me && owner?.id === me.id);
  const canBuild = Boolean(isMine && isPropertyTile(tile) && owner && canAddBuilding(tile, owner, state.buildingsByTile));
  const canAffordBuilding = Boolean(buildingCost !== null && me && me.cash >= buildingCost);
  const buildDisabled = isActionLocked || !canBuild || !canAffordBuilding;
  const sellDisabled = isActionLocked || !isMine;

  return (
    <section className="panel tile-panel">
      <h2>
        <CircleDollarSign size={17} />
        {tile.shortName}
      </h2>
      {flagSrc && <img className="tile-panel-flag" src={flagSrc} alt={`علم ${tile.name}`} draggable={false} decoding="async" />}
      <p>{tile.description}</p>
      {isOwnableTile(tile) && (
        <dl>
          <div>
            <dt>المجموعة</dt>
            <dd>{GROUP_NAMES[tile.group]}</dd>
          </div>
          <div>
            <dt>السعر</dt>
            <dd>{money(tile.price)}</dd>
          </div>
          <div>
            <dt>الإيجار</dt>
            <dd>{money(currentRent ?? tile.rent)}</dd>
          </div>
          <div>
            <dt>المالك</dt>
            <dd>{owner?.name ?? "البنك"}</dd>
          </div>
          {isPropertyTile(tile) && (
            <>
              <div className={groupComplete ? "complete-group-detail" : undefined}>
                <dt>التجميعة</dt>
                <dd>
                  {groupComplete
                    ? "كاملة - البناء مفتوح"
                    : `${formatNumber(groupOwnedCount)} من ${formatNumber(groupSize)}`}
                </dd>
              </div>
              <div>
                <dt>المباني</dt>
                <dd>
                  {formatNumber(buildingCount)} / {formatNumber(MAX_BUILDINGS_PER_PROPERTY)}
                </dd>
              </div>
              <div>
                <dt>المبنى</dt>
                <dd>{money(buildingCost ?? 0)}</dd>
              </div>
            </>
          )}
          <div>
            <dt>بيع للبنك</dt>
            <dd>{money(saleValue ?? 0)}</dd>
          </div>
        </dl>
      )}
      {isMine && isOwnableTile(tile) && (
        <div className="tile-management">
          {isPropertyTile(tile) && (
            <button className="primary-action" disabled={buildDisabled} onClick={() => buildProperty(tile.id)}>
              <Building2 size={16} />
              ابني
            </button>
          )}
          <button disabled={sellDisabled} onClick={() => sellProperty(tile.id)}>
            <Banknote size={16} />
            بيع للبنك
          </button>
          {isPropertyTile(tile) && !canBuild && (
            <span>البناء محتاج المجموعة كاملة وفيه حد أقصى {formatNumber(MAX_BUILDINGS_PER_PROPERTY)} مباني.</span>
          )}
          {canBuild && !canAffordBuilding && <span>فلوسك مش مكفية للمبنى ده.</span>}
          {isActionLocked && <span>استنى العربية توصل الأول.</span>}
        </div>
      )}
      {tile.kind === "tax" && (
        <dl>
          <div>
            <dt>المبلغ</dt>
            <dd>{money(tile.amount)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function LogPanel({ state }: { state: GameState }) {
  return (
    <section className="panel log-panel">
      <h2>
        <Banknote size={17} />
        الحركة
      </h2>
      <ol>
        {state.log.slice(0, 8).map((entry) => (
          <li key={entry.id}>{entry.message}</li>
        ))}
      </ol>
    </section>
  );
}

function ActionBar({
  state,
  me,
  isMyTurn,
  status,
  error,
  isActionLocked,
  rollDice,
  buyProperty,
  passProperty,
  payBail
}: {
  state: GameState;
  me: Player | null;
  isMyTurn: boolean;
  status: string;
  error: string | null;
  isActionLocked: boolean;
  rollDice: () => void;
  buyProperty: () => void;
  passProperty: () => void;
  payBail: () => void;
}) {
  const pendingTile = state.pendingPurchase ? BOARD_TILES[state.pendingPurchase.tileId] : null;

  return (
    <footer className="action-bar">
      <div className="action-status">
        <ConnectionLine status={status} error={error} compact />
        {state.status === "finished" && <strong>اللعبة خلصت</strong>}
        {state.status !== "finished" && isActionLocked && <strong>استنى العربية توصل</strong>}
        {state.status !== "finished" && !isActionLocked && !isMyTurn && <strong>استنى دورك</strong>}
        {state.status !== "finished" && !isActionLocked && isMyTurn && state.turnPhase === "end" && <strong>الدور بيتسلم</strong>}
        {state.status !== "finished" && !isActionLocked && isMyTurn && state.turnPhase !== "end" && (
          <strong>{pendingTile ? `${pendingTile.name} بـ ${money(state.pendingPurchase?.price ?? 0)}` : "دورك يا بطل"}</strong>
        )}
        {me && <span className="wallet-line">معاك {money(me.cash)}</span>}
      </div>

      <div className="action-buttons">
        {isMyTurn && state.turnPhase === "roll" && me?.inPenalty && (
          <button onClick={payBail} disabled={isActionLocked}>
            <ShieldAlert size={18} />
            ادفع كفالة
          </button>
        )}
        {isMyTurn && state.turnPhase === "roll" && (
          <button className="primary-action" onClick={rollDice} disabled={isActionLocked}>
            <Dice5 size={18} />
            ارمي
          </button>
        )}
        {isMyTurn && state.turnPhase === "buy" && pendingTile && (
          <>
            <button className="primary-action" onClick={buyProperty} disabled={isActionLocked}>
              <ShoppingBag size={18} />
              اشتري
            </button>
            <button onClick={passProperty} disabled={isActionLocked}>
              <SkipForward size={18} />
              سيبها
            </button>
          </>
        )}
        {!isMyTurn && (
          <button disabled>
            <Hourglass size={18} />
            استنى
          </button>
        )}
      </div>
    </footer>
  );
}

function ConnectionLine({
  status,
  error,
  compact = false
}: {
  status: string;
  error: string | null;
  compact?: boolean;
}) {
  return (
    <div className={`connection-line ${compact ? "compact" : ""}`}>
      {status === "connected" ? <PlugZap size={16} /> : <RefreshCcw size={16} />}
      <span>{error ?? statusText(status)}</span>
    </div>
  );
}

function IphoneInstallGate() {
  return (
    <main className="iphone-install-gate">
      <section className="iphone-install-card" aria-label="طريقة تثبيت اللعبة على آيفون">
        <div className="install-hero">
          <span className="brand-mark">حظ</span>
          <div>
            <h1>ثبت اللعبة الأول</h1>
            <p>Install the game first</p>
          </div>
        </div>

        <div className="iphone-demo" aria-hidden="true">
          <div className="iphone-screen">
            <div className="mini-address">bank-el7az.adelsamir.com</div>
            <div className="mini-game-logo">بنك الحظ</div>
            <div className="mini-safari-bar">
              <span />
              <span className="share-target">
                <Share2 size={20} />
              </span>
              <span />
            </div>
            <div className="arrow-point share-arrow">↓</div>
          </div>
        </div>

        <ol className="install-steps">
          <li className="install-step step-one">
            <span className="step-icon">
              <Share2 size={20} />
            </span>
            <div>
              <strong>١. دوس زر المشاركة تحت في Safari</strong>
              <span>1. Tap the Share button at the bottom of Safari</span>
            </div>
            <b className="step-arrow">↙</b>
          </li>
          <li className="install-step step-two">
            <span className="step-icon">
              <SquarePlus size={20} />
            </span>
            <div>
              <strong>٢. اختار إضافة إلى الشاشة الرئيسية</strong>
              <span>2. Choose Add to Home Screen</span>
            </div>
            <b className="step-arrow">↓</b>
          </li>
          <li className="install-step step-three">
            <span className="step-icon">
              <House size={20} />
            </span>
            <div>
              <strong>٣. افتح بنك الحظ من الأيقونة والعب بالعرض</strong>
              <span>3. Open Bank El7az from the icon and play landscape</span>
            </div>
            <b className="step-arrow">→</b>
          </li>
        </ol>

        <div className="install-block-note">
          <strong>اللعب مقفول من Safari عشان الشاشة الكاملة والتزامن يبقوا مظبوطين.</strong>
          <span>Playing is blocked in Safari so fullscreen and sync work correctly.</span>
        </div>
      </section>
    </main>
  );
}

function LandscapeGate() {
  const showInstallHelp = isAppleMobile() && !isStandaloneMode();

  return (
    <div className="landscape-gate">
      <div className="landscape-card">
        <span className="brand-mark">حظ</span>
        <h2>لف الموبايل بالعرض</h2>
        <p>اللعبة معمولة شاشة كاملة بالعرض عشان اللوحة والأزرار يبقوا واضحين.</p>
        {showInstallHelp && (
          <p className="install-inline">عشان تخفي شريط سفاري خالص، ثبت اللعبة على الشاشة الرئيسية وافتحها من الأيقونة.</p>
        )}
        <button onClick={() => void enterImmersiveMode()}>
          <Maximize2 size={18} />
          افتح ملء الشاشة
        </button>
      </div>
    </div>
  );
}

function tilePosition(id: number): Record<string, number> {
  if (id <= 10) {
    return { gridRow: 10, gridColumn: 11 - id };
  }
  if (id <= 19) {
    return { gridRow: 20 - id, gridColumn: 1 };
  }
  if (id <= 29) {
    return { gridRow: 1, gridColumn: id - 18 };
  }
  return { gridRow: id - 28, gridColumn: 11 };
}

function money(amount: number): string {
  return `${formatNumber(amount)} جنيه`;
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatDateTime(timestamp: number): string {
  if (!timestamp) {
    return "مفيش";
  }
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(Math.round(durationMs / 60000), 0);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${formatNumber(minutes)} د`;
  }
  return `${formatNumber(hours)} س ${formatNumber(minutes)} د`;
}

function statusLabel(status: GameState["status"]): string {
  if (status === "lobby") {
    return "لوبي";
  }
  if (status === "playing") {
    return "بتتلعب";
  }
  return "خلصت";
}

function tileKindLabel(kind: TileStats["kind"]): string {
  switch (kind) {
    case "start":
      return "بداية";
    case "property":
      return "محافظة";
    case "transport":
      return "محافظة";
    case "utility":
      return "محافظة";
    case "tax":
      return "رسوم";
    case "fate":
      return "حظ";
    case "penalty":
      return "القسم";
    case "goToPenalty":
      return "تفتيش";
    case "freeRest":
      return "استراحة";
  }
}

function statusText(status: string): string {
  if (status === "connected") {
    return "متصل";
  }
  if (status === "connecting") {
    return "بيوصل";
  }
  return "فاصل";
}

function isAppleMobile(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent) || (platform === "macintel" && navigator.maxTouchPoints > 1);
}

function isStandaloneMode(): boolean {
  const standaloneNavigator = navigator as Navigator & { standalone?: boolean };
  return (
    Capacitor.isNativePlatform() ||
    window.matchMedia("(display-mode: standalone)").matches ||
    standaloneNavigator.standalone === true
  );
}

// انحراف موثّق: رابط الإحصائيات يُشتق من عنوان خادم ديدوس (ws → http)
function getStatsHttpUrl(): string {
  return `${getServerUrl().replace(/^ws/, "http")}/api/stats`;
}

async function enterImmersiveMode(): Promise<void> {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    }
  } catch {
    // Some mobile browsers only allow fullscreen when installed as an app.
  }

  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (orientation: "landscape") => Promise<void>;
    };
    await orientation.lock?.("landscape");
  } catch {
    // iOS Safari does not expose orientation lock for normal web pages.
  }
}
