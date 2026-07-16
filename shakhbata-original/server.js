const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STATS_PATH = path.join(DATA_DIR, "stats.json");
const rooms = new Map();

const words = [
  "قطة", "كلب", "أسد", "فيل", "سمكة", "عصفور", "حصان", "جمل", "أرنب", "سلحفاة",
  "زرافة", "نمر", "دب", "ثعلب", "ذئب", "قرد", "غزال", "تمساح", "بطريق", "كنغر",
  "بطة", "دجاجة", "ديك", "بقرة", "خروف", "ماعز", "حمار", "فأر", "خفاش", "نحلة",
  "فراشة", "نملة", "عنكبوت", "أخطبوط", "دلفين", "قرش", "حوت", "ضفدع", "بومة", "نسر",
  "حمامة", "ببغاء", "طاووس", "قنفذ", "حلزون", "سرطان", "حصان بحر", "كوالا", "باندا", "راكون",
  "بيت", "كرسي", "طاولة", "باب", "شباك", "سرير", "مصباح", "ساعة", "هاتف", "كتاب",
  "مفتاح", "شنطة", "حذاء", "قلم", "دفتر", "كوب", "طبق", "شوكة", "ملعقة", "سكين",
  "ثلاجة", "غسالة", "فرن", "مروحة", "تلفزيون", "ريموت", "مرآة", "مشط", "فرشاة", "صابون",
  "منشفة", "مخدة", "بطانية", "سجادة", "ستارة", "خزانة", "درج", "سلم", "مصعد", "جرس",
  "شمعة", "كاميرا", "سماعة", "كمبيوتر", "لابتوب", "شاحن", "بطارية", "مظلة", "خيمة", "خريطة",
  "بيتزا", "كشري", "فول", "كنافة", "شاورما", "عصير", "تفاحة", "موز", "قهوة", "آيس كريم",
  "برجر", "بطاطس", "مكرونة", "أرز", "دجاج", "سمك", "بيض", "جبنة", "خبز", "فطير",
  "محشي", "ملوخية", "فتة", "طعمية", "حمص", "تبولة", "ورق عنب", "كبسة", "مندي", "مقلوبة",
  "منسف", "مسقعة", "شوربة", "سلطة", "بطيخ", "عنب", "برتقال", "فراولة", "مانجو", "أناناس",
  "ليمون", "خيار", "طماطم", "جزر", "بصل", "فلفل", "ذرة", "فشار", "شوكولاتة", "بسكويت",
  "كيك", "دونات", "عسل", "لبن", "شاي", "ماء", "تمر", "لوز", "فستق", "زبادي",
  "طبيب", "مهندس", "مدرس", "شرطي", "طباخ", "لاعب", "رسام", "طيار", "مصور", "مذيع",
  "ممرض", "محامي", "قاضي", "نجار", "حداد", "كهربائي", "سباك", "بائع", "خباز", "حلاق",
  "مزارع", "صياد", "بحار", "سائق", "مغني", "ممثل", "كاتب", "صحفي", "مترجم", "مبرمج",
  "مصمم", "حارس", "رجل إطفاء", "رائد فضاء", "عالم", "طبيب أسنان", "صيدلي", "مدرب", "حكم", "مخرج",
  "بحر", "مدرسة", "حديقة", "مطار", "سينما", "مسجد", "مكتبة", "مستشفى", "ملعب", "سوق",
  "مطعم", "مقهى", "فندق", "بنك", "متحف", "جامعة", "مزرعة", "ميناء", "محطة", "جزيرة",
  "صحراء", "غابة", "كهف", "شاطئ", "نهر", "بحيرة", "جسر", "برج", "قلعة", "قصر",
  "ملاهي", "حديقة حيوان", "مكتب", "مصنع", "مخبز", "صيدلية", "بقالة", "ورشة", "مسرح", "استاد",
  "كرة", "سيارة", "قطار", "قارب", "شمس", "قمر", "نجمة", "مطر", "جبل", "نظارة"
  , "دراجة", "دراجة نارية", "طائرة", "حافلة", "تاكسي", "مترو", "سفينة", "غواصة", "صاروخ", "إسعاف",
  "عربة", "إشارة مرور", "طريق", "نفق", "رصيف", "عجلة", "خوذة", "حزام", "بنزين", "بوصلة",
  "كرة قدم", "كرة سلة", "تنس", "سباحة", "جري", "ملاكمة", "مصارعة", "تزلج", "غوص", "رماية",
  "شطرنج", "طاولة زهر", "بلياردو", "كاراتيه", "يوجا", "مضرب", "شبكة", "كأس", "ميدالية", "صافرة",
  "سحابة", "برق", "رعد", "ثلج", "رياح", "وردة", "شجرة", "نخلة", "صبار", "عشب",
  "بركان", "قوس قزح", "كوكب", "فضاء", "سفينة فضاء", "مجرة", "نار", "دخان", "حجر", "رمل",
  "قميص", "بنطلون", "فستان", "قبعة", "جاكيت", "جورب", "قفاز", "خاتم", "ساعة يد", "سلسلة",
  "فرعون", "مومياء", "هرم", "أبو الهول", "فانوس", "طبلة", "عود", "مزمار", "رقصة", "ميكروفون",
  "روبوت", "واي فاي", "رسالة", "إيميل", "لعبة", "كنترول", "سماعات", "ماوس", "كيبورد", "طابعة",
  "مغناطيس", "تلسكوب", "مجهر", "دواء", "حقنة", "ضمادة", "ميزان", "كيس", "صندوق", "هدية",
  "بالون", "طائرة ورق", "عجلة ملاهي", "زحليقة", "مرجيحة", "دمية", "دبدوب", "لغز", "قناع", "تاج",
  "كنبة", "بلكونة", "حمام", "مطبخ", "صالون", "غرفة", "سطح", "حوش", "بوابة", "جراج",
  "زحمة", "كوبري", "كشك", "توك توك", "ميكروباص", "موبايل", "فلوس", "عملة", "محفظة", "فاتورة",
  "مدرسة", "سبورة", "طباشير", "مسطرة", "ممحاة", "حقيبة مدرسية", "امتحان", "جرس المدرسة", "معمل", "فسحة",
  "ساحر", "وحش", "تنين", "كنز", "خريطة كنز", "سيف", "درع", "سهم", "قلعة رمل", "مصباح سحري",
  "كابتن", "قرصان", "غواص", "ملك", "ملكة", "أمير", "أميرة", "جندي", "شرطي مرور", "لص",
  "حلاق", "عريس", "عروسة", "طفل", "جد", "جدة", "عائلة", "صديق", "جار", "ضيف"
];

const blockedWords = [
  // General insults
  "غبي", "اغبيا", "غباء",
  "اهبل", "هبل", "هبلة",
  "عبيط", "عبيطة",
  "احا", "احه", "اهان", "احنة",
  "سافل", "سافلة", "سفالة",
  "واطي", "واطية",
  "حقير", "حقيرة", "حقارة",
  "خسيس", "خسيسة",
  "قذر", "قذارة",
  "نجس", "نجاسة",
  "زبالة", "زباله", "زبالين",
  "وسخ", "وسخة", "وساخين",
  "بضان", "بضانك",
  // Sexual/profane
  "كسم", "كسمك", "كسمها", "كسمهم", "كسمكما", "ياكسم",
  "كس", "كوس", "كسها", "كسك", "كسي",
  "زب", "زبي", "زبك", "زبو", "زبها", "يازب",
  "طيز", "طيزك", "طيزي", "طيزها",
  "بز", "بزاز", "بزها",
  "بظر", "بظري",
  "خرا", "خرى", "خره", "خراء",
  "براز", "بول", "مني", "قضيب", "فرج", "فروج",
  "نيك", "ناك", "ينيك", "بنيك", "منيك", "منيكة", "منيكه", "منيكين", "منيوك", "منيوكة", "منيوكين",
  "فشخ", "فشخت", "فشخة",
  // Slurs against women
  "شرموطة", "شرموط", "شرموطه", "شرموطين", "شرموطات",
  "قحبة", "قحبه", "قحاب",
  "لبوة", "لبوه", "لبات",
  "عاهرة", "عاهرات", "داعرة", "فاسقة",
  // Slurs against men
  "خول", "خواتين", "خولات",
  "عرص", "عرصة", "عراص", "عرصات",
  "متناك", "متناكة", "متناكين",
  "زامل", "زامله", "زاملين",
  "ديوث", "ديوثة", "ديوثين",
  // LGBTQ+ slurs
  "لواط", "لوطي", "لوطيين", "سحاق", "سحاقية", "سحاقيات", "شاذ", "شاذين", "شذوذ", "ميوع",
  // Religious/ethnic slurs
  "كافر", "كافرة", "كفرة",
  "يهودي", "يهود", "نصراني", "صليبي",
  "زنجي", "زنوج",
  // Ableist slurs
  "معاق", "معاقين", "مجنون", "مجانين", "عبيط"
];

const defaultStats = () => ({
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  totals: {
    roomsCreated: 0,
    publicRoomsCreated: 0,
    privateRoomsCreated: 0,
    playerJoins: 0,
    publicPlayerJoins: 0,
    privatePlayerJoins: 0,
    gamesStarted: 0,
    publicGamesStarted: 0,
    privateGamesStarted: 0,
    gamesCompleted: 0,
    publicGamesCompleted: 0,
    privateGamesCompleted: 0,
    roundsStarted: 0,
    roundsCompleted: 0,
    guesses: 0,
    correctGuesses: 0,
    closeGuesses: 0,
    chatMessages: 0,
    drawEvents: 0,
    strokes: 0,
    clears: 0,
    undos: 0
  },
  max: {
    concurrentRooms: 0,
    concurrentPlayers: 0,
    playersInRoom: 0
  },
  words: {}
});

function mergeDefaults(base, fallback) {
  for (const [key, value] of Object.entries(fallback)) {
    if (base[key] === undefined) base[key] = value;
    else if (value && typeof value === "object" && !Array.isArray(value)) mergeDefaults(base[key], value);
  }
  return base;
}

function loadStats() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STATS_PATH)) {
      const fresh = defaultStats();
      fs.writeFileSync(STATS_PATH, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    return mergeDefaults(JSON.parse(fs.readFileSync(STATS_PATH, "utf8")), defaultStats());
  } catch (error) {
    console.error("Could not load stats:", error);
    return defaultStats();
  }
}

const stats = loadStats();
let saveStatsTimer = null;

function saveStats() {
  stats.updatedAt = new Date().toISOString();
  if (saveStatsTimer) {
    saveStatsTimer.refresh();
    return;
  }
  saveStatsTimer = setTimeout(() => {
    saveStatsTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error("Could not save stats:", error);
    }
  }, 1000);
}

function bump(pathKey, amount = 1) {
  const parts = pathKey.split(".");
  let target = stats;
  for (const part of parts.slice(0, -1)) target = target[part] ||= {};
  target[parts[parts.length - 1]] = (Number(target[parts[parts.length - 1]]) || 0) + amount;
  saveStats();
}

function bumpDrawStats(type) {
  stats.totals.drawEvents += 1;
  if (type === "clear") stats.totals.clears += 1;
  else if (type === "undo") stats.totals.undos += 1;
  else stats.totals.strokes += 1;
  saveStats();
}

function updateMaxStats(room = null) {
  const livePlayers = [...rooms.values()].reduce((sum, item) => sum + connectedCount(item), 0);
  stats.max.concurrentRooms = Math.max(stats.max.concurrentRooms, rooms.size);
  stats.max.concurrentPlayers = Math.max(stats.max.concurrentPlayers, livePlayers);
  if (room) stats.max.playersInRoom = Math.max(stats.max.playersInRoom, room.players.length);
  saveStats();
}

function trackWord(word, key) {
  if (!word) return;
  const entry = stats.words[word] ||= { chosen: 0, guessed: 0 };
  entry[key] = (Number(entry[key]) || 0) + 1;
  saveStats();
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? roomCode() : code;
}

function normalizeText(value = "") {
  return String(value)
    .trim()
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[^\u0600-\u06FFa-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function containsBlockedWord(value = "") {
  const normalized = normalizeText(value);
  const compact = normalized.replace(/\s+/g, "");
  return blockedWords.some(word => {
    const nw = normalizeText(word);
    return normalized.includes(nw) || compact.includes(nw);
  });
}

function editDistance(a, b) {
  const left = Array.from(a);
  const right = Array.from(b);
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[left.length][right.length];
}

function isCloseGuess(guess, word) {
  const normalizedGuess = normalizeText(guess);
  const normalizedWord = normalizeText(word);
  if (!normalizedGuess || normalizedGuess === normalizedWord || normalizedWord.length < 3) return false;
  const compactGuess = normalizedGuess.replace(/\s+/g, "");
  const compactWord = normalizedWord.replace(/\s+/g, "");
  const distance = Math.min(editDistance(normalizedGuess, normalizedWord), editDistance(compactGuess, compactWord));
  const limit = normalizedWord.length <= 5 ? 1 : 2;
  return distance <= limit;
}

function cleanName(name) {
  const cleaned = String(name || "").trim().slice(0, 18);
  if (!cleaned || cleaned.length < 1 || containsBlockedWord(cleaned)) {
    return null;
  }
  return cleaned;
}

function firstName(name = "") {
  return String(name).trim().split(/\s+/)[0] || name;
}

function publicRoom(room, viewerId = "", includeDrawEvents = true) {
  const currentWord = room.word || "";
  const canSeeWord = room.status === "reveal" || room.status === "ended" || viewerId === room.drawerId;
  const canChooseWord = room.status === "choosing" && viewerId === room.drawerId;
  const canSeeHints = room.status === "playing" && viewerId !== room.drawerId;
  const visibleChat = room.chat.filter(message => !message.toPlayerId || message.toPlayerId === viewerId);
  return {
    code: room.code,
    isPublic: room.isPublic,
    hostId: room.hostId,
    status: room.status,
    round: room.round,
    totalRounds: room.settings.rounds,
    drawTime: room.settings.drawTime,
    maxPlayers: room.settings.maxPlayers,
    drawerId: room.drawerId,
    drawerName: room.players.find(player => player.id === room.drawerId)?.name || "",
    wordLength: currentWord.replace(/\s+/g, "").length,
    wordPattern: currentWord.replace(/[^\s]/g, "_"),
    revealedWord: canSeeWord ? currentWord : "",
    hintLetters: canSeeHints ? visibleHintLetters(room) : [],
    wordOptions: canChooseWord ? room.wordOptions : [],
    endsAt: room.endsAt,
    autoStartAt: room.autoStartAt,
    players: room.players
      .filter(player => player.connected)
      .map(player => ({
        id: player.id,
        name: firstName(player.name),
        score: player.score,
        guessed: player.guessed,
        muted: player.muted,
        connected: player.connected
      })),
    chat: visibleChat.slice(-80),
    drawSeq: room.drawSeq,
    ...(includeDrawEvents ? { drawEvents: room.drawEvents.slice(-600) } : {}),
    lastWinner: room.lastWinner
  };
}

function broadcast(room) {
  for (const client of room.clients) {
    if (client.readyState !== 1) continue;
    try {
      const payload = JSON.stringify({ type: "state", room: publicRoom(room, client.playerId || "", false) });
      client.send(payload);
    } catch {
      // ignore send errors; cleanup happens on close
    }
  }
}

function broadcastDraw(room, event) {
  room.drawSeq += 1;
  event.seq = room.drawSeq;
  const payload = JSON.stringify({ type: "draw", seq: room.drawSeq, event });
  for (const client of room.clients) {
    if (client.readyState !== 1) continue;
    try {
      client.send(payload);
    } catch {
      // ignore send errors
    }
  }
}

function addChat(room, entry) {
  room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...entry });
  if (room.chat.length > 120) room.chat.splice(0, room.chat.length - 120);
}

function addPlayer(room, name, deviceId = "") {
  const player = { id: crypto.randomUUID(), name, score: 0, guessed: false, muted: false, connected: true, deviceId };
  room.players.push(player);
  addChat(room, { kind: "system", text: `انضمام ${firstName(name)} للغرفة.` });
  bump("totals.playerJoins");
  bump(room.isPublic ? "totals.publicPlayerJoins" : "totals.privatePlayerJoins");
  updateMaxStats(room);
  return player;
}

function reconnectPlayer(room, name, playerId, deviceId) {
  if (deviceId) {
    const byDevice = room.players.find(player => player.deviceId === deviceId);
    if (byDevice) {
      byDevice.name = name;
      byDevice.connected = true;
      return byDevice;
    }
  }
  const byId = playerId ? getPlayer(room, playerId) : null;
  if (byId) {
    byId.name = name;
    byId.connected = true;
    return byId;
  }
  const byName = room.players.find(player => player.name === name && !player.connected);
  if (byName) {
    byName.connected = true;
    return byName;
  }
  return null;
}

function removeDuplicateNames(room, keeper) {
  room.players = room.players.filter(player => player.id === keeper.id || !(player.name === keeper.name && !player.connected));
}

function removeDuplicateDevices(room, keeper) {
  if (!keeper.deviceId) return;
  room.players = room.players.filter(player => player.id === keeper.id || player.deviceId !== keeper.deviceId);
}

function pickWord() {
  return words[Math.floor(Math.random() * words.length)];
}

function pickWordOptions(count = 3) {
  const options = new Set();
  while (options.size < count && options.size < words.length) options.add(pickWord());
  return [...options];
}

function pickHintIndexes(word) {
  const indexes = [...word].map((letter, index) => ({ letter, index }))
    .filter(item => item.letter.trim());
  indexes.sort(() => Math.random() - 0.5);
  return indexes.slice(0, Math.min(2, indexes.length)).map(item => item.index);
}

function visibleHintLetters(room) {
  const elapsed = Date.now() - room.startedAt;
  const firstHintAt = room.settings.drawTime * 1000 * 0.35;
  const secondHintAt = room.settings.drawTime * 1000 * 0.65;
  const count = elapsed >= secondHintAt ? 2 : elapsed >= firstHintAt ? 1 : 0;
  return room.hintIndexes.slice(0, count).map(index => ({ index, letter: room.word[index] }));
}

function clearHintTimers(room) {
  for (const timer of room.hintTimers) clearTimeout(timer);
  room.hintTimers = [];
}

function scheduleHintTimers(room) {
  clearHintTimers(room);
  const delays = [
    Math.round(room.settings.drawTime * 1000 * 0.35),
    Math.round(room.settings.drawTime * 1000 * 0.65)
  ];
  for (const delay of delays) {
    room.hintTimers.push(setTimeout(() => {
      if (room.status === "playing") broadcast(room);
    }, delay));
  }
}

function nextDrawer(room) {
  if (!room.players.length) return null;
  for (let i = 0; i < room.players.length; i++) {
    const nextIndex = room.drawerIndex % room.players.length;
    room.drawerIndex += 1;
    const player = room.players[nextIndex];
    if (player.connected) return player.id;
  }
  return null;
}

function scheduleRoomCleanup(room) {
  if (room.cleanupTimer) return;
  // Empty public rooms disappear quickly; private rooms wait longer for the host to reconnect
  const delay = room.isPublic ? 10000 : 60000;
  room.cleanupTimer = setTimeout(() => {
    if (connectedCount(room) === 0) {
      clearTimeout(room.roundTimer);
      clearTimeout(room.revealTimer);
      clearTimeout(room.nextGameTimer);
      clearTimeout(room.autoStartTimer);
      rooms.delete(room.code);
    }
    room.cleanupTimer = null;
  }, delay);
}

function advanceDrawer(room) {
  const current = getPlayer(room, room.drawerId);
  if (current && current.connected) return;
  const nextId = nextDrawer(room);
  if (!nextId) {
    room.drawerId = null;
    if (room.status === "playing") revealRound(room, "الرسام غادر!");
    return;
  }
  room.drawerId = nextId;
  if (room.status === "choosing") {
    room.wordOptions = pickWordOptions(3);
    room.hintIndexes = [];
    clearHintTimers(room);
    room.endsAt = Date.now() + 12000;
    clearTimeout(room.roundTimer);
    room.roundTimer = setTimeout(() => chooseWord(room, room.wordOptions[0]), 12000);
    addChat(room, { kind: "system", text: `اختيار الكلمة: ${firstName(getPlayer(room, nextId)?.name) || "لاعب"}.` });
  }
  broadcast(room);
}

function startRound(room) {
  if (endIfTooFew(room)) {
    broadcast(room);
    return;
  }
  if (room.round >= room.settings.rounds) {
    if (room.isPublic) {
      bump("totals.gamesCompleted");
      bump("totals.publicGamesCompleted");
      startPublicIntermission(room);
      return;
    }
    room.status = "ended";
    room.revealTimer = null;
    room.lastWinner = null;
    bump("totals.gamesCompleted");
    bump("totals.privateGamesCompleted");
    addChat(room, { kind: "system", text: "انتهت اللعبة! شوفوا الترتيب النهائي." });
    broadcast(room);
    clearTimeout(room.nextGameTimer);
    room.nextGameTimer = setTimeout(() => {
      if (connectedCount(room) >= 2) {
        resetGame(room);
        startRound(room);
      }
    }, 10000);
    return;
  }

  room.status = "choosing";
  if (room.round === 0) {
    bump("totals.gamesStarted");
    bump(room.isPublic ? "totals.publicGamesStarted" : "totals.privateGamesStarted");
  }
  room.round += 1;
  bump("totals.roundsStarted");
  room.word = "";
  room.wordOptions = pickWordOptions(3);
  room.hintIndexes = [];
  clearHintTimers(room);
  room.drawerId = nextDrawer(room);
  if (!room.drawerId) {
    room.status = "ended";
    addChat(room, { kind: "system", text: "مفيش لاعبين متصلين. اللعبة اتوقفت." });
    broadcast(room);
    return;
  }
  room.endsAt = Date.now() + 12000;
  room.drawEvents = [];
  room.drawSeq = 0;
  room.lastWinner = null;
  for (const player of room.players) player.guessed = false;
  addChat(room, { kind: "system", text: `الجولة ${room.round} - اختيار الكلمة: ${firstName(room.players.find(player => player.id === room.drawerId)?.name)}.` });
  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => chooseWord(room, room.wordOptions[0]), 12000);
  broadcast(room);
}

function startPublicIntermission(room) {
  room.status = "intermission";
  room.endsAt = Date.now() + 4000;
  room.drawerId = null;
  room.word = "";
  room.wordOptions = [];
  room.hintIndexes = [];
  room.lastWinner = null;
  clearHintTimers(room);
  clearTimeout(room.roundTimer);
  clearTimeout(room.revealTimer);
  clearTimeout(room.nextGameTimer);
  addChat(room, { kind: "system", text: "جولة جديدة هتبدأ حالاً." });
  room.nextGameTimer = setTimeout(() => {
    room.nextGameTimer = null;
    if (connectedCount(room) >= 2) {
      resetGame(room);
      room.settings.rounds = connectedCount(room) * 5;
      startRound(room);
      return;
    }
    room.status = "lobby";
    room.round = 0;
    room.drawerIndex = 0;
    room.drawerId = null;
    room.endsAt = null;
    room.drawEvents = [];
    room.drawSeq = 0;
    schedulePublicStart(room);
    broadcast(room);
  }, 4000);
  broadcast(room);
}

function chooseWord(room, word) {
  if (room.status !== "choosing") return;
  advanceDrawer(room);
  if (room.status !== "choosing") return;
  if (endIfTooFew(room)) {
    broadcast(room);
    return;
  }
  if (!room.drawerId || !getPlayer(room, room.drawerId)?.connected) {
    room.status = "ended";
    addChat(room, { kind: "system", text: "مفيش رسام متصل. اللعبة اتوقفت." });
    broadcast(room);
    return;
  }
  const selected = room.wordOptions.includes(word) ? word : room.wordOptions[0];
  room.status = "playing";
  room.word = selected;
  trackWord(selected, "chosen");
  room.wordOptions = [];
  room.hintIndexes = pickHintIndexes(selected);
  room.startedAt = Date.now();
  room.endsAt = Date.now() + room.settings.drawTime * 1000;
  clearTimeout(room.roundTimer);
  room.roundTimer = setTimeout(() => revealRound(room, "انتهى الوقت!"), room.settings.drawTime * 1000);
  scheduleHintTimers(room);
  addChat(room, { kind: "system", text: `بدأ الرسم! (${firstName(room.players.find(player => player.id === room.drawerId)?.name)})` });
  broadcast(room);
}

function revealRound(room, text) {
  if (room.status !== "playing") return;
  room.status = "reveal";
  room.endsAt = Date.now() + 5000;
  bump("totals.roundsCompleted");
  clearHintTimers(room);
  addChat(room, { kind: "system", text: `${text} الكلمة كانت: ${room.word}` });
  clearTimeout(room.roundTimer);
  clearTimeout(room.revealTimer);
  room.revealTimer = setTimeout(() => startRound(room), 5000);
  broadcast(room);
}

function resetGame(room) {
  room.round = 0;
  room.drawerIndex = 0;
  room.drawerId = null;
  room.word = "";
  room.wordOptions = [];
  room.hintIndexes = [];
  clearHintTimers(room);
  room.drawEvents = [];
  room.drawSeq = 0;
  room.lastWinner = null;
  for (const player of room.players) {
    player.score = 0;
    player.guessed = false;
  }
  addChat(room, { kind: "system", text: "لعبة جديدة!" });
}

function endIfTooFew(room) {
  if (connectedCount(room) >= 2) return false;
  if (room.status === "lobby" || room.status === "ended") return false;

  clearTimeout(room.roundTimer);
  clearTimeout(room.revealTimer);
  clearTimeout(room.nextGameTimer);
  clearHintTimers(room);

  if (room.isPublic) {
    room.status = "lobby";
    room.round = 0;
    room.drawerIndex = 0;
    room.drawerId = null;
    room.word = "";
    room.wordOptions = [];
    room.hintIndexes = [];
    room.drawEvents = [];
    room.drawSeq = 0;
    room.lastWinner = null;
    room.endsAt = null;
    for (const player of room.players) {
      player.score = 0;
      player.guessed = false;
    }
    addChat(room, { kind: "system", text: "اللاعبين قلوا. الماتش هيرجع للوبي لحد ما يجمع لاعبين." });
    schedulePublicStart(room);
  } else {
    room.status = "ended";
    room.revealTimer = null;
    room.lastWinner = null;
    addChat(room, { kind: "system", text: "مفيش لاعبين كفاية. اللعبة اتوقفت." });
  }
  return true;
}

function createRoom(hostName, settings = {}, options = {}) {
  const player = { id: crypto.randomUUID(), name: hostName, score: 0, guessed: false, muted: false, connected: true, deviceId: options.deviceId || "" };
  const room = {
    code: roomCode(),
    isPublic: Boolean(options.isPublic),
    hostId: player.id,
    players: [player],
    clients: new Set(),
    status: "lobby",
    settings: {
      rounds: Math.max(2, Math.min(10, Number(settings.rounds) || 4)),
      drawTime: Math.max(35, Math.min(120, Number(settings.drawTime) || 70)),
      maxPlayers: Math.max(2, Math.min(12, Number(settings.maxPlayers) || 8))
    },
    round: 0,
    drawerIndex: 0,
    drawerId: null,
    word: "",
    wordOptions: [],
    hintIndexes: [],
    hintTimers: [],
    startedAt: 0,
    endsAt: null,
    chat: [],
    drawEvents: [],
    drawSeq: 0,
    lastWinner: null,
    roundTimer: null,
    revealTimer: null,
    nextGameTimer: null,
    autoStartTimer: null,
    autoStartAt: null,
    cleanupTimer: null
  };
  addChat(room, { kind: "system", text: options.isPublic ? `انضمام ${firstName(hostName)} للعب العشوائي.` : `تم إنشاء الغرفة بواسطة ${firstName(hostName)}.` });
  rooms.set(room.code, room);
  bump("totals.roomsCreated");
  bump(room.isPublic ? "totals.publicRoomsCreated" : "totals.privateRoomsCreated");
  bump("totals.playerJoins");
  bump(room.isPublic ? "totals.publicPlayerJoins" : "totals.privatePlayerJoins");
  updateMaxStats(room);
  return { room, player };
}

function findPublicRoom() {
  return [...rooms.values()]
    .filter(room => room.isPublic && room.status !== "ended" && room.round <= 3 && connectedCount(room) > 0 && connectedCount(room) < 5)
    .sort((a, b) => {
      const score = room => room.status === "lobby" ? 2 : 1;
      if (score(a) !== score(b)) return score(b) - score(a);
      return connectedCount(b) - connectedCount(a);
    })[0];
}

function schedulePublicStart(room) {
  if (!room.isPublic || room.status !== "lobby" || connectedCount(room) < 2 || room.autoStartTimer) return;
  room.autoStartAt = Date.now() + 5000;
  addChat(room, { kind: "system", text: "الماتش هيبدأ خلال 5 ثواني." });
  room.autoStartTimer = setTimeout(() => {
    room.autoStartTimer = null;
    room.autoStartAt = null;
    if (room.status === "lobby" && connectedCount(room) >= 2) {
      room.round = 0;
      room.drawerIndex = 0;
      for (const player of room.players) player.score = 0;
      room.settings.rounds = connectedCount(room) * 5;
      startRound(room);
    } else {
      broadcast(room);
    }
  }, 5000);
  broadcast(room);
}

function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase());
}

function getPlayer(room, playerId) {
  return room.players.find(player => player.id === playerId);
}

function connectedCount(room) {
  return room.players.filter(player => player.connected).length;
}

function handleDisconnect(room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player) return;
  const stillConnected = [...room.clients].some(client => client.playerId === playerId);
  if (stillConnected) return;
  player.connected = false;
  addChat(room, { kind: "system", text: `مغادرة ${firstName(player.name)}.` });

  if (room.drawerId === player.id) {
    if (room.status === "choosing") advanceDrawer(room);
    else if (room.status === "playing") revealRound(room, "الرسام خرج!");
  }

  if (room.status === "lobby" && connectedCount(room) < 2 && room.autoStartTimer) {
    clearTimeout(room.autoStartTimer);
    room.autoStartTimer = null;
    room.autoStartAt = null;
  }

  endIfTooFew(room);
  if (connectedCount(room) === 0) scheduleRoomCleanup(room);
  broadcast(room);
}

function statsSnapshot() {
  const liveRooms = [...rooms.values()];
  const activePlayers = liveRooms.reduce((sum, room) => sum + connectedCount(room), 0);
  const statuses = liveRooms.reduce((all, room) => {
    all[room.status] = (all[room.status] || 0) + 1;
    return all;
  }, {});
  const topWords = Object.entries(stats.words)
    .map(([word, value]) => ({ word, chosen: value.chosen || 0, guessed: value.guessed || 0 }))
    .sort((a, b) => b.chosen - a.chosen || b.guessed - a.guessed)
    .slice(0, 20);
  return {
    createdAt: stats.createdAt,
    updatedAt: stats.updatedAt,
    totals: stats.totals,
    max: stats.max,
    live: {
      rooms: liveRooms.length,
      publicRooms: liveRooms.filter(room => room.isPublic).length,
      privateRooms: liveRooms.filter(room => !room.isPublic).length,
      activePlayers,
      connectedPlayers: activePlayers,
      statuses
    },
    derived: {
      averagePlayersPerRoom: stats.totals.roomsCreated ? Number((stats.totals.playerJoins / stats.totals.roomsCreated).toFixed(2)) : 0,
      correctGuessRate: stats.totals.guesses ? Number(((stats.totals.correctGuesses / stats.totals.guesses) * 100).toFixed(1)) : 0,
      closeGuessRate: stats.totals.guesses ? Number(((stats.totals.closeGuesses / stats.totals.guesses) * 100).toFixed(1)) : 0,
      roundsPerGame: stats.totals.gamesStarted ? Number((stats.totals.roundsStarted / stats.totals.gamesStarted).toFixed(2)) : 0,
      drawEventsPerRound: stats.totals.roundsStarted ? Number((stats.totals.drawEvents / stats.totals.roundsStarted).toFixed(2)) : 0
    },
    topWords
  };
}

function staticFile(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = decodeURIComponent(requestUrl.pathname);
  const filePath = requestedPath === "/"
    ? path.join(PUBLIC_DIR, "index.html")
    : requestedPath === "/stats"
      ? path.join(PUBLIC_DIR, "stats.html")
    : path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  const publicRoot = `${path.resolve(PUBLIC_DIR)}${path.sep}`;
  if (filePath !== path.join(PUBLIC_DIR, "index.html") && !filePath.startsWith(publicRoot)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(res, 404, { error: "Not found" });
    const ext = path.extname(filePath);
    const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".webmanifest": "application/manifest+json" };
    const isVersionedAsset = [".css", ".js"].includes(ext) && requestUrl.searchParams.has("v");
    const headers = {
      "content-type": `${types[ext] || "application/octet-stream"}; charset=utf-8`,
      "cache-control": isVersionedAsset ? "public, max-age=31536000, immutable" : "no-cache, no-store, must-revalidate"
    };
    if (!isVersionedAsset) {
      headers.pragma = "no-cache";
      headers.expires = "0";
    }
    res.writeHead(200, headers);
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/stats") {
      return sendJson(res, 200, statsSnapshot());
    }

    if (!url.pathname.startsWith("/api/")) return staticFile(req, res);

    if (req.method === "POST" && url.pathname === "/api/create") {
      const body = await readBody(req);
      const name = cleanName(body.name);
      if (!name) return sendJson(res, 400, { error: "اسم مناسب مطلوب." });
      const { room, player } = createRoom(name, body.settings, { deviceId: body.deviceId });
      return sendJson(res, 200, { room: publicRoom(room, player.id), playerId: player.id });
    }

    if (req.method === "POST" && url.pathname === "/api/join") {
      const body = await readBody(req);
      const name = cleanName(body.name);
      const code = String(body.code || "").trim().toUpperCase().slice(0, 8);
      const room = getRoom(code);
      const existingPlayerId = String(body.playerId || "").trim();
      if (!name) return sendJson(res, 400, { error: "اسم مناسب مطلوب." });
      if (!room) return sendJson(res, 404, { error: "الغرفة غير موجودة." });

      const deviceId = String(body.deviceId || "").trim();
      const existing = reconnectPlayer(room, name, existingPlayerId, deviceId);
      if (existing) {
        removeDuplicateNames(room, existing);
        removeDuplicateDevices(room, existing);
        addChat(room, { kind: "system", text: `عودة ${firstName(name)} للغرفة.` });
        broadcast(room);
        return sendJson(res, 200, { room: publicRoom(room, existing.id), playerId: existing.id });
      }

      if (connectedCount(room) >= room.settings.maxPlayers) return sendJson(res, 409, { error: "الغرفة ممتلئة." });
      if (room.status !== "lobby") return sendJson(res, 409, { error: "اللعبة بدأت بالفعل." });
      const player = addPlayer(room, name, deviceId);
      if (room.isPublic) schedulePublicStart(room);
      broadcast(room);
      return sendJson(res, 200, { room: publicRoom(room, player.id), playerId: player.id });
    }

    if (req.method === "POST" && url.pathname === "/api/quick-play") {
      const body = await readBody(req);
      const name = cleanName(body.name);
      const existingPlayerId = String(body.playerId || "").trim();
      if (!name) return sendJson(res, 400, { error: "اسم مناسب مطلوب." });
      const deviceId = String(body.deviceId || "").trim();

      let room;
      let player;

      function placePlayer(targetRoom) {
        const existing = reconnectPlayer(targetRoom, name, existingPlayerId, deviceId);
        if (existing) {
          removeDuplicateNames(targetRoom, existing);
          removeDuplicateDevices(targetRoom, existing);
          addChat(targetRoom, { kind: "system", text: `عودة ${firstName(name)} للماتش.` });
          return existing;
        }
        return addPlayer(targetRoom, name, deviceId);
      }

      // 1) Rejoin any public room this device already belongs to, even if temporarily empty
      const previousPublicRoom = deviceId ? [...rooms.values()].find(r => r.isPublic && r.players.some(p => p.deviceId === deviceId)) : null;
      if (previousPublicRoom) {
        room = previousPublicRoom;
        player = placePlayer(room);
        if (room.status === "lobby") schedulePublicStart(room);
      } else {
        // 2) Join an active public room, or 3) create a new one
        room = findPublicRoom();
        if (room) {
          player = placePlayer(room);
          if (room.status === "lobby") schedulePublicStart(room);
        } else {
          const created = createRoom(name, { rounds: 5, drawTime: 60, maxPlayers: 4 }, { isPublic: true, deviceId });
          room = created.room;
          player = created.player;
          schedulePublicStart(room);
        }
      }

      broadcast(room);
      return sendJson(res, 200, { room: publicRoom(room, player.id), playerId: player.id });
    }

    if (["/api/start", "/api/guess", "/api/choose-word", "/api/draw", "/api/room-settings"].includes(url.pathname)) {
      return sendJson(res, 410, { error: "هذا الإجراء يتم الآن عبر WebSocket." });
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("Request error:", error);
    if (!res.headersSent) sendJson(res, 500, { error: "حدث خطأ في السيرفر." });
  }
});

server.on("error", error => {
  console.error(`Could not start server on ${HOST}:${PORT} (${error.code || error.message}).`);
  process.exit(1);
});

const wss = new WebSocketServer({ server });

function safeSend(ws, data) {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(data));
  } catch (error) {
    console.error("WS send error:", error.message);
  }
}

function closeWithError(ws, message) {
  safeSend(ws, { type: "error", message });
  ws.close(1008, message);
}

function safeDrawPoints(points) {
  if (!Array.isArray(points)) return [];
  const cleaned = [];
  for (const point of points) {
    if (cleaned.length >= 80) break;
    const x = Number(point?.x);
    const y = Number(point?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    cleaned.push({
      x: Math.max(0, Math.min(1, Number(x.toFixed(4)))),
      y: Math.max(0, Math.min(1, Number(y.toFixed(4))))
    });
  }
  return cleaned;
}

wss.on("connection", (ws, req) => {
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  if (urlPath !== "/ws") {
    ws.close(1002, "Invalid path");
    return;
  }
  ws.isAlive = true;
  ws.lastMessageAt = Date.now();
  ws.playerId = "";
  ws.roomCode = "";

  ws.on("pong", () => { ws.isAlive = true; ws.lastMessageAt = Date.now(); });

  ws.on("message", raw => {
    ws.lastMessageAt = Date.now();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return closeWithError(ws, "Invalid message.");
    }

    const type = data.type;

    if (type === "auth") {
      const room = getRoom(data.room);
      const playerId = String(data.player || "").trim();
      const player = room && getPlayer(room, playerId);
      if (!room || !player) {
        return closeWithError(ws, "الغرفة أو اللاعب غير موجود.");
      }
      ws.roomCode = room.code;
      ws.playerId = playerId;
      room.clients.add(ws);
      player.connected = true;
      safeSend(ws, { type: "state", room: publicRoom(room, playerId) });
      broadcast(room);
      return;
    }

    const room = getRoom(ws.roomCode);
    const player = room && getPlayer(room, ws.playerId);
    if (!room || !player) {
      return closeWithError(ws, "غير مصرح.");
    }

    if (type === "ping") {
      safeSend(ws, { type: "pong" });
      return;
    }

    if (type === "draw") {
      if (room.status !== "playing" || room.drawerId !== player.id) return;
      const event = data.event || {};
      const safeEvent = {
        type: ["stroke", "clear", "undo"].includes(event.type) ? event.type : "stroke",
        points: safeDrawPoints(event.points),
        color: String(event.color || "#111827").slice(0, 16),
        size: Math.max(2, Math.min(34, Number(event.size) || 6)),
        tool: event.tool === "eraser" ? "eraser" : "pen",
        strokeId: String(event.strokeId || crypto.randomUUID()).slice(0, 80)
      };
      if (safeEvent.type === "stroke" && safeEvent.points.length < 2) return;
      if (safeEvent.type === "clear") room.drawEvents = [safeEvent];
      else if (safeEvent.type === "undo") room.drawEvents.push(safeEvent);
      else room.drawEvents.push(safeEvent);
      bumpDrawStats(safeEvent.type);
      if (room.drawEvents.length > 700) room.drawEvents.splice(0, room.drawEvents.length - 700);
      broadcastDraw(room, safeEvent);
      return;
    }

    if (type === "guess") {
      const text = String(data.text || "").trim().slice(0, 80);
      if (!text) return;
      if (player.muted) return;
      if (containsBlockedWord(text)) {
        addChat(room, { kind: "system", text: "تم حجب رسالة غير مناسبة." });
        broadcast(room);
        return;
      }
      if (room.status !== "playing" || player.id === room.drawerId || player.guessed) {
        addChat(room, { kind: "message", playerId: player.id, name: firstName(player.name), text });
        bump("totals.chatMessages");
        broadcast(room);
        return;
      }
      bump("totals.guesses");
      if (normalizeText(text) === normalizeText(room.word)) {
        const remaining = Math.max(0, room.endsAt - Date.now());
        const base = Math.round(30 + (remaining / (room.settings.drawTime * 1000)) * 70);
        player.score += base;
        player.guessed = true;
        bump("totals.correctGuesses");
        trackWord(room.word, "guessed");
        const drawer = getPlayer(room, room.drawerId);
        if (drawer) drawer.score += 20;
        room.lastWinner ||= player.name;
        addChat(room, { kind: "correct", playerId: player.id, name: firstName(player.name), text: `إجابة صحيحة من ${firstName(player.name)}! +${base}` });
        const activeGuessers = room.players.filter(p => p.id !== room.drawerId && p.connected);
        if (activeGuessers.every(p => p.guessed)) revealRound(room, "كل اللاعبين خمنوا!");
        else broadcast(room);
        return;
      }
      if (isCloseGuess(text, room.word)) {
        bump("totals.closeGuesses");
        addChat(room, { kind: "hint", toPlayerId: player.id, text: "قريب جداً... جرّبوا تعديل بسيط." });
      }
      addChat(room, { kind: "message", playerId: player.id, name: firstName(player.name), text });
      bump("totals.chatMessages");
      broadcast(room);
      return;
    }

    if (type === "choose-word") {
      if (room.status !== "choosing" || room.drawerId !== player.id) return;
      chooseWord(room, String(data.word || ""));
      return;
    }

    if (type === "start") {
      if (room.hostId !== player.id) return;
      if (connectedCount(room) < 2) return;
      room.round = 0;
      room.drawerIndex = 0;
      for (const p of room.players) p.score = 0;
      startRound(room);
      return;
    }

    if (type === "room-settings") {
      if (room.hostId !== player.id || room.status !== "lobby") return;
      room.settings.rounds = Math.max(2, Math.min(10, Number(data.rounds) || room.settings.rounds));
      room.settings.drawTime = Math.max(35, Math.min(120, Number(data.drawTime) || room.settings.drawTime));
      room.settings.maxPlayers = Math.max(2, Math.min(12, Number(data.maxPlayers) || room.settings.maxPlayers));
      broadcast(room);
      return;
    }

    if (type === "sync") {
      safeSend(ws, { type: "state", room: publicRoom(room, player.id) });
      return;
    }
  });

  ws.on("close", () => {
    const room = getRoom(ws.roomCode);
    if (room) {
      room.clients.delete(ws);
      handleDisconnect(room, ws.playerId);
    }
  });

  ws.on("error", error => {
    console.error("WS error:", error.message);
    ws.terminate();
  });
});

const heartbeat = setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    // Terminate connections that have not responded to our ping or sent anything for 35 seconds
    if (!ws.isAlive || (ws.lastMessageAt && now - ws.lastMessageAt > 35000)) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

wss.on("close", () => clearInterval(heartbeat));

server.listen(PORT, HOST, () => {
  console.log(`Arabic Scribble running on http://${HOST}:${PORT}`);
});
