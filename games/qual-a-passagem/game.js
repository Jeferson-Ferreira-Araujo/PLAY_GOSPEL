import { createCountdownTimer, shuffleArray, pointsLabel } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";

// Máximo de rodadas por partida (evita jogar todos os versículos de uma vez).
const ROUND_SIZE = 10;

const $ = (id) => document.getElementById(id);

const scoreBtn = $("scoreBtn");

const turnBanner = $("turnBanner");
const turnBannerTeam = $("turnBannerTeam");
const turnBannerPlayer = $("turnBannerPlayer");

const pointsBox = $("pointsBox");
const pointsValue = $("pointsValue");

const correctBtn = $("correctBtn");
const wrongBtn = $("wrongBtn");
const passTurnBtn = $("passTurnBtn");
const timerRow = $("presenterTimerRow");

let DATA = [];
let pool = [];
let index = 0;

let settings = {
  difficulty: "easy",
  time: 30
};

let timer = null;
let gameOver = false;
let countdownInterval = null;

// Passar a vez: quantas vezes a vez já passou nesta rodada, e quem já tentou
let passCount = 0;
let triedTeamIds = new Set();
let verseStartTurn = 0; // time que iniciou a rodada (base da rotação p/ a próxima)

// Resposta revelada nesta rodada — Acertou/Errou (dão ponto) só aparecem
// depois de "Revelar", pra evitar cliques sem querer que pontuem a equipe
// errada por engano. "Passar a vez" continua disponível antes, já que
// passar não exige (nem deveria exigir) mostrar a resposta.
let answerRevealed = false;

function getParams() {
  const url = new URL(window.location.href);
  const play = url.searchParams.get("play") === "1";
  const difficulty = url.searchParams.get("difficulty");
  const timeRaw = url.searchParams.get("time");
  const time = timeRaw !== null ? Number(timeRaw) : null;
  return { play, difficulty, time };
}

function labelDifficulty(diff) {
  const map = { easy: "Fácil", medium: "Médio", hard: "Difícil" };
  return map[diff] || diff || "-";
}

function setBadgeDifficulty(diff) {
  $("badgeDifficulty").textContent = labelDifficulty(diff);
}

function updateProgress() {
  const total = pool.length;
  const current = total ? Math.min(index + 1, total) : 0;
  $("badgeProgress").textContent = `${current}/${total}`;
}

function showAnswer(show) {
  $("answerBox").classList.toggle("d-none", !show);

  if (show) {
    answerRevealed = true;
    // Depois de revelar não precisa mais contar — esconde o timer até a
    // próxima rodada começar.
    stopTimer();
    timerRow?.classList.add("d-none");
    renderTeamUI();
  }
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

/* Contagem "3, 2, 1" antes de cada rodada nova — dá tempo da equipe se
   preparar antes do timer voltar a contar. */
function startPrepareCountdown(onDone) {
  clearCountdown();
  timerRow?.classList.add("d-none");

  let n = 3;
  $("verseText").textContent = prepareLabel(n);

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      $("verseText").textContent = prepareLabel(n);
      return;
    }
    clearCountdown();
    onDone();
  }, 1000);
}

/* =========================
   TEAMS UI (placar + vez da equipe + botões de pontuação)
========================= */
function setTeamsControlsVisible(visible) {
  // Acertou/Errou dão ponto — só depois de revelar a resposta.
  const showScoring = visible && answerRevealed;
  if (correctBtn) correctBtn.style.display = showScoring ? "inline-block" : "none";
  if (wrongBtn) wrongBtn.style.display = showScoring ? "inline-block" : "none";
  // Passar não dá ponto nem exige revelar — some só sem equipes.
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

  const player = Teams.currentPlayer();
  if (turnBannerPlayer) {
    turnBannerPlayer.textContent = player || "";
    turnBannerPlayer.classList.toggle("d-none", !player);
  }

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
  verseStartTurn = Teams.getState().turn;
  answerRevealed = false;

  const t = Teams.currentTeam();
  if (t) triedTeamIds.add(t.id);

  renderTeamUI();
}

// Avança a rotação a partir de quem INICIOU a rodada (não de quem respondeu
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
  timerRow?.classList.remove("d-none");
  startTimer(settings.time);
}

function shuffle(arr) {
  return shuffleArray(arr);
}

function renderCard() {
  if (!pool.length) return;

  const item = pool[index];

  showAnswer(false);
  updateProgress();
  // Esconde os botões de pontuação enquanto conta "Prepare-se!" — só
  // voltam (com o passCount certo) quando resetPassChain roda lá embaixo,
  // pra ninguém clicar Passar a vez antes da rodada realmente começar.
  setTeamsControlsVisible(false);

  startPrepareCountdown(() => {
    $("verseText").textContent = item.verse || "—";
    $("answerText").textContent = item.reference || "—";
    timerRow?.classList.remove("d-none");
    startTimer(settings.time);
    resetPassChain();
  });
}

// Avança pra próxima carta — quem chama decide o que acontece com a vez
// (o botão "Próximo" mantém quem iniciou a rodada; Acertou/Errou já
// avançaram a vez via advanceFromVerseStart antes de chamar isto).
function nextCard() {
  if (!pool.length) return;

  index++;
  if (index >= pool.length) {
    gameOverScreen();
    return;
  }
  renderCard();
}

function gameOverScreen() {
  stopTimer();
  clearCountdown();
  gameOver = true;

  $("verseText").textContent = "FIM! ✅";
  $("answerText").textContent = "";
  showAnswer(false);

  $("playAgainBtn").classList.remove("d-none");
  $("gameOverNotice").classList.remove("d-none");

  $("revealBtn").disabled = true;
  $("nextBtn").disabled = true;
  $("restartTimerBtn").disabled = true;
  setGameOverButtons(true);

  $("timerText").textContent = "--";
  $("timerBar").style.width = "0%";
  timerRow?.classList.add("d-none");
  $("badgeProgress").textContent = `${pool.length}/${pool.length}`;

  turnBanner?.classList.add("d-none");

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(() => $("playAgainBtn").click()),
  });
}

function setGameOverButtons(isOver) {
  if (correctBtn) correctBtn.disabled = isOver;
  if (wrongBtn) wrongBtn.disabled = isOver;
  if (passTurnBtn) passTurnBtn.disabled = isOver;
}

function resetGame() {
  index = 0;
  gameOver = false;

  // Cada partida sorteia até ROUND_SIZE versículos (evita jogar todos de
  // uma vez).
  pool = shuffle(DATA.filter((x) => x.level === settings.difficulty)).slice(0, ROUND_SIZE);

  $("playAgainBtn").classList.add("d-none");
  $("gameOverNotice").classList.add("d-none");

  $("revealBtn").disabled = false;
  $("nextBtn").disabled = false;
  $("restartTimerBtn").disabled = false;
  setGameOverButtons(false);

  if (!pool.length) {
    $("verseText").textContent = "Sem versículos para esta dificuldade.";
    $("answerText").textContent = "";
    showAnswer(false);
    $("badgeProgress").textContent = "0/0";
    $("timerText").textContent = "--";
    $("timerBar").style.width = "0%";
    timerRow?.classList.add("d-none");
    turnBanner?.classList.add("d-none");
    return;
  }

  renderCard();
}

function showScreen(gameMode) {
  $("setupScreen").classList.toggle("d-none", gameMode);
  $("gameScreen").classList.toggle("d-none", !gameMode);
}

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  DATA = await res.json();
}

function startFromSettings() {
  setBadgeDifficulty(settings.difficulty);
  showScreen(true);
  updateScoreBtn();
  resetGame();
}

/* ===== Sair (confirma antes de deixar o jogo, com ou sem equipes) ===== */
function confirmExit() {
  stopTimer();
  clearCountdown();
  const goToCatalog = () => { window.location.href = "../../index.html"; };
  const shown = showScorePopup({
    title: "👋 Sair do jogo?",
    footer: buildExitFooter(goToCatalog),
  });
  if (!shown) goToCatalog();
}

function wireEvents() {
  $("revealBtn").addEventListener("click", () => showAnswer(true));

  // "Próximo" pula a rodada sem ninguém responder — mantém quem a iniciou
  // (desfaz qualquer "passar a vez" que tenha acontecido nela).
  $("nextBtn").addEventListener("click", () => {
    if (Teams.isEnabled()) Teams.setTurn(verseStartTurn);
    nextCard();
  });

  $("restartTimerBtn").addEventListener("click", () => startTimer(settings.time));

  // Pontuação (equipes)
  correctBtn?.addEventListener("click", () => {
    if (gameOver) return;

    if (Teams.isEnabled()) {
      Teams.addPoint(passCount + 1);
      advanceFromVerseStart();
    }

    renderTeamUI();
    nextCard();
  });

  // Errou: desconta os mesmos pontos que estavam em jogo (o valor cresce a
  // cada "Passar a vez", igual ao acerto) e encerra a tentativa desta rodada.
  wrongBtn?.addEventListener("click", () => {
    if (gameOver) return;

    if (Teams.isEnabled()) {
      Teams.addPoint(-(passCount + 1));
      advanceFromVerseStart();
    }

    renderTeamUI();
    nextCard();
  });

  // Time atual não sabe: passa a vez, mesma rodada continua
  passTurnBtn?.addEventListener("click", () => {
    if (gameOver) return;
    passTurn();
  });

  scoreBtn?.addEventListener("click", () => showScorePopup());

  $("exitBtn").addEventListener("click", confirmExit);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

  $("playAgainBtn").addEventListener("click", () => {
    $("revealBtn").disabled = false;
    $("nextBtn").disabled = false;
    $("restartTimerBtn").disabled = false;
    resetGame();
  });

  $("startBtn").addEventListener("click", () => {
    settings.difficulty = $("difficultySelect").value;
    settings.time = Number($("timeSelect").value || 0);
    startFromSettings();
  });

  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();

    // atalhos só no modo jogo
    if ($("gameScreen").classList.contains("d-none")) return;

    if (k === "r") showAnswer(true);
    if (k === "n") $("nextBtn").click();
    if (k === "t") startTimer(settings.time);
  });
}

/* =========================
   TIMER (padrão compartilhado — createCountdownTimer)
========================= */
function createOrUpdateTimer() {
  stopTimer();

  const seconds = Number(settings.time || 0);
  if (seconds <= 0) {
    timer = null;
    $("timerText").textContent = "Sem tempo";
    $("timerBar").style.width = "0%";
    return;
  }

  timer = createCountdownTimer({
    durationSec: seconds,
    onTick: ({ remainingSec, progress01 }) => {
      $("timerText").textContent = `${remainingSec}s`;
      $("timerBar").style.width = `${Math.round(progress01 * 100)}%`;
    },
    onEnd: () => {
      $("timerText").textContent = "Tempo!";
      $("timerBar").style.width = "0%";
      // quando zera, para; rodada continua
    },
  });
}

function startTimer(seconds) {
  settings.time = Number(seconds || 0);
  createOrUpdateTimer();
  if (!timer) return;
  timer.reset(settings.time);
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
}

// Placar sob demanda (padrão do site): um botão no cabeçalho que abre o
// popup com o ranking, em vez de um placar fixo. Só aparece durante o
// jogo (não na tela de configuração) e só com equipes ativas.
function updateScoreBtn() {
  if (!scoreBtn) return;
  const show = !$("gameScreen").classList.contains("d-none") && Teams.isEnabled();
  scoreBtn.classList.toggle("d-none", !show);
}

async function init() {
  wireEvents();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", updateScoreBtn);

  // A tela de configuração ficou só no modal do catálogo (que já barra
  // "Jogar" sem equipes ativas — ver assets/js/app.js). Se mesmo assim
  // alguém cair aqui sem equipes (link direto, por exemplo), volta pro
  // catálogo em vez de mostrar um jogo sem placar.
  if (!Teams.isEnabled()) {
    window.location.href = "../../index.html#catalogo";
    return;
  }

  await loadData();

  const { difficulty, time } = getParams();

  if (difficulty) settings.difficulty = difficulty;
  if (time !== null && !Number.isNaN(time)) settings.time = time;

  // fallback: preenche selects
  $("difficultySelect").value = settings.difficulty;
  $("timeSelect").value = String(settings.time);

  // A tela de configuração ficou só no modal do catálogo (index.html);
  // ao chegar aqui, o jogo começa direto, sempre.
  await maybeShowDrawIntro();
  startFromSettings();
}

init().catch((err) => {
  console.error(err);
  $("setupScreen").innerHTML = `
    <div class="container py-4">
      <div class="p-4 rounded-4 bg-black border border-danger">
        <h1 class="h4">Erro ao carregar o jogo</h1>
        <p class="text-secondary mb-0">Verifique data.json e a estrutura de pastas.</p>
      </div>
    </div>
  `;
});
