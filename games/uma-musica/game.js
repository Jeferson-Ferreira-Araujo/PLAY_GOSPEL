import { shuffleArray, createCountdownTimer, pointsLabel } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";

// Máximo de rodadas por partida (evita jogar todas as palavras de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");

const turnBanner = document.getElementById("turnBanner");
const turnBannerTeam = document.getElementById("turnBannerTeam");
const pointsBox = document.getElementById("pointsBox");
const pointsValue = document.getElementById("pointsValue");

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");
const timeSelect = document.getElementById("timeSelect");

const customWordsInput = document.getElementById("customWordsInput");

const wordText = document.getElementById("wordText");
const badgeProgress = document.getElementById("badgeProgress");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const newWordBtn = document.getElementById("newWordBtn");
const correctBtn = document.getElementById("correctBtn");
const wrongBtn = document.getElementById("wrongBtn");
const passTurnBtn = document.getElementById("passTurnBtn");
const restartTimerBtn = document.getElementById("restartTimerBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");
const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");
const timerRow = document.getElementById("presenterTimerRow");

let baseWords = [];       // vem do words.json (fixo)
let roundWords = [];      // base + custom (só desta rodada)
let pool = [];            // pool embaralhado da rodada
let idx = 0;
let gameOver = false;

let durationSec = 30;
let timer = null;
let countdownInterval = null;

// Passar a vez: quantas vezes a vez já passou nesta palavra, e quem já tentou
let passCount = 0;
let triedTeamIds = new Set();
let wordStartTurn = 0; // time que iniciou a palavra (base da rotação p/ a próxima)

document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  wireUI();
  renderTeamUI();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTeamUI();
    updateScoreBtn();
  });
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
   TEAMS UI (placar + vez da equipe + botões de pontuação)
   Uma equipe por vez: ela tem o tempo do timer pra cantar uma música com a
   palavra. Acertou soma ponto (dobra a cada "Passar a vez") e vai pra
   próxima palavra; Errou desconta o mesmo valor (também vai pra próxima
   palavra); Passar a vez chama a próxima equipe pra tentar a mesma
   palavra, sem gastar uma tentativa de ninguém mais de uma vez.
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
    pointsBox?.classList.add("d-none");
    return;
  }

  const t = Teams.currentTeam();
  turnBanner?.classList.toggle("d-none", !t);
  pointsBox?.classList.toggle("d-none", !t);
  if (!t) return;

  if (turnBannerTeam) turnBannerTeam.textContent = t.name;
  turnBanner?.style.setProperty("--team-color", t.color || "#F4C430");

  if (correctBtn) correctBtn.textContent = `Acertou (+${passCount + 1})`;
  if (wrongBtn) wrongBtn.textContent = `Errou (-${passCount + 1})`;
  if (pointsValue) pointsValue.textContent = pointsLabel(passCount + 1);

  const state = Teams.getState();
  const canPass = state.teams.length > triedTeamIds.size;
  if (passTurnBtn) passTurnBtn.disabled = gameOver || !canPass;
}

window.addEventListener("bibflix:teams:change", renderTeamUI);

/* =========================
   PASSAR A VEZ
========================= */
function resetPassChain() {
  passCount = 0;
  triedTeamIds = new Set();
  wordStartTurn = Teams.getState().turn;

  const t = Teams.currentTeam();
  if (t) triedTeamIds.add(t.id);

  renderTeamUI();
}

// Avança a rotação a partir de quem INICIOU a palavra (não de quem cantou
// depois de um "passar a vez"), assim cada time mantém sua vez de começar.
function advanceFromWordStart() {
  const n = Teams.getState().teams.length;
  if (!n) return;
  Teams.setTurn((wordStartTurn + 1) % n);
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
  // Esconde os botões de pontuação enquanto conta "Prepare-se!" — só
  // voltam quando a próxima tentativa realmente começar.
  setTeamsControlsVisible(false);

  const w = wordText.textContent;
  startPrepareCountdown(() => {
    wordText.textContent = w;
    timerRow?.classList.remove("d-none");
    startTimer(durationSec);
    renderTeamUI();
  });
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/* Contagem "3, 2, 1" antes de cada palavra/vez nova — dá tempo da equipe
   se preparar antes do timer voltar a contar. */
function startPrepareCountdown(onDone) {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");

  let n = 3;
  wordText.textContent = `Prepare-se! ${n}`;

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      wordText.textContent = `Prepare-se! ${n}`;
      return;
    }
    clearCountdown();
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

/* =========================
   AUTO START VIA URL
   ?play=1
   ?custom=...
   ?time=...
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

  // se vier custom na URL, preenche o textarea do setup (mesmo que não apareça)
  const custom = params.get("custom");
  if (customWordsInput && custom) {
    customWordsInput.value = decodeURIComponent(custom);
  }

  const time = params.get("time");
  if (time !== null && timeSelect) timeSelect.value = time;

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

  // "Nova palavra" pula sem ninguém acertar — mantém quem iniciou a
  // palavra (desfaz qualquer "passar a vez" que tenha acontecido nela).
  newWordBtn.addEventListener("click", () => {
    if (gameOver) return;
    if (Teams.isEnabled()) Teams.setTurn(wordStartTurn);
    nextWord();
  });

  // Pontuação (equipes)
  correctBtn?.addEventListener("click", () => {
    if (gameOver) return;

    if (Teams.isEnabled()) {
      Teams.addPoint(passCount + 1);
      advanceFromWordStart();
    }

    renderTeamUI();
    nextWord();
  });

  // Errou: desconta os mesmos pontos que estavam em jogo (o valor cresce a
  // cada "Passar a vez", igual ao acerto) e encerra a tentativa desta palavra.
  wrongBtn?.addEventListener("click", () => {
    if (gameOver) return;

    if (Teams.isEnabled()) {
      Teams.addPoint(-(passCount + 1));
      advanceFromWordStart();
    }

    renderTeamUI();
    nextWord();
  });

  // Time atual não sabe: passa a vez, mesma palavra continua
  passTurnBtn?.addEventListener("click", () => {
    if (gameOver) return;
    passTurn();
  });

  restartTimerBtn?.addEventListener("click", () => {
    if (gameOver) return;
    startTimer(durationSec);
  });

  playAgainBtn.addEventListener("click", () => {
    restartGame(); // reembaralha e reinicia usando as mesmas roundWords
  });

  scoreBtn?.addEventListener("click", () => showScorePopup());

  // ✅ sair volta pro catálogo principal
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
      if (gameOver) return;
      newWordBtn.click();
    }
  });
}

function startGame() {
  // monta as palavras desta rodada (base + custom do textarea)
  roundWords = buildRoundWords();
  durationSec = Number(timeSelect?.value || 0);

  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();

  restartGame();
}

function buildRoundWords() {
  const custom = parseCustomWords(customWordsInput?.value);

  // junta e remove duplicados (case-insensitive)
  const merged = [...baseWords, ...custom];
  const deduped = dedupeCaseInsensitive(merged);

  // limpa vazios
  return deduped.filter(Boolean);
}

function parseCustomWords(text) {
  // separa por vírgula, aceita também quebra de linha/; e normaliza espaços
  return String(text || "")
    .split(/[,;\n]/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);
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

  // embaralha a ordem a cada reinício, sorteando até ROUND_SIZE palavras
  // (evita jogar todas de uma vez)
  pool = shuffleArray(roundWords).slice(0, ROUND_SIZE);
  idx = 0;

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

  const w = pool[idx];
  idx += 1;
  updateProgress();
  setTeamsControlsVisible(false);

  startPrepareCountdown(() => {
    wordText.textContent = w;
    timerRow?.classList.remove("d-none");
    startTimer(durationSec);
    resetPassChain();
  });
}

function updateProgress() {
  const total = pool.length || roundWords.length || baseWords.length || 0;
  const done = Math.min(idx, total);
  badgeProgress.textContent = `${done}/${total}`;
}

function endGame(text) {
  stopTimer();
  gameOver = true;
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
  if (restartTimerBtn) restartTimerBtn.disabled = isOver;
  if (correctBtn) correctBtn.disabled = isOver;
  if (wrongBtn) wrongBtn.disabled = isOver;
  if (passTurnBtn) passTurnBtn.disabled = isOver;

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

function startTimer(seconds) {
  durationSec = Number(seconds || 0);
  createOrUpdateTimer();
  if (!timer) return;
  timer.reset(durationSec);
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
}
