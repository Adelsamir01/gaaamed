# Play Console — Data Safety Form Answers

Exact answers for **Play Console → App content → Data safety**, based on the
actual code (`server/users.js`, `server/bankel7az.js`, `server/server.js`,
`src/store/AppContext.tsx`). Review this file before every form re-submission
and keep it in sync with code changes.

**Global facts that apply to every answer below**

- Server is **self-hosted** (Node WebSocket server, `server/server.js`,
  persistent JSON files in `server/data/`).
- All client↔server traffic is **encrypted in transit with TLS** (wss through a
  Cloudflare Tunnel; TLS is terminated at Cloudflare).
- **No third-party SDKs** in the app that collect data — no ads, no analytics,
  no crash-reporting SDK (verified in `package.json` and `android/app/build.gradle`).
- **No data is shared with or sold to third parties.** Cloudflare acts only as
  infrastructure (tunnel/TLS termination), processing traffic on our behalf —
  this is not "sharing" for the purposes of the form.
- The only Android permission requested is `android.permission.INTERNET`.

---

## Section 1 — Data collection and security

**Does your app collect or share any of the required user data types?**
→ **Yes** (we collect the data types listed in Section 2).

**Is all of the user data collected by your app encrypted in transit?**
→ **Yes** (TLS / wss via Cloudflare Tunnel).

**Do you provide a way for users to request that their data is deleted?**
→ **Yes** — via email request to `[CONTACT_EMAIL]` (placeholder, set before
submission; see `PRIVACY.md`). Uninstalling the app also deletes all on-device
data (profile, coins, XP) stored in app local storage.

---

## Section 2 — Data types

### Personal info → **Name** — COLLECTED

| Question | Answer |
|---|---|
| Collected / shared | **Collected** (not shared) |
| Processed ephemerally? | **No** — stored on the server in `users.json` |
| Required or optional? | **Optional** — user-chosen display name (max 24 chars); a default ("لاعب") is used otherwise |
| Purpose(s) | **App functionality** |

### Personal info → **User IDs** — COLLECTED

Covers the internal `userId` (server-generated UUID) and the optional
user-chosen `@handle` (`^[a-z0-9_]{3,15}$`).

| Question | Answer |
|---|---|
| Collected / shared | **Collected** (not shared) |
| Processed ephemerally? | **No** — stored in `users.json` |
| Required or optional? | **Required** — a `userId`/handle is auto-assigned on first launch; choosing a custom handle is optional. Note: there is **no email/password account** — identity is device-bound ("account creation" = automatic profile + optional handle) |
| Purpose(s) | **App functionality**, **Account management** |

### Personal info → **Other info** — COLLECTED

Covers the emoji avatar chosen by the user.

| Question | Answer |
|---|---|
| Collected / shared | **Collected** (not shared) |
| Processed ephemerally? | **No** — stored in `users.json` (≤ 8 characters, an emoji) |
| Required or optional? | **Optional** — default 🎮/😎 is used otherwise |
| Purpose(s) | **App functionality**, **Personalization** |

### Messages → **Other in-app messages** — COLLECTED

Covers 1:1 and group chat text messages (≤ 1000 chars each) and in-chat game
invites.

| Question | Answer |
|---|---|
| Collected / shared | **Collected** (not shared) |
| Processed ephemerally? | **No** — the last 200 messages per thread are stored on the server in `chats.json` so members can read history |
| Required or optional? | **Optional** — users choose to send messages |
| Purpose(s) | **App functionality** |

### App activity → **Other user-generated content** — COLLECTED

Covers the friends list (social graph stored in `friends.json`) and the
شخبطة (Shakhbata) drawings. Drawings are relayed to other players in real time
during a match and are **not persisted** — for them mark *processed ephemerally*;
the friends list is persisted.

| Question | Answer |
|---|---|
| Collected / shared | **Collected** (not shared) |
| Processed ephemerally? | **No** (friends list persisted in `friends.json`); drawing strokes are relayed live and discarded |
| Required or optional? | **Optional** — users choose to add friends / play drawing games |
| Purpose(s) | **App functionality** |

### App activity → **Other actions** — COLLECTED

Covers game stats: coins / XP / level / daily-reward timestamps (stored
**on-device only**, in app local storage) and server-side بنك الحظ (Bank of
Luck) aggregate stats in `bank-stats.json` keyed by display name (rooms
created, games joined, highest virtual cash, last seen).

| Question | Answer |
|---|---|
| Collected / shared | **Collected** (not shared) |
| Processed ephemerally? | **No** — coins/XP stay on the device; aggregate board-game stats stay on the server |
| Required or optional? | **Required** — generated automatically by playing |
| Purpose(s) | **App functionality** |

### Device or other IDs → **Device or other IDs** — COLLECTED

Covers the app-generated random UUID (`deviceId`) created on first launch and
stored on the device; used to re-link the device to its server profile. It is
**not** a hardware ID and **not** an advertising ID.

| Question | Answer |
|---|---|
| Collected / shared | **Collected** (not shared) |
| Processed ephemerally? | **No** — stored on device and in `users.json` |
| Required or optional? | **Required** — needed to keep the player's profile across launches |
| Purpose(s) | **App functionality**, **Account management** |

---

## Section 3 — Data types explicitly NOT collected

Answer **No / not collected** for all of these:

- Location (approximate or precise)
- Email address, phone number, address, race/ethnicity, political or religious
  beliefs, sexual orientation
- Financial info (no payments, no purchases of any kind)
- Health and fitness
- Photos and videos, audio files, files and docs, calendar, **contacts**
  (the friends list is built from in-app handles — the address book is never accessed)
- Web browsing history, app interactions/search history analytics
- App info and performance (crash logs, diagnostics) — nothing collected by the
  app itself
- SMS or emails

---

## Quick copy block (for the "preview" PDF sanity check)

> Collected, not shared, encrypted in transit, deletable on request:
> Name; User IDs; Other personal info (emoji avatar); Other in-app messages;
> Other user-generated content (friends list, live drawings); Other app
> activity (game stats); Device or other IDs (app-generated UUID).
> Nothing shared with third parties. No ads. No analytics.
