# ديدوس — Dedos 🎮

**منصة ألعاب اجتماعية عربية — العب ودردش مع أصدقائك، أونلاين أو على نفس الجهاز.**

A Plato-style social gaming platform, fully in Arabic (RTL), built as a web app and shipped as a native Android app via Capacitor. Casual games, private rooms with 4-digit codes, realtime multiplayer over WebSocket, chat rooms, friends, coins, XP and levels.

---

## Screenshots

| شخبطة — الرسام | شخبطة — التخمين | إكس أو أونلاين | النتيجة |
|---|---|---|---|
| ![drawer](docs/screenshots/shakhbata-drawer.png) | ![guesser](docs/screenshots/shakhbata-guesser.png) | ![xo](docs/screenshots/tictactoe-online-win.png) | ![result](docs/screenshots/tictactoe-online-result.png) |

---

## Games

### 🌐 Online (realtime multiplayer over WebSocket)

| Game | Players | Description |
|---|---|---|
| **شخبطة** 🎨 | 2–8 | Arabic draw-and-guess party game (Skribbl-style): one player draws, everyone guesses in chat. 420-word Arabic bank, letter hints, speed-based scoring. |
| **بنك الحظ** 🏦 | 2–6 | Egyptian Monopoly-style board game: dice, properties, rent, jail, chance cards — fully ported and wired into Dedos rooms. |
| **إكس أو أونلاين** ⭕ | 2 | Tic-tac-toe over the network with turn sync and win-line highlight. |
| **أربعة تربح** 🔴 | 2 | Connect 4 — drop discs, gravity animation, 4-in-a-row detection. |
| **حجر ورقة مقص أونلاين** ✂️ | 2 | Best of 5, secret picks revealed simultaneously by the server. |
| **سباق البرق** ⚡ | 2 | Reaction race — server decides who tapped first each round. |

All online games support three ways to play from one unified game card: **غرفة برمز** (4-digit room code), **دعوة في الدردشة** (tap-to-join invite bubble), and **مباراة سريعة** ⚡ (server matchmaking pairs you with a random waiting player).

### 📱 Offline (vs bot or 2 players on one device)

| Game | Notes |
|---|---|
| **إكس أو** | Bot with 3 difficulties — سهل / متوسط / صعب (unbeatable minimax) |
| **لعبة الذاكرة** 🧠 | 4×4 Arabic-themed memory cards, timer, best score |
| **أسئلة ثقافية** 📚 | 51 real Arabic trivia questions, 15s per question, streak bonuses |
| **حجر ورقة مقص** | Best of 5 vs bot |
| **سرعة البرق** | 5-round reaction test with average/best ms |

### Platform features

- Server-side identity with no signup: device-bound account, editable `@handle`, searchable by friends
- Real friends system: search by handle, send/accept/reject/cancel requests, remove friends, online presence dots, persisted on the server
- Real chat: DMs + group chats (3+ friends), unread badges, history persisted server-side
- Native Android push notifications for messages and game invites, with lock-screen/heads-up delivery and one-tap opening of the exact chat
- Game invites inside chat: tap 🎮 in any DM/group → friend taps **انضم الآن** → both land in the room (no codes)
- Quick match (مباراة سريعة ⚡): one tap pairs two waiting players into a game
- Unified game cards: 🤖 كمبيوتر / 👥 لاعبَين / 🌐 أونلاين modes on a single card
- Onboarding with username + avatar emoji picker, daily coin reward, coins economy, XP and levels
- Profile with per-game stats, settings (sound, server URL)
- WebAudio sound effects, confetti celebrations, framer-motion animations
- Full Arabic RTL UI — Cairo font, dark theme, glassmorphism

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Tailwind CSS 3.4, shadcn/ui, framer-motion |
| Realtime server | Node.js + `ws` (rooms, relay + authoritative game engines) |
| Notifications | Firebase Cloud Messaging via Capacitor Push Notifications |
| Android | Capacitor 8 → native APK (min API 24, target API 36) |
| Build | AGP 9 + Gradle (JDK 21), Android SDK platform 36, R8 shrinking/optimization |

## Project structure

```text
├── src/                      # React client
│   ├── sections/             # Screens: Home, Games, Chat, ChatRoom, Friends, Profile, OnlineLobby…
│   ├── games/                # Offline games + games/index.ts registry
│   │   └── online/           # Online games: XO, ConnectFour, Rps, Reaction, Shakhbata, bankel7az/
│   ├── online/               # WS client + OnlineContext (rooms, identity, social, matchmaking)
│   ├── store/                # AppContext — profile, coins/XP, stats (localStorage)
│   └── data/                 # Trivia bank, friends/rooms seed
├── server/
│   ├── server.js             # WS relay + rooms + social protocol (port 8787)
│   ├── users.js              # Persistent identity, handles, friends, chats (server/data/*.json)
│   ├── shakhbata.js          # شخبطة authoritative game engine (420-word bank)
│   ├── bankel7az.js          # بنك الحظ authoritative engine (ported)
│   ├── public/               # Public website: landing page, privacy.html, brand assets
│   ├── smoke-test.js         # 2-player games protocol tests
│   ├── smoke-shakhbata.js    # شخبطة end-to-end tests
│   ├── smoke-bankel7az.js    # بنك الحظ end-to-end tests
│   └── smoke-social.js       # identity/friend requests/chats/invites/quick-match tests (68 checks)
├── autostart/                # Hidden VBS launchers + HKCU Run registration (server+tunnel at logon)
├── android/                  # Capacitor Android project (builds the APK)
├── runtime/                  # Local standalone node.exe for autostart (gitignored)
├── shakhbata-original/       # Original شخبطة game (reference)
├── bank-el7az-original/      # Original بنك الحظ game (reference)
└── docs/                     # Architecture, protocol, development guides
```

---

## Quick start

### Web app (development)

```bash
npm install
npm run dev          # http://localhost:3000
```

### Multiplayer server

```bash
npm run server       # ws://0.0.0.0:8787
```

- **Production (default)**: the Android app connects to the public server at `wss://dedos.adelsamir.com` — a Cloudflare Tunnel in front of this machine's local server (`HTTP → localhost:8787`). Any phone with the APK can play from anywhere.
- Web preview connects to `ws://localhost:8787` automatically.
- Override anytime in **Profile → إعدادات الخادم** (e.g. `ws://192.168.1.20:8787` for LAN play, or `ws://10.0.2.2:8787` for emulator-to-localhost dev).

#### Push notification setup

Push notifications require one Firebase project with the Android app ID `com.dedos.game`:

1. Download the Android client configuration as `android/app/google-services.json`. This file is packaged into Android builds.
2. Give the server Firebase Admin credentials using one of these options:
   - place the service-account JSON at `server/firebase-service-account.json` (gitignored), or
   - set `FIREBASE_SERVICE_ACCOUNT_FILE`, `FIREBASE_SERVICE_ACCOUNT_JSON`, or `FIREBASE_SERVICE_ACCOUNT_BASE64`, or
   - configure Application Default Credentials with `GOOGLE_APPLICATION_CREDENTIALS`.
3. Restart the server, install a freshly built Android app, and accept the notification permission prompt.

Never commit the Firebase service-account JSON. `/health` reports `push.configured` and the number of registered devices so deployment can be verified without exposing credentials.

### Protocol tests

```bash
node server/smoke-test.js        # 2-player games protocol
node server/smoke-shakhbata.js   # شخبطة full match
node server/smoke-bankel7az.js   # بنك الحظ full match
node server/smoke-social.js      # identity, friend requests, chats, invites, quick match — 68 checks
```

### Auto-start on Windows logon (production)

The server and tunnel register in `HKCU\...\Run` (no admin needed) and start hidden via VBS launchers:

```bat
autostart\install-autostart.bat
```

- `gaaamed-server` → `runtime\node.exe server\server.js` (standalone node copy, immune to tool updates)
- `gaaamed-tunnel` → `cloudflared … --token` read from `sdk-installer\tunnel-token.txt` (gitignored)
- To remove: `reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v gaaamed-server /f` (same for `gaaamed-tunnel`)

### Build the Android APK

Requires JDK 21 + Android SDK (platform/build-tools 36):

```bash
npm run build && npx cap sync android
cd android
gradlew.bat assembleDebug        # → android/app/build/outputs/apk/debug/app-debug.apk
gradlew.bat bundleRelease        # signed, R8-optimized Play Store AAB
```

If `android/local.properties` is missing, create it with your SDK path:
`sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`

### Run on emulators

```bash
emulator -avd gaaamed  -port 5554 &
emulator -avd gaaamed2 -port 5556 &
adb -s emulator-5554 install -r app-debug.apk
adb -s emulator-5556 install -r app-debug.apk
```

### Public tunnel (production server)

The public endpoint `wss://dedos.adelsamir.com` is a Cloudflare Tunnel to this machine:

```bash
# cloudflared (Windows binary) — runs detached, keeps the tunnel alive
cloudflared.exe tunnel --no-autoupdate --protocol http2 run --token <TUNNEL_TOKEN>
```

- Dashboard route: Zero Trust → Networks → Tunnels → gaaamed → Public Hostname → `dedos.adelsamir.com` → service `HTTP → localhost:8787` (Cloudflare handles the WS Upgrade automatically).
- `--protocol http2` is required on networks that block QUIC/UDP.
- The tunnel token is a secret — keep it in the dashboard / your password manager, never in this repo.

### Public web pages (landing, privacy, deletion, APK)

The same Node server also serves a small public website from `server/public/` (static files only — no game logic involved):

| Route | What it serves |
|---|---|
| `/` | Arabic RTL landing page (`server/public/index.html`) — hero, game cards, download buttons |
| `/privacy` | Privacy policy page (`server/public/privacy.html`, Arabic + English) — the public URL Play Console requires |
| `/delete-account` | Public privacy/account-deletion request page with in-app display-name verification |
| `/api/privacy-request` | Same-origin POST endpoint for verified deletion and privacy requests |
| `/dedos.apk` | Direct APK download — serves the signed `dedos-release.apk` from the workspace root when it exists, otherwise a friendly JSON 404 |
| `/health` | JSON health check |
| `/api/stats` | بنك الحظ stats snapshot (JSON, CORS `*`) |

Static serving is guarded against path traversal (paths resolve strictly inside `server/public/`) and sets proper content types (html/png/jpg/css/js/ico/apk). The Play Console URLs are `https://dedos.adelsamir.com/privacy` and `https://dedos.adelsamir.com/delete-account`.

---

## شخبطة — rules

1. Each player draws **one round**; rounds = number of players (2–8).
2. The drawer picks 1 of 3 Arabic words within 12s (auto-pick on timeout).
3. Drawing time: 70s. Guessers type in chat — correct guesses are **never broadcast as text** (only a "أجاب فلان بشكل صحيح! +N" announcement).
4. Close guesses get a private "قريب جداً" warning.
5. Letter hints reveal at 35% and 65% of the timer (guessers only).
6. Scoring: `30 + (timeRemaining / drawTime) × 70` per correct guess; the drawer earns **+20** per correct guesser.
7. Final leaderboard → Dedos coins/XP by rank.

Arabic answer checking normalizes alef/hamza forms, taa marbuta, yaa/alef maqsura and diacritics.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, components, room lifecycle
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — full WebSocket message reference
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — environment setup, adding new games, troubleshooting

## Roadmap

- [x] Public server deployment (Cloudflare Tunnel — `wss://dedos.adelsamir.com`)
- [x] Server-side identity + handles, real friends, DMs & group chats
- [x] In-chat game invites (tap to join) + quick match matchmaking
- [x] Windows auto-start for server + tunnel
- [ ] Voice chat in rooms
- [ ] More party games (مافيا، تحدي الرسم السريع)
- [ ] Release-signed APK + Play Store listing

## License

Private project — All rights reserved © Adelsamir01.
