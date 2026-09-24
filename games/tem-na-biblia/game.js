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
// uma vez).
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
const turnBanner = document.getElementById("turnBanner");
const turnBannerIcon = document.getElementById("turnBannerIcon");
const turnBannerTeam = document.getElementById("turnBannerTeam");
const turnBannerPlayer = document.getElementById("turnBannerPlayer");

const badgeCategory = document.getElementById("badgeCategory");
const badgeProgress = document.getElementById("badgeProgress");

const readyBtn = document.getElementById("readyBtn");
const letterDisplay = document.getElementById("letterDisplay");
const timerRow = document.getElementById("presenterTimerRow");
const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const correctBtn = document.getElementById("correctBtn");
const wrongBtn = document.getElementById("wrongBtn");
const passBtn = document.getElementById("passBtn");
const restartBtn = document.getElementById("restartBtn");
const endBtn = document.getElementById("endBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

/* ===== Estado ===== */
let selectedCategory = "biblia";
let selectedTime = 10;

let letterPool = [];
let usedLetters = [];
let currentLetter = null;
let attemptedThisLetter = new Set();
let roundActive = false;
let processing = false;

let answerTimerCtl = null;
let memberQueues = {}; // fila embaralhada de integrantes por equipe (ver assets/js/turn-fairness.js)
let countdownInterval = null;

/* ===== Categoria / tempo (tela de setup) ===== */
function updateTeamsGate() {
  const enabled = Teams.isEnabled();
  if (teamsSetupWarning) teamsSetupWarning.classList.toggle("d-none", enabled);
  if (startBtn) startBtn.disabled = !enabled;
}

function renderTurnBanner() {
  if (!Teams.isEnabled()) {
    turnBanner?.classList.add("d-none");
    return;
  }

  const t = Teams.currentTeam();
  turnBanner?.classList.toggle("d-none", !t);
  if (!t) return;

  if (turnBannerIcon) turnBannerIcon.innerHTML = icon(t.icon || "star", { size: 18 });
  if (turnBannerTeam) turnBannerTeam.textContent = t.name;
  turnBanner?.style.setProperty("--team-color", t.color || "#F4C430");

  const player = Teams.currentPlayer();
  if (turnBannerPlayer) {
    turnBannerPlayer.textContent = player ? `— ${player}` : "";
    turnBannerPlayer.classList.toggle("d-none", !player);
  }
}

/* ===== Letras ===== */
function initLetterPool() {
  letterPool = shuffleArray(LETTERS_ALL).slice(0, ROUND_SIZE);
  usedLetters = [];
}

/** Sorteia a próxima letra do pool; null quando acabou (fim da rodada). */
function drawNextLetter() {
  if (!letterPool.length) return null;
  currentLetter = letterPool.pop();
  usedLetters.push(currentLetter);
  attemptedThisLetter = new Set();
  return currentLetter;
}

function showLetter() {
  letterDisplay.classList.remove("is-countdown");
  letterDisplay.textContent = currentLetter;
}

/* ===== Espera a confirmação de "Pronto" antes de cada letra — como as
   equipes/pessoas revezam, sempre precisa desse momento pra "chamar"
   quem vai jogar antes da contagem aparecer (mesmo padrão de
   games/verdadeiro-ou-falso/game.js). O time (e a pessoa, se sorteada)
   já aparecem na caixa centralizada do topo. */
function showReadyState() {
  clearCountdown();
  answerTimerCtl?.stop();
  timerRow?.classList.add("d-none");

  letterDisplay.classList.add("d-none");
  readyBtn.classList.remove("d-none");

  renderTurnBanner();
}

/* ===== Contagem "3, 2, 1" antes de cada letra — dá tempo da equipe (e
   pessoa, se sorteada) se preparar antes do cronômetro de resposta
   começar. */
function startCountdown() {
  clearCountdown();
  readyBtn.classList.add("d-none");
  letterDisplay.classList.remove("d-none");
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
    showLetter();
    timerRow?.classList.remove("d-none");
    startTimerForTurn();
  }, 1000);
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function updateBadgeProgress() {
  const total = usedLetters.length + letterPool.length;
  badgeProgress.textContent = `${usedLetters.length}/${total}`;
}

/* ===== Cronômetro por resposta =====
   Tempo esgotado sem resposta conta como "Passou" (sem botão de errar).
   Mesmo padrão dos outros jogos: texto + barra linear via
   createCountdownTimer. */
function initTimer() {
  answerTimerCtl = createCountdownTimer({
    durationSec: selectedTime,
    onTick: ({ remainingSec, progress01 }) => {
      timerText.textContent = `${remainingSec}s`;
      timerBar.style.width = `${Math.round(progress01 * 100)}%`;
    },
    onEnd: () => {
      if (!roundActive) return;
      onPass();
    },
  });
}

function startTimerForTurn() {
  answerTimerCtl.reset(selectedTime);
  answerTimerCtl.start();
}

/* ===== Fluxo da rodada ===== */
function startRoundState() {
  initLetterPool();
  drawNextLetter();
  memberQueues = buildMemberQueues();
  advanceMemberForTeam(memberQueues, Teams.getState().turn);
  attemptedThisLetter.add(Teams.currentTeam()?.id);

  updateBadgeProgress();
  showReadyState();
}

/** Some a tela de setup e começa a jogar — usado tanto pelo clique em
 * "Iniciar" quanto pelo início automático via URL (?play=1). */
function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();
  showTeamsBlockFocus();

  badgeCategory.textContent = CATEGORY_LABELS[selectedCategory];
  Teams.setTurn(0);
  roundActive = true;
  startRoundState();
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

function onCorrect() {
  if (!roundActive || processing) return;
  processing = true;

  Teams.addPoint(1);
  const next = drawNextLetter();
  if (next === null) {
    processing = false;
    endRoundNatural();
    return;
  }

  Teams.nextTurn();
  advanceMemberForTeam(memberQueues, Teams.getState().turn);
  attemptedThisLetter.add(Teams.currentTeam()?.id);

  updateBadgeProgress();
  showReadyState();
  processing = false;
}

/** Passa a vez ou registra erro com a mesma letra — só sorteia letra nova
 * quando o turno voltaria a cair numa equipe que já tentou essa letra sem
 * acertar. Compartilhado por "Passou" (não tentou) e "Errou" (tentou e
 * falou palavra errada). */
function advanceTurnSameLetter() {
  Teams.nextTurn();
  advanceMemberForTeam(memberQueues, Teams.getState().turn);
  const newTeamId = Teams.currentTeam()?.id;

  if (attemptedThisLetter.has(newTeamId)) {
    const next = drawNextLetter();
    if (next === null) {
      processing = false;
      endRoundNatural();
      return;
    }
  }
  attemptedThisLetter.add(newTeamId);

  updateBadgeProgress();
  showReadyState();
  processing = false;
}

function onPass() {
  if (!roundActive || processing) return;
  processing = true;
  advanceTurnSameLetter();
}

/** Time atual falou uma palavra errada: passa a vez (mesma letra), igual
 * ao "Passou" — sem desconto de ponto. */
function onWrong() {
  if (!roundActive || processing) return;
  processing = true;
  advanceTurnSameLetter();
}

/** Fim natural da rodada (letras esgotadas): popup em destaque com o
 * placar final. */
function endRoundNatural() {
  roundActive = false;
  answerTimerCtl.stop();
  clearCountdown();

  correctBtn.classList.add("d-none");
  wrongBtn.classList.add("d-none");
  passBtn.classList.add("d-none");
  readyBtn.classList.add("d-none");

  showScorePopup({
    title: "🏁 Fim de rodada!",
    footer: buildPlayAgainFooter(resetRoundState),
  });
}

/** Reinicia a rodada (letras + vez do zero) sem tocar no placar — usada
 * tanto pelo botão "Reiniciar" (durante o jogo) quanto por "Jogar novamente"
 * (no popup de fim de rodada). */
function resetRoundState() {
  correctBtn.classList.remove("d-none");
  wrongBtn.classList.remove("d-none");
  passBtn.classList.remove("d-none");

  Teams.setTurn(0);
  roundActive = true;
  startRoundState();
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

/* ===== UI wiring ===== */
function wireUI() {
  startBtn?.addEventListener("click", () => {
    if (!Teams.isEnabled()) return;
    selectedCategory = categorySelect?.value || selectedCategory;
    selectedTime = Number(timeSelect?.value || selectedTime);
    startGame();
  });

  correctBtn.addEventListener("click", onCorrect);
  wrongBtn.addEventListener("click", onWrong);
  passBtn.addEventListener("click", onPass);
  readyBtn.addEventListener("click", startCountdown);

  restartBtn.addEventListener("click", async () => {
    const confirmed = await confirmDialog({
      title: "🔁 Reiniciar rodada?",
      message: "As letras são sorteadas de novo e a vez volta pra primeira equipe. O placar continua igual.",
      confirmLabel: "Reiniciar",
      cancelLabel: "Cancelar",
    });
    if (confirmed) resetRoundState();
  });

  playAgainBtn.addEventListener("click", resetRoundState);

  scoreBtn?.addEventListener("click", () => showScorePopup());

  endBtn.addEventListener("click", exitToCatalog);
  exitBtn.addEventListener("click", exitToCatalog);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair"/"Encerrar" explícito pergunta antes (ver acima).

  window.addEventListener("bibflix:teams:change", () => {
    renderTurnBanner();
    updateTeamsGate();
  });
}

// Placar sob demanda (padrão do site): um botão no cabeçalho que abre o
// popup com o ranking, em vez de um placar fixo. Só aparece durante o
// jogo (não na tela de configuração) e só com equipes ativas.
function updateScoreBtn() {
  if (!scoreBtn) return;
  const show = !gameScreen.classList.contains("d-none") && Teams.isEnabled();
  scoreBtn.classList.toggle("d-none", !show);
}

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", () => {
  updateTeamsGate();
  wireUI();
  initTimer();
  mountFullscreenButton(document.querySelector(".game-topbar-actions"));
  watchStageText(document.querySelector(".presenter-center"));
  mountSoundMuteButton(document.querySelector(".game-topbar-actions"));
  checkAutoStartFromURL();
});
