import { createCountdownTimer, shuffleArray } from "../../assets/js/utils.js";
import { icon } from "../../playgospel-ui/js/core.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { showTeamsBlockFocus } from "../../assets/js/game-focus-tour.js";
import { buildFairSchedule, applyScheduleEntry } from "../../assets/js/turn-fairness.js";
import { BibleVersion } from "../../assets/js/bible-version.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";

// Máximo de rodadas por partida (evita jogar todos os versículos de uma vez).
const ROUND_SIZE = 10;

const $ = (id) => document.getElementById(id);

const scoreBtn = $("scoreBtn");

const turnBanner = $("turnBanner");
const turnBannerIcon = $("turnBannerIcon");
const turnBannerTeam = $("turnBannerTeam");
const turnBannerPlayer = $("turnBannerPlayer");

const correctBtn = $("correctBtn");
const timerRow = $("presenterTimerRow");
const readyBtn = $("readyBtn");
const verseText = $("verseText");

let DATA = [];
let pool = [];
let index = 0;
let schedule = []; // escala justa da partida (ver assets/js/turn-fairness.js)

let settings = {
  difficulty: "easy",
  time: 30
};

let timer = null;
let gameOver = false;
let countdownInterval = null;

// Resposta revelada nesta rodada — "✅ Acertou?" tanto marca o ponto quanto
// revela a passagem, então isso também serve pra saber se o ponto desta
// rodada já foi dado (evita clique duplo — ver setTeamsControlsVisible).
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

/* ===== Fase "pronto" — espera confirmar que a equipe da vez está pronta
   antes de começar a contagem, mesmo padrão dos outros jogos por turno
   (ver games/verdadeiro-ou-falso/game.js). A equipe (e "Qualquer um pode
   responder") já aparece no bloco centralizado do topo — o botão só
   ocupa o lugar do versículo, sem repetir o nome de novo aqui. */
function showReadyState() {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  $("nextBtn").disabled = true;

  verseText.classList.add("d-none");
  readyBtn.classList.remove("d-none");
}

function beginPrepareCountdown() {
  verseText.classList.remove("d-none");
  readyBtn.classList.add("d-none");

  startPrepareCountdown(async () => {
    const item = pool[index];
    $("answerText").textContent = item.reference || "—";
    timerRow?.classList.remove("d-none");
    startTimer(settings.time);
    $("nextBtn").disabled = false;

    answerRevealed = false;
    renderTeamUI();

    // Busca a tradução ANTES de escrever o texto na tela — escrever o
    // original e trocar pelo traduzido logo em seguida (como era antes)
    // fazia o texto "piscar" duas vezes, com o traduzido geralmente
    // maior/menor que o original (percebido como "o texto mudou de
    // tamanho sozinho").
    const reqId = ++verseRequestId;
    const text = await BibleVersion.resolveText(item.verse, item.reference);
    if (reqId !== verseRequestId) return; // já foi pra outra carta enquanto buscava
    verseText.textContent = text || "—";
  });
}

/* Contagem "3, 2, 1" antes de cada rodada nova — mesmo padrão visual de
   TODOS os jogos (destaque dourado, .stage-text.is-countdown em
   assets/css/game-base.css) e o mesmo som de tick/"vai" dos demais. */
function startPrepareCountdown(onDone) {
  clearCountdown();
  timerRow?.classList.add("d-none");
  verseText.classList.add("is-countdown");

  let n = 3;
  verseText.textContent = String(n);
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      verseText.textContent = String(n);
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    verseText.classList.remove("is-countdown");
    onDone();
  }, 1000);
}

/* =========================
   TEAMS UI (placar + vez da equipe + botões de pontuação)
========================= */
function setTeamsControlsVisible(visible) {
  // "✅ Acertou?" já revela a resposta — some depois de usado (evita
  // marcar ponto de novo) ou se não houver equipes.
  if (correctBtn) correctBtn.style.display = visible && !answerRevealed ? "inline-block" : "none";
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

  // Diferente dos outros jogos por turno: não mostra uma pessoa
  // específica — com participantes sorteados, avisa que qualquer um da
  // equipe pode responder, já que é difícil saber a resposta de cara e
  // não faria sentido travar numa pessoa só.
  if (turnBannerPlayer) {
    const anyoneCanAnswer = Array.isArray(t.members) && t.members.length > 0;
    turnBannerPlayer.textContent = anyoneCanAnswer ? "— Qualquer um pode responder" : "";
    turnBannerPlayer.classList.toggle("d-none", !anyoneCanAnswer);
  }
}

window.addEventListener("bibflix:teams:change", renderTeamUI);

// Avança a rotação da escala justa (ver assets/js/turn-fairness.js) pra
// quem deve começar a PRÓXIMA rodada (index+1 — chamado antes do
// nextCard() incrementar o index de verdade). Roda sempre uma vez por
// rodada, acertando ou não (ver correctBtn/nextBtn em wireEvents).
function advanceFromVerseStart() {
  if (!Teams.getState().teams.length) return;
  applyScheduleEntry(schedule[index + 1]);
}

function shuffle(arr) {
  return shuffleArray(arr);
}

function renderCard() {
  if (!pool.length) return;

  showAnswer(false);
  updateProgress();
  // Esconde "✅ Acertou?" enquanto espera o "Pronto" e conta — só volta
  // quando a rodada realmente começa (dentro de beginPrepareCountdown).
  setTeamsControlsVisible(false);

  showReadyState();
}

// Incrementado a cada carta nova/troca de tradução — busca de texto que
// terminar depois de já termos ido pra outra carta é descartada em vez
// de sobrescrever a tela errada.
let verseRequestId = 0;

// Troca de tradução (ver bibflix:bible-version:change) com o jogo
// parado numa carta: busca o texto na tradução nova e substitui. Só
// antes de revelar a resposta — depois disso mexer no texto não faz
// sentido (a carta já foi respondida).
async function reloadCurrentVerseText() {
  if (!pool.length || answerRevealed || gameOver) return;
  const item = pool[index];
  const reqId = ++verseRequestId;
  const text = await BibleVersion.resolveText(item.verse, item.reference);
  if (reqId !== verseRequestId) return;
  verseText.textContent = text || "—";
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

  readyBtn.classList.add("d-none");
  verseText.classList.remove("d-none", "is-countdown");
  verseText.textContent = "FIM! ✅";
  $("answerText").textContent = "";
  showAnswer(false);

  $("playAgainBtn").classList.remove("d-none");
  $("gameOverNotice").classList.remove("d-none");

  $("nextBtn").disabled = true;
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
}

function resetGame() {
  index = 0;
  gameOver = false;

  // Escala justa primeiro (ver assets/js/turn-fairness.js) — só a ordem
  // das EQUIPES (forceTeamOnly: diferente dos outros jogos por turno,
  // aqui a resposta não fica restrita a 1 pessoa sorteada, então não faz
  // sentido esticar as rodadas pra cobrir todo mundo individualmente —
  // ver renderTeamUI, "Qualquer um pode responder").
  schedule = buildFairSchedule(ROUND_SIZE, { forceTeamOnly: true });
  const roundCount = schedule.length || ROUND_SIZE;

  // Cada partida sorteia até roundCount versículos (evita jogar todos de
  // uma vez).
  pool = shuffle(DATA.filter((x) => x.level === settings.difficulty)).slice(0, roundCount);
  schedule = schedule.slice(0, pool.length);
  if (Teams.isEnabled()) applyScheduleEntry(schedule[0]);

  $("playAgainBtn").classList.add("d-none");
  $("gameOverNotice").classList.add("d-none");

  $("nextBtn").disabled = false;
  setGameOverButtons(false);

  if (!pool.length) {
    readyBtn.classList.add("d-none");
    verseText.classList.remove("d-none", "is-countdown");
    verseText.textContent = "Sem versículos para esta dificuldade.";
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
  showTeamsBlockFocus();
  resetGame();
}

/* ===== Sair (confirma antes de deixar o jogo, com ou sem equipes) ===== */
function confirmExit() {
  stopTimer();
  clearCountdown();
  const goToCatalog = () => { window.location.href = "../../index.html"; };
  const shown = showScorePopup({
    title: "Sair do jogo?",
    footer: buildExitFooter(goToCatalog),
  });
  if (!shown) goToCatalog();
}

function wireEvents() {
  readyBtn.addEventListener("click", () => beginPrepareCountdown());

  // "✅ Acertou?" marca o ponto da equipe da vez E revela a passagem —
  // a rodada fica na tela (não avança sozinha) pra dar tempo de ler a
  // referência antes de "Próximo versículo".
  correctBtn?.addEventListener("click", () => {
    if (gameOver || answerRevealed) return;

    if (Teams.isEnabled()) {
      advanceFromVerseStart();
      Teams.addPoint(1);
    }

    showAnswer(true);
  });

  // "Próximo versículo": não sabiam (ou já acertaram e só querem seguir) —
  // sem resposta ainda revelada, ainda precisa avançar a escala justa pra
  // próxima rodada (o acerto já faz isso sozinho, ver correctBtn acima).
  $("nextBtn").addEventListener("click", () => {
    if (gameOver) return;
    if (!answerRevealed && Teams.isEnabled()) advanceFromVerseStart();
    nextCard();
  });

  scoreBtn?.addEventListener("click", () => showScorePopup());

  $("exitBtn").addEventListener("click", confirmExit);
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

  $("playAgainBtn").addEventListener("click", () => {
    $("nextBtn").disabled = false;
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

    if (k === "a") correctBtn?.click();
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
  // O seletor de tradução só existe no header da tela inicial (ver
  // wireHeaderControls em app.js) — dentro do jogo ninguém deve trocar a
  // versão no meio de uma rodada. A escolha feita lá continua valendo
  // aqui (BibleVersion.resolveText lê a preferência salva).
  window.addEventListener("bibflix:bible-version:change", reloadCurrentVerseText);
  mountFullscreenButton(document.querySelector(".game-topbar-actions"));
  watchStageText(document.querySelector(".presenter-center"));
  mountSoundMuteButton(document.querySelector(".game-topbar-actions"));

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
