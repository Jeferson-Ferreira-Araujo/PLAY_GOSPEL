import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { icon } from "../../playgospel-ui/js/core.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { BibleVersion } from "../../assets/js/bible-version.js";
import { mountBibleVersionPicker } from "../../assets/js/bible-version-ui.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";

// Máximo de rodadas por partida (evita jogar todas as frases de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");
const teamScoreButtons = document.getElementById("teamScoreButtons");
const pointsBox = document.getElementById("pointsBox");

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
const timerRow = document.getElementById("presenterTimerRow");

/* ===== State ===== */
let data = null;

let currentDifficulty = "easy";
let durationSec = 30;

let pool = [];
let idx = 0;

let current = null;
let timer = null;
let gameOver = false;
let countdownInterval = null;

// Resposta revelada nesta frase e ponto já dado — controlam quando os
// botões "X acertou" aparecem/ficam habilitados (ver renderTeamScoreButtons).
let answerRevealed = false;
let pointGiven = false;

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  renderTeamScoreButtons();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTeamScoreButtons();
    updateScoreBtn();
  });
  mountBibleVersionPicker(document.querySelector(".game-topbar-actions"));
  window.addEventListener("bibflix:bible-version:change", reloadCurrentQuoteText);
  mountSoundMuteButton(document.querySelector(".game-topbar-actions"));
  checkAutoStartFromURL(); // 🔥 NOVO
});

// Placar sob demanda (padrão do site): um botão no cabeçalho que abre o
// popup com o ranking, em vez de um placar fixo. Só aparece durante o
// jogo (não na tela de configuração) e só com equipes ativas.
function updateScoreBtn() {
  if (!scoreBtn) return;
  const show = !gameScreen.classList.contains("d-none") && Teams.isEnabled();
  scoreBtn.classList.toggle("d-none", !show);
  pointsBox?.classList.toggle("d-none", !show);
}

/* ===== Formato "disputa": um botão de pontuação por equipe ativa =====
   Todas as equipes veem a mesma frase ao mesmo tempo; quem administra o
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
  // quem administra confere antes de dar o ponto pra equipe certa.
  if (!teamScoreButtons) return;

  if (!Teams.isEnabled() || !answerRevealed || gameOver) {
    teamScoreButtons.innerHTML = "";
    teamScoreButtons.classList.add("d-none");
    return;
  }

  const state = Teams.getState();
  teamScoreButtons.classList.remove("d-none");

  teamScoreButtons.innerHTML = state.teams.map((team, index) => `
    <button
      type="button"
      class="qd-team-btn"
      data-index="${index}"
      style="--team-color:${escapeHtml(team.color)}"
      ${pointGiven ? "disabled" : ""}
    >
      <span class="qd-team-btn-icon">${icon(teamIconName(team), { size: 16 })}</span>
      <span>${escapeHtml(team.name)} acertou</span>
    </button>
  `).join("");

  teamScoreButtons.querySelectorAll(".qd-team-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (gameOver || pointGiven) return;

      const index = Number(btn.dataset.index);
      Teams.setTurn(index);
      Teams.addPoint(1);

      pointGiven = true;
      renderTeamScoreButtons();
    });
  });
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  data = await res.json();
}

/* ===== AUTO START — a tela de configuração ficou só no modal do
   catálogo (que já barra "Jogar" sem equipes ativas — ver
   assets/js/app.js). Se mesmo assim alguém cair aqui sem equipes (link
   direto, por exemplo), volta pro catálogo em vez de mostrar um jogo
   sem placar. ===== */
async function checkAutoStartFromURL() {
  if (!Teams.isEnabled()) {
    window.location.href = "../../index.html#catalogo";
    return;
  }

  const params = new URLSearchParams(window.location.search);

  const difficultyFromUrl = params.get("difficulty");
  const timeFromUrl = params.get("time");

  if (difficultyFromUrl) difficultySelect.value = difficultyFromUrl;
  if (timeFromUrl) timeSelect.value = timeFromUrl;

  currentDifficulty = difficultySelect.value;
  durationSec = Number(timeSelect.value || 0);

  await maybeShowDrawIntro();
  startGame();
}

/* ===== UI wiring ===== */
/* ===== Sair (confirma antes de deixar o jogo, com ou sem equipes) ===== */
function confirmExit() {
  stopTimer();
  clearCountdown();
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

  scoreBtn?.addEventListener("click", () => showScorePopup());

  exitBtn.addEventListener("click", confirmExit);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

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
  updateScoreBtn();

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
  // Cada partida sorteia até ROUND_SIZE frases (evita jogar todas de uma
  // vez).
  pool = shuffleArray(list).slice(0, ROUND_SIZE);
  idx = 0;

  if (!pool.length) {
    endGame("SEM FRASES");
    return;
  }

  updateProgress();
  // Esconde os botões de pontuação enquanto conta "Prepare-se!" — só
  // voltam quando loadQuoteAtIndex resetar a frase, pra ninguém clicar
  // antes da rodada realmente começar.
  teamScoreButtons?.classList.add("d-none");

  startPrepareCountdown(() => {
    loadQuoteAtIndex(idx);
    timerRow?.classList.remove("d-none");
    resetAndStartTimer();
  });
}

function nextQuote() {
  stopTimer();

  idx++;

  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  updateProgress();
  teamScoreButtons?.classList.add("d-none");

  startPrepareCountdown(() => {
    loadQuoteAtIndex(idx);
    timerRow?.classList.remove("d-none");
    resetAndStartTimer();
  });
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/* Contagem "3, 2, 1" antes de cada frase nova — dá tempo do grupo se
   preparar antes do timer voltar a contar. */
function startPrepareCountdown(onDone) {
  clearCountdown();
  timerRow?.classList.add("d-none");

  let n = 3;
  quoteText.textContent = `Prepare-se! ${n}`;
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      quoteText.textContent = `Prepare-se! ${n}`;
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    onDone();
  }, 1000);
}

// Incrementado a cada frase nova/troca de tradução — busca de texto que
// terminar depois de já termos ido pra outra frase é descartada em vez
// de sobrescrever a tela errada.
let quoteRequestId = 0;

async function loadQuoteAtIndex(i) {
  current = pool[i];

  answerBox.classList.add("d-none");
  answerText.textContent = "";
  referenceText.textContent = "";

  revealBtn.textContent = "Revelar";

  answerRevealed = false;
  pointGiven = false;
  renderTeamScoreButtons();

  // Busca a tradução ANTES de escrever o texto na tela — escrever o
  // original e trocar pelo traduzido logo em seguida (como era antes)
  // fazia o texto "piscar" duas vezes, com o traduzido geralmente
  // maior/menor que o original (percebido como "o texto mudou de
  // tamanho sozinho").
  const reqId = ++quoteRequestId;
  const text = await BibleVersion.resolveText(current.quote, current.reference);
  if (reqId !== quoteRequestId) return; // já foi pra outra frase enquanto buscava
  quoteText.textContent = `“${text}”`;
}

// Troca de tradução (ver bibflix:bible-version:change) com o jogo
// parado numa frase: busca o texto na tradução nova e substitui. Só
// antes de revelar a resposta — depois disso mexer no texto não faz
// sentido (a frase já foi respondida).
function reloadCurrentQuoteText() {
  if (!current || answerRevealed || gameOver) return;
  const reqId = ++quoteRequestId;
  BibleVersion.resolveText(current.quote, current.reference).then((text) => {
    if (reqId !== quoteRequestId) return;
    quoteText.textContent = `“${text}”`;
  });
}

function revealAnswer() {
  if (!current) return;

  answerText.textContent = current.answer ?? "—";
  referenceText.textContent = current.reference ? `📖 ${current.reference}` : "";

  answerBox.classList.remove("d-none");
  revealBtn.textContent = "Resposta revelada";

  answerRevealed = true;
  // Depois de revelar não precisa mais contar — esconde o timer até a
  // próxima frase começar.
  stopTimer();
  timerRow?.classList.add("d-none");
  renderTeamScoreButtons();
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
  clearCountdown();
  gameOver = true;
  setGameOverUI(true);

  quoteText.textContent = text;
  answerBox.classList.add("d-none");
  timerText.textContent = "";
  timerBar.style.width = "0%";
  timerRow?.classList.add("d-none");

  badgeProgress.textContent = `${pool.length}/${pool.length}`;
  renderTeamScoreButtons();

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