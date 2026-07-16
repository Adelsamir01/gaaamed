# قييمد — gaaamed 🎮

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
| **إكس أو أونلاين** ⭕ | 2 | Tic-tac-toe over the network with turn sync and win-line highlight. |
| **أربعة تربح** 🔴 | 2 | Connect 4 — drop discs, gravity animation, 4-in-a-row detection. |
| **حجر ورقة مقص أونلاين** ✂️ | 2 | Best of 5, secret picks revealed simultaneously by the server. |
| **سباق البرق** ⚡ | 2 | Reaction race — server decides who tapped first each round. |

### 📱 Offline (vs bot or 2 players on one device)

| Game | Notes |
|---|---|
| **إكس أو** | Bot with 3 difficulties — سهل / متوسط / صعب (unbeatable minimax) |
| **لعبة الذاكرة** 🧠 | 4×4 Arabic-themed memory cards, timer, best score |
| **أسئلة ثقافية** 📚 | 51 real Arabic trivia questions, 15s per question, streak bonuses |
| **حجر ورقة مقص** | Best of 5 vs bot |
| **سرعة البرق** | 5-round reaction test with average/best ms |

### Platform features

- Onboarding with username + avatar emoji picker (24 avatars)
- Daily coin reward, coins economy, XP and levels
- Chat rooms with simulated Arabic bot replies and typing indicator
- Friends list with online status
- Profile with per-game stats, settings (sound, server URL)
- WebAudio sound effects, confetti celebrations, framer-motion animations
- Full Arabic RTL UI — Cairo font, dark theme, glassmorphism

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite 7, Tailwind CSS 3.4, shadcn/ui, framer-motion |
| Realtime server | Node.js + `ws` (rooms, relay + شخبطة authoritative engine) |
| Android | Capacitor 8 → native APK (Android 14 / API 34) |
| Build | Gradle (JDK 21), Android SDK platform 34 |

## Project structure

```text
├── src/                      # React client
│   ├── sections/             # Screens: Home, Games, Chat, Friends, Profile, OnlineLobby…
│   ├── games/                # Offline games + games/index.ts registry
│   │   └── online/           # Online games: XO, ConnectFour, Rps, Reaction, Shakhbata
│   ├── online/               # WS client + OnlineContext (rooms, connection)
│   ├── store/                # AppContext — profile, coins/XP, stats (localStorage)
│   └── data/                 # Trivia bank, friends/rooms seed, bot replies
├── server/
│   ├── server.js             # WS relay + room management (port 8787)
│   ├── shakhbata.js          # شخبطة authoritative game engine (420-word bank)
│   ├── smoke-test.js         # 2-player games protocol tests (16 checks)
│   └── smoke-shakhbata.js    # شخبطة end-to-end tests (51 checks)
├── android/                  # Capacitor Android project (builds the APK)
├── shakhbata-original/       # Original شخبطة game (reference, ported into the app)
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

- Web preview connects to `ws://localhost:8787` automatically.
- Android emulator connects to `ws://10.0.2.2:8787` automatically (10.0.2.2 = host machine).
- Physical phones on the same LAN: set the PC's LAN IP in **Profile → إعدادات الخادم** (e.g. `ws://192.168.1.20:8787`).

### Protocol tests

```bash
node server/smoke-test.js        # 2-player games — 16 checks
node server/smoke-shakhbata.js   # شخبطة full match — 51 checks
```

### Build the Android APK

Requires JDK 21 + Android SDK (platform 34, build-tools 34.0.0):

```bash
npm run build && npx cap sync android
cd android
gradlew.bat assembleDebug        # → android/app/build/outputs/apk/debug/app-debug.apk
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

---

## شخبطة — rules

1. Each player draws **one round**; rounds = number of players (2–8).
2. The drawer picks 1 of 3 Arabic words within 12s (auto-pick on timeout).
3. Drawing time: 70s. Guessers type in chat — correct guesses are **never broadcast as text** (only a "أجاب فلان بشكل صحيح! +N" announcement).
4. Close guesses get a private "قريب جداً" warning.
5. Letter hints reveal at 35% and 65% of the timer (guessers only).
6. Scoring: `30 + (timeRemaining / drawTime) × 70` per correct guess; the drawer earns **+20** per correct guesser.
7. Final leaderboard → gaaamed coins/XP by rank.

Arabic answer checking normalizes alef/hamza forms, taa marbuta, yaa/alef maqsura and diacritics.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, components, room lifecycle
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — full WebSocket message reference
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — environment setup, adding new games, troubleshooting

## Roadmap

- [ ] Public server deployment (Cloudflare tunnel / VPS) so any phone can join
- [ ] Voice chat in rooms
- [ ] More party games (مافيا، تحدي الرسم السريع)
- [ ] Release-signed APK + Play Store listing

## License

Private project — All rights reserved © Adelsamir01.
