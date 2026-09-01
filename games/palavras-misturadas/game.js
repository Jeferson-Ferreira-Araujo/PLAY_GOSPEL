import { createCountdownTimer, shuffleArray } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { renderTeamScoreboard } from "../../assets/js/scoreboard-ui.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { icon } from "../../playgospel-ui/js/core.js";

/* ===== ELEMENTS ===== */
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const categorySelect = document.getElementById("categorySelect");
const timeSelect = document.getElementById("timeSelect");
const startBtn = document.getElementById("startBtn");

const scrambledWordEl = document.getElementById("scrambledWord");

const badgeCategory = document.getElementById("badgeCategory");
const badgeRound = document.getElementById("badgeRound");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const newWordBtn = document.getElementById("newWordBtn");
const showAnswerBtn = document.getElementById("showAnswerBtn");
const restartTimerBtn = document.getElementById("restartTimerBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

const teamsScoreboard = document.getElementById("teamsScoreboard");
const teamScoreButtons = document.getElementById("teamScoreButtons");

/* ===== STATE ===== */
let data = null;
let currentCategory = null;
let currentWord = "";
let round = 0;

let timer = null;
let selectedDurationSec = 30;

let wordPool = [];
let poolIndex = 0;

let gameOver = false;

let answerRevealed = false;
let timeExpired = false;

// Fases da rodada: "countdown" (3,2,1 antes da palavra aparecer),
// "playing" (palavra visível, times podem pontuar) e "ended" (alguém
// pontuou ou o tempo acabou — só resta clicar em "Nova palavra").
let roundPhase = "idle";
let countdownInterval = null;

/* ========================= INIT ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  wireUI();
  renderTeamScoreboard(teamsScoreboard, { clickable: false });
  renderTeamScoreButtons();
  window.addEventListener("bibflix:teams:change", renderTeamScoreButtons);
  applyParamsFromURL();
});

/* ===== Formato "disputa": um botão de pontuação por equipe ativa =====
   Todas as equipes veem a mesma palavra ao mesmo tempo; quem administra o
   jogo clica no botão da equipe que falar a resposta certa primeiro. */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function teamIconName(team) {
  return Teams.teamIconNames.includes(team.icon) ? team.icon : "star";
}

function renderTeamScoreButtons() {
  // Só aparecem depois que a resposta certa foi revelada na tela — assim
  // quem administra confere a palavra antes de dar o ponto pra equipe
  // certa (evita pontuar a equipe errada por engano).
  if (!Teams.isEnabled() || !answerRevealed || gameOver) {
    teamScoreButtons.innerHTML = "";
    teamScoreButtons.classList.add("d-none");
    return;
  }

  const state = Teams.getState();
  teamScoreButtons.classList.remove("d-none");

  const locked = roundPhase !== "playing";

  teamScoreButtons.innerHTML = state.teams.map((team, index) => `
    <button
      type="button"
      class="pm-team-btn"
      data-index="${index}"
      style="--team-color:${escapeHtml(team.color)}"
      ${locked ? "disabled" : ""}
    >
      <span class="pm-team-btn-icon">${icon(teamIconName(team), { size: 16 })}</span>
      <span>${escapeHtml(team.name)} acertou</span>
    </button>
  `).join("");

  teamScoreButtons.querySelectorAll(".pm-team-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (gameOver || roundPhase !== "playing") return;

      const index = Number(btn.dataset.index);
      Teams.setTurn(index);
      Teams.addPoint(1);

      revealAnswer();
      playPointSound();
      afterPoint();
      setRoundPhase("ended");
    });
  });
}

/* ===== Fase da rodada (countdown / playing / ended) ===== */
function setRoundPhase(phase) {
  roundPhase = phase;

  newWordBtn.disabled = gameOver || phase === "countdown";
  restartTimerBtn.disabled = gameOver || phase !== "playing";

  renderTeamScoreButtons();
}

function clearCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}

/* ========================= LOAD ========================= */
async function loadWords() {
  const res = await fetch("./words.json", { cache: "no-store" });
  data = await res.json();

  categorySelect.innerHTML =
    `<option value="" disabled selected>Selecione...</option>` +
    data.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

  if (data.categories.length) {
    categorySelect.value = data.categories[0].id;
  }
}

/* ========================= URL ========================= */
function applyParamsFromURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("play") !== "1") return;

  const categoryFromUrl = params.get("category");
  const timeFromUrl = params.get("time");

  if (categoryFromUrl) categorySelect.value = categoryFromUrl;

  if (timeFromUrl !== null) {
    timeSelect.value = timeFromUrl;
    selectedDurationSec = Number(timeFromUrl);
  }

  const catId = categorySelect.value;
  if (!catId) return;

  currentCategory = data.categories.find(c => c.id === catId);

  startGame();
}

/* ===== Sair (confirma antes de deixar o jogo, com ou sem equipes) ===== */
function confirmExit() {
  clearCountdown();
  stopTimer();
  const goToCatalog = () => { window.location.href = "../../index.html"; };
  const shown = showScorePopup({
    title: "👋 Sair do jogo?",
    footer: buildExitFooter(goToCatalog),
  });
  if (!shown) goToCatalog();
}

/* ========================= UI ========================= */
function wireUI() {
  timeSelect.addEventListener("change", () => {
    selectedDurationSec = Number(timeSelect.value || 0);
  });

  startBtn.addEventListener("click", () => {
    const catId = categorySelect.value;
    if (!catId) return;

    currentCategory = data.categories.find(c => c.id === catId);
    selectedDurationSec = Number(timeSelect.value || 0);

    startGame();
  });

  newWordBtn.addEventListener("click", () => {
    if (gameOver || roundPhase === "countdown") return;
    nextWord();
  });

  showAnswerBtn.addEventListener("click", () => {
    toggleAnswer();
  });

  restartTimerBtn.addEventListener("click", () => {
    if (gameOver || roundPhase !== "playing") return;

    if (!answerRevealed) {
      scrambledWordEl.textContent = scrambleKeepSpaces(currentWord);
    }

    timeExpired = false;
    answerRevealed = false;

    showAnswerBtn.textContent = "Mostrar resposta";

    startOrResetTimer();
  });

  playAgainBtn.addEventListener("click", () => {
    round = 0;
    gameOver = false;
    setGameOverUI(false);

    buildWordPool();
    nextWord();
  });

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

    if (e.code === "Space") {
      e.preventDefault();
      if (gameOver || roundPhase === "countdown") return;
      nextWord();
    }
  });
}

/* ========================= GAME ========================= */
function startGame() {
  if (!currentCategory) return;

  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");

  badgeCategory.textContent = currentCategory.name;

  round = 0;
  gameOver = false;
  setGameOverUI(false);

  buildWordPool();

  nextWord();
}

function nextWord() {
  const next = getNextWordNoRepeat();

  if (!next) {
    endGame();
    return;
  }

  round++;
  badgeRound.textContent = `Rodada ${round}/${wordPool.length}`;

  currentWord = next;
  answerRevealed = false;
  timeExpired = false;

  startCountdown();
}

/* ===== Contagem "3, 2, 1" antes de cada palavra — dá tempo das equipes
   se prepararem antes da palavra aparecer na tela. ===== */
function startCountdown() {
  clearCountdown();
  stopTimer();
  setRoundPhase("countdown");

  showAnswerBtn.classList.add("d-none");
  scrambledWordEl.classList.add("pm-countdown");

  timerBar.style.width = "0%";

  let n = 3;
  timerText.textContent = "Prepare-se!";
  scrambledWordEl.textContent = String(n);

  countdownInterval = setInterval(() => {
    n -= 1;

    if (n > 0) {
      scrambledWordEl.textContent = String(n);
      return;
    }

    clearCountdown();
    beginRound();
  }, 1000);
}

function beginRound() {
  scrambledWordEl.classList.remove("pm-countdown");
  scrambledWordEl.textContent = scrambleKeepSpaces(currentWord);

  showAnswerBtn.classList.remove("d-none");
  showAnswerBtn.textContent = "Mostrar resposta";

  setRoundPhase("playing");
  startOrResetTimer();

  if (selectedDurationSec <= 0) {
    timerText.textContent = "Sem tempo";
    timerBar.style.width = "0%";
  }
}

function toggleAnswer() {
  if (!currentWord) return;

  if (!answerRevealed) {
    revealAnswer();
  } else {
    hideAnswer();
  }
}

function revealAnswer() {
  answerRevealed = true;

  // 🔥 PARA O TEMPO
  stopTimer();
  timerText.textContent = "Resposta revelada";
  timerBar.style.width = "0%";

  // 🔥 MOSTRA NO CENTRO
  scrambledWordEl.textContent = currentWord;

  showAnswerBtn.textContent = "Ocultar resposta";
  renderTeamScoreButtons();
}

function hideAnswer() {
  answerRevealed = false;

  scrambledWordEl.textContent = scrambleKeepSpaces(currentWord);

  showAnswerBtn.textContent = "Mostrar resposta";
  renderTeamScoreButtons();
}

function endGame() {
  gameOver = true;
  clearCountdown();
  stopTimer();

  scrambledWordEl.classList.remove("pm-countdown");
  scrambledWordEl.textContent = "FIM DE JOGO";
  setGameOverUI(true);

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(() => playAgainBtn.click()),
  });
}

/* ========================= AFTER POINT ========================= */
function afterPoint() {
  stopTimer();

  timerText.textContent = "Ponto registrado!";
  timerBar.style.width = "0%";
}

/* ========================= TIMER ========================= */
function createOrUpdateTimer() {
  stopTimer();

  if (selectedDurationSec <= 0) return;

  timer = createCountdownTimer({
    durationSec: selectedDurationSec,
    onTick: ({ remainingSec, progress01 }) => {
      timerText.textContent = `${remainingSec}s`;
      timerBar.style.width = `${progress01 * 100}%`;
    },
    onEnd: () => {
      timerText.textContent = "Tempo esgotado!";
      timerBar.style.width = "0%";

      timeExpired = true;

      // A palavra some da tela; só resta clicar em "Nova palavra".
      scrambledWordEl.textContent = "⏱️";
      showAnswerBtn.classList.add("d-none");

      setRoundPhase("ended");
    }
  });
}

function startOrResetTimer() {
  createOrUpdateTimer();
  if (!timer) return;

  timer.reset(selectedDurationSec);
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
}

/* ========================= HELPERS ========================= */
function scrambleKeepSpaces(phrase) {
  return phrase.split(" ").map(scrambleToken).join(" ");
}

function scrambleToken(token) {
  return shuffleArray([...token]).join("");
}

function setGameOverUI(isOver) {
  newWordBtn.disabled = isOver;
  restartTimerBtn.disabled = isOver;
  teamsScoreboard.style.pointerEvents = isOver ? "none" : "";
  renderTeamScoreButtons();

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

function playPointSound() {
  try {
    const audio = new Audio("../../assets/sounds/correct.mp3");
    audio.play();
  } catch {}
}

/* ========================= WORD POOL ========================= */
// Cada partida sorteia até ROUND_SIZE palavras de uma "fila" da categoria
// (evita jogar todas de uma vez). A fila persiste entre partidas ("Jogar
// novamente"), então nenhuma palavra repete enquanto ainda sobrar alguma
// não usada na categoria — só quando a fila esvaziar ela é reembaralhada
// e recomeça do zero (podendo repetir a partir daí).
const ROUND_SIZE = 10;

let categoryQueue = [];
let categoryQueueId = null;

function buildWordPool() {
  if (categoryQueueId !== currentCategory.id || categoryQueue.length === 0) {
    categoryQueue = shuffleArray(currentCategory.words || []);
    categoryQueueId = currentCategory.id;
  }

  wordPool = categoryQueue.splice(0, ROUND_SIZE);
  poolIndex = 0;
}

function getNextWordNoRepeat() {
  if (!wordPool.length) return null;
  if (poolIndex >= wordPool.length) return null;

  return wordPool[poolIndex++];
}