# shakhbata

شخبطة is a mobile-first Arabic drawing and guessing web game inspired by Skribbl.

Players can join with only a name, create private rooms, share invite links, or enter a global quick-play lobby with random players. In each round, one player chooses from three Arabic words, draws on a shared canvas, and everyone else guesses in chat.

## Features

- Arabic RTL interface.
- Mobile-first no-scroll game layout.
- Join with name only, no accounts.
- Private rooms with shareable invite links.
- Global quick-play matchmaking.
- Auto-start for public rooms when at least two players join.
- Three random word choices for the drawer.
- Realtime drawing canvas.
- Pen, eraser, color picker, brush size, undo, and clear tools.
- Guess chat with correct-answer masking.
- Timed letter hints for guessers.
- Score system based on guess speed.
- Drawer gets points when others guess correctly.
- Final leaderboard.
- Large Arabic word bank.
- Lightweight Node.js server with no external dependencies.

## Tech Stack

- Node.js HTTP server.
- Server-Sent Events for realtime game state.
- Browser `fetch` POST requests for actions.
- HTML, CSS, and vanilla JavaScript frontend.
- Canvas for drawing.

No database is required for the current MVP. Rooms are stored in memory, so they reset when the server restarts.

## Project Structure

```text
.
├── package.json
├── server.js
└── public
    ├── app.js
    ├── index.html
    ├── manifest.webmanifest
    └── styles.css
```

## Requirements

- Node.js 20 or newer.
- npm.

## Run Locally

```bash
npm start
```

Open:

```text
http://127.0.0.1:3000
```

The default host is `127.0.0.1` and default port is `3000`.

You can override them:

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

Use `HOST=0.0.0.0` when exposing the app through a tunnel or another machine on the network.

## Gameplay Flow

1. Player enters a name.
2. Player chooses one of:
   - Create private room.
   - Join with code.
   - Quick play with random players.
3. In private rooms, host starts the match.
4. In public quick-play rooms, the match auto-starts when enough players join.
5. Drawer chooses one of three random Arabic words.
6. Drawer draws while others guess in chat.
7. Guessers receive letter hints after part of the timer has passed.
8. Scores are awarded based on guess speed.
9. After all rounds, the final leaderboard is shown.

## Private Room Invite Links

Private room sharing generates links like:

```text
https://example.com/?room=ABCDE
```

When a player opens the link:

- The room code is read from the URL.
- The code field is hidden.
- The player only enters a name and joins.
- After joining, the URL is cleaned back to `/`.

## Cloudflare Tunnel Deployment

Target subdomain:

```text
shakhbata.adelsamir.com
```

On the server or PC that will host the game:

1. Clone the repo:

```bash
git clone https://github.com/Adelsamir01/shakhbata.git
cd shakhbata
```

2. Start the app:

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

3. In another terminal, run a Cloudflare tunnel to the local app:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

For a permanent named tunnel, create/configure a Cloudflare tunnel that routes:

```text
shakhbata.adelsamir.com -> http://127.0.0.1:3000
```

Example `config.yml` shape:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: /path/to/YOUR_TUNNEL_ID.json

ingress:
  - hostname: shakhbata.adelsamir.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Then run:

```bash
cloudflared tunnel run YOUR_TUNNEL_NAME
```

## Notes For Future Coding Agents

- Main server logic is in `server.js`.
- Frontend UI and client state are in `public/app.js`.
- Styling and animations are in `public/styles.css`.
- There are no npm dependencies right now.
- The game is memory-only. Adding persistence would require Redis/PostgreSQL or another store.
- Current realtime transport is Server-Sent Events plus POST actions. If scaling up, Socket.IO or WebSocket rooms would be a natural next step.
- Drawing updates are intentionally handled incrementally on the client to avoid canvas flashing while drawing.
- Avoid re-rendering the full game screen on every draw event.
- Word hints are calculated server-side and only sent to guessers.
- Drawer-only word options are filtered per viewer in `publicRoom(room, viewerId)`.

## Useful Commands

```bash
node --check server.js
node --check public/app.js
npm start
```

## License

Private project unless a license is added.
