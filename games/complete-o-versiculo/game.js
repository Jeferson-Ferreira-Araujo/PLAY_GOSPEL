import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
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

const verseText = document.getElementById("verseText");
const referenceBox = document.getElementById("referenceBox");
const referenceText = document.getElementById("referenceText");

const turnBanner = document.getElementById("turnBanner");
const turnBannerTeam = document.getElementById("turnBannerTeam");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const showAnswerBtn = document.getElementById("showAnswerBtn");
const correctBtn = document.getElementById("correctBtn");
const wrongBtn = document.getElementById("wrongBtn");
const passTurnBtn = document.getElementById("passTurnBtn");

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

let current = null; // { text, reference }
let timer = null;
let gameOver = false;

// Passar a vez: quantas vezes a vez já passou nesta frase, e quem já tentou
let passCount = 0;
let triedTeamIds = new Set();
let verseStartTurn = 0; // time que iniciou a frase (base da rotação p/ a próxima)

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
  if (passTurnBtn) passTurnBtn.style.display = visible ? "inline-block" : "none";
}

function renderTeamUI() {
  const enabled = Teams.isEnabled();
  setTeamsControlsVisible(enabled);

  if (!enabled) {
    turnBanner?.classList.add("d-none");
    return;
  }

  const t = Teams.currentTeam();
  turnBanner?.classList.toggle("d-none", !t);
  if (!t) return;

  if (turnBannerTeam) turnBannerTeam.textContent = t.name;
  turnBanner?.style.setProperty("--team-color", t.color || "#F4C430");

  if (correctBtn) correctBtn.textContent = `Acertou (+${passCount + 1})`;
  if (wrongBtn) wrongBtn.textContent = `Errou (-${passCount + 1})`;

  const state = Teams.getState();
  const canPass = state.teams.length > triedTeamIds.size;
  if (passTurnBtn) passTurnBtn.disabled = gameOver || !canPass;
}

// Atualiza quando algo muda em equipes (placar/vez)
window.addEventListener("bibflix:teams:change", renderTeamUI);

/* =========================
   PASSAR A VEZ
========================= */
function resetPassChain() {
  passCount = 0;
  triedTeamIds = new Set();
  verseStartTurn = Teams.getState().turn;

  const t = Teams.currentTeam();
  if (t) triedTeamIds.add(t.id);

  renderTeamUI();
}

// Avança a rotação a partir de quem INICIOU a frase (não de quem respondeu
// depois de um "passar a vez"), assim cada time mantém sua vez de começar.
function advanceFromVerseStart() {
  const n = Teams.getState().teams.length;
  if (!n) return;
  Teams.setTurn((verseStartTurn + 1) % n);
}

function passTurn() {
  if (!Teams.isEnabled()) return;

  const state = Teams.getState();
  const n = state.teams.length;

  if (n === 2) {
    Teams.nextTurn();
  } else {
    const candidates = state.teams
      .map((_, i) => i)
      .filter((i) => !triedTeamIds.has(state.teams[i].id));

    if (!candidates.length) return; // botão já deveria estar desabilitado

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    Teams.setTurn(pick);
  }

  passCount += 1;

  const t = Teams.currentTeam();
  if (t) triedTeamIds.add(t.id);

  renderTeamUI();
  resetAndStartTimer();
}

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  renderTeamScoreboard(teamsScoreboard, { clickable: false });

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
      Teams.addPoint(passCount + 1);
      advanceFromVerseStart();
    }

    renderTeamUI();
    nextVerse();
  });

  // Errou: desconta os mesmos pontos que estavam em jogo (o valor cresce
  // a cada "Passar a vez", igual ao acerto) e encerra a tentativa desta
  // frase — não dá pra passar depois de errar.
  wrongBtn?.addEventListener("click", () => {
    if (gameOver) return;

    if (Teams.isEnabled()) {
      Teams.addPoint(-(passCount + 1));
      advanceFromVerseStart();
    }

    renderTeamUI();
    nextVerse();
  });

  // Time atual não sabe: passa a vez, mesma frase continua
  passTurnBtn?.addEventListener("click", () => {
    if (gameOver) return;
    passTurn();
  });

  // Próximo (pula) — desfaz passes da frase e mantém quem a iniciou
  nextBtn.addEventListener("click", () => {
    if (gameOver) return;
    if (Teams.isEnabled()) Teams.setTurn(verseStartTurn);
    nextVerse();
  });

  restartTimerBtn.addEventListener("click", () => {
    if (gameOver) return;
    resetAndStartTimer();
  });

  playAgainBtn.addEventListener("click", restartGame);
  exitBtn.addEventListener("click", confirmExit);
  brandLink.addEventListener("click", (e) => {
    // Só confirma se o jogo já estiver em andamento — na tela de
    // configuração não há nada a perder, deixa navegar direto.
    if (gameScreen.classList.contains("d-none")) return;
    e.preventDefault();
    confirmExit();
  });

  // atalhos
  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    const k = e.key.toLowerCase();
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

  resetPassChain();
}

function endGame(text) {
  stopTimer();
  gameOver = true;
  setGameOverUI(true);

  verseText.textContent = text;
  timerText.textContent = "";
  timerBar.style.width = "0%";

  badgeProgress.textContent = `${pool.length}/${pool.length}`;

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
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
  if (passTurnBtn) passTurnBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

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

function confirmExit() {
  const shown = showScorePopup({
    title: "👋 Sair do jogo?",
    footer: buildExitFooter(exitGame),
  });
  if (!shown) exitGame();
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
