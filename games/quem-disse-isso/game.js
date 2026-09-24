import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { buildMemberQueues, advanceMemberForTeam } from "../../assets/js/turn-fairness.js";
import { icon } from "../../playgospel-ui/js/core.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { showTeamsBlockFocus } from "../../assets/js/game-focus-tour.js";
import { BibleVersion } from "../../assets/js/bible-version.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";

// Máximo de rodadas por partida (evita jogar todas as frases de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");
const teamScoreButtons = document.getElementById("teamScoreButtons");
const pairRow = document.getElementById("pairRow");
const pairRowBig = document.getElementById("pairRowBig");
const pairRowBigLabel = document.getElementById("pairRowBigLabel");

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

// Índice (dentro de currentPair) de quem marcou o ponto nesta rodada —
// mostra o badge "+1" piscando no bloco da equipe (ver pairTeamsHtml).
// Zera ao avançar pra próxima rodada (ver nextQuote/restartGame).
let scoredTeamIndex = null;

// ===== Rodízio de pares (2 equipes por rodada) =====
// Com só 2 equipes ativas, o par é sempre o mesmo (as duas). Com 3+, a
// ordem das equipes é embaralhada uma vez no início da partida e o par
// avança uma posição a cada rodada (A x B, B x C, C x A, repete...) — um
// rodízio circular que garante que ninguém fica de fora rodadas seguidas
// (mesmo padrão de games/palavras-misturadas/game.js).
let pairOrder = [];
let pairCursor = -1;
let currentPair = null; // [índiceEquipeA, índiceEquipeB] ou null antes da 1ª rodada
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

// Chamada no início de cada rodada nova: fecha a rodada anterior (troca
// quem representa cada equipe do par que acabou de jogar, em ordem
// embaralhada — sem repetir ninguém da equipe até todo mundo dela ter
// jogado) e decide o próximo par pelo rodízio.
function advancePair() {
  const n = Teams.getState().teams.length;
  if (pairOrder.length !== n) initPairing();

  if (currentPair) {
    advanceMemberForTeam(memberQueues, currentPair[0]);
    advanceMemberForTeam(memberQueues, currentPair[1]);
  }

  pairCursor = (pairCursor + 1) % n;
  const a = pairOrder[pairCursor % n];
  const b = pairOrder[(pairCursor + 1) % n];
  currentPair = [a, b];
}

// Monta o HTML do par (equipe x equipe) — usado tanto no bloco pequeno do
// topo (#pairRow) quanto no bloco grande centralizado durante a contagem
// (#pairRowBig, ver startRound), pra não duplicar a marcação.
function pairTeamsHtml() {
  const state = Teams.getState();
  return currentPair.map((teamIndex) => {
    const team = state.teams[teamIndex];
    if (!team) return "";
    const player = Teams.playerOf(teamIndex);
    // Badge "+1" piscando no bloco de quem acabou de marcar o ponto —
    // fica até avançar pra próxima rodada (ver scoredTeamIndex).
    const scored = teamIndex === scoredTeamIndex;
    return `
      <div class="qd-pair-team" style="--team-color:${escapeHtml(team.color)}">
        <span class="qd-pair-team-icon">${icon(teamIconName(team), { size: 18 })}</span>
        <span class="qd-pair-team-text">
          <span class="qd-pair-team-name">${escapeHtml(team.name)}</span>
          ${player ? `<span class="qd-pair-team-player">${escapeHtml(player)}</span>` : ""}
        </span>
        ${scored ? `<span class="qd-pair-score-badge">+1</span>` : ""}
      </div>
    `;
  }).join(`<div class="qd-pair-vs">×</div>`);
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
    // A visibilidade do bloco grande é controlada pelo startRound (só
    // aparece durante a contagem) — aqui só garante que ele já não fique
    // visível com conteúdo vazio se a rodada/partida acabou.
    if (!has) pairRowBig.classList.add("d-none");
  }
}

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
  // O seletor de tradução só existe no header da tela inicial (ver
  // wireHeaderControls em app.js) — dentro do jogo ninguém deve trocar a
  // versão no meio de uma rodada. A escolha feita lá continua valendo
  // aqui (BibleVersion.resolveText lê a preferência salva).
  window.addEventListener("bibflix:bible-version:change", reloadCurrentQuoteText);
  mountFullscreenButton(document.querySelector(".game-topbar-actions"));
  watchStageText(document.querySelector(".presenter-center"));
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
  // Ficam visíveis desde o início da rodada (junto com "Revelar" e
  // "Próxima frase") — clicar na equipe que acertou já revela a resposta
  // e dá o ponto, sem precisar de um passo extra pra "confirmar acerto".
  // Só as 2 equipes do par atual (ver advancePair) disputam a rodada.
  // Somem assim que o ponto é dado (ver revealAnswer/pointGiven).
  if (!teamScoreButtons) return;

  if (!Teams.isEnabled() || gameOver || !currentPair || pointGiven) {
    teamScoreButtons.innerHTML = "";
    teamScoreButtons.classList.add("d-none");
    return;
  }

  const state = Teams.getState();
  teamScoreButtons.classList.remove("d-none");

  teamScoreButtons.innerHTML = currentPair.map((index) => {
    const team = state.teams[index];
    if (!team) return "";
    return `
    <button
      type="button"
      class="qd-team-btn"
      data-index="${index}"
      style="--team-color:${escapeHtml(team.color)}"
    >
      <span class="qd-team-btn-icon">${icon(teamIconName(team), { size: 16 })}</span>
      <span>${escapeHtml(team.name)} acertou</span>
    </button>
  `;
  }).join("");

  teamScoreButtons.querySelectorAll(".qd-team-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (gameOver || pointGiven) return;

      const index = Number(btn.dataset.index);
      Teams.setTurn(index);
      Teams.addPoint(1);

      pointGiven = true;
      scoredTeamIndex = index;
      revealAnswer();
      renderPairRow();
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
    title: "Sair do jogo?",
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

  revealBtn.addEventListener("click", () => revealAnswer());

  nextBtn.addEventListener("click", () => {
    if (!gameOver) nextQuote();
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
  showTeamsBlockFocus();

  answerBox.classList.add("d-none");

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

  initPairing();

  if (!pool.length) {
    endGame("SEM FRASES");
    return;
  }

  updateProgress();
  scoredTeamIndex = null;
  advancePair();
  renderPairRow();

  startRound();
}

function nextQuote() {
  stopTimer();

  idx++;

  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  updateProgress();
  scoredTeamIndex = null;
  advancePair();
  renderPairRow();

  startRound();
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/* ===== Início de rodada — sem passo manual de "Começar": a contagem
   "3,2,1" já dispara sozinha assim que a rodada anterior termina (ver
   nextQuote/restartGame), com o par da vez em destaque grande no centro
   (mesmo conteúdo do bloco pequeno do topo — ver renderPairRow/
   pairTeamsHtml). Ao fim da contagem, o par volta pro tamanho/posição
   normal e a frase é carregada. */
function startRound() {
  if (gameOver) return;

  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");

  // Limpa o resto da rodada anterior — senão ficava tudo visível por
  // baixo do bloco grande de contagem.
  answerBox.classList.add("d-none");
  revealBtn.classList.add("d-none");
  nextBtn.classList.add("d-none");
  teamScoreButtons?.classList.add("d-none");

  pairRow?.classList.add("d-none");
  pairRowBig?.classList.remove("d-none");
  pairRowBigLabel?.classList.remove("d-none");
  quoteText.classList.remove("d-none");

  startPrepareCountdown(() => {
    pairRowBig?.classList.add("d-none");
    pairRowBigLabel?.classList.add("d-none");
    pairRow?.classList.remove("d-none");
    loadQuoteAtIndex(idx);
    timerRow?.classList.remove("d-none");
    resetAndStartTimer();
  });
}

/* Contagem "5, 4, 3, 2, 1" antes de cada frase nova — mesmo padrão
   visual de todos os jogos (dígito grande dourado, .stage-text.is-countdown
   em assets/css/game-base.css) e o mesmo som de tick/"vai". Mais longa
   que o padrão (3s) porque agora tem o par de equipes em destaque junto
   — dá tempo de todo mundo ver quem joga antes da frase aparecer. */
function startPrepareCountdown(onDone) {
  clearCountdown();
  timerRow?.classList.add("d-none");
  quoteText.classList.add("is-countdown");

  let n = 5;
  quoteText.textContent = String(n);
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      quoteText.textContent = String(n);
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    quoteText.classList.remove("is-countdown");
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

  revealBtn.classList.remove("d-none");
  // "Próxima frase" fica visível desde já (não só depois de revelar) —
  // pode ser que ninguém saiba a resposta e o jogo precisa seguir mesmo
  // assim.
  nextBtn.classList.remove("d-none");

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

// Revela a resposta — chamada tanto pelo botão "Ver resposta" quanto ao
// clicar direto numa equipe (ver renderTeamScoreButtons). Quem marcou o
// ponto já fica claro pelo botão clicado, então a resposta em si não
// repete o nome da equipe.
function revealAnswer() {
  if (!current) return;

  answerText.textContent = current.answer ?? "—";
  referenceText.textContent = current.reference ? `📖 ${current.reference}` : "";

  answerBox.classList.remove("d-none");
  revealBtn.classList.add("d-none");

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
  scoredTeamIndex = null;

  revealBtn.classList.add("d-none");
  nextBtn.classList.add("d-none");
  pairRowBig?.classList.add("d-none");
  pairRowBigLabel?.classList.add("d-none");
  quoteText.classList.remove("is-countdown", "d-none");
  quoteText.textContent = text;
  answerBox.classList.add("d-none");
  timerText.textContent = "";
  timerBar.style.width = "0%";
  timerRow?.classList.add("d-none");

  badgeProgress.textContent = `${pool.length}/${pool.length}`;
  renderTeamScoreButtons();
  renderPairRow();

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