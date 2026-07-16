const root = document.querySelector("[data-stats-root]");
const updated = document.querySelector("[data-updated]");

function number(value) {
  return new Intl.NumberFormat("ar").format(Number(value) || 0);
}

function label(key) {
  return ({
    roomsCreated: "الغرف المنشأة",
    publicRoomsCreated: "غرف اللعب العشوائي",
    privateRoomsCreated: "الغرف الخاصة",
    playerJoins: "إجمالي دخول اللاعبين",
    publicPlayerJoins: "دخول لاعبي العشوائي",
    privatePlayerJoins: "دخول لاعبي الخاص",
    gamesStarted: "الألعاب التي بدأت",
    publicGamesStarted: "ألعاب عشوائية بدأت",
    privateGamesStarted: "ألعاب خاصة بدأت",
    gamesCompleted: "الألعاب المكتملة",
    publicGamesCompleted: "ألعاب عشوائية مكتملة",
    privateGamesCompleted: "ألعاب خاصة مكتملة",
    roundsStarted: "الجولات التي بدأت",
    roundsCompleted: "الجولات المكتملة",
    guesses: "التخمينات",
    correctGuesses: "التخمينات الصحيحة",
    closeGuesses: "التخمينات القريبة",
    chatMessages: "رسائل اللاعبين",
    drawEvents: "أحداث الرسم",
    strokes: "رسمات القلم",
    clears: "مسح اللوحة",
    undos: "تراجع الرسم",
    concurrentRooms: "أكبر عدد غرف معاً",
    concurrentPlayers: "أكبر عدد لاعبين معاً",
    playersInRoom: "أكبر عدد لاعبين في غرفة",
    rooms: "الغرف الحالية",
    publicRooms: "غرف عشوائية حالية",
    privateRooms: "غرف خاصة حالية",
    activePlayers: "اللاعبون المتصلون الآن",
    connectedPlayers: "الاتصالات الحالية",
    averagePlayersPerRoom: "متوسط اللاعبين لكل غرفة",
    correctGuessRate: "نسبة التخمين الصحيح",
    closeGuessRate: "نسبة التخمين القريب",
    roundsPerGame: "متوسط الجولات لكل لعبة",
    drawEventsPerRound: "متوسط الرسم لكل جولة"
  })[key] || key;
}

function card(title, rows) {
  return `
    <section class="panel stats-card">
      <h2>${title}</h2>
      <div class="stats-list">
        ${rows.map(([key, value]) => `
          <div>
            <span>${label(key)}</span>
            <strong>${typeof value === "number" ? number(value) : value}</strong>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

async function loadStats() {
  const response = await fetch("/api/stats");
  if (!response.ok) throw new Error("stats unavailable");
  const data = await response.json();
  updated.textContent = `آخر تحديث ${new Date(data.updatedAt).toLocaleString("ar")}`;
  root.innerHTML = [
    card("الإجمالي", Object.entries(data.totals)),
    card("مباشر الآن", Object.entries(data.live).filter(([key]) => key !== "statuses")),
    card("حالات الغرف", Object.entries(data.live.statuses || {})),
    card("أرقام قياسية", Object.entries(data.max)),
    card("معدلات", Object.entries(data.derived).map(([key, value]) => [key, key.includes("Rate") ? `${number(value)}٪` : value])),
    `
      <section class="panel stats-card stats-wide">
        <h2>أكثر الكلمات ظهوراً</h2>
        <div class="stats-list">
          ${(data.topWords || []).map(item => `
            <div>
              <span>${item.word}</span>
              <strong>${number(item.chosen)} اختيار · ${number(item.guessed)} تخمين</strong>
            </div>
          `).join("") || "<p class=\"small\">لا توجد كلمات بعد.</p>"}
        </div>
      </section>
    `
  ].join("");
}

loadStats().catch(() => {
  root.innerHTML = `<section class="panel">تعذر تحميل الإحصائيات.</section>`;
});
