import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";

/* ===== Elements (setup) ===== */
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const btnFullscreen = document.getElementById("btnFullscreen");
const startBtn = document.getElementById("startBtn");
const difficultySelect = document.getElementById("difficultySelect");
const timeSelect = document.getElementById("timeSelect");

/* ===== Elements (presenter) ===== */
const badgeDifficulty = document.getElementById("badgeDifficulty");
const badgeProgress = document.getElementById("badgeProgress");

const badgeTeam = document.getElementById("badgeTeam");
const teamDot = document.getElementById("teamDot");
const teamText = document.getElementById("teamText");

const verseText = document.getElementById("verseText");
const referenceBox = document.getElementById("referenceBox");
const referenceText = document.getElementById("referenceText");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const showAnswerBtn = document.getElementById("showAnswerBtn");
const correctBtn = document.getElementById("correctBtn");
const wrongBtn = document.getElementById("wrongBtn");

const nextBtn = document.getElementById("nextBtn");
const restartTimerBtn = document.getElementById("restartTimerBtn");
const exitBtn = document.getElementById("exitBtn");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

/* ===== State ===== */
let data = null;

let currentDifficulty = "easy";
let durationSec = 30;

let pool = [];
let idx = 0;

let current = null; // { text, reference }
let timer = null;
let gameOver = false;

/* =========================
   URL PARAMS
========================= */
function getParam(name) {
  return new URL(window.location.href).searchParams.get(name);
}

function shouldAutoPlay() {
  return getParam("play") === "1";
}

function applyParamsToSetupUI() {
  const difficulty = getParam("difficulty");
  const time = getParam("time");

  if (difficulty) difficultySelect.value = difficulty;
  if (time !== null) timeSelect.value = String(time);
}

/* =========================
   TEAMS UI
========================= */
function setTeamsControlsVisible(visible) {
  if (correctBtn) correctBtn.style.display = visible ? "inline-block" : "none";
  if (wrongBtn) wrongBtn.style.display = visible ? "inline-block" : "none";
}

function renderTeamUI() {
  const enabled = Teams.isEnabled();

  // mostrar/esconder botões e badge
  setTeamsControlsVisible(enabled);

  if (!badgeTeam) return;

  if (!enabled) {
    badgeTeam.style.display = "none";
    if (teamText) teamText.textContent = "";
    if (teamDot) teamDot.style.background = "#888";
    return;
  }

  const t = Teams.currentTeam();
  if (!t) {
    badgeTeam.style.display = "none";
    return;
  }

  badgeTeam.style.display = "inline-block";
  if (teamText) teamText.textContent = `Vez: ${t.name} (${t.score})`;

  // cor do time
  const c = t.color || "#888";
  badgeTeam.style.borderColor = c;
  if (teamDot) teamDot.style.background = c;
}

// Atualiza quando algo muda em equipes (placar/vez)
window.addEventListener("bibflix:teams:change", renderTeamUI);

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();

  if (shouldAutoPlay()) {
    applyParamsToSetupUI();
    currentDifficulty = difficultySelect.value;
    durationSec = Number(timeSelect.value || 0);
    startGame();
  }
});

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  data = await res.json();
}

/* =========================
   UI WIRING
========================= */
function wireUI() {
  btnFullscreen?.addEventListener("click", toggleFullscreen);

  startBtn.addEventListener("click", () => {
    currentDifficulty = difficultySelect.value;
    durationSec = Number(timeSelect.value || 0);
    startGame();
  });

  showAnswerBtn.addEventListener("click", revealAnswer);

  // Pontuação (equipes)
  correctBtn?.addEventListener("click", () => {
    if (gameOver) return;

    if (Teams.isEnabled()) {
      Teams.addPoint(1);
      Teams.nextTurn();
    }

    renderTeamUI();
    nextVerse();
  });

  wrongBtn?.addEventListener("click", () => {
    if (gameOver) return;

    if (Teams.isEnabled()) {
      Teams.nextTurn();
    }

    renderTeamUI();
    nextVerse();
  });

  // Próximo (pula) — NÃO muda vez
  nextBtn.addEventListener("click", () => {
    if (gameOver) return;
    nextVerse();
  });

  restartTimerBtn.addEventListener("click", () => {
    if (gameOver) return;
    resetAndStartTimer();
  });

  playAgainBtn.addEventListener("click", restartGame);
  exitBtn.addEventListener("click", exitGame);

  // atalhos
  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    const k = e.key.toLowerCase();
    if (k === "f") toggleFullscreen();
    if (k === "n") nextBtn.click();
    if (k === "r") showAnswerBtn.click();
  });
}

/* =========================
   GAME FLOW
========================= */
function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
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

  loadVerseAtIndex(idx);
  resetAndStartTimer();
  updateProgress();
  renderTeamUI();
}

function nextVerse() {
  stopTimer();

  idx += 1;

  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  loadVerseAtIndex(idx);
  resetAndStartTimer();
  updateProgress();
  renderTeamUI();
}

function loadVerseAtIndex(i) {
  current = pool[i];

  referenceBox.classList.add("d-none");
  referenceText.textContent = "";

  renderVerseWithBlanks(current.text, currentDifficulty);

  showAnswerBtn.textContent = "Mostrar resposta";
}

function endGame(text) {
  stopTimer();
  gameOver = true;
  setGameOverUI(true);

  verseText.textContent = text;
  timerText.textContent = "";
  timerBar.style.width = "0%";

  badgeProgress.textContent = `${pool.length}/${pool.length}`;
}

/* =========================
   PROGRESS
========================= */
function updateProgress() {
  const total = pool.length || 0;
  const done = Math.min(idx + 1, total);
  badgeProgress.textContent = total ? `${done}/${total}` : "0/0";
}

/* =========================
   REVEAL ANSWER
========================= */
function revealAnswer() {
  if (!current) return;

  document.querySelectorAll(".blank").forEach((el) => {
    el.classList.add("revealed");
  });

  referenceText.textContent = current.reference ? `📖 ${current.reference}` : "";
  referenceBox.classList.remove("d-none");

  showAnswerBtn.textContent = "Resposta revelada";
}

/* =========================
   BLANKS LOGIC
========================= */
function renderVerseWithBlanks(text, difficulty) {
  const tokens = tokenize(text);
  const wordPositions = [];

  for (let i = 0; i < tokens.length; i++) {
    if (isWordToken(tokens[i])) wordPositions.push(i);
  }

  const blanksCount = getBlankCount(difficulty);

  const candidates = wordPositions.filter(
    (i) => tokens[i].replace(/[^A-Za-zÀ-ÿ']/g, "").length >= 3
  );
  const pickFrom = candidates.length >= blanksCount ? candidates : wordPositions;

  const picked = new Set(
    shuffleArray(pickFrom).slice(0, Math.min(blanksCount, pickFrom.length))
  );

  verseText.innerHTML = tokens
    .map((t, i) => {
      if (picked.has(i)) {
        const clean = escapeHtml(t);
        return `<span class="blank" data-word="${clean}">${clean}</span>`;
      }
      return escapeHtml(t);
    })
    .join("");
}

function getBlankCount(difficulty) {
  if (difficulty === "easy") return 1;
  if (difficulty === "medium") return 2;
  return 3 + Math.floor(Math.random() * 2);
}

function tokenize(text) {
  return text.match(/\S+|\s+/g) || [];
}

function isWordToken(t) {
  return /[A-Za-zÀ-ÿ]/.test(t);
}

/* =========================
   TIMER
========================= */
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
    },
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

/* =========================
   UI STATE
========================= */
function setGameOverUI(isOver) {
  nextBtn.disabled = isOver;
  restartTimerBtn.disabled = isOver;

  if (correctBtn) correctBtn.disabled = isOver;
  if (wrongBtn) wrongBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

/* =========================
   FULLSCREEN
========================= */
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      btnFullscreen.textContent = "Sair da tela cheia";
    } else {
      await document.exitFullscreen();
      btnFullscreen.textContent = "Tela cheia";
    }
  } catch {}
}

document.addEventListener("fullscreenchange", () => {
  if (!btnFullscreen) return;
  btnFullscreen.textContent = document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia";
});

/* =========================
   EXIT
========================= */
function exitGame() {
  stopTimer();
  gameOver = false;
  setGameOverUI(false);

  gameScreen.classList.add("d-none");
  setupScreen.classList.remove("d-none");

  verseText.textContent = "—";
  referenceBox.classList.add("d-none");
  referenceText.textContent = "";
  timerText.textContent = "--";
  timerBar.style.width = "0%";
  badgeProgress.textContent = "0/0";

  window.location.href = "../../index.html";
}

/* =========================
   HELPERS
========================= */
function difficultyLabel(v) {
  if (v === "easy") return "Fácil";
  if (v === "medium") return "Médio";
  return "Difícil";
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}
