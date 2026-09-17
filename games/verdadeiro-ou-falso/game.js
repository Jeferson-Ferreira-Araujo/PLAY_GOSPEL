import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { showTeamsBlockFocus } from "../../assets/js/game-focus-tour.js";
import { buildFairSchedule, applyScheduleEntry } from "../../assets/js/turn-fairness.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";

// Máximo de rodadas por partida (evita jogar todas as afirmações de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");
const turnBanner = document.getElementById("turnBanner");
const turnBannerTeam = document.getElementById("turnBannerTeam");
const turnBannerPlayer = document.getElementById("turnBannerPlayer");

/* ===== Elements (setup) ===== */
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");
const difficultySelect = document.getElementById("difficultySelect");
const timeSelect = document.getElementById("timeSelect");

/* ===== Elements (presenter) ===== */
const badgeDifficulty = document.getElementById("badgeDifficulty");
const badgeProgress = document.getElementById("badgeProgress");

const readyBtn = document.getElementById("readyBtn");
const statementText = document.getElementById("statementText");

const resultWrap = document.getElementById("resultWrap");
const explainBox = document.getElementById("explainBox");
const noteText = document.getElementById("noteText");
const referenceText = document.getElementById("referenceText");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const trueBtn = document.getElementById("trueBtn");
const falseBtn = document.getElementById("falseBtn");
const nextBtn = document.getElementById("nextBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");
const timerRow = document.getElementById("presenterTimerRow");

/* ===== State ===== */
let data = null;

let currentDifficulty = "hard";
let durationSec = 20;

let pool = [];
let idx = 0;
let schedule = []; // escala justa da partida (ver assets/js/turn-fairness.js)

let current = null; // { statement, answer(boolean), reference, note? }
let answered = false;

// Fases da rodada: "ready" (esperando confirmar quem vai responder),
// "countdown" (3,2,1 antes da afirmação aparecer), "playing" (afirmação
// visível, V/F liberados) e "ended" (respondeu ou o tempo acabou).
let roundPhase = "idle";

let score = 0;

let timer = null;
let gameOver = false;
let countdownInterval = null;

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  renderTurnBanner();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTurnBanner();
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

/* ===== Vez da equipe (banner) ===== */
function renderTurnBanner() {
  if (!Teams.isEnabled()) {
    turnBanner?.classList.add("d-none");
    return;
  }

  const t = Teams.currentTeam();
  turnBanner?.classList.toggle("d-none", !t);
  if (!t) return;

  if (turnBannerTeam) turnBannerTeam.textContent = t.name;
  turnBanner?.style.setProperty("--team-color", t.color || "#F4C430");

  // Nome de quem joga essa rodada — só aparece se a equipe tiver
  // participantes sorteados (ver Teams.currentPlayer em teams.js).
  const player = Teams.currentPlayer();
  if (turnBannerPlayer) {
    turnBannerPlayer.textContent = player || "";
    turnBannerPlayer.classList.toggle("d-none", !player);
  }
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  data = await res.json();
}

/* =========================
   AUTO START VIA URL
   ?play=1&difficulty=hard&time=20
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

  const params = new URLSearchParams(window.location.search);

  const diff = params.get("difficulty");
  const t = params.get("time");

  if (difficultySelect && diff) difficultySelect.value = diff;
  if (timeSelect && t != null) timeSelect.value = String(t);

  currentDifficulty = difficultySelect?.value || currentDifficulty;
  durationSec = Number(timeSelect?.value || durationSec);

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
  startBtn?.addEventListener("click", () => {
    currentDifficulty = difficultySelect.value;
    durationSec = Number(timeSelect.value || 0);
    startGame();
  });

  trueBtn.addEventListener("click", () => choose(true));
  falseBtn.addEventListener("click", () => choose(false));

  readyBtn.addEventListener("click", () => {
    if (roundPhase !== "ready") return;
    beginPrepareCountdown();
  });

  nextBtn.addEventListener("click", () => {
    if (gameOver) return;
    nextStatement();
  });

  playAgainBtn.addEventListener("click", () => restartGame());

  scoreBtn?.addEventListener("click", () => showScorePopup());

  // ✅ sair volta pro catálogo principal
  exitBtn.addEventListener("click", confirmExit);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

  // atalhos
  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    const k = e.key.toLowerCase();

    if (k === " ") e.preventDefault();

    // Na tela de "pronto", espaço/enter chama a pessoa da vez em vez de
    // avançar — ainda não tem afirmação carregada pra ir pra próxima.
    if (roundPhase === "ready" && (k === " " || k === "enter")) {
      readyBtn.click();
      return;
    }

    // cuidado: Ctrl+F fica de boa (busca do browser), F sozinho = FALSO.
    if (k === "v") trueBtn.click();
    if (k === "f" && !e.ctrlKey) falseBtn.click();
    if (k === "n" || k === " ") nextBtn.click();
  });
}

/* ===== Game flow ===== */
function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();
  showTeamsBlockFocus();
  restartGame();
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  currentDifficulty = difficultySelect.value;
  durationSec = Number(timeSelect.value || 0);

  badgeDifficulty.textContent = difficultyLabel(currentDifficulty);

  const list = (data?.[currentDifficulty] ?? []).filter(Boolean);

  // Escala justa primeiro (ver assets/js/turn-fairness.js): com gente
  // sorteada, pode precisar de mais que ROUND_SIZE rodadas pra todo
  // mundo jogar 1 vez — o pool de perguntas acompanha esse tamanho (nunca
  // o contrário, senão sobraria gente sem jogar). Se não houver
  // afirmações suficientes pra cobrir todo mundo, os dois cortam juntos
  // no que der (não tem como inventar pergunta).
  schedule = buildFairSchedule(ROUND_SIZE);
  const roundCount = schedule.length || ROUND_SIZE;
  pool = shuffleArray(list).slice(0, roundCount);
  schedule = schedule.slice(0, pool.length);
  idx = 0;
  score = 0;

  if (!pool.length) {
    endGame("SEM PERGUNTAS");
    return;
  }

  applyScheduleEntry(schedule[0]);
  updateProgress();
  showReadyState();
}

function nextStatement() {
  stopTimer();

  idx += 1;
  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  // Só passa a vez pra próxima posição da escala agora — ao responder (ou
  // o tempo acabar), o placar já foi ajustado na hora, mas a caixa da
  // equipe continua mostrando quem acabou de responder até "Próxima
  // Frase" ser clicado (ver choose() e o onEnd do timer).
  if (Teams.isEnabled()) applyScheduleEntry(schedule[idx]);

  updateProgress();
  showReadyState();
}

/* ===== Fase "pronto" — espera confirmar quem vai responder antes de
   começar a contagem. Como as equipes/pessoas revezam, sempre precisa
   desse momento pra "chamar" quem vai jogar antes da afirmação aparecer
   (mesmo padrão de games/palavras-misturadas/game.js). ===== */
function showReadyState() {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  resultWrap.classList.add("d-none");
  setAnswerButtonsEnabled(false);
  // "Próximo" só faz sentido depois de responder (ou o tempo esgotar) —
  // ver choose() e o onEnd do timer.
  nextBtn.classList.add("d-none");

  roundPhase = "ready";
  statementText.classList.add("d-none");
  readyBtn.classList.remove("d-none");
  // O time (e a pessoa, se sorteada) já aparecem na caixa centralizada
  // do topo — o botão só precisa confirmar que quem vai responder está
  // pronto, sem repetir o nome de novo aqui.
  readyBtn.textContent = "Pronto";
}

function beginPrepareCountdown() {
  statementText.classList.remove("d-none");
  readyBtn.classList.add("d-none");
  roundPhase = "countdown";

  startPrepareCountdown(() => {
    loadAtIndex(idx);
    timerRow?.classList.remove("d-none");
    resetAndStartTimer();
    roundPhase = "playing";
  });
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/* Contagem "3, 2, 1" antes de cada afirmação nova — quem vai responder já
   apareceu na caixa centralizada do topo e confirmou no botão "Pronto",
   então aqui é só a contagem mesmo (sem repetir "Prepare-se, Equipe!"). */
function startPrepareCountdown(onDone) {
  clearCountdown();
  timerRow?.classList.add("d-none");
  statementText.classList.add("is-countdown");

  let n = 3;
  statementText.textContent = String(n);
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      statementText.textContent = String(n);
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    statementText.classList.remove("is-countdown");
    onDone();
  }, 1000);
}

function loadAtIndex(i) {
  current = pool[i];
  answered = false;

  statementText.textContent = current.statement ?? "—";

  // esconder resultado/explicação
  resultWrap.classList.add("d-none");
  noteText.textContent = "—";
  referenceText.textContent = "—";

  setAnswerButtonsEnabled(true);
}

/* ===== Choose ===== */
function choose(choice) {
  if (!current || answered || gameOver) return;

  answered = true;
  roundPhase = "ended";
  nextBtn.classList.remove("d-none");
  // Resposta dada — não precisa mais contar. Esconde o timer até a
  // próxima afirmação começar.
  stopTimer();
  timerRow?.classList.add("d-none");

  const correct = choice === Boolean(current.answer);

  if (correct) {
    score += 1;
  }

  // A vez só passa pra próxima equipe quando "Próxima Frase" é clicado
  // (ver nextStatement) — aqui só o placar é ajustado na hora.
  if (Teams.isEnabled() && correct) Teams.addPoint(1);

  showExplanation();

  setAnswerButtonsEnabled(false);
}

// Mostra a explicação (nota + referência) automaticamente assim que a
// resposta é dada — pelo voto ou pelo tempo esgotar. Não tem mais botão
// pra mostrar/esconder: a explicação faz parte do resultado.
function showExplanation(prefix) {
  if (!current) return;

  resultWrap.classList.remove("d-none");
  explainBox.classList.remove("d-none");

  const expected = current.answer ? "VERDADEIRO" : "FALSO";

  let note = current.note;
  if (!note) {
    note = current.answer
      ? "A afirmação está de acordo com o texto."
      : "A afirmação é falsa; confira a referência para entender o detalhe/pegadinha.";
  }

  noteText.textContent = `${prefix ? `${prefix} ` : ""}${expected}: ${note}`;
  referenceText.textContent = current.reference ? `📖 ${current.reference}` : "—";
}

/* ===== Progress / Score ===== */
function updateProgress() {
  const total = pool.length || 0;
  const done = Math.min(idx + 1, total);
  badgeProgress.textContent = total ? `${done}/${total}` : "0/0";
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

      if (!answered && current && !gameOver) {
        answered = true;
        roundPhase = "ended";
        nextBtn.classList.remove("d-none");
        setAnswerButtonsEnabled(false);
        timerRow?.classList.add("d-none");

        // Ninguém respondeu a tempo — perde 1 ponto na hora (diferente
        // de errar escolhendo a opção errada, que não desconta). A vez
        // só passa pra próxima equipe quando "Próxima Frase" é clicado
        // (ver nextStatement).
        if (Teams.isEnabled()) Teams.addPoint(-1);

        showExplanation("⏰ Tempo esgotado! -1 ponto.");
      }
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

/* ===== UI helpers ===== */
// Verdadeiro/Falso somem depois de responder (ou o tempo acabar) — só
// voltam quando a próxima frase é carregada (ver loadAtIndex), pra não
// ficar com os botões parados na tela enquanto mostra o resultado.
function setAnswerButtonsEnabled(enabled) {
  trueBtn.disabled = !enabled;
  falseBtn.disabled = !enabled;
  trueBtn.classList.toggle("d-none", !enabled);
  falseBtn.classList.toggle("d-none", !enabled);
}

function setGameOverUI(isOver) {
  nextBtn.disabled = isOver;
  trueBtn.disabled = isOver;
  falseBtn.disabled = isOver;
  readyBtn.classList.toggle("d-none", isOver || roundPhase !== "ready");

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

function endGame(text) {
  stopTimer();
  clearCountdown();
  gameOver = true;
  roundPhase = "ended";
  setGameOverUI(true);
  timerRow?.classList.add("d-none");

  readyBtn.classList.add("d-none");
  statementText.classList.remove("d-none");
  statementText.textContent = text;

  resultWrap.classList.remove("d-none");
  explainBox.classList.remove("d-none");
  noteText.textContent = `Você fez ${score} acertos de ${pool.length}. Clique em Jogar novamente para reembaralhar as perguntas.`;
  referenceText.textContent = "—";

  badgeProgress.textContent = `${pool.length}/${pool.length}`;

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
}

/* ===== Helpers ===== */
function difficultyLabel(v) {
  if (v === "easy") return "Fácil";
  if (v === "medium") return "Médio";
  return "Difícil";
}