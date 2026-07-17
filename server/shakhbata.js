/**
 * محرك لعبة شخبطة — منقول عن الخادم الأصلي مع نفس القواعد:
 * اختيار من ٣ كلمات، تلميحات حروف مؤقتة، نقاط حسب سرعة التخمين، نقاط للرسام
 */

// ===== بنك الكلمات العربي (منقول كاملًا من اللعبة الأصلية) =====
export const words = [
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
  "كرة", "سيارة", "قطار", "قارب", "شمس", "قمر", "نجمة", "مطر", "جبل", "نظارة",
  "دراجة", "دراجة نارية", "طائرة", "حافلة", "تاكسي", "مترو", "سفينة", "غواصة", "صاروخ", "إسعاف",
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

// ===== قائمة الكلمات المحظورة (فلترة الدردشة — منقولة من الأصل) =====
const blockedWords = [
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
  "شرموطة", "شرموط", "شرموطه", "شرموطين", "شرموطات",
  "قحبة", "قحبه", "قحاب",
  "لبوة", "لبوه", "لبات",
  "عاهرة", "عاهرات", "داعرة", "فاسقة",
  "خول", "خواتين", "خولات",
  "عرص", "عرصة", "عراص", "عرصات",
  "متناك", "متناكة", "متناكين",
  "زامل", "زامله", "زاملين",
  "ديوث", "ديوثة", "ديوثين",
  "لواط", "لوطي", "لوطيين", "سحاق", "سحاقية", "سحاقيات", "شاذ", "شاذين", "شذوذ", "ميوع",
  "كافر", "كافرة", "كفرة",
  "يهودي", "يهود", "نصراني", "صليبي",
  "زنجي", "زنوج",
  "معاق", "معاقين", "مجنون", "مجانين", "عبيط"
];

// ===== أدوات النص العربي (مطابقة للأصل) =====
export function normalizeText(value = "") {
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
  return blockedWords.some((word) => {
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
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
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

function firstName(name = "") {
  return String(name).trim().split(/\s+/)[0] || name;
}

// ===== ثوابت سير الجولات =====
const WORD_CHOICE_SECONDS = 8; // مهلة اختيار الكلمة قبل الاختيار التلقائي
// شاشة اللعبة عند العميل تُركَّب بعد وصول أول round_choosing، فيضيع أول إرسال (خاصة الجولة 1).
// نعيد الإرسال مرة واحدة بعد هذه المهلة — الرسالتان idempotent عند العميل.
const WORD_OPTIONS_RESEND_MS = 750;
const DEFAULT_ROUNDS = 5; // الافتراضي: ٥ جولات يتناوب عليها الرسّامون round-robin
const MAX_ROUNDS = 10;

// ===== أدوات إرسال =====
function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function broadcast(room, obj) {
  for (const ws of room.players.values()) send(ws, obj);
}

function sendToSlot(room, slot, obj) {
  send(room.players.get(slot), obj);
}

// ===== حالة اللعبة =====
export function initShakhbata(room, drawTime = 60) {
  room.shak = {
    status: 'lobby',
    round: 0,
    totalRounds: 0,
    drawTime: Math.max(35, Math.min(120, Number(drawTime) || 60)),
    drawerOrder: [],
    drawerIndex: 0,
    drawerSlot: null,
    word: '',
    wordOptions: [],
    hintIndexes: [],
    scores: new Map(),
    guessed: new Set(),
    startedAt: 0,
    endsAt: null,
    roundTimer: null,
    optionsResendTimer: null,
    hintTimers: [],
    revealTimer: null,
  };
}

export function shakPlayers(room) {
  return [...room.players.keys()].sort((a, b) => a - b).map((slot) => {
    const info = room.names.get(slot) || { name: 'لاعب', avatar: '🎮' };
    return { id: slot, slot, name: info.name, avatar: info.avatar };
  });
}

function scoresList(room) {
  const sh = room.shak;
  return shakPlayers(room).map((p) => ({
    ...p,
    score: sh.scores.get(p.slot) || 0,
    guessed: sh.guessed.has(p.slot),
  }));
}

function broadcastPlayers(room) {
  broadcast(room, { type: 'player_joined', players: shakPlayers(room), settings: room.settings });
}

function systemChat(room, text) {
  broadcast(room, { type: 'chat', kind: 'system', text });
}

function clearShakTimers(room) {
  const sh = room.shak;
  if (!sh) return;
  clearTimeout(sh.roundTimer);
  clearTimeout(sh.optionsResendTimer);
  clearTimeout(sh.revealTimer);
  for (const t of sh.hintTimers) clearTimeout(t);
  sh.hintTimers = [];
}

export function destroyShakhbata(room) {
  clearShakTimers(room);
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
  const indexes = [...word]
    .map((letter, index) => ({ letter, index }))
    .filter((item) => item.letter.trim());
  indexes.sort(() => Math.random() - 0.5);
  return indexes.slice(0, Math.min(2, indexes.length)).map((item) => item.index);
}

function nextDrawer(room) {
  const sh = room.shak;
  for (let i = 0; i < sh.drawerOrder.length; i++) {
    const slot = sh.drawerOrder[sh.drawerIndex % sh.drawerOrder.length];
    sh.drawerIndex += 1;
    if (room.players.has(slot)) return slot;
  }
  return null;
}

function sendHints(room, count) {
  const sh = room.shak;
  const hints = sh.hintIndexes.slice(0, count).map((index) => ({ index, letter: sh.word[index] }));
  for (const slot of room.players.keys()) {
    if (slot !== sh.drawerSlot) sendToSlot(room, slot, { type: 'hint', hints });
  }
}

function scheduleHints(room) {
  const sh = room.shak;
  // إيقاع أسرع: التلميح الأول عند 30% والثاني عند 60% من زمن الرسم
  const first = Math.round(sh.drawTime * 1000 * 0.3);
  const second = Math.round(sh.drawTime * 1000 * 0.6);
  sh.hintTimers.push(setTimeout(() => { if (sh.status === 'playing') sendHints(room, 1); }, first));
  sh.hintTimers.push(setTimeout(() => { if (sh.status === 'playing') sendHints(room, 2); }, second));
}

// ===== سير الجولات =====
export function startMatch(room) {
  const sh = room.shak;
  sh.drawerOrder = [...room.players.keys()].sort((a, b) => a - b);
  sh.drawerIndex = 0;
  sh.totalRounds = Math.max(1, Math.min(MAX_ROUNDS, Number(room.settings?.rounds) || DEFAULT_ROUNDS)); // الافتراضي ٥ جولات بالتناوب الدائري
  sh.round = 0;
  sh.scores = new Map([...room.players.keys()].map((s) => [s, 0]));
  nextRound(room);
}

function nextRound(room) {
  const sh = room.shak;
  clearShakTimers(room);
  if (room.players.size < 2) return endMatch(room);
  if (sh.round >= sh.totalRounds) return endMatch(room);

  sh.status = 'choosing';
  sh.round += 1;
  sh.word = '';
  sh.wordOptions = pickWordOptions(3);
  sh.hintIndexes = [];
  sh.guessed = new Set();
  sh.drawerSlot = nextDrawer(room);
  if (sh.drawerSlot === null) return endMatch(room);
  sh.endsAt = Date.now() + WORD_CHOICE_SECONDS * 1000;

  const drawerName = firstName(room.names.get(sh.drawerSlot)?.name || 'لاعب');
  systemChat(room, `الجولة ${sh.round} - اختيار الكلمة: ${drawerName}.`);
  const choosingMsg = {
    type: 'round_choosing',
    round: sh.round,
    totalRounds: sh.totalRounds,
    drawer: sh.drawerSlot,
    drawerName,
    duration: WORD_CHOICE_SECONDS,
  };
  broadcast(room, choosingMsg);
  sendToSlot(room, sh.drawerSlot, { type: 'word_options', options: sh.wordOptions });
  // إعادة إرسال احتياطية: العميل يستلم round_choosing الأولى ثم يركّب شاشة اللعبة وتشترك بعدها،
  // فيضيع word_options الأولى (وكذلك round_choosing الأولى في الجولة 1) — الإعادة تضمن وصولها.
  // الرسالتان idempotent عند العميل، والحارس يلغي الإعادة لو اختار الرسام فورًا.
  const roundAtSend = sh.round;
  sh.optionsResendTimer = setTimeout(() => {
    if (sh.status !== 'choosing' || sh.round !== roundAtSend) return;
    if (sh.drawerSlot === null || !room.players.has(sh.drawerSlot)) return;
    broadcast(room, choosingMsg);
    sendToSlot(room, sh.drawerSlot, { type: 'word_options', options: sh.wordOptions });
  }, WORD_OPTIONS_RESEND_MS);
  sh.roundTimer = setTimeout(() => chooseWord(room, sh.wordOptions[0]), WORD_CHOICE_SECONDS * 1000);
}

function chooseWord(room, word) {
  const sh = room.shak;
  if (sh.status !== 'choosing') return;
  if (room.players.size < 2) return endMatch(room);
  if (sh.drawerSlot === null || !room.players.has(sh.drawerSlot)) return endMatch(room);

  const selected = sh.wordOptions.includes(word) ? word : sh.wordOptions[0];
  sh.status = 'playing';
  sh.word = selected;
  sh.wordOptions = [];
  sh.hintIndexes = pickHintIndexes(selected);
  sh.startedAt = Date.now();
  sh.endsAt = Date.now() + sh.drawTime * 1000;
  clearTimeout(sh.roundTimer);
  clearTimeout(sh.optionsResendTimer);
  sh.roundTimer = setTimeout(() => revealRound(room, 'انتهى الوقت!'), sh.drawTime * 1000);
  scheduleHints(room);

  const drawerName = firstName(room.names.get(sh.drawerSlot)?.name || 'لاعب');
  systemChat(room, `بدأ الرسم! (${drawerName})`);
  broadcast(room, {
    type: 'round',
    drawer: sh.drawerSlot,
    wordLength: selected.replace(/\s+/g, '').length,
    wordPattern: selected.replace(/[^\s]/g, '_'),
    duration: sh.drawTime,
    endsAt: sh.endsAt,
  });
  sendToSlot(room, sh.drawerSlot, { type: 'your_word', word: selected });
}

function revealRound(room, reason) {
  const sh = room.shak;
  if (sh.status !== 'playing') return;
  sh.status = 'reveal';
  clearShakTimers(room);
  systemChat(room, `${reason} الكلمة كانت: ${sh.word}`);
  broadcast(room, { type: 'round_end', word: sh.word, reason, players: scoresList(room) });
  sh.revealTimer = setTimeout(() => nextRound(room), 2500);
}

function endMatch(room) {
  const sh = room.shak;
  clearShakTimers(room);
  sh.status = 'ended';
  systemChat(room, 'انتهت اللعبة! شوفوا الترتيب النهائي.');
  const leaderboard = scoresList(room).sort((a, b) => b.score - a.score);
  broadcast(room, { type: 'ended', leaderboard });
}

// ===== معالجة الرسائل =====
export function shakHandleMessage(room, ws, msg) {
  const sh = room.shak;
  const slot = ws._slot;

  if (msg.type === 'start') {
    if (slot !== 1 || sh.status !== 'lobby') return;
    if (room.players.size < 2) return;
    startMatch(room);
    return;
  }

  if (msg.type === 'choose_word') {
    if (sh.status !== 'choosing' || slot !== sh.drawerSlot) return;
    chooseWord(room, String(msg.word || ''));
    return;
  }

  if (msg.type === 'draw') {
    if (sh.status !== 'playing' || slot !== sh.drawerSlot) return;
    const op = ['stroke', 'clear', 'undo'].includes(msg.op) ? msg.op : 'stroke';
    const event = {
      type: 'draw',
      op,
      points: safeDrawPoints(msg.points),
      color: String(msg.color || '#111827').slice(0, 16),
      size: Math.max(2, Math.min(34, Number(msg.size) || 6)),
      tool: msg.tool === 'eraser' ? 'eraser' : 'pen',
      strokeId: String(msg.strokeId || '').slice(0, 80),
      done: msg.done === true, // آخر دفعة من الخط — يكمل بها المستقبِل ذيل المنحنى
    };
    if (event.op === 'stroke' && event.points.length < 2) return;
    // التمرير للجميع عدا الرسام
    for (const [s, playerWs] of room.players) {
      if (s !== slot) send(playerWs, event);
    }
    return;
  }

  if (msg.type === 'guess') {
    const text = String(msg.text || '').trim().slice(0, 80);
    if (!text) return;
    const name = firstName(room.names.get(slot)?.name || 'لاعب');

    if (containsBlockedWord(text)) {
      systemChat(room, 'تم حجب رسالة غير مناسبة.');
      return;
    }

    // خارج جولة التخمين (أو الرسام أو من خمّن صح) → رسالة دردشة عادية
    if (sh.status !== 'playing' || slot === sh.drawerSlot || sh.guessed.has(slot)) {
      broadcast(room, { type: 'chat', kind: 'message', name, text, from: slot });
      return;
    }

    if (normalizeText(text) === normalizeText(sh.word)) {
      const remaining = Math.max(0, sh.endsAt - Date.now());
      const base = Math.round(30 + (remaining / (sh.drawTime * 1000)) * 70);
      sh.scores.set(slot, (sh.scores.get(slot) || 0) + base);
      sh.guessed.add(slot);
      const drawerScore = sh.scores.get(sh.drawerSlot) || 0;
      sh.scores.set(sh.drawerSlot, drawerScore + 20);
      // التخمين الصحيح لا يُبث كنص — رسالة تأكيد فقط
      broadcast(room, { type: 'chat', kind: 'correct', name, text: `إجابة صحيحة من ${name}! +${base}`, points: base });
      broadcast(room, { type: 'scores', players: scoresList(room) });
      const guessers = [...room.players.keys()].filter((s) => s !== sh.drawerSlot);
      if (guessers.every((s) => sh.guessed.has(s))) revealRound(room, 'كل اللاعبين خمنوا!');
      return;
    }

    if (isCloseGuess(text, sh.word)) {
      sendToSlot(room, slot, { type: 'chat', kind: 'hint', text: 'قريب جداً... جرّبوا تعديل بسيط.' });
    }
    broadcast(room, { type: 'chat', kind: 'message', name, text, from: slot });
    return;
  }
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
      y: Math.max(0, Math.min(1, Number(y.toFixed(4)))),
    });
  }
  return cleaned;
}

// ===== مغادرة لاعب =====
export function shakHandleLeave(room, slot) {
  const sh = room.shak;
  if (!sh) return;
  const name = firstName(room.names.get(slot)?.name || 'لاعب');
  systemChat(room, `مغادرة ${name}.`);
  sh.scores.delete(slot);
  sh.guessed.delete(slot);
  broadcastPlayers(room);

  if (room.players.size === 0) return;

  if (sh.status === 'lobby') return;

  if (room.players.size < 2) {
    endMatch(room);
    return;
  }

  if (slot === sh.drawerSlot) {
    if (sh.status === 'choosing') {
      // نفس الجولة مع رسام جديد
      sh.round -= 1;
      clearShakTimers(room);
      nextRound(room);
    } else if (sh.status === 'playing') {
      revealRound(room, 'الرسام خرج!');
    }
  } else if (sh.status === 'playing') {
    // لو باقي المخمنين كلهم خمّنوا صح
    const guessers = [...room.players.keys()].filter((s) => s !== sh.drawerSlot);
    if (guessers.length && guessers.every((s) => sh.guessed.has(s))) revealRound(room, 'كل اللاعبين خمنوا!');
    else broadcast(room, { type: 'scores', players: scoresList(room) });
  }
}

export { broadcastPlayers };
