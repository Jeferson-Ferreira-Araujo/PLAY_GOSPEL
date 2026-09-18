import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";
import { showTeamsBlockFocus } from "../../assets/js/game-focus-tour.js";
import { buildFairSchedule, applyScheduleEntry } from "../../assets/js/turn-fairness.js";
import { icon } from "../../playgospel-ui/js/core.js";

// Máximo de rodadas por partida (evita jogar todas as palavras de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");

const turnBanner = document.getElementById("turnBanner");
const turnBannerIcon = document.getElementById("turnBannerIcon");
const turnBannerTeam = document.getElementById("turnBannerTeam");
const turnBannerPlayer = document.getElementById("turnBannerPlayer");

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");

const readyBtn = document.getElementById("readyBtn");
const wordText = document.getElementById("wordText");
const badgeProgress = document.getElementById("badgeProgress");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const newWordBtn = document.getElementById("newWordBtn");
const correctBtn = document.getElementById("correctBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");
const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");
const timerRow = document.getElementById("presenterTimerRow");

let baseWords = [];       // vem do words.json (fixo)
let roundWords = [];      // baseWords sem duplicados
let pool = [];            // pool embaralhado da rodada
let idx = 0;
let schedule = [];        // escala justa da partida (ver assets/js/turn-fairness.js)
let gameOver = false;

// Tempo fixo (sem opção de escolha, pra evitar excesso de configurações —
// ver assets/js/game-focus-tour.js e o histórico de simplificação do site).
const durationSec = 10;
let timer = null;
let countdownInterval = null;

let currentWord = "";    // palavra sorteada pra rodada atual (mostrada só depois do "Começar")
let pointGiven = false;  // ponto já dado nesta rodada — evita clique duplo em "Acertou?"

document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  wireUI();
  renderTeamUI();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTeamUI();
    updateScoreBtn();
  });
  mountFullscreenButton(document.querySelector(".game-topbar-actions"));
  watchStageText(document.querySelector(".presenter-center"));
  mountSoundMuteButton(document.querySelector(".game-topbar-actions"));
  checkAutoStartFromURL(); // ✅ novo fluxo
});

// Placar sob demanda (padrão do site): um botão no cabeçalho que abre o
// popup com o ranking, em vez de um placar fixo. Só aparece durante o
// jogo (não na tela de configuração) e só com equipes ativas.
function updateScoreBtn() {
  if (!scoreBtn) return;
  const show = !gameScreen.classList.contains("d-none") && Teams.isEnabled();
  scoreBtn.classList.toggle("d-none", !show);
}

/* =========================
   TEAMS UI (placar + vez da equipe + botão de pontuação)
   Uma equipe por vez tem o tempo do timer pra cantar uma música com a
   palavra. "✅ Acertou?" marca 1 ponto fixo e passa a vez pra próxima
   equipe (escala justa); sem acerto, "Nova palavra" segue sem pontuar
   (a vez passa do mesmo jeito, pra rotação continuar justa).
========================= */
function setTeamsControlsVisible(visible) {
  if (correctBtn) correctBtn.style.display = visible && !pointGiven ? "inline-block" : "none";
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

  if (turnBannerIcon) turnBannerIcon.innerHTML = icon(t.icon || "star", { size: 18 });
  if (turnBannerTeam) turnBannerTeam.textContent = t.name;
  turnBanner?.style.setProperty("--team-color", t.color || "#F4C430");

  const player = Teams.currentPlayer();
  if (turnBannerPlayer) {
    turnBannerPlayer.textContent = player ? `— ${player}` : "";
    turnBannerPlayer.classList.toggle("d-none", !player);
  }
}

window.addEventListener("bibflix:teams:change", renderTeamUI);

// Avança a rotação da escala justa (ver assets/js/turn-fairness.js) pra
// quem deve começar a PRÓXIMA palavra — idx já aponta pra rodada seguinte
// nesse ponto (nextWord() incrementa antes de qualquer botão poder ser
// clicado). Roda sempre uma vez por rodada, acertando ou não.
function advanceFromWordStart() {
  if (!Teams.getState().teams.length) return;
  applyScheduleEntry(schedule[idx]);
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/* ===== Fase "pronto" — espera confirmar que a equipe da vez está pronta
   antes de começar a contagem (mesmo padrão dos outros jogos por turno).
   A equipe (e a pessoa, se sorteada) já aparece no bloco centralizado do
   topo — o botão só ocupa o lugar da palavra. */
function showReadyState() {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  setTeamsControlsVisible(false);
  newWordBtn.classList.add("d-none");

  wordText.classList.add("d-none");
  readyBtn.classList.toggle("d-none", gameOver);
}

function beginPrepareCountdown() {
  wordText.classList.remove("d-none");
  readyBtn.classList.add("d-none");

  startPrepareCountdown(() => {
    wordText.textContent = currentWord;
    timerRow?.classList.remove("d-none");
    startTimer();
    pointGiven = false;
    setTeamsControlsVisible(Teams.isEnabled());
    newWordBtn.classList.remove("d-none");
  });
}

/* Contagem "3, 2, 1" antes de cada palavra — mesmo padrão visual de todos
   os jogos (dígito grande dourado, .stage-text.is-countdown em
   assets/css/game-base.css) e o mesmo som de tick/"vai". */
function startPrepareCountdown(onDone) {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  wordText.classList.add("is-countdown");

  let n = 3;
  wordText.textContent = String(n);
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      wordText.textContent = String(n);
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    wordText.classList.remove("is-countdown");
    onDone();
  }, 1000);
}

async function loadWords() {
  const res = await fetch("./words.json", { cache: "no-store" });
  const data = await res.json();
  baseWords = (data.words ?? []).filter(Boolean);

  // setup inicial
  roundWords = [...baseWords];
  updateProgress();
}

// Ponto dado: some a palavra e os botões de pontuação — só resta o
// anúncio de quem ganhou e "Nova palavra" esperando o clique pra seguir.
function showPointGiven(team) {
  stopTimer();
  timerRow?.classList.add("d-none");
  wordText.classList.remove("is-countdown");
  wordText.textContent = team ? `Equipe ${team.name} ganhou 1 ponto` : "";
  renderTeamUI();
}

/* =========================
   AUTO START VIA URL
   ?play=1
========================= */
async function checkAutoStartFromURL() {
  // A tela de configuração ficou só no modal do catálogo (que já barra
  // "Jogar" sem equipes ativas — ver assets/js/app.js). Se mesmo assim
  // alguém cair aqui sem equipes (link direto, por exemplo), volta pro
  // catálogo em vez de mostrar um jogo sem placar.
  if (!Teams.isEnabled()) {
    window.location.href = "../../index.html#catalogo";
    return;
  }

  await maybeShowDrawIntro();
  startGame();
}

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
  startBtn?.addEventListener("click", () => {
    startGame();
  });

  readyBtn.addEventListener("click", () => beginPrepareCountdown());

  // "Nova palavra": sem acerto (ou já acertou e só quer seguir) — a
  // escala justa continua avançando do mesmo jeito (ver correctBtn).
  newWordBtn.addEventListener("click", () => {
    if (gameOver) return;
    if (!pointGiven && Teams.isEnabled()) advanceFromWordStart();
    nextWord();
  });

  // "✅ Acertou?" marca o ponto fixo (1) da equipe da vez e já avança a
  // escala justa pra quem começa a próxima palavra.
  correctBtn?.addEventListener("click", () => {
    if (gameOver || pointGiven) return;

    const team = Teams.currentTeam();
    if (Teams.isEnabled()) {
      Teams.addPoint(1);
      advanceFromWordStart();
    }

    pointGiven = true;
    showPointGiven(team);
  });

  playAgainBtn.addEventListener("click", () => {
    restartGame(); // reembaralha e reinicia usando as mesmas roundWords
  });

  scoreBtn?.addEventListener("click", () => showScorePopup());

  // ✅ sair volta pro catálogo principal
  exitBtn.addEventListener("click", confirmExit);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    if (e.code === "Space") {
      e.preventDefault();
      if (gameOver) return;
      newWordBtn.click();
    }
  });
}

function startGame() {
  // monta as palavras desta rodada (função de palavras extras removida
  // por enquanto — só as da lista base, sem duplicados)
  roundWords = buildRoundWords();

  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();
  showTeamsBlockFocus();

  restartGame();
}

function buildRoundWords() {
  return dedupeCaseInsensitive(baseWords).filter(Boolean);
}

function dedupeCaseInsensitive(list) {
  const seen = new Set();
  const result = [];

  for (const item of list) {
    const key = String(item).trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(String(item).trim());
  }
  return result;
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  // Escala justa primeiro (ver assets/js/turn-fairness.js): com gente
  // sorteada, pode precisar de mais que ROUND_SIZE rodadas pra todo mundo
  // jogar 1 vez — o pool de palavras acompanha esse tamanho.
  schedule = buildFairSchedule(ROUND_SIZE);
  const roundCount = schedule.length || ROUND_SIZE;

  // embaralha a ordem a cada reinício, sorteando até roundCount palavras
  // (evita jogar todas de uma vez)
  pool = shuffleArray(roundWords).slice(0, roundCount);
  schedule = schedule.slice(0, pool.length);
  idx = 0;

  if (Teams.isEnabled()) applyScheduleEntry(schedule[0]);
  nextWord();
}

function nextWord() {
  stopTimer();
  clearCountdown();

  if (!pool.length) {
    endGame("SEM PALAVRAS");
    return;
  }

  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  currentWord = pool[idx];
  idx += 1;
  updateProgress();

  showReadyState();
}

function updateProgress() {
  const total = pool.length || roundWords.length || baseWords.length || 0;
  const done = Math.min(idx, total);
  badgeProgress.textContent = `${done}/${total}`;
}

function endGame(text) {
  stopTimer();
  clearCountdown();
  gameOver = true;

  readyBtn.classList.add("d-none");
  newWordBtn.classList.add("d-none");
  wordText.classList.remove("is-countdown", "d-none");
  wordText.textContent = text;
  setGameOverUI(true);
  updateProgress();

  turnBanner?.classList.add("d-none");
  timerText.textContent = "--";
  timerBar.style.width = "0%";

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
}

function setGameOverUI(isOver) {
  newWordBtn.disabled = isOver;
  if (correctBtn) correctBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

/* =========================
   TIMER (padrão compartilhado — createCountdownTimer)
========================= */
function createOrUpdateTimer() {
  stopTimer();

  if (durationSec <= 0) {
    timer = null;
    timerText.textContent = "Sem tempo";
    timerBar.style.width = "0%";
    return;
  }

  timer = createCountdownTimer({
    durationSec,
    onTick: ({ remainingSec, progress01 }) => {
      timerText.textContent = `${remainingSec}s`;
      timerBar.style.width = `${Math.round(progress01 * 100)}%`;
    },
    onEnd: () => {
      timerText.textContent = "Tempo!";
      timerBar.style.width = "0%";
      // quando zera, para; a rodada continua (admin decide acertou/passou)
    },
  });
}

function startTimer() {
  createOrUpdateTimer();
  if (!timer) return;
  timer.reset(durationSec);
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
}
