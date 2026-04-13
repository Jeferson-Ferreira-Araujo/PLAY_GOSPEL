const $ = (id) => document.getElementById(id);

let DATA = [];
let pool = [];
let index = 0;

let settings = {
  difficulty: "easy",
  time: 30
};

let timer = {
  total: 0,
  left: 0,
  interval: null
};

function getParams() {
  const url = new URL(window.location.href);
  const play = url.searchParams.get("play") === "1";
  const difficulty = url.searchParams.get("difficulty");
  const timeRaw = url.searchParams.get("time");
  const time = timeRaw !== null ? Number(timeRaw) : null;
  return { play, difficulty, time };
}

function labelDifficulty(diff) {
  const map = { easy: "Fácil", medium: "Médio", hard: "Difícil" };
  return map[diff] || diff || "-";
}

function setBadgeDifficulty(diff) {
  $("badgeDifficulty").textContent = labelDifficulty(diff);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function updateProgress() {
  const total = pool.length;
  const current = total ? Math.min(index + 1, total) : 0;
  $("badgeProgress").textContent = `${current}/${total}`;
}

function showAnswer(show) {
  $("answerBox").classList.toggle("d-none", !show);
}

function stopTimer() {
  if (timer.interval) clearInterval(timer.interval);
  timer.interval = null;
}

function startTimer(seconds) {
  stopTimer();

  const s = Number(seconds || 0);
  timer.total = s;
  timer.left = s;

  if (s <= 0) {
    $("timerText").textContent = "--";
    $("timerBar").style.width = "0%";
    return;
  }

  $("timerText").textContent = String(timer.left);
  $("timerBar").style.width = "0%";

  timer.interval = setInterval(() => {
    timer.left = Math.max(0, timer.left - 1);
    $("timerText").textContent = String(timer.left);

    const elapsed = timer.total - timer.left;
    const pct = Math.min(100, Math.round((elapsed / timer.total) * 100));
    $("timerBar").style.width = `${pct}%`;

    // quando zera, para; rodada continua
    if (timer.left <= 0) stopTimer();
  }, 1000);
}

function renderCard() {
  if (!pool.length) return;

  const item = pool[index];
  $("verseText").textContent = item.verse || "—";
  $("answerText").textContent = item.reference || "—";

  showAnswer(false);
  updateProgress();
  startTimer(settings.time);
}

function nextCard() {
  if (!pool.length) return;

  index++;
  if (index >= pool.length) {
    gameOver();
    return;
  }
  renderCard();
}

function gameOver() {
  stopTimer();

  $("verseText").textContent = "FIM! ✅";
  $("answerText").textContent = "";
  showAnswer(false);

  $("playAgainBtn").classList.remove("d-none");
  $("gameOverNotice").classList.remove("d-none");

  $("revealBtn").disabled = true;
  $("nextBtn").disabled = true;
  $("restartTimerBtn").disabled = true;

  $("timerText").textContent = "--";
  $("timerBar").style.width = "0%";
  $("badgeProgress").textContent = `${pool.length}/${pool.length}`;
}

function resetGame() {
  index = 0;

  pool = shuffle(DATA.filter((x) => x.level === settings.difficulty));

  $("playAgainBtn").classList.add("d-none");
  $("gameOverNotice").classList.add("d-none");

  $("revealBtn").disabled = false;
  $("nextBtn").disabled = false;
  $("restartTimerBtn").disabled = false;

  if (!pool.length) {
    $("verseText").textContent = "Sem versículos para esta dificuldade.";
    $("answerText").textContent = "";
    showAnswer(false);
    $("badgeProgress").textContent = "0/0";
    $("timerText").textContent = "--";
    $("timerBar").style.width = "0%";
    return;
  }

  renderCard();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

function showScreen(gameMode) {
  $("setupScreen").classList.toggle("d-none", gameMode);
  $("gameScreen").classList.toggle("d-none", !gameMode);
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  DATA = await res.json();
}

function startFromSettings() {
  setBadgeDifficulty(settings.difficulty);
  showScreen(true);
  resetGame();
}

function wireEvents() {
  $("btnFullscreen").addEventListener("click", toggleFullscreen);

  $("revealBtn").addEventListener("click", () => showAnswer(true));
  $("nextBtn").addEventListener("click", nextCard);
  $("restartTimerBtn").addEventListener("click", () => startTimer(settings.time));

  $("exitBtn").addEventListener("click", () => {
    stopTimer();
    window.location.href = "../../index.html";
  });

  $("playAgainBtn").addEventListener("click", () => {
    $("revealBtn").disabled = false;
    $("nextBtn").disabled = false;
    $("restartTimerBtn").disabled = false;
    resetGame();
  });

  $("startBtn").addEventListener("click", () => {
    settings.difficulty = $("difficultySelect").value;
    settings.time = Number($("timeSelect").value || 0);
    startFromSettings();
  });

  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    if (k === "f") toggleFullscreen();

    // atalhos só no modo jogo
    if ($("gameScreen").classList.contains("d-none")) return;

    if (k === "r") showAnswer(true);
    if (k === "n") nextCard();
    if (k === "t") startTimer(settings.time);
  });
}

async function init() {
  wireEvents();
  await loadData();

  const { play, difficulty, time } = getParams();

  if (difficulty) settings.difficulty = difficulty;
  if (time !== null && !Number.isNaN(time)) settings.time = time;

  // fallback: preenche selects
  $("difficultySelect").value = settings.difficulty;
  $("timeSelect").value = String(settings.time);

  if (play) startFromSettings();
  else showScreen(false);
}

init().catch((err) => {
  console.error(err);
  $("setupScreen").innerHTML = `
    <div class="container py-4">
      <div class="p-4 rounded-4 bg-black border border-danger">
        <h1 class="h4">Erro ao carregar o jogo</h1>
        <p class="text-secondary mb-0">Verifique data.json e a estrutura de pastas.</p>
      </div>
    </div>
  `;
});