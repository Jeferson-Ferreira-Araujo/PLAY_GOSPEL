import { createCountdownTimer, shuffleArray } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { icon } from "../../playgospel-ui/js/core.js";
import { playCorrectSound } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";

/* ===== ELEMENTS ===== */
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const categorySelect = document.getElementById("categorySelect");
const timeSelect = document.getElementById("timeSelect");
const startBtn = document.getElementById("startBtn");
const teamsSetupWarning = document.getElementById("teamsSetupWarning");

const scrambledWordEl = document.getElementById("scrambledWord");

const badgeCategory = document.getElementById("badgeCategory");
const badgeRound = document.getElementById("badgeRound");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const readyBtn = document.getElementById("readyBtn");
const newWordBtn = document.getElementById("newWordBtn");
const showAnswerBtn = document.getElementById("showAnswerBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

const scoreBtn = document.getElementById("scoreBtn");
const teamScoreButtons = document.getElementById("teamScoreButtons");
const pairRow = document.getElementById("pairRow");

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

// ===== Rodízio de pares (2 equipes por rodada) =====
// Com só 2 equipes ativas, o par é sempre o mesmo (as duas). Com 3+, a
// ordem das equipes é embaralhada uma vez no início da partida e o par
// avança uma posição a cada rodada (A x B, B x C, C x A, repete...) — um
// rodízio circular que garante que ninguém fica de fora rodadas seguidas
// (cada equipe entra em 2 de cada N rodadas do ciclo).
let pairOrder = [];
let pairCursor = -1;
let currentPair = null; // [índiceEquipeA, índiceEquipeB] ou null antes da 1ª rodada

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  return shuffleArray(arr);
}

function initPairing() {
  const n = Teams.getState().teams.length;
  pairOrder = shuffledIndices(n);
  pairCursor = -1;
  currentPair = null;
}

// Chamada no início de cada rodada nova: fecha a rodada anterior (avança
// quem representa cada equipe do par que acabou de jogar) e decide o
// próximo par pelo rodízio.
function advancePair() {
  const n = Teams.getState().teams.length;
  if (pairOrder.length !== n) initPairing();

  if (currentPair) {
    Teams.advanceMemberTurnFor(currentPair[0]);
    Teams.advanceMemberTurnFor(currentPair[1]);
  }

  pairCursor = (pairCursor + 1) % n;
  const a = pairOrder[pairCursor % n];
  const b = pairOrder[(pairCursor + 1) % n];
  currentPair = [a, b];
}

function renderPairRow() {
  if (!pairRow) return;
  if (!currentPair || gameOver) {
    pairRow.classList.add("d-none");
    pairRow.innerHTML = "";
    return;
  }

  const state = Teams.getState();
  pairRow.classList.remove("d-none");
  pairRow.innerHTML = currentPair.map((teamIndex) => {
    const team = state.teams[teamIndex];
    if (!team) return "";
    const player = Teams.playerOf(teamIndex);
    return `
      <div class="pm-pair-team" style="--team-color:${escapeHtml(team.color)}">
        <span class="pm-pair-team-icon">${icon(teamIconName(team), { size: 18 })}</span>
        <span class="pm-pair-team-text">
          <span class="pm-pair-team-name">${escapeHtml(team.name)}</span>
          ${player ? `<span class="pm-pair-team-player">${escapeHtml(player)}</span>` : ""}
        </span>
      </div>
    `;
  }).join(`<div class="pm-pair-vs">×</div>`);
}

let answerRevealed = false;
let timeExpired = false;

// Fases da rodada: "ready" (par mostrado, esperando confirmação de quem
// vai jogar), "countdown" (3,2,1 antes da palavra aparecer), "playing"
// (palavra visível, times podem pontuar) e "ended" (alguém pontuou ou o
// tempo acabou — só resta clicar em "Nova palavra").
let roundPhase = "idle";
let countdownInterval = null;

/* ========================= INIT ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  wireUI();
  renderTeamScoreButtons();
  updateTeamsGate();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTeamScoreButtons();
    updateTeamsGate();
    updateScoreBtn();
  });
  mountFullscreenButton(document.querySelector(".game-topbar-actions"));
  watchStageText(document.querySelector(".presenter-center"));
  mountSoundMuteButton(document.querySelector(".game-topbar-actions"));
  applyParamsFromURL();
});

// Placar sob demanda (padrão do site): um botão no cabeçalho que abre o
// popup com o ranking, em vez de um placar fixo. Só aparece durante o
// jogo (não na tela de configuração) e só com equipes ativas.
function updateScoreBtn() {
  if (!scoreBtn) return;
  const show = !gameScreen.classList.contains("d-none") && Teams.isEnabled();
  scoreBtn.classList.toggle("d-none", !show);
}

/* ===== Trava de equipes (tela de configuração) =====
   Sem equipes ativas não existe como pontuar (é um jogo de "disputa" — os
   botões de ponto só aparecem por equipe), então o Iniciar fica bloqueado
   e um aviso explica onde criar as equipes. */
function updateTeamsGate() {
  const enabled = Teams.isEnabled();
  if (teamsSetupWarning) teamsSetupWarning.classList.toggle("d-none", enabled);
  startBtn.disabled = !enabled;
}

/* ===== Formato "disputa": um botão de pontuação por equipe do par da vez =====
   Só as 2 equipes do par atual (ver advancePair) veem a mesma palavra;
   quem administra o jogo clica no botão da equipe que falar a resposta
   certa primeiro. */
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
  if (!Teams.isEnabled() || !answerRevealed || gameOver || !currentPair) {
    teamScoreButtons.innerHTML = "";
    teamScoreButtons.classList.add("d-none");
    return;
  }

  const state = Teams.getState();
  teamScoreButtons.classList.remove("d-none");

  const locked = roundPhase !== "playing";

  teamScoreButtons.innerHTML = currentPair.map((index) => {
    const team = state.teams[index];
    if (!team) return "";
    return `
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
  `;
  }).join("");

  teamScoreButtons.querySelectorAll(".pm-team-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (gameOver || roundPhase !== "playing") return;

      const index = Number(btn.dataset.index);
      Teams.setTurn(index);
      Teams.addPoint(1);

      playPointSound();
      // Time acertou: já vai direto pra próxima rodada (tela de "Pronto"),
      // sem esperar clicar em "Nova palavra" — esse botão só é usado
      // quando ninguém pontua (tempo esgota, ver onEnd do timer).
      nextWord();
    });
  });
}

/* ===== Fase da rodada (ready / countdown / playing / ended) ===== */
function setRoundPhase(phase) {
  roundPhase = phase;

  // "ready": o botão "Começar" ocupa o lugar da palavra no centro da
  // tela (em vez de um texto + botão embaixo) — só um dos dois aparece
  // por vez.
  const isReady = phase === "ready" && !gameOver;
  readyBtn.classList.toggle("d-none", !isReady);
  scrambledWordEl.classList.toggle("d-none", isReady);

  // Enquanto não dá pra mostrar uma palavra nova (contagem rolando ou
  // esperando quem vai jogar confirmar), o botão nem aparece — só
  // desabilitar (cinza) deixava ele ocupando espaço à toa.
  newWordBtn.classList.toggle("d-none", gameOver || phase === "countdown" || phase === "ready");

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
async function applyParamsFromURL() {
  // A tela de configuração ficou só no modal do catálogo (que já barra
  // "Jogar" sem equipes ativas — ver assets/js/app.js). Se mesmo assim
  // alguém cair aqui sem equipes (link direto, por exemplo), volta pro
  // catálogo em vez de mostrar uma tela quebrada.
  if (!Teams.isEnabled()) {
    window.location.href = "../../index.html#catalogo";
    return;
  }

  const params = new URLSearchParams(window.location.search);

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

  await maybeShowDrawIntro();
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

  readyBtn.addEventListener("click", () => {
    if (gameOver || roundPhase !== "ready") return;
    startCountdown();
  });

  newWordBtn.addEventListener("click", () => {
    if (gameOver || roundPhase === "countdown" || roundPhase === "ready") return;
    nextWord();
  });

  showAnswerBtn.addEventListener("click", () => {
    toggleAnswer();
  });

  playAgainBtn.addEventListener("click", () => {
    round = 0;
    gameOver = false;
    setGameOverUI(false);

    initPairing();
    buildWordPool();
    nextWord();
  });

  scoreBtn?.addEventListener("click", () => showScorePopup());

  exitBtn.addEventListener("click", confirmExit);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    if (e.code === "Space") {
      e.preventDefault();
      if (gameOver || roundPhase === "countdown") return;
      if (roundPhase === "ready") {
        startCountdown();
        return;
      }
      nextWord();
    }
  });
}

/* ========================= GAME ========================= */
function startGame() {
  if (!currentCategory || !Teams.isEnabled()) return;

  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();

  badgeCategory.textContent = currentCategory.name;

  round = 0;
  gameOver = false;
  setGameOverUI(false);

  initPairing();
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
  badgeRound.textContent = `${round}/${wordPool.length}`;

  advancePair();
  renderPairRow();

  currentWord = next;
  answerRevealed = false;
  timeExpired = false;

  showReadyState();
}

/* ===== Espera a confirmação de "Pronto!" antes de começar a rodada —
   como as pessoas revezam (ver advancePair), sempre precisa de um
   momento pra quem vai jogar se posicionar antes da contagem começar.
   O botão "Começar" ocupa o lugar da palavra no centro da tela (ver
   setRoundPhase). O bloco do relógio mostra só o tempo (nada de texto de
   status nele); avisos de "prepare-se"/"tempo esgotado" vão no centro. */
function showReadyState() {
  clearCountdown();
  stopTimer();

  showAnswerBtn.classList.add("d-none");
  scrambledWordEl.classList.remove("pm-countdown");

  setRoundPhase("ready");

  timerText.textContent = selectedDurationSec > 0 ? `${selectedDurationSec}s` : "Sem tempo";
  // Cheia aqui (não vazia) — a barra representa o tempo que AINDA resta,
  // e antes da rodada começar o tempo todo ainda está disponível.
  timerBar.style.width = selectedDurationSec > 0 ? "100%" : "0%";
}

/* ===== Contagem "3, 2, 1" antes de cada palavra — dá tempo das equipes
   se prepararem antes da palavra aparecer na tela. ===== */
function startCountdown() {
  clearCountdown();
  stopTimer();
  setRoundPhase("countdown");

  showAnswerBtn.classList.add("d-none");
  scrambledWordEl.classList.add("pm-countdown");

  let n = 3;
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

  // 🔥 PARA O TEMPO (a caixa continua visível, só congela) — só volta a
  // contar quando uma rodada nova começar (ver startCountdown/beginRound).
  stopTimer();

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
  timerText.textContent = "--";
  timerBar.style.width = "0%";

  scrambledWordEl.classList.remove("pm-countdown", "d-none");
  scrambledWordEl.textContent = "FIM DE JOGO";
  setGameOverUI(true);
  renderPairRow();

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(() => playAgainBtn.click()),
  });
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
      // O bloco do relógio mostra só o tempo — o aviso de "acabou" vai
      // no texto central, junto com a palavra que some da tela.
      timerText.textContent = "0s";
      timerBar.style.width = "0%";

      timeExpired = true;

      scrambledWordEl.classList.remove("pm-countdown");
      scrambledWordEl.textContent = "Tempo esgotado!";
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
  newWordBtn.classList.toggle("d-none", isOver);
  readyBtn.classList.toggle("d-none", isOver || roundPhase !== "ready");
  renderTeamScoreButtons();

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

function playPointSound() {
  playCorrectSound();
}

/* ========================= WORD POOL ========================= */
// Cada partida sorteia até ROUND_SIZE palavras de uma "fila" da categoria
// (evita jogar todas de uma vez). A fila persiste entre partidas ("Jogar
// novamente"), então nenhuma palavra repete enquanto ainda sobrar alguma
// não usada na categoria — só quando a fila esvaziar ela é reembaralhada
// e recomeça do zero (podendo repetir a partir daí).
//
// Padrão do site é 10 rodadas fixas, mas aqui só 2 equipes jogam por vez
// — com muitas equipes ativas, 10 rodadas fixas deixariam cada uma jogar
// poucas vezes (ex: 6 equipes em 10 rodadas = só 3,3 rodadas por equipe,
// em média). Escala o total pra garantir pelo menos ~4 rodadas por
// equipe (2 equipes por rodada => 2×tamanho rodadas cobre isso), sem
// nunca ficar abaixo do padrão de 10.
function roundSizeFor(teamCount) {
  return Math.max(10, teamCount * 2);
}

let categoryQueue = [];
let categoryQueueId = null;

function buildWordPool() {
  const roundSize = roundSizeFor(Teams.getState().teams.length);

  if (categoryQueueId !== currentCategory.id || categoryQueue.length === 0) {
    categoryQueue = shuffleArray(currentCategory.words || []);
    categoryQueueId = currentCategory.id;
  }

  wordPool = categoryQueue.splice(0, roundSize);
  poolIndex = 0;
}

function getNextWordNoRepeat() {
  if (!wordPool.length) return null;
  if (poolIndex >= wordPool.length) return null;

  return wordPool[poolIndex++];
}