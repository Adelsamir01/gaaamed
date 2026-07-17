# Architecture — ديدوس (dedos)

## Overview

```text
┌────────────────────────────┐         WebSocket (JSON)         ┌─────────────────────────────┐
│  React client (Vite build) │ ◄──────────────────────────────► │  Node.js game server :8787  │
│  src/                      │   ws://localhost:8787  (web)     │  server/server.js           │
│  • offline games (local)   │   ws://10.0.2.2:8787   (emulator)│  • rooms & relay            │
│  • online games (network)  │   ws://<LAN-IP>:8787   (phones)  │  • شخبطة authoritative      │
└─────────────┬──────────────┘                                  │    engine (shakhbata.js)    │
              │ Capacitor 8                                     └─────────────────────────────┘
              ▼
┌────────────────────────────┐
│  Android WebView shell     │  androidScheme: http + allowMixedContent + usesCleartextTraffic
│  com.dedos.game (ديدوس)   │  (required so ws:// works from the WebView)
└────────────────────────────┘
```

The client is a single-page React app. The same build runs three ways:

1. **Web dev/preview** — Vite dev server; WS connects to `ws://localhost:8787`.
2. **Android APK (default)** — Capacitor wraps `dist/` in a WebView; WS connects to the public production endpoint **`wss://dedos.adelsamir.com`** — a Cloudflare Tunnel (`--protocol http2`) forwarding `HTTP → localhost:8787` on the host machine.
3. **Override** — server URL is overridable in Profile → إعدادات الخادم (persisted in `localStorage` key `gaaamed_server_url`), e.g. `ws://10.0.2.2:8787` for emulator dev or a LAN IP.

URL resolution lives in `src/online/client.ts` (`Capacitor.isNativePlatform()` check).

## Client (`src/`)

| Module | Responsibility |
|---|---|
| `App.tsx` | Onboarding gate, bottom-tab routing, offline game session routing, wraps everything in `OnlineProvider`. |
| `store/AppContext.tsx` | Profile (name/avatar/level/XP/coins), per-game stats, friends, chat threads, settings. Persisted to `localStorage`. Level = 100 XP per level. |
| `games/index.ts` | Game registry — every game (offline & online) is an entry: `id, name, description, emoji, category, howToPlay, supportsBot, supportsTwoPlayer, online, component`. Adding a game = one entry + one component. |
| `games/*` (offline) | Self-contained game components; results reported via `finishGame` (coins/XP/stats). |
| `online/client.ts` | WebSocket singleton: connect, 3-try reconnect with backoff, typed event emitter, server URL resolution. |
| `online/OnlineContext.tsx` | Connection status, current room (code, slot, players, opponent), actions (`createRoom`, `joinRoom`, `leaveRoom`, `startGame`, `sendAction`, `sendRpsChoice`, `sendReactTap`, `sendRaw`), rematch handshake, game-event subscription. |
| `sections/OnlineLobby.tsx` | Online entry: create (game picker) / join (4-digit code), waiting room (2-player card or شخبطة group list up to 8), host start button, opponent-left alerts, results with rematch. |
| `games/online/*` | Online game components driven by the shared action stream from the server. |

### Offline game flow

```text
Games screen → GameLobby (mode/difficulty) → game component → GameResults
                                                    └─ finishGame(result) → coins/XP/stats
```

### Online game flow

```text
OnlineLobby → create(code) / join(code) → waiting room → host: start
           → game component (server-driven) → results → rematch or lobby
```

2-player games synchronize by applying the **same action stream** on both clients (deterministic local logic; server only relays). شخبطة is different — see below.

## Server (`server/`)

Single Node process, `ws` library, port **8787**, no database (rooms in memory).

- `server.js` — room lifecycle + relay + authoritative handlers for the simultaneous/realtime games:
  - Rooms keyed by 4-digit code; players get slots (1..2, or 1..8 for شخبطة).
  - `{type:'action'}` is relayed to the other player(s) untouched.
  - `rps_choice` — held until both arrive, then one `rps_reveal` broadcast (no peeking).
  - `react_tap` — server receipt timestamps decide the winner per round (fair, client-clock independent).
  - 20s heartbeat, dead-socket cleanup, `opponent_left` on disconnect, empty-room GC.
- `shakhbata.js` — **authoritative game engine** for شخبطة:
  - State machine: `lobby → wordChoice → drawing → roundEnd → (next) → ended`.
  - 420-word Arabic bank + banned-word filter.
  - Arabic normalization for answer checking (alef/hamza, taa marbuta, yaa/maqsura, tashkeel).
  - Hints at 35%/65% of the timer (guessers only); scoring formula `30 + remaining/total × 70`, drawer +20 per guesser; timers server-side; leaderboard broadcast at the end.

HTTP endpoints on the same port (static files only, no game logic): `/health` (JSON health), `/api/stats` (بنك الحظ stats), `/` (Arabic landing page from `server/public/`), `/privacy` (privacy policy page), `/dedos.apk` (serves `dedos-debug.apk` from the workspace root when present). Static serving is path-traversal-guarded (strictly inside `server/public/`).

### Why two models?

- **Relay + deterministic clients** is perfect for turn-based games (XO, Connect 4): tiny server, zero duplicated logic.
- **Authoritative server** is required when the server owns secrets (the word!), timers and scoring — شخبطة, and the simultaneous-reveal mechanics of RPS/reaction race.

## Android shell

- Capacitor 8, app id `com.dedos.game`, display name **ديدوس**.
- `capacitor.config.ts`: `server: { androidScheme: 'http', allowMixedContent: true }`.
- `android/app/src/main/AndroidManifest.xml`: `android:usesCleartextTraffic="true"` — without both of these, Android 9+ blocks cleartext `ws://` from the WebView (the app shows "غير متصل").
- Build: `gradlew.bat assembleDebug` with JDK 21, SDK platform 34. `android/local.properties` (git-ignored) points at the SDK.

## Persistence

| What | Where |
|---|---|
| Profile, coins, XP, stats, settings, server URL | `localStorage` (per device) |
| Rooms & matches | Server memory (reset on restart) |
| Chat history | Seeded mock data (client) |

## Testing

- `server/smoke-test.js` — 16 protocol checks for the 2-player games (create/join/relay/reveal/reaction/rematch/leave/full-room).
- `server/smoke-shakhbata.js` — 51 checks for شخبطة: 3 players, full 3-round match, word privacy, stroke relay rules, guess masking, "قريب جداً", hints not sent to drawer, scoring, leaderboard.
