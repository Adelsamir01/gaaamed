# WebSocket Protocol — gaaamed server (port 8787)

All messages are JSON over a single WebSocket connection. Rooms are identified by a 4-digit numeric `code`. Two-player games use slots 1–2; شخبطة rooms allow slots 1–8.

## Client → Server

| Message | Payload | Description |
|---|---|---|
| `create` | `{gameId, name, avatar}` | Create a room. Server logs `ROOM_CREATED <code> <gameId>`. |
| `join` | `{code, name, avatar}` | Join a room by code. |
| `leave` | — | Leave the room (room closes when empty). |
| `start` | — | Host only. Starts the match (شخبطة requires ≥ 2 players). |
| `action` | `{action: {...}}` | Game action, relayed untouched to the other player(s). Used by XO `{index}`, Connect4 `{column}`, etc. |
| `rps_choice` | `{choice}` | `'rock' \| 'paper' \| 'scissors'` — held server-side until both players submit. |
| `react_tap` | — | Reaction race tap; server timestamp decides the round. |
| `rematch` | — | Relayed to the opponent; both must request. |
| `choose_word` | `{word}` | شخبطة: drawer picks one of the offered words. |
| `draw` | `{op, ...}` | شخبطة: `op` = `stroke` (points, color, size), `clear`, `undo`. Relayed to everyone except the drawer's echo. |
| `guess` | `{text}` | شخبطة: a guess attempt. Checked server-side. |

## Server → Client

### Room lifecycle

| Message | Payload | Description |
|---|---|---|
| `created` | `{code, slot}` | Room created; you are slot 1 (host). |
| `joined` | `{code, slot, opponent}` | Join ok; includes host info. |
| `error` | `{message}` | Arabic message, e.g. `الغرفة غير موجودة، تأكد من الرمز` / `الغرفة ممتلئة`. |
| `opponent_joined` | `{opponent}` | 2-player rooms: the other player arrived. |
| `player_joined` | `{players:[{id,name,avatar,slot}]}` | شخبطة rooms: full roster on every join/leave. |
| `opponent_left` | — | The other player left or disconnected. |

### Relay & simultaneous games

| Message | Payload | Description |
|---|---|---|
| `action` | `{action, from}` | Relayed game action from another player. |
| `rps_reveal` | `{choices: {1: c1, 2: c2}}` | Broadcast only after BOTH choices are in. |
| `react_result` | `{winnerSlot, times: {1: ms, 2: ms}}` | Per-round reaction result. |
| `rematch` | — | Opponent requested a rematch. |

### شخبطة

| Message | Payload | Description |
|---|---|---|
| `round_choosing` | `{round, totalRounds, drawerSlot}` | New round; drawer is picking a word. |
| `word_options` | `{options: [w1, w2, w3]}` | **Drawer only** — 3 words, 12s to choose (auto-pick on timeout). |
| `your_word` | `{word}` | **Drawer only** — confirms the selected word. |
| `round` | `{round, drawerSlot, wordLength, duration}` | Drawing phase started. |
| `draw` | `{op, ...}` | Relayed stroke/clear/undo from the drawer. |
| `chat` | `{name, text}` | A wrong guess, shown as a chat message. |
| `guessed` | `{name, slot, points}` | Correct guess announcement (text is NEVER broadcast). May include close-guess feedback to the guesser only (`قريب جداً`). |
| `hint` | `{pattern}` | **Guessers only** — letter reveal at 35% and 65% of the timer (e.g. `_ ص _`). |
| `round_end` | `{word, reason}` | Round over (time up or everyone guessed); word revealed. |
| `scores` | `{scores: [{slot, name, avatar, points}]}` | Live scoreboard update. |
| `ended` | `{leaderboard: [...]}` | Match over; client maps rank → coins/XP. |

## Server logs (useful for debugging)

```text
GAAMED_SERVER listening on ws://0.0.0.0:8787
ROOM_CREATED 7604 shakhbata
PLAYER_JOINED 7604 Sara slot=2
PLAYER_LEFT 7604 slot=1
ROOM_CLOSED 7604
```

## Notes

- Turn enforcement for relay games is client-side; both clients apply the same action stream deterministically. Slot 1 is X in XO and moves first.
- Reaction-race fairness depends on server receipt timestamps only — client clocks are never compared.
- The شخبطة engine owns all secrets: words, hints and scoring never pass through clients.
- Reconnect: the client retries 3 times with backoff; there is no session resumption — a dropped socket leaves the room.
