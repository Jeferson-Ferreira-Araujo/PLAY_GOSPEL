import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";

// Máximo de rodadas por partida (evita jogar todas as afirmações de uma vez).
const ROUND_SIZE = 10;

// Ícone do botão "Explicação" — o texto nunca muda, só o ícone (olho
// aberto/fechado) indica se a explicação está visível ou não.
const EYE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.7 20.7 0 0 1-3.22 4.44M6.06 6.06A20.7 20.7 0 0 0 1 12s4 8 11 8a10.94 10.94 0 0 0 5.94-1.76"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>`;

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
const resultPill = document.getElementById("resultPill");
const explainBox = document.getElementById("explainBox");
const noteText = document.getElementById("noteText");
const referenceText = document.getElementById("referenceText");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const trueBtn = document.getElementById("trueBtn");
const falseBtn = document.getElementById("falseBtn");
const revealBtn = document.getElementById("revealBtn");
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

let current = null; // { statement, answer(boolean), reference, note? }
let answered = false;
let explanationOpen = false;

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

  // Alterna mostrar/esconder a explicação — o texto do botão nunca muda
  // ("Explicação"), só o ícone (olho aberto/fechado). Também funciona
  // antes de responder ("modo ensino": dá uma espiada na explicação).
  revealBtn.addEventListener("click", () => {
    if (!current) return;
    setExplanationVisible(!explanationOpen);
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
    if (k === "r") revealBtn.click();
  });
}

/* ===== Game flow ===== */
function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();
  restartGame();
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  currentDifficulty = difficultySelect.value;
  durationSec = Number(timeSelect.value || 0);

  badgeDifficulty.textContent = difficultyLabel(currentDifficulty);

  const list = (data?.[currentDifficulty] ?? []).filter(Boolean);
  // Cada partida sorteia até ROUND_SIZE afirmações (evita jogar todas de
  // uma vez).
  pool = shuffleArray(list).slice(0, ROUND_SIZE);
  idx = 0;
  score = 0;

  if (!pool.length) {
    endGame("SEM PERGUNTAS");
    return;
  }

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
  revealBtn.classList.add("d-none");

  roundPhase = "ready";
  statementText.classList.add("d-none");
  readyBtn.classList.remove("d-none");
  readyBtn.textContent = readyLabel();
}

function readyLabel() {
  const t = Teams.currentTeam();
  if (!t) return "Estou pronto";
  const player = Teams.currentPlayer();
  const who = player ? `${t.name} (${player})` : t.name;
  return `Chamar ${who}`;
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

// Anuncia a equipe (e, se sorteada, a pessoa) da vez junto com a
// contagem — o aviso de que o jogo mostra "de quem é a vez" deixou de
// ser um texto solto no modal de Equipes pra virar esse momento real,
// bem no início de cada rodada.
function prepareLabel(n) {
  const t = Teams.currentTeam();
  if (!t) return `Prepare-se! ${n}`;
  const player = Teams.currentPlayer();
  const who = player ? `${t.name} (${player})` : t.name;
  return `Prepare-se, ${who}! ${n}`;
}

/* Contagem "3, 2, 1" antes de cada afirmação nova — dá tempo da equipe se
   preparar antes do timer voltar a contar. */
function startPrepareCountdown(onDone) {
  clearCountdown();
  timerRow?.classList.add("d-none");

  let n = 3;
  statementText.textContent = prepareLabel(n);
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      statementText.textContent = prepareLabel(n);
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    onDone();
  }, 1000);
}

function loadAtIndex(i) {
  current = pool[i];
  answered = false;

  statementText.textContent = current.statement ?? "—";

  // esconder resultado/explicação
  resultWrap.classList.add("d-none");
  resultPill.textContent = "—";
  noteText.textContent = "—";
  referenceText.textContent = "—";

  setAnswerButtonsEnabled(true);
  setExplanationVisible(false);
  // Só pode ver a explicação depois de votar Verdadeiro/Falso (ou o
  // tempo esgotar) — ver choose() e o onEnd do timer.
  revealBtn.classList.add("d-none");
}

/* ===== Choose ===== */
function choose(choice) {
  if (!current || answered || gameOver) return;

  answered = true;
  roundPhase = "ended";
  revealBtn.classList.remove("d-none");
  // Resposta dada — não precisa mais contar. Esconde o timer até a
  // próxima afirmação começar.
  stopTimer();
  timerRow?.classList.add("d-none");

  const correct = choice === Boolean(current.answer);

  if (correct) {
    score += 1;
  }

  if (Teams.isEnabled()) {
    if (correct) Teams.addPoint(1);
    Teams.nextTurn();
  }

  showResult(correct, choice);
  showExplanation();

  setAnswerButtonsEnabled(false);
}

function showResult(correct, choice) {
  resultWrap.classList.remove("d-none");

  const expected = current.answer ? "VERDADEIRO" : "FALSO";
  const chosen = choice ? "VERDADEIRO" : "FALSO";

  if (correct) {
    resultPill.textContent = `✅ Acertou! (${chosen})`;
    resultPill.style.borderColor = "rgba(25,135,84,.55)";
  } else {
    resultPill.textContent = `❌ Errou! Você marcou ${chosen}. Resposta: ${expected}.`;
    resultPill.style.borderColor = "rgba(220,53,69,.55)";
  }
}

// Preenche o texto da explicação (nota + referência) sem mexer em
// visibilidade — separado de setExplanationVisible pra poder popular o
// conteúdo (ao responder/tempo esgotar) sem forçar o "olho" a abrir se a
// pessoa já tinha escondido a explicação.
function populateExplanation() {
  if (!current) return;

  const expected = current.answer ? "VERDADEIRO" : "FALSO";

  let note = current.note;
  if (!note) {
    note = current.answer
      ? "A afirmação está de acordo com o texto."
      : "A afirmação é falsa; confira a referência para entender o detalhe/pegadinha.";
  }

  noteText.textContent = `${expected}: ${note}`;
  referenceText.textContent = current.reference ? `📖 ${current.reference}` : "—";
}

// Mostra a explicação automaticamente (ao responder ou o tempo acabar) —
// sempre abre o "olho", já que é a primeira vez que ela aparece nessa
// rodada.
function showExplanation() {
  if (!current) return;
  resultWrap.classList.remove("d-none");
  populateExplanation();
  setExplanationVisible(true);
}

// Botão "Explicação" (ícone de olho) — o texto nunca muda, só o ícone.
// Esconder a explicação não esconde o resultWrap inteiro se já houver um
// resultado (acertou/errou) pra mostrar; só esconde de vez se ainda
// estiver em "modo ensino" (antes de responder).
function setExplanationVisible(visible) {
  explanationOpen = visible;
  explainBox.classList.toggle("d-none", !visible);
  revealBtn.innerHTML = `${visible ? EYE_OFF_ICON : EYE_ICON} Explicação`;

  if (visible) {
    resultWrap.classList.remove("d-none");
    populateExplanation();
  } else if (!answered) {
    resultWrap.classList.add("d-none");
  }
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
        revealBtn.classList.remove("d-none");
        setAnswerButtonsEnabled(false);
        timerRow?.classList.add("d-none");

        if (Teams.isEnabled()) Teams.nextTurn();

        resultWrap.classList.remove("d-none");
        const expected = current.answer ? "VERDADEIRO" : "FALSO";
        resultPill.textContent = `⏰ Tempo! Resposta: ${expected}.`;
        resultPill.style.borderColor = "rgba(255,193,7,.55)";
        showExplanation();
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
function setAnswerButtonsEnabled(enabled) {
  trueBtn.disabled = !enabled;
  falseBtn.disabled = !enabled;
}

function setGameOverUI(isOver) {
  nextBtn.disabled = isOver;
  trueBtn.disabled = isOver;
  falseBtn.disabled = isOver;
  revealBtn.disabled = isOver;
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
  resultPill.textContent = `✅ Você fez ${score} acertos de ${pool.length}.`;
  resultPill.style.borderColor = "rgba(25,135,84,.55)";

  explanationOpen = true;
  explainBox.classList.remove("d-none");
  revealBtn.classList.remove("d-none");
  revealBtn.innerHTML = `${EYE_OFF_ICON} Explicação`;
  noteText.textContent = "Clique em Jogar novamente para reembaralhar as perguntas.";
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