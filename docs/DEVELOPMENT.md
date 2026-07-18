# Development Guide — gaaamed

## Environment

| Tool | Version | Path on the build machine |
|---|---|---|
| Node.js | 20+ (24 used) | PATH |
| JDK (Temurin) | **21** (required by Capacitor 8 / AGP) | `C:\Users\Adel\AppData\Local\Android\jdk-21` |
| Android SDK | platform/build-tools 36, platform-tools, emulator | `C:\Users\Adel\AppData\Local\Android\Sdk` |
| Emulator AVDs | `gaaamed`, `gaaamed2` (Pixel 6, Android 14, x86_64) | created via `avdmanager` |

## Everyday commands

```bash
npm run dev            # Vite dev server (web preview)        → http://localhost:3000
npm run server         # multiplayer server                   → ws://0.0.0.0:8787
npm run build          # production build → dist/
npm run android:sync   # build + copy into the Android project
```

## Android build

```bash
cd android
set JAVA_HOME=C:\Users\Adel\AppData\Local\Android\jdk-21   # cmd
gradlew.bat assembleDebug
# APK → android/app/build/outputs/apk/debug/app-debug.apk
```

`android/local.properties` must contain `sdk.dir=C:/Users/Adel/AppData/Local/Android/Sdk` (forward slashes — git-ignored).

## Emulators

```bash
# launch (each in its own window)
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd gaaamed  -gpu auto -port 5554
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd gaaamed2 -gpu auto -port 5556

# install / launch the app
adb -s emulator-5554 install -r gaaamed-debug.apk
adb -s emulator-5554 shell monkey -p com.dedos.game -c android.intent.category.LAUNCHER 1

# screenshots / UI automation
adb -s emulator-5554 exec-out screencap -p > screen.png
adb -s emulator-5554 shell input tap X Y
adb -s emulator-5554 shell input swipe X1 Y1 X2 Y2 DURATION_MS
```

> Note: `adb shell input text` only types ASCII — Arabic guesses can't be scripted this way. Use `server/smoke-shakhbata.js` as a scripted third player instead.

## Tests

```bash
node server/smoke-test.js        # 16 checks — 2-player protocol
node server/smoke-shakhbata.js   # 51 checks — full شخبطة match
```

Run them before every server change; both spin up their own server instance and clean up.

## Adding a new game

### Offline game

1. Create `src/games/MyGame.tsx` (self-contained component, calls `finishGame(result)` at the end).
2. Register it in `src/games/index.ts` — it automatically appears in the store, lobby, stats and results flow.

### Online game (2-player)

1. Add the component under `src/games/online/` driven by `useOnline()` — send moves with `sendAction`, receive via the game-event subscription.
2. Register with `online: true`, category `أونلاين` — it appears in the online lobby picker automatically.
3. If the game needs secrets or simultaneous reveals (like RPS), add a small authoritative handler in `server/server.js` and extend `server/smoke-test.js`.

### شخبطة-style authoritative game

Follow `server/shakhbata.js` as the template: server-side state machine + timers + secrets, thin client renderer.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "غير متصل" on Android only | Production endpoint unavailable or URL is not secure | Verify `wss://dedos.adelsamir.com`; use a temporary `ws://10.0.2.2:8787` override only in a development build. |
| Emulator can't reach server | Wrong host alias | Use `ws://10.0.2.2:8787`, never `localhost` (that points at the emulator itself). |
| `invalid source release: 21` | Gradle running on JDK 17 | Set `JAVA_HOME` to the JDK 21 path. |
| `sdk.dir` syntax error in Gradle | Backslashes in `local.properties` | Use forward slashes: `C:/Users/...`. |
| Room code says "غير موجودة" | Server restarted (rooms are in-memory) | Create a new room. |

## Repo hygiene

- `dist/`, `node_modules/`, `*.apk`, `sdk-installer/`, emulator screenshots and logs are git-ignored.
- The APK is a build artifact — distribute it via GitHub Releases, not the repo.
