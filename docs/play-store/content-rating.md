# Play Console — Content Rating (IARC) Questionnaire Walkthrough

Answers for **Play Console → App content → Content rating → IARC questionnaire**,
based on the actual app content. The IARC questionnaire produces the rating
shown in each region (ESRB, PEGI, USK, etc.). Answer honestly — the publisher
is legally responsible for these declarations.

**Questionnaire category to start with: Game.**

---

## 1. Violence — **No**

No realistic, cartoon, or fantasy violence of any kind. All games are abstract
board/party/drawing games (XO, Connect 4, Rock-Paper-Scissors, reaction
timing, draw-and-guess, a property-trading board game, memory, trivia).

## 2. Sexuality / nudity — **No**

No sexual or suggestive content, no nudity, no romance mechanics.

## 3. Language (profanity / crude humor) — **No**

No profanity or crude humor in the app's own content. User-typed chat text is
user-generated and is covered by **Users Interact** (section 8), not by this
content question — that is how IARC intends social features to be declared.

## 4. Controlled substances (drugs, alcohol, tobacco) — **No**

No references to drugs, alcohol, tobacco, or gambling-like substances.

## 5. Gambling — **No** (both questions)

This needs care because of **بنك الحظ (Bank of Luck)**. Rationale:

- **Real-money gambling: No.** There is no way to deposit, wager, win, or
  withdraw real money or anything of real-world value. The app has **no
  payments and no in-app purchases at all** (verified: no billing SDK, no
  store SDK).
- **Simulated gambling: No.** Bank of Luck is a **Monopoly-style
  property-trading board game** (`server/bankel7az.js`): players roll dice to
  move around a board, buy properties, build, and pay rent **with virtual
  coins only**. Coins are earned by playing and a free daily reward; they
  cannot be bought, sold, exchanged, or cashed out, and have no real-world
  value. There are **no casino mechanics** — no slots, roulette, poker,
  blackjack, betting odds, or wagering. Dice used purely for board movement is
  the standard board-game pattern (comparable Monopoly-style apps are rated
  Everyone / PEGI 3 with no gambling flag).

> If a reviewer ever disputes this, the conservative fallback is to flag
> "simulated gambling", which would raise the rating sharply in some regions
> (e.g., 18+ in Germany) — only do that if Google explicitly requires it.

## 6. Users Interact / shares information — **Yes**

This is the one answer that materially affects the rating.

- **Users can interact or exchange information with other users: Yes** —
  1:1 and group text chat, in-chat game invites, and user-generated drawings
  in شخبطة (draw-and-guess with up to 8 players).
- Chat is **open / not pre-moderated** — answer accordingly where the
  questionnaire asks about moderation or filtering of user-generated content.
- **Shares user's physical location with other users: No.**

Honesty note: there is currently no in-app block/report system. Declare the
interaction accurately; adding moderation features is a product decision
tracked outside this document.

## 7. Digital goods purchases — **No**

No in-app purchases, no subscriptions, no paid digital goods, no loot boxes.

## 8. Miscellaneous

- User-generated content sharing outside the app: **No** (drawings/messages
  stay inside the app).
- Web browsing / unrestricted internet access: **No** (the app connects only
  to its own game server).

---

## Expected rating outcome

| Region | Expected | Why |
|---|---|---|
| ESRB (Americas) | **Teen** | No content flags at all, but **open user-to-user interaction** typically pushes an otherwise-Everyone game to Teen with the **"Users Interact"** interactive element notice |
| PEGI (Europe) | **PEGI 12** (possibly PEGI 3 + interactive notice, varies) | Same reason: user interaction, no content descriptors |
| Other IARC regions | Similar mid-tier rating with "Users Interact" notice | — |

**Bottom line:** expect roughly **Teen / PEGI 12 with a "Users Interact"
notice** — not because of game content, but because of the open chat. The
final rating is assigned by IARC and shown per region; treat anything between
Everyone+notice and Teen as a normal outcome. If a stricter rating ever
appears, the chat declaration — not the games — will be the cause.

## Re-submission triggers

Retake the questionnaire if any of these change: moderation/block features,
voice/image chat, purchases, new games with different content themes.
