import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { renderTeamScoreboard } from "../../assets/js/scoreboard-ui.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";

const teamsScoreboard = document.getElementById("teamsScoreboard");

/* ===== Elements (setup) ===== */
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");
const difficultySelect = document.getElementById("difficultySelect");
const timeSelect = document.getElementById("timeSelect");

/* ===== Elements (presenter) ===== */
const badgeDifficulty = document.getElementById("badgeDifficulty");
const badgeProgress = document.getElementById("badgeProgress");

const quoteText = document.getElementById("quoteText");

const answerBox = document.getElementById("answerBox");
const answerText = document.getElementById("answerText");
const referenceText = document.getElementById("referenceText");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const revealBtn = document.getElementById("revealBtn");
const nextBtn = document.getElementById("nextBtn");
const restartTimerBtn = document.getElementById("restartTimerBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

/* ===== State ===== */
let data = null;

let currentDifficulty = "easy";
let durationSec = 30;

let pool = [];
let idx = 0;

let current = null;
let timer = null;
let gameOver = false;

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  renderTeamScoreboard(teamsScoreboard);
  checkAutoStartFromURL(); // 🔥 NOVO
});

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  data = await res.json();
}

/* ===== URL AUTO START ===== */
function checkAutoStartFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("play") !== "1") return;

  const difficultyFromUrl = params.get("difficulty");
  const timeFromUrl = params.get("time");

  if (difficultyFromUrl) difficultySelect.value = difficultyFromUrl;
  if (timeFromUrl) timeSelect.value = timeFromUrl;

  currentDifficulty = difficultySelect.value;
  durationSec = Number(timeSelect.value || 0);

  startGame();
}

/* ===== UI wiring ===== */
/* ===== Sair (confirma antes de deixar o jogo, com ou sem equipes) ===== */
function confirmExit() {
  stopTimer();
  const goToCatalog = () => { window.location.href = "../../index.html#catalogo"; };
  const shown = showScorePopup({
    title: "👋 Sair do jogo?",
    footer: buildExitFooter(goToCatalog),
  });
  if (!shown) goToCatalog();
}

function wireUI() {
  startBtn.addEventListener("click", () => {
    currentDifficulty = difficultySelect.value;
    durationSec = Number(timeSelect.value || 0);
    startGame();
  });

  revealBtn.addEventListener("click", revealAnswer);

  nextBtn.addEventListener("click", () => {
    if (!gameOver) nextQuote();
  });

  restartTimerBtn.addEventListener("click", () => {
    if (!gameOver) resetAndStartTimer();
  });

  playAgainBtn?.addEventListener("click", restartGame);

  exitBtn.addEventListener("click", confirmExit);
  brandLink.addEventListener("click", (e) => {
    // Só confirma se o jogo já estiver em andamento — na tela de
    // configuração não há nada a perder, deixa navegar direto.
    if (gameScreen.classList.contains("d-none")) return;
    e.preventDefault();
    confirmExit();
  });

  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    const k = e.key.toLowerCase();
    if (k === "n") nextBtn.click();
    if (k === "r") revealBtn.click();
  });
}

/* ===== Game flow ===== */
function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");

  answerBox.classList.add("d-none");
  revealBtn.textContent = "Revelar";

  restartGame();
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  currentDifficulty = difficultySelect.value;
  durationSec = Number(timeSelect.value || 0);

  badgeDifficulty.textContent = difficultyLabel(currentDifficulty);

  const list = (data?.[currentDifficulty] ?? []).filter(Boolean);
  pool = shuffleArray(list);
  idx = 0;

  if (!pool.length) {
    endGame("SEM FRASES");
    return;
  }

  loadQuoteAtIndex(idx);
  resetAndStartTimer();
  updateProgress();
}

function nextQuote() {
  stopTimer();

  idx++;

  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  loadQuoteAtIndex(idx);
  resetAndStartTimer();
  updateProgress();
}

function loadQuoteAtIndex(i) {
  current = pool[i];

  quoteText.textContent = `“${current.quote}”`;

  answerBox.classList.add("d-none");
  answerText.textContent = "";
  referenceText.textContent = "";

  revealBtn.textContent = "Revelar";
}

function revealAnswer() {
  if (!current) return;

  answerText.textContent = current.answer ?? "—";
  referenceText.textContent = current.reference ? `📖 ${current.reference}` : "";

  answerBox.classList.remove("d-none");
  revealBtn.textContent = "Resposta revelada";
}

/* ===== Progress ===== */
function updateProgress() {
  const total = pool.length || 0;
  const done = Math.min(idx + 1, total);
  badgeProgress.textContent = total ? `${done}/${total}` : "0/0";
}

/* ===== End ===== */
function endGame(text) {
  stopTimer();
  gameOver = true;
  setGameOverUI(true);

  quoteText.textContent = text;
  answerBox.classList.add("d-none");
  timerText.textContent = "";
  timerBar.style.width = "0%";

  badgeProgress.textContent = `${pool.length}/${pool.length}`;

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
}

/* ===== Timer ===== */
function createOrUpdateTimer() {
  stopTimer();

  if (durationSec <= 0) {
    timer = null;
    timerText.textContent = "Sem tempo";
    timerBar.style.width = "0%";
    timerBar.classList.remove("bg-danger");
    return;
  }

  timer = createCountdownTimer({
    durationSec,
    onTick: ({ remainingSec, progress01 }) => {
      timerText.textContent = `${remainingSec}s`;
      timerBar.style.width = `${Math.round(progress01 * 100)}%`;

      if (remainingSec <= 5) timerBar.classList.add("bg-danger");
      else timerBar.classList.remove("bg-danger");
    },
    onEnd: () => {
      timerText.textContent = "Tempo!";
      timerBar.style.width = "0%";
      timerBar.classList.add("bg-danger");
    }
  });
}

function resetAndStartTimer() {
  createOrUpdateTimer();
  if (!timer) return;
  timer.reset(durationSec);
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
}

/* ===== UI state ===== */
function setGameOverUI(isOver) {
  nextBtn.disabled = isOver;
  restartTimerBtn.disabled = isOver;
  revealBtn.disabled = isOver;

  if (playAgainBtn && gameOverNotice) {
    playAgainBtn.classList.toggle("d-none", !isOver);
    gameOverNotice.classList.toggle("d-none", !isOver);
  }
}

/* ===== Helpers ===== */
function difficultyLabel(v) {
  if (v === "easy") return "Fácil";
  if (v === "medium") return "Médio";
  return "Difícil";
}