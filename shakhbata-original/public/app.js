const app = document.querySelector("#app");
const COLORS = ["#111827", "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#78350f", "#b45309", "#52525b", "#6b7280"];
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && state.colorOpen) {
    state.colorOpen = false;
    render();
  }
});
function getCookie(name) {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : "";
}
function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}
function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const value = Math.random() * 16 | 0;
    return (char === "x" ? value : (value & 0x3 | 0x8)).toString(16);
  });
}

const urlRoomCode = (new URLSearchParams(location.search).get("room") || new URLSearchParams(location.search).get("code") || "").trim().toUpperCase();
const storedRoomCode = (localStorage.getItem("shakhbata:roomCode") || "").trim().toUpperCase();
const storedPlayerId = localStorage.getItem("shakhbata:playerId") || "";
let deviceId = localStorage.getItem("shakhbata:deviceId") || getCookie("shakhbata_deviceId") || "";
if (!deviceId) {
  deviceId = generateId();
}
localStorage.setItem("shakhbata:deviceId", deviceId);
setCookie("shakhbata_deviceId", deviceId, 365);

const state = {
  name: localStorage.getItem("shakhbata:name") || "",
  code: urlRoomCode || storedRoomCode,
  playerId: storedPlayerId,
  room: null,
  ws: null,
  wsReconnectDelay: 1000,
  reconnecting: false,
  tool: "pen",
  color: "#111827",
  colorOpen: false,
  sizeOpen: false,
  size: 7,
  strokes: [],
  isDrawing: false,
  strokeId: "",
  lastSentAt: 0,
  pendingPoints: [],
  renderKey: "",
  drawEventCursor: 0,
  pendingRenderKey: "",
  canvas: {
    element: null,
    ctx: null,
    cssWidth: 0,
    cssHeight: 0,
    scale: 1,
    rect: null
  }
};

function html(strings, ...values) {
  return strings.map((string, index) => string + (values[index] ?? "")).join("");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function compactName(name = "", max = 9) {
  const text = firstName(name);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function firstName(name = "") {
  return String(name).trim().split(/\s+/)[0] || name;
}

function roomLink(code) {
  const url = new URL(location.origin);
  url.searchParams.set("room", code);
  return url.toString();
}

function clearRoomLink() {
  if (location.search) history.replaceState(null, "", location.pathname);
}

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "حصل خطأ.");
  return data;
}

async function fetchStats() {
  const response = await fetch("/api/stats");
  if (!response.ok) throw new Error("stats unavailable");
  return response.json();
}

function setError(message) {
  const element = document.querySelector("[data-error]");
  if (element) element.textContent = message || "";
}

function handleServerMessage(data) {
  if (data.type === "state") {
    const previousRoom = state.room;
    const hasDrawEvents = Array.isArray(data.room.drawEvents);
    const sameCanvas = previousRoom &&
      previousRoom.code === data.room.code &&
      previousRoom.round === data.room.round &&
      previousRoom.drawerId === data.room.drawerId;
    const room = {
      ...data.room,
      drawEvents: hasDrawEvents ? data.room.drawEvents : (sameCanvas ? previousRoom.drawEvents : [])
    };
    const didRender = applyRoomState(room);
    syncDrawEvents(room.drawEvents, didRender);
    const maxSeq = room.drawEvents.reduce((max, event) => Math.max(max, event.seq || 0), 0);
    state.room.lastDrawSeq = Number.isFinite(room.drawSeq) ? room.drawSeq : maxSeq;
  } else if (data.type === "draw") {
    if (state.room) {
      if (data.seq && data.seq !== (state.room.lastDrawSeq || 0) + 1) {
        // Gap detected; request a full resync
        sendWS("sync");
      }
      state.room.lastDrawSeq = data.seq || 0;
      state.room.drawEvents.push(data.event);
      if (state.room.drawEvents.length > 700) state.room.drawEvents.splice(0, state.room.drawEvents.length - 700);
      syncDrawEvents(state.room.drawEvents, false);
    }
  } else if (data.type === "error") {
    setError(data.message || "حصل خطأ.");
  }
}

function wsUrl(roomCode, playerId) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws?room=${encodeURIComponent(roomCode)}&player=${encodeURIComponent(playerId)}`;
}

function sendWS(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return false;
  try {
    state.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  } catch {
    return false;
  }
}

function connectWS(room, playerId) {
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.close();
  }
  const ws = new WebSocket(wsUrl(room.code, playerId));
  state.ws = ws;

  let heartbeatTimer = null;
  let lastServerMessage = Date.now();
  const startHeartbeat = () => {
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastServerMessage > 35000) {
        ws.close();
        return;
      }
      sendWS("ping");
    }, 10000);
  };

  ws.onopen = () => {
    state.wsReconnectDelay = 1000;
    state.reconnecting = false;
    sendWS("auth", { room: room.code, player: playerId });
    startHeartbeat();
  };

  ws.onmessage = event => {
    lastServerMessage = Date.now();
    try {
      handleServerMessage(JSON.parse(event.data));
    } catch {
      // ignore malformed messages
    }
  };

  ws.onerror = () => setError("محاولة إعادة الاتصال...");

  ws.onclose = () => {
    clearInterval(heartbeatTimer);
    state.ws = null;
    setError("محاولة إعادة الاتصال...");
    if (state.room) {
      setTimeout(() => connectWS(state.room, state.playerId), state.wsReconnectDelay);
      state.wsReconnectDelay = Math.min(state.wsReconnectDelay * 1.5, 5000);
    }
  };
}

function tryReconnect() {
  const urlRoom = (new URLSearchParams(location.search).get("room") || new URLSearchParams(location.search).get("code") || "").trim().toUpperCase();
  if (urlRoom) return renderHome();
  const savedCode = (localStorage.getItem("shakhbata:roomCode") || "").trim().toUpperCase();
  const savedPlayerId = localStorage.getItem("shakhbata:playerId") || "";
  if (!savedCode || !savedPlayerId) return renderHome();
  state.code = savedCode;
  state.playerId = savedPlayerId;
  state.reconnecting = true;
  renderHome();
  connectWS({ code: savedCode }, savedPlayerId);
}

function isLocalDrawerDrawing() {
  return state.isDrawing && state.room?.status === "playing" && state.room.drawerId === state.playerId;
}

function shouldDeferRenderForDrawing(currentRoom, nextRoom) {
  return state.isDrawing &&
    currentRoom?.status === "playing" &&
    nextRoom?.status === "playing" &&
    currentRoom.round === nextRoom.round &&
    currentRoom.drawerId === state.playerId &&
    nextRoom.drawerId === state.playerId;
}

function clearDrawingState() {
  state.isDrawing = false;
  state.strokeId = "";
  state.pendingPoints = [];
}

function roomRenderKey(room) {
  return JSON.stringify({
    code: room.code,
    isPublic: room.isPublic,
    status: room.status,
    round: room.round,
    totalRounds: room.totalRounds,
    drawerId: room.drawerId,
    drawerName: room.drawerName,
    wordLength: room.wordLength,
    wordPattern: room.wordPattern,
    revealedWord: room.revealedWord,
    hintLetters: room.hintLetters,
    wordOptions: room.wordOptions,
    autoStartAt: room.autoStartAt,
    players: room.players.map(player => [player.id, player.name, player.score, player.guessed]),
    chatTail: room.chat.slice(-8).map(message => [message.id, message.kind, message.text])
  });
}

function applyRoomState(room) {
  const nextRenderKey = roomRenderKey(room);
  const deferRender = shouldDeferRenderForDrawing(state.room, room);
  state.room = room;
  if (nextRenderKey !== state.renderKey) {
    if (deferRender) {
      state.pendingRenderKey = nextRenderKey;
      patchLiveUI(room);
      return false;
    }
    if (state.isDrawing && !deferRender) clearDrawingState();
    state.renderKey = nextRenderKey;
    state.pendingRenderKey = "";
    render();
    return true;
  }
  return false;
}

function patchLiveUI(room) {
  const me = room.players.find(player => player.id === state.playerId);
  const timer = document.querySelector("[data-timer]");
  if (timer && room.endsAt) {
    const left = Math.max(0, Math.ceil((room.endsAt - Date.now()) / 1000));
    timer.textContent = left;
    timer.classList.toggle("low", left <= 10);
  }
  const chat = document.querySelector("[data-chat]");
  if (chat && room.chat.length) {
    const currentIds = new Set(Array.from(chat.children).map(child => child.dataset.id).filter(Boolean));
    const newMessages = room.chat.filter(message => !currentIds.has(message.id));
    for (const message of newMessages) {
      const div = document.createElement("div");
      div.innerHTML = messageHtml(message);
      chat.appendChild(div.firstElementChild);
    }
    if (newMessages.length) chat.scrollTop = chat.scrollHeight;
  }
  const scoreList = document.querySelector(".score-list");
  if (scoreList) {
    const players = activePlayers(room);
    const ranking = [...players].sort((a, b) => b.score - a.score);
    scoreList.innerHTML = ranking.slice(0, 3).map(player => `
      <span class="score-chip ${player.id === room.drawerId ? "drawer-chip" : ""}" title="${escapeHtml(player.name)}">${escapeHtml(compactName(player.name))} · ${player.score}</span>
    `).join("") + (ranking.length > 3 ? `<span class="score-chip">+${ranking.length - 3}</span>` : "");
  }
  const word = document.querySelector(".word-row .word");
  if (word) {
    const isDrawer = room.drawerId === state.playerId;
    const isChoosing = room.status === "choosing";
    const display = room.revealedWord || room.wordPattern || "".padStart(room.wordLength, "_");
    word.innerHTML = wordDisplay(room, isDrawer, isChoosing, display);
  }
  const statusLine = document.querySelector(".game-header .small");
  if (statusLine) {
    const isDrawer = room.drawerId === state.playerId;
    const isChoosing = room.status === "choosing";
    statusLine.textContent = isChoosing ? (isDrawer ? "اختاروا كلمة للرسم" : `اختيار الكلمة: ${room.drawerName}`) : (isDrawer ? "دورك في الرسم" : `الرسام: ${room.drawerName}`);
  }
  const pointsPill = document.querySelector(".game-header .pill");
  if (pointsPill) pointsPill.textContent = `نقاطك: ${me?.score || 0}`;
}

function syncDrawEvents(events = [], forceFullRedraw = false) {
  const canvas = document.querySelector("#board");
  if (!canvas) {
    state.drawEventCursor = events.length;
    state.strokes = replayableStrokes(events);
    return;
  }

  const newEvents = events.slice(state.drawEventCursor);
  const needsFullRedraw = forceFullRedraw ||
    state.drawEventCursor > events.length ||
    newEvents.some(event => event.type === "clear" || event.type === "undo");

  if (needsFullRedraw) {
    state.strokes = replayableStrokes(events);
    state.drawEventCursor = events.length;
    redrawCanvas();
    return;
  }

  for (const event of newEvents) {
    if (event.type !== "stroke" || !event.points?.length) continue;
    state.strokes.push(event);
    if (!isLocalDrawerDrawing()) drawStroke(event);
  }
  state.drawEventCursor = events.length;
}

function persistPlayer(data) {
  state.room = data.room;
  state.renderKey = "";
  state.drawEventCursor = 0;
  state.pendingRenderKey = "";
  state.playerId = data.playerId || state.playerId;
  state.code = data.room.code;
  state.wsReconnectDelay = 1000;
  localStorage.setItem("shakhbata:name", state.name);
  localStorage.setItem("shakhbata:playerId", state.playerId);
  localStorage.setItem("shakhbata:roomCode", data.room.code);
  connectWS(data.room, state.playerId);
}

function replayableStrokes(events = []) {
  const strokes = [];
  for (const event of events) {
    if (event.type === "clear") strokes.length = 0;
    if (event.type === "undo") {
      for (let index = strokes.length - 1; index >= 0; index -= 1) {
        if (strokes[index].strokeId === event.strokeId) strokes.splice(index, 1);
      }
    }
    if (event.type === "stroke") strokes.push(event);
  }
  return strokes;
}

function render() {
  if (!state.room) return renderHome();
  if (state.room.status === "lobby") return renderLobby();
  if (state.room.status === "ended") return renderEnded();
  return renderGame();
}

function renderHome() {
  const currentUrlCode = (new URLSearchParams(location.search).get("room") || new URLSearchParams(location.search).get("code") || "").trim().toUpperCase();
  const invitedCode = state.reconnecting ? "" : currentUrlCode;
  const showRejoin = !state.reconnecting && state.code && state.playerId && !currentUrlCode;
  app.className = "app home-hero";
  app.innerHTML = html`
    <section class="panel">
      <div class="brand-bar">
        <div class="logo"><span class="logo-mark">ش</span> شخبطة</div>
        <span class="pill">موبايل • عربي • بدون تسجيل</span>
      </div>
      <div class="scribble-scene" aria-hidden="true">
        <svg class="home-drawing" viewBox="0 0 360 150" role="img">
          <path class="draw-line sun" d="M286 31 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0 M286 6 v12 M286 44 v12 M261 31 h12 M299 31 h12 M268 13 l8 8 M296 41 l8 8 M304 13 l-8 8 M276 41 l-8 8" />
          <path class="draw-line house" d="M42 104 L42 72 L78 45 L114 72 L114 104 Z M58 104 L58 82 L76 82 L76 104 M91 87 h13 M46 72 h64" />
          <path class="draw-line cat" d="M168 98 C143 96 130 80 136 61 L127 43 L149 51 C160 43 180 43 191 51 L213 43 L204 61 C210 81 194 98 168 98 Z M151 68 q8 -8 16 0 M181 68 q8 -8 16 0 M174 79 l-5 5 l-5 -5 M166 87 q7 5 14 0 M142 77 h-24 M142 84 h-26 M194 77 h24 M194 84 h26" />
          <path class="draw-line pencil" d="M234 112 L303 80 L315 92 L246 124 Z M303 80 L310 71 L324 85 L315 92 M246 124 L231 129 L234 112" />
          <path class="draw-fill accent-fill" d="M58 104 L58 82 L76 82 L76 104 Z" />
          <path class="draw-fill cat-fill" d="M168 98 C143 96 130 80 136 61 L127 43 L149 51 C160 43 180 43 191 51 L213 43 L204 61 C210 81 194 98 168 98 Z" />
        </svg>
      </div>
      ${showRejoin ? html`
        <div class="rejoin-banner">
          <p class="small">عندك لعبة مفتوحة من قبل</p>
          <button class="btn" data-rejoin style="width:100%;margin-top:6px">ارجعوا للعبة</button>
          <button class="btn ghost" data-forget-rejoin style="width:100%;margin-top:6px">لعبة جديدة</button>
        </div>
      ` : ""}
      <h1 class="title">${invitedCode ? "ادخلوا الغرفة" : "ارسمها، وخليهم يخمنوا."}</h1>
      <p class="subtitle">${invitedCode ? `اكتبوا اسمكم وانضموا مباشرة لغرفة ${escapeHtml(invitedCode)}.` : "ادخلوا باسمكم، اعملوا غرفة بكود، وابدأوا جولات رسم وتخمين عربية مع أصحابك."}</p>
      <label class="field">
        <span>اسمك</span>
        <input class="input" data-name maxlength="18" autocomplete="name" placeholder="مثلاً: حودة" value="${escapeHtml(state.name)}" />
      </label>
      <label class="field ${invitedCode ? "hidden-field" : ""}">
        <span>كود الغرفة</span>
        <input class="input" data-code maxlength="5" dir="ltr" placeholder="A7K3Q" value="${escapeHtml(invitedCode)}" />
      </label>
      ${invitedCode ? html`
        <button class="btn" data-join style="width:100%;margin-top:10px">انضمام للغرفة</button>
        <button class="btn ghost" data-cancel-invite style="width:100%;margin-top:10px">اختيار غرفة أخرى</button>
      ` : html`
        <div class="actions">
          <button class="btn" data-create>إنشاء غرفة</button>
          <button class="btn secondary" data-join>انضمام</button>
        </div>
        <button class="btn random-btn" data-quick style="width:100%;margin-top:10px">لعب عشوائي مع ناس</button>
      `}
      <div class="home-stats" data-home-stats>
        <span><strong>...</strong><small>لعبة</small></span>
        <span><strong>...</strong><small>لاعب</small></span>
        <span><strong>...</strong><small>تخمين صحيح</small></span>
      </div>
      <div class="error" data-error></div>
      <footer class="home-footer">
        <a href="https://adelsamir.com" target="_blank" rel="noopener noreferrer">Built by Adel Samir</a>
      </footer>
    </section>
  `;
  bindHome();
  loadHomeStats();
}

async function loadHomeStats() {
  const element = document.querySelector("[data-home-stats]");
  if (!element) return;
  try {
    const data = await fetchStats();
    const values = [data.totals.gamesStarted, data.totals.playerJoins, data.totals.correctGuesses];
    const strongs = element.querySelectorAll("strong");
    strongs.forEach((strong, index) => {
      strong.textContent = values[index];
      strong.style.animation = "none";
      strong.offsetHeight;
      strong.style.animation = "stat-pop 260ms var(--ease-pop) both";
    });
  } catch {
    element.style.display = "none";
  }
}

function bindHome() {
  const nameInput = document.querySelector("[data-name]");
  const codeInput = document.querySelector("[data-code]");
  const sync = () => {
    state.name = nameInput.value.trim();
    state.code = codeInput.value.trim().toUpperCase();
  };
  nameInput.addEventListener("input", sync);
  codeInput.addEventListener("input", sync);
  document.querySelector("[data-cancel-invite]")?.addEventListener("click", () => {
    state.code = "";
    clearRoomLink();
    renderHome();
  });
  document.querySelector("[data-rejoin]")?.addEventListener("click", () => {
    connectWS({ code: state.code }, state.playerId);
  });
  document.querySelector("[data-forget-rejoin]")?.addEventListener("click", () => {
    localStorage.removeItem("shakhbata:playerId");
    localStorage.removeItem("shakhbata:roomCode");
    state.playerId = "";
    state.code = "";
    renderHome();
  });
  document.querySelector("[data-create]")?.addEventListener("click", async () => {
    sync();
    try {
      const data = await api("/api/create", { name: state.name, deviceId });
      persistPlayer(data);
      clearRoomLink();
    } catch (error) {
      setError(error.message);
    }
  });
  document.querySelector("[data-join]")?.addEventListener("click", async () => {
    sync();
    try {
      const data = await api("/api/join", { name: state.name, code: state.code, playerId: state.playerId, deviceId });
      persistPlayer(data);
      clearRoomLink();
    } catch (error) {
      setError(error.message);
    }
  });
  document.querySelector("[data-quick]")?.addEventListener("click", async () => {
    sync();
    try {
      const data = await api("/api/quick-play", { name: state.name, playerId: state.playerId, deviceId });
      persistPlayer(data);
      clearRoomLink();
    } catch (error) {
      setError(error.message);
    }
  });
}

function activePlayers(room) {
  return room.players.filter(player => player.connected !== false);
}

function renderLobby() {
  const room = state.room;
  const isPublic = room.isPublic;
  const isHost = room.hostId === state.playerId && !isPublic;
  const players = activePlayers(room);
  app.className = "app lobby-screen";
  app.innerHTML = html`
    <header class="brand-bar">
      <div class="logo"><span class="logo-mark">ش</span> شخبطة</div>
      <button class="btn ghost" data-leave>خروج</button>
    </header>
    <section class="panel room-header ${isPublic ? "public-room" : ""}">
      <div>
        <div class="small">${isPublic ? "اللعب العشوائي" : "كود الغرفة"}</div>
        <div class="code">${isPublic ? "عام" : room.code}</div>
      </div>
      ${isPublic ? `<span class="matchmaking-dot" title="بحث"></span>` : `<button class="btn secondary" data-share>مشاركة</button>`}
    </section>
    <section class="panel">
      <div class="brand-bar">
        <strong>اللاعبين ${players.length}/${room.maxPlayers}</strong>
        <span class="small">${lobbyStatusText(room, isHost, players)}</span>
      </div>
      <div class="players" style="margin-top:10px">
        ${players.map(player => html`
          <div class="player">
            <strong>${escapeHtml(firstName(player.name))} ${player.id === room.hostId ? "★" : ""}</strong>
            <span>${player.score}</span>
          </div>
        `).join("")}
      </div>
    </section>
    ${isPublic ? publicLobbyPanel(room, players) : privateLobbyPanel(room, isHost, players)}
  `;
  bindLobby();
}

function lobbyStatusText(room, isHost, players) {
  if (room.isPublic) {
    if (players.length < 2) return "في انتظار لاعب عشوائي";
    return room.autoStartAt ? "الماتش بيبدأ حالاً" : "جاهزين";
  }
  return isHost ? "أنت مسؤول الغرفة" : "في انتظار البداية";
}

function publicLobbyPanel(room, players) {
  const waiting = players.length < 2;
  return html`
    <section class="panel matchmaking-panel">
      <strong>${waiting ? "بندور على ناس تلعب معاهم" : "لقينا لاعبين"}</strong>
      <div class="matchmaking-pulse" aria-hidden="true"><span></span><span></span><span></span></div>
      <p class="small">${waiting ? "سيب الشاشة مفتوحة. أول ما ينضم لاعب تاني الماتش هيبدأ تلقائياً." : "استعدوا. اختيار الكلمات هيبدأ بعد ثواني."}</p>
      <div class="error" data-error></div>
    </section>
  `;
}

function privateLobbyPanel(room, isHost, players) {
  const canStart = isHost && players.length >= 2;
  return html`
    <section class="panel">
      <div class="settings-grid">
        <label class="field"><span>الجولات</span><select class="select" data-rounds ${isHost ? "" : "disabled"}>${[2,3,4,5,6,8,10].map(v => `<option ${room.totalRounds === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="field"><span>الثواني</span><select class="select" data-time ${isHost ? "" : "disabled"}>${[45,60,70,90,120].map(v => `<option ${room.drawTime === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="field"><span>العدد</span><select class="select" data-max ${isHost ? "" : "disabled"}>${[4,6,8,10,12].map(v => `<option ${room.maxPlayers === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      </div>
      <button class="btn" data-start style="width:100%;margin-top:12px" ${canStart ? "" : "disabled"}>بدء اللعبة</button>
      <div class="error" data-error>${players.length < 2 ? "تحتاج لاعبين متصلين على الأقل للبدء." : ""}</div>
    </section>
  `;
}

function bindLobby() {
  document.querySelector("[data-leave]").addEventListener("click", leaveRoom);
  document.querySelector("[data-share]")?.addEventListener("click", async () => {
    const link = roomLink(state.room.code);
    if (navigator.share) {
      await navigator.share({ title: `شخبطة - غرفة ${state.room.code}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
    }
  });
  document.querySelector("[data-start]")?.addEventListener("click", () => {
    sendWS("start");
  });
  for (const selector of ["[data-rounds]", "[data-time]", "[data-max]"]) {
    const element = document.querySelector(selector);
    if (!element || element.disabled) continue;
    element.addEventListener("change", () => {
      sendWS("room-settings", {
        rounds: document.querySelector("[data-rounds]").value,
        drawTime: document.querySelector("[data-time]").value,
        maxPlayers: document.querySelector("[data-max]").value
      });
    });
  }
}

function renderGame() {
  const room = state.room;
  const me = room.players.find(player => player.id === state.playerId);
  const players = activePlayers(room);
  const isDrawer = room.drawerId === state.playerId;
  const isChoosing = room.status === "choosing";
  const isIntermission = room.status === "intermission";
  const isPlaying = room.status === "playing";
  const canGuess = isPlaying && !isDrawer;
  const canDraw = isPlaying && isDrawer;
  const word = room.revealedWord || room.wordPattern || "".padStart(room.wordLength, "_");
  const ranking = [...players].sort((a, b) => b.score - a.score);
  const statusText = isIntermission
    ? "جولة جديدة هتبدأ حالاً"
    : isChoosing
      ? (isDrawer ? "اختاروا كلمة للرسم" : `اختيار الكلمة: ${escapeHtml(room.drawerName)}`)
      : (isDrawer ? "دورك في الرسم" : `الرسام: ${escapeHtml(room.drawerName)}`);
  app.className = "app game-screen premium-game";
  app.innerHTML = html`
    <section class="stage ${isDrawer ? "" : "guesser-mode"} ${canDraw && state.sizeOpen ? "size-open" : ""}">
      <header class="game-header">
        <div class="brand-bar">
          <div>
            <strong>${isIntermission ? "استراحة قصيرة" : `جولة ${room.round}/${room.totalRounds}`}</strong>
            <div class="small">${statusText}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="pill">نقاطك: ${me?.score || 0}</span>
            <button class="btn ghost" data-leave style="padding:0 10px;height:32px;min-height:32px;font-size:12px">خروج</button>
          </div>
        </div>
        <div class="timer" data-timer>--</div>
      </header>
      <div class="score-list">
        ${ranking.slice(0, 3).map(player => html`
          <span class="score-chip ${player.id === room.drawerId ? "drawer-chip" : ""}" title="${escapeHtml(player.name)}">${escapeHtml(compactName(player.name))} · ${player.score}</span>
        `).join("")}
        ${ranking.length > 3 ? `<span class="score-chip">+${ranking.length - 3}</span>` : ""}
      </div>
      <div class="word-row panel">
        <div class="word">
          ${wordDisplay(room, isDrawer, isChoosing, word)}
        </div>
        <span class="small">${isIntermission ? "استعداد" : (isChoosing ? "اختيار" : (room.status === "reveal" ? "الكلمة" : `${room.wordLength} حروف`))}</span>
      </div>
      ${canDraw ? drawToolsHtml() : `<div class="tools panel round-note">${isIntermission ? "خليكوا هنا. اللعبة الجديدة بتبدأ تلقائياً." : (isChoosing ? (isDrawer ? "اختاروا بسرعة. لو الوقت خلص هنختار أول كلمة." : "استعدوا للتخمين...") : (isPlaying ? "اكتبوا تخمينكم في الدردشة" : "استراحة قصيرة قبل الجولة التالية"))}</div>`}
      <div class="canvas-wrap">
        ${isChoosing ? chooseBoardHtml(room, isDrawer) : `<canvas id="board"></canvas>`}
      </div>
      <section class="panel chat-panel">
        <div class="chat" data-chat>
          ${room.chat.map(message => messageHtml(message)).join("")}
        </div>
        <form class="guess-form" data-guess-form>
          <input class="input" data-guess placeholder="${guessPlaceholder(isDrawer, room.status)}" ${canGuess ? "" : "disabled"} maxlength="80" />
          <button class="btn" ${canGuess ? "" : "disabled"}>➤</button>
        </form>
      </section>
    </section>
  `;
  bindGame();
  redrawCanvas();
}

function wordDisplay(room, isDrawer, isChoosing, word) {
  if (room.status === "intermission") return "جولة جديدة خلال ثواني";
  if (isChoosing) return isDrawer ? "اختاروا كلمة للرسم" : "في انتظار اختيار الكلمة";
  if (isDrawer || room.revealedWord) return escapeHtml(room.revealedWord);
  const hints = new Map((room.hintLetters || []).map(hint => [hint.index, hint.letter]));
  return Array.from(word).map((_, index) => {
    if (word[index] === " ") return `<span class="word-space"></span>`;
    const letter = hints.get(index);
    return `<span class="letter ${letter ? "hinted" : ""}">${letter ? escapeHtml(letter) : ""}</span>`;
  }).join("");
}

function drawToolsHtml() {
  return html`
    <div class="tools panel ${state.sizeOpen ? "size-open" : ""}">
      <button class="icon-btn ${state.tool === "pen" ? "active" : ""}" data-tool="pen" title="قلم">✏</button>
      <button class="icon-btn ${state.tool === "eraser" ? "active" : ""}" data-tool="eraser" title="ممحاة">⌫</button>
      <div class="color-picker-wrap">
        <button class="color-current ${state.colorOpen ? "open" : ""}" style="background:${state.color}" title="لون القلم" data-toggle-color></button>
        ${state.colorOpen ? `<div class="color-picker-backdrop" data-color-backdrop></div>` : ""}
        <div class="color-dropdown ${state.colorOpen ? "open" : ""}">
          ${COLORS.map(color => html`
            <button class="color-swatch ${state.color === color ? "active" : ""}" data-color="${color}" style="background:${color}" aria-label="لون"></button>
          `).join("")}
        </div>
      </div>
      ${state.sizeOpen ? `<input class="size" data-size type="range" min="2" max="26" value="${state.size}" title="حجم القلم" />` : ""}
      <button class="icon-btn" data-undo title="تراجع">↶</button>
      <button class="icon-btn" data-clear title="مسح">✕</button>
    </div>
  `;
}

function chooseBoardHtml(room, isDrawer) {
  if (!isDrawer) {
    return html`
      <div class="choice-board waiting-board">
        <strong>اختيار الكلمة: ${escapeHtml(room.drawerName)}</strong>
        <span>أول ما يتم الاختيار، الجولة تبدأ والوقت يتحسب.</span>
      </div>
    `;
  }

  return html`
    <div class="choice-board">
      <strong>اختاروا واحدة ترسموها</strong>
      <div class="word-options">
        ${room.wordOptions.map(word => `<button class="word-option" data-word-choice="${escapeHtml(word)}">${escapeHtml(word)}</button>`).join("")}
      </div>
    </div>
  `;
}

function guessPlaceholder(isDrawer, status) {
  if (status === "intermission") return "الجولة الجديدة بتبدأ...";
  if (isDrawer) return status === "choosing" ? "اختاروا كلمة الأول" : "دورك ترسم في الجولة دي";
  return status === "choosing" ? "استنوا اختيار الكلمة" : "اكتبوا تخمينكم";
}

function messageHtml(message) {
  if (message.kind === "system") return `<div class="message system" data-id="${message.id}">${escapeHtml(message.text)}</div>`;
  if (message.kind === "hint") return `<div class="message hint" data-id="${message.id}">${escapeHtml(message.text)}</div>`;
  if (message.kind === "correct") return `<div class="message correct" data-id="${message.id}">${escapeHtml(message.text)}</div>`;
  return `<div class="message" data-id="${message.id}"><strong>${escapeHtml(firstName(message.name))}:</strong> ${escapeHtml(message.text)}</div>`;
}

function bindGame() {
  const chat = document.querySelector("[data-chat]");
  if (chat) chat.scrollTop = chat.scrollHeight;
  document.querySelector("[data-guess-form]").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.querySelector("[data-guess]");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendWS("guess", { text });
  });
  document.querySelectorAll("[data-tool]").forEach(button => {
    button.addEventListener("click", () => {
      const tool = button.dataset.tool;
      if (tool === "pen") {
        state.sizeOpen = state.tool === "pen" ? !state.sizeOpen : true;
      } else {
        state.sizeOpen = false;
      }
      state.tool = tool;
      render();
    });
  });
  document.querySelectorAll("[data-word-choice]").forEach(button => {
    button.addEventListener("click", () => {
      sendWS("choose-word", { word: button.dataset.wordChoice });
    });
  });
  document.querySelector("[data-toggle-color]")?.addEventListener("click", () => {
    state.colorOpen = !state.colorOpen;
    render();
  });
  document.querySelector("[data-color-backdrop]")?.addEventListener("click", () => {
    state.colorOpen = false;
    render();
  });
  document.querySelectorAll("[data-color]").forEach(button => {
    button.addEventListener("click", () => {
      state.color = button.dataset.color;
      state.colorOpen = false;
      state.tool = "pen";
      state.sizeOpen = true;
      render();
    });
  });
  document.querySelector("[data-size]")?.addEventListener("input", event => {
    state.size = Number(event.target.value);
  });
  document.querySelector("[data-undo]")?.addEventListener("click", () => {
    const lastStroke = state.strokes[state.strokes.length - 1];
    if (lastStroke) sendDraw({ type: "undo", strokeId: lastStroke.strokeId });
  });
  document.querySelector("[data-clear]")?.addEventListener("click", () => sendDraw({ type: "clear" }));
  document.querySelector("[data-leave]")?.addEventListener("click", leaveRoom);
  setupCanvas();
  tickTimer();
}

function renderEnded() {
  const ranking = [...state.room.players].sort((a, b) => b.score - a.score);
  app.className = "app end-screen";
  app.innerHTML = html`
    <header class="brand-bar">
      <div class="logo"><span class="logo-mark">ش</span> شخبطة</div>
      <button class="btn ghost" data-leave>خروج</button>
    </header>
    <section class="panel">
      <h1 class="title">النتيجة النهائية</h1>
      <div class="ended-list">
        ${ranking.map(player => `<div class="rank"><strong>${escapeHtml(firstName(player.name))}</strong><span>${player.score} نقطة</span></div>`).join("")}
      </div>
      <button class="btn" data-share style="width:100%;margin-top:12px">مشاركة النتيجة</button>
    </section>
  `;
  document.querySelector("[data-leave]").addEventListener("click", leaveRoom);
  document.querySelector("[data-share]").addEventListener("click", async () => {
    const text = `نتيجة شخبطة:\n${ranking.map((p, i) => `${i + 1}. ${firstName(p.name)}: ${p.score}`).join("\n")}`;
    if (navigator.share) await navigator.share({ text });
    else await navigator.clipboard.writeText(text);
  });
}

function leaveRoom() {
  if (state.ws) {
    state.ws.onclose = null;
    state.ws.close();
    state.ws = null;
  }
  state.room = null;
  state.code = "";
  state.renderKey = "";
  state.drawEventCursor = 0;
  state.pendingRenderKey = "";
  resetCanvasCache();
  localStorage.removeItem("shakhbata:roomCode");
  renderHome();
}

function resetCanvasCache() {
  state.canvas.element = null;
  state.canvas.ctx = null;
  state.canvas.cssWidth = 0;
  state.canvas.cssHeight = 0;
  state.canvas.scale = 1;
  state.canvas.rect = null;
}

function setupCanvas() {
  const canvas = document.querySelector("#board");
  if (!canvas) return;
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);
  canvas.width = Math.floor(cssWidth * scale);
  canvas.height = Math.floor(cssHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  state.canvas = {
    element: canvas,
    ctx,
    cssWidth,
    cssHeight,
    scale,
    rect: canvas.getBoundingClientRect()
  };
  redrawCanvas();
  const isDrawer = state.room.drawerId === state.playerId && state.room.status === "playing";
  if (!isDrawer) return;
  canvas.addEventListener("pointerdown", startStroke);
  canvas.addEventListener("pointermove", moveStroke);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
}

function pointFromEvent(event) {
  const canvasState = state.canvas;
  const rect = canvasState.rect || canvasState.element?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return {
    x: Number(((event.clientX - rect.left) / rect.width).toFixed(4)),
    y: Number(((event.clientY - rect.top) / rect.height).toFixed(4))
  };
}

function pointDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function startStroke(event) {
  event.preventDefault();
  state.canvas.rect = state.canvas.element?.getBoundingClientRect() || state.canvas.rect;
  state.isDrawing = true;
  state.strokeId = crypto.randomUUID();
  state.pendingPoints = [pointFromEvent(event)];
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function moveStroke(event) {
  if (!state.isDrawing) return;
  event.preventDefault();
  const point = pointFromEvent(event);
  const previous = state.pendingPoints[state.pendingPoints.length - 1];
  if (pointDistance(point, previous) < 0.0015) return;
  state.pendingPoints.push(point);
  drawStroke({ points: [previous, point], color: activeColor(), size: state.size, tool: state.tool });
  const now = Date.now();
  if (now - state.lastSentAt > 55 && state.pendingPoints.length > 1) flushStroke(false);
}

function endStroke(event) {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  event?.currentTarget?.releasePointerCapture?.(event.pointerId);
  flushStroke(true);
  if (state.pendingRenderKey) {
    state.renderKey = state.pendingRenderKey;
    state.pendingRenderKey = "";
    render();
    syncDrawEvents(state.room?.drawEvents || [], true);
  }
}

function activeColor() {
  return state.tool === "eraser" ? "#ffffff" : state.color;
}

function flushStroke(force) {
  if (!force && state.pendingPoints.length < 2) return;
  sendDraw({
    type: "stroke",
    strokeId: state.strokeId,
    points: state.pendingPoints,
    color: activeColor(),
    size: state.size,
    tool: state.tool
  });
  state.pendingPoints = state.pendingPoints.slice(-1);
  state.lastSentAt = Date.now();
}

function sendDraw(event) {
  sendWS("draw", { event });
}

function redrawCanvas() {
  const { ctx, cssWidth, cssHeight } = state.canvas;
  if (!ctx) return;
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  for (const stroke of state.strokes) drawStroke(stroke);
}

function drawStroke(stroke) {
  const { ctx, cssWidth, cssHeight } = state.canvas;
  if (!ctx || !stroke.points?.length) return;
  ctx.strokeStyle = stroke.tool === "eraser" ? "#ffffff" : stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.beginPath();
  stroke.points.forEach((point, index) => {
    const x = point.x * cssWidth;
    const y = point.y * cssHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function tickTimer() {
  const timer = document.querySelector("[data-timer]");
  if (!timer || !state.room?.endsAt) return;
  const left = Math.max(0, Math.ceil((state.room.endsAt - Date.now()) / 1000));
  timer.textContent = left;
  timer.classList.toggle("low", left <= 10);
  setTimeout(tickTimer, 350);
}

tryReconnect();
