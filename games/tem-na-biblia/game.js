import { Teams } from "../../assets/js/teams.js";
import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { confirmDialog, icon } from "../../playgospel-ui/js/playgospel-ui.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { showTeamsBlockFocus } from "../../assets/js/game-focus-tour.js";
import { buildMemberQueues, advanceMemberForTeam } from "../../assets/js/turn-fairness.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";

/* Alfabeto do jogo: todas as letras menos as difíceis (H, K, Q, W, X, Y, Z). */
const LETTERS_ALL = ["A", "B", "C", "D", "E", "F", "G", "I", "J", "L", "M", "N", "O", "P", "R", "S", "T", "U", "V"];

// Máximo de rodadas (letras) por partida (evita jogar o alfabeto inteiro de
// uma vez) — mesmo padrão dos outros jogos "disputa".
const ROUND_SIZE = 10;

const CATEGORY_LABELS = {
  biblia: "Tem na Bíblia com...",
  nomes: "Nomes",
  louvor: "Louvor",
};

/* ===== Elements (setup) ===== */
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const categorySelect = document.getElementById("categorySelect");
const timeSelect = document.getElementById("timeSelect");
const teamsSetupWarning = document.getElementById("teamsSetupWarning");
const startBtn = document.getElementById("startBtn");

/* ===== Elements (presenter) ===== */
const scoreBtn = document.getElementById("scoreBtn");
const pairRow = document.getElementById("pairRow");
const pairRowBig = document.getElementById("pairRowBig");
const pairRowBigLabel = document.getElementById("pairRowBigLabel");

const badgeCategory = document.getElementById("badgeCategory");
const badgeProgress = document.getElementById("badgeProgress");

const readyBtn = document.getElementById("readyBtn");
const letterDisplay = document.getElementById("letterDisplay");
const timerRow = document.getElementById("presenterTimerRow");
const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const correctBtn = document.getElementById("correctBtn");
const skipBtn = document.getElementById("skipBtn");
const restartBtn = document.getElementById("restartBtn");
const endBtn = document.getElementById("endBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

/* ===== Estado ===== */
let selectedCategory = "biblia";
let selectedTime = 10;

let pool = [];
let idx = 0;
let currentLetter = null;

let gameOver = false;
let processing = false; // evita duplo clique/duplo avanço enquanto uma transição já está rolando
let timer = null;
let countdownInterval = null;

// Só a 1ª rodada da partida (ou logo após "Reiniciar"/"Jogar novamente")
// espera o clique em "Prontos" — depois disso, cada letra nova (acertou
// ou tempo esgotado) já entra sozinha, sem parar de novo.
let firstTurn = true;

// ===== Par da rodada (formato "disputa") =====
// Só 2 equipes disputam por vez: a primeira do par (currentPair[0]) é
// quem responde a letra da vez; a segunda aparece só pra dar contexto de
// quem ela enfrenta. Com 3+ equipes ativas, o rodízio já garante que
// todo mundo assume o papel de "quem responde" em algum momento (ver
// advanceTurn) — mesmo padrão de rodízio usado em games/quem-disse-isso/
// game.js e outros jogos "disputa", só que aqui só o índice 0 do par
// realmente joga a rodada.
let pairOrder = [];
let pairCursor = -1;
let currentPair = null; // [equipeQueResponde, equipeAdversária]
let memberQueues = {}; // fila embaralhada de integrantes por equipe (ver assets/js/turn-fairness.js)

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  return shuffleArray(arr);
}

function initPairing() {
  const n = Teams.getState().teams.length;
  pairOrder = shuffledIndices(n);
  pairCursor = -1;
  currentPair = null;
  memberQueues = buildMemberQueues();
}

// Chamada no início de cada letra nova: fecha a rodada anterior (troca
// quem representa a equipe que ACABOU de responder — currentPair[0] —
// pro próximo integrante dela; a adversária nem chegou a jogar essa
// rodada, não faz sentido girar a vez dela também) e decide o próximo
// par pelo rodízio. Como o rodízio avança 1 posição por letra, quem é
// "currentPair[0]" (quem responde) vai passando por todas as equipes
// ativas, mesmo com 3+ na disputa.
function advanceTurn() {
  const n = Teams.getState().teams.length;
  if (pairOrder.length !== n) initPairing();

  if (currentPair) {
    advanceMemberForTeam(memberQueues, currentPair[0]);
  }

  pairCursor = (pairCursor + 1) % n;
  const a = pairOrder[pairCursor % n];
  const b = pairOrder[(pairCursor + 1) % n];
  currentPair = [a, b];
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function teamIconName(team) {
  return Teams.teamIconNames.includes(team.icon) ? team.icon : "star";
}

// Monta o HTML do par (equipe que responde x equipe adversária) — usado
// tanto no bloco pequeno do topo (#pairRow) quanto no bloco grande
// centralizado durante o "Prontos"/contagem (#pairRowBig).
function pairTeamsHtml() {
  const state = Teams.getState();
  return currentPair.map((teamIndex, i) => {
    const team = state.teams[teamIndex];
    if (!team) return "";
    const player = Teams.playerOf(teamIndex);
    const active = i === 0; // currentPair[0] é sempre quem responde a rodada
    return `
      <div class="tb-pair-team${active ? " tb-pair-team--active" : ""}" style="--team-color:${escapeHtml(team.color)}">
        <span class="tb-pair-team-icon">${icon(teamIconName(team), { size: 18 })}</span>
        <span class="tb-pair-team-text">
          <span class="tb-pair-team-name">${escapeHtml(team.name)}</span>
          ${player ? `<span class="tb-pair-team-player">${escapeHtml(player)}</span>` : ""}
        </span>
        ${active ? `<span class="tb-pair-turn-badge">Vez</span>` : ""}
      </div>
    `;
  }).join(`<div class="tb-pair-vs">×</div>`);
}

function renderPairRow() {
  const has = Boolean(currentPair) && !gameOver;
  const html = has ? pairTeamsHtml() : "";

  if (pairRow) {
    pairRow.classList.toggle("d-none", !has);
    pairRow.innerHTML = html;
  }

  if (pairRowBig) {
    pairRowBig.innerHTML = html;
    if (!has) pairRowBig.classList.add("d-none");
  }
}

function setActionButtonsEnabled(enabled) {
  correctBtn.disabled = !enabled;
  skipBtn.disabled = !enabled;
}

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", () => {
  updateTeamsGate();
  wireUI();
  window.addEventListener("bibflix:teams:change", updateTeamsGate);
  mountFullscreenButton(document.querySelector(".game-topbar-actions"));
  watchStageText(document.querySelector(".presenter-center"));
  mountSoundMuteButton(document.querySelector(".game-topbar-actions"));
  checkAutoStartFromURL();
});

// Placar sob demanda (padrão do site): um botão no cabeçalho que abre o
// popup com o ranking, em vez de um placar fixo. Só aparece durante o
// jogo (não na tela de configuração) e só com equipes ativas.
function updateScoreBtn() {
  if (!scoreBtn) return;
  const show = !gameScreen.classList.contains("d-none") && Teams.isEnabled();
  scoreBtn.classList.toggle("d-none", !show);
}

/* ===== Trava de equipes (tela de configuração, fallback) =====
   Formato "disputa" só faz sentido com equipes ativas (é dali que vem o
   par da rodada). Sem equipes, avisa e trava o Iniciar. */
function updateTeamsGate() {
  const enabled = Teams.isEnabled();
  if (teamsSetupWarning) teamsSetupWarning.classList.toggle("d-none", enabled);
  if (startBtn) startBtn.disabled = !enabled;
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/* ===== Fase "pronto" — só na 1ª letra da partida (ou logo após
   Reiniciar/Jogar novamente): mostra o par em destaque grande (com o
   nome de quem representa cada equipe, se sorteado) e espera confirmar
   "Prontos" antes da contagem começar. ===== */
function showReadyState() {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  setActionButtonsEnabled(false);

  letterDisplay.classList.add("d-none");
  pairRow?.classList.add("d-none");
  pairRowBig?.classList.remove("d-none");
  pairRowBigLabel?.classList.remove("d-none");
  readyBtn.classList.remove("d-none");
}

/* Contagem "3, 2, 1" antes de cada letra — com o par em destaque grande
   (mesmo conteúdo do bloco pequeno do topo). Ao fim, o par volta pro
   tamanho/posição normal e a letra aparece. */
function beginPrepareCountdown() {
  readyBtn.classList.add("d-none");
  letterDisplay.classList.remove("d-none");
  pairRow?.classList.add("d-none");
  pairRowBig?.classList.remove("d-none");
  pairRowBigLabel?.classList.remove("d-none");

  startPrepareCountdown(() => {
    pairRowBig?.classList.add("d-none");
    pairRowBigLabel?.classList.add("d-none");
    pairRow?.classList.remove("d-none");
    showLetter();
    timerRow?.classList.remove("d-none");
    startTimer();
    setActionButtonsEnabled(true);
    processing = false;
  });
}

function startPrepareCountdown(onDone) {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  letterDisplay.classList.add("is-countdown");

  let n = 3;
  letterDisplay.textContent = String(n);
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      letterDisplay.textContent = String(n);
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    letterDisplay.classList.remove("is-countdown");
    onDone();
  }, 1000);
}

function showLetter() {
  letterDisplay.classList.remove("is-countdown");
  letterDisplay.textContent = currentLetter;
}

function updateProgress() {
  const total = pool.length || 0;
  const done = Math.min(idx, total);
  badgeProgress.textContent = `${done}/${total}`;
}

/* ===== Fluxo da rodada ===== */
function startGame() {
  badgeCategory.textContent = CATEGORY_LABELS[selectedCategory];

  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();
  showTeamsBlockFocus();

  restartGame();
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  initPairing();

  pool = shuffleArray(LETTERS_ALL).slice(0, ROUND_SIZE);
  idx = 0;
  firstTurn = true;

  nextTurn();
}

function nextTurn() {
  stopTimer();
  clearCountdown();

  if (idx >= pool.length) {
    endGame();
    return;
  }

  currentLetter = pool[idx];
  idx += 1;
  updateProgress();

  advanceTurn();
  renderPairRow();

  if (firstTurn) {
    firstTurn = false;
    showReadyState();
  } else {
    beginPrepareCountdown();
  }
}

function endGame() {
  stopTimer();
  clearCountdown();
  gameOver = true;

  readyBtn.classList.add("d-none");
  pairRowBig?.classList.add("d-none");
  pairRowBigLabel?.classList.add("d-none");
  letterDisplay.classList.remove("is-countdown", "d-none");
  letterDisplay.textContent = "FIM DE JOGO";
  setGameOverUI(true);
  setActionButtonsEnabled(false);
  updateProgress();
  renderPairRow();

  timerText.textContent = "--";
  timerBar.style.width = "0%";

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
}

function setGameOverUI(isOver) {
  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

async function exitToCatalog() {
  const goToCatalog = () => { window.location.href = "../../index.html#catalogo"; };

  const shown = showScorePopup({
    title: "Sair do jogo?",
    footer: buildExitFooter(goToCatalog),
  });
  if (shown) return;

  // Sem equipes ativas não há placar pra mostrar — cai no confirm de sempre.
  const confirmed = await confirmDialog({
    title: "Sair do jogo?",
    message: "Tem certeza que quer sair?",
    confirmLabel: "Sair",
    cancelLabel: "Cancelar",
  });
  if (confirmed) goToCatalog();
}

/* =========================
   AUTO START — a tela de configuração ficou só no modal do catálogo
   (que já barra "Jogar" sem equipes ativas — ver assets/js/app.js).
   Se mesmo assim alguém cair aqui sem equipes (link direto, por
   exemplo), volta pro catálogo em vez de mostrar uma tela quebrada.
========================= */
async function checkAutoStartFromURL() {
  if (!Teams.isEnabled()) {
    window.location.href = "../../index.html#catalogo";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const cat = params.get("category");
  const time = params.get("time");
  if (cat && CATEGORY_LABELS[cat]) {
    selectedCategory = cat;
    if (categorySelect) categorySelect.value = cat;
  }
  if (time) {
    selectedTime = Number(time);
    if (timeSelect) timeSelect.value = time;
  }

  await maybeShowDrawIntro();
  startGame();
}

/* ===== UI wiring ===== */
function wireUI() {
  startBtn?.addEventListener("click", () => {
    if (!Teams.isEnabled()) return;
    selectedCategory = categorySelect?.value || selectedCategory;
    selectedTime = Number(timeSelect?.value || selectedTime);
    startGame();
  });

  readyBtn.addEventListener("click", () => {
    if (processing) return;
    processing = true;
    beginPrepareCountdown();
  });

  correctBtn.addEventListener("click", () => {
    if (gameOver || processing) return;
    processing = true;

    Teams.setTurn(currentPair[0]);
    Teams.addPoint(1);

    setActionButtonsEnabled(false);
    nextTurn();
  });

  skipBtn.addEventListener("click", () => {
    if (gameOver || processing) return;
    processing = true;
    setActionButtonsEnabled(false);
    nextTurn();
  });

  restartBtn.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "🔁 Reiniciar rodada?",
      message: "As letras são sorteadas de novo e a dupla volta pra primeira posição. O placar continua igual.",
      confirmLabel: "Reiniciar",
      cancelLabel: "Cancelar",
    });
    if (confirmed) restartGame();
  });

  playAgainBtn.addEventListener("click", restartGame);

  scoreBtn?.addEventListener("click", () => showScorePopup());

  endBtn.addEventListener("click", exitToCatalog);
  exitBtn.addEventListener("click", exitToCatalog);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair"/"Encerrar" explícito pergunta antes (ver acima).

  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    const k = e.key.toLowerCase();
    if (k === " " || k === "enter") {
      e.preventDefault();
      if (!readyBtn.classList.contains("d-none")) readyBtn.click();
      return;
    }
    if (k === "a") correctBtn.click();
    if (k === "p") skipBtn.click();
  });
}

/* =========================
   TIMER (padrão compartilhado — createCountdownTimer). Quando o tempo
   acaba sem resposta, avança pra letra/vez seguinte automaticamente
   (sem pontuar ninguém).
========================= */
function createOrUpdateTimer() {
  stopTimer();

  timer = createCountdownTimer({
    durationSec: selectedTime,
    onTick: ({ remainingSec, progress01 }) => {
      timerText.textContent = `${remainingSec}s`;
      timerBar.style.width = `${Math.round(progress01 * 100)}%`;
    },
    onEnd: () => {
      if (gameOver || processing) return;
      processing = true;
      setActionButtonsEnabled(false);
      nextTurn();
    },
  });
}

function startTimer() {
  createOrUpdateTimer();
  if (!timer) return;
  timer.reset(selectedTime);
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
}
