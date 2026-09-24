import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { playCountdownTick, playCountdownGo } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";
import { watchStageText } from "../../assets/js/fit-text.js";
import { showTeamsBlockFocus } from "../../assets/js/game-focus-tour.js";
import { buildMemberQueues, advanceMemberForTeam } from "../../assets/js/turn-fairness.js";
import { icon } from "../../playgospel-ui/js/core.js";

// Máximo de rodadas por partida (evita jogar todas as palavras de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");
const pairRow = document.getElementById("pairRow");
const pairRowBig = document.getElementById("pairRowBig");
const pairRowBigLabel = document.getElementById("pairRowBigLabel");
const teamScoreButtons = document.getElementById("teamScoreButtons");

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");

const wordText = document.getElementById("wordText");
const badgeProgress = document.getElementById("badgeProgress");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const newWordBtn = document.getElementById("newWordBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");
const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");
const timerRow = document.getElementById("presenterTimerRow");

let baseWords = [];       // vem do words.json (fixo)
let roundWords = [];      // baseWords sem duplicados
let pool = [];            // pool embaralhado da rodada
let idx = 0;
let gameOver = false;

// Tempo fixo (sem opção de escolha, pra evitar excesso de configurações —
// ver assets/js/game-focus-tour.js e o histórico de simplificação do site).
const durationSec = 10;
let timer = null;
let countdownInterval = null;

let currentWord = "";    // palavra sorteada pra rodada atual (mostrada só depois do "Começar rodada")
let pointGiven = false;  // ponto já dado nesta rodada — evita clique duplo nos botões de equipe

// ===== Rodízio de pares (2 equipes por rodada) =====
// Formato "disputa": as 2 equipes do par veem a mesma palavra ao mesmo
// tempo, e quem cantar uma música com ela primeiro marca o ponto (ver
// teamScoreButtons). Com só 2 equipes ativas, o par é sempre o mesmo. Com
// 3+, a ordem é embaralhada uma vez no início da partida e o par avança
// uma posição a cada rodada (A x B, B x C, C x A, repete...) — mesmo
// padrão de games/palavras-misturadas/game.js e games/quem-disse-isso/game.js.
let pairOrder = [];
let pairCursor = -1;
let currentPair = null; // [índiceEquipeA, índiceEquipeB] ou null antes da 1ª rodada
let memberQueues = {};  // fila embaralhada de integrantes por equipe (ver assets/js/turn-fairness.js)

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

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function teamIconName(team) {
  return Teams.teamIconNames.includes(team.icon) ? team.icon : "star";
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
    return `
      <div class="um-pair-team" style="--team-color:${escapeHtml(team.color)}">
        <span class="um-pair-team-icon">${icon(teamIconName(team), { size: 18 })}</span>
        <span class="um-pair-team-text">
          <span class="um-pair-team-name">${escapeHtml(team.name)}</span>
          ${player ? `<span class="um-pair-team-player">${escapeHtml(player)}</span>` : ""}
        </span>
      </div>
    `;
  }).join(`<div class="um-pair-vs">×</div>`);
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
    // aparece durante a contagem) — aqui só garante que ele não fique
    // visível com conteúdo vazio se a rodada/partida acabou.
    if (!has) pairRowBig.classList.add("d-none");
  }
}

/* ===== Formato "disputa": um botão de pontuação por equipe do par ativo —
   quem administra clica na equipe que cantou uma música com a palavra
   primeiro. Aparecem assim que a palavra é revelada (não tem resposta
   escondida pra revelar antes, como em outros jogos de disputa). ===== */
function renderTeamScoreButtons() {
  if (!teamScoreButtons) return;

  if (!Teams.isEnabled() || !currentPair || gameOver || pointGiven) {
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
      class="um-team-btn"
      data-index="${index}"
      style="--team-color:${escapeHtml(team.color)}"
    >
      <span class="um-team-btn-icon">${icon(teamIconName(team), { size: 16 })}</span>
      <span>${escapeHtml(team.name)} cantou</span>
    </button>
  `;
  }).join("");

  teamScoreButtons.querySelectorAll(".um-team-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (gameOver || pointGiven) return;

      const index = Number(btn.dataset.index);
      const team = state.teams[index];
      Teams.addPoint(1);

      pointGiven = true;
      showPointGiven(team);
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  wireUI();
  renderTeamScoreButtons();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTeamScoreButtons();
    updateScoreBtn();
  });
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

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

/* ===== Início de rodada — sem passo manual de "Começar": a contagem
   "5,4,3,2,1" já dispara sozinha assim que a rodada anterior termina (ver
   nextWord), com o par da vez em destaque grande no centro (mesmo
   conteúdo do bloco pequeno do topo — ver renderPairRow/pairTeamsHtml).
   Ao fim da contagem, o par volta pro tamanho/posição normal e a palavra
   é revelada. */
function startRound() {
  if (gameOver) return;

  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  newWordBtn.classList.add("d-none");
  teamScoreButtons?.classList.add("d-none");

  pairRow?.classList.add("d-none");
  pairRowBig?.classList.remove("d-none");
  pairRowBigLabel?.classList.remove("d-none");
  wordText.classList.remove("d-none");

  startPrepareCountdown(() => {
    pairRowBig?.classList.add("d-none");
    pairRowBigLabel?.classList.add("d-none");
    pairRow?.classList.remove("d-none");
    wordText.textContent = currentWord;
    timerRow?.classList.remove("d-none");
    startTimer();
    pointGiven = false;
    renderTeamScoreButtons();
    newWordBtn.classList.remove("d-none");
  });
}

/* Contagem "5, 4, 3, 2, 1" antes de cada palavra — mesmo padrão visual de
   todos os jogos (dígito grande dourado, .stage-text.is-countdown em
   assets/css/game-base.css) e o mesmo som de tick/"vai". */
function startPrepareCountdown(onDone) {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  wordText.classList.add("is-countdown");

  let n = 5;
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

// Ponto dado: some a palavra, os botões de pontuação e o bloco do par do
// topo (já mostra o badge da equipe vencedora aqui embaixo, não faz
// sentido repetir lá em cima) — só resta o anúncio de quem ganhou (badge
// colorido com ícone, não texto em branco) e "Nova palavra" esperando o
// clique. O bloco do topo só volta quando a próxima rodada estiver
// pronta pra começar (ver showReadyState).
function showPointGiven(team) {
  stopTimer();
  timerRow?.classList.add("d-none");
  wordText.classList.remove("is-countdown");
  pairRow?.classList.add("d-none");
  renderTeamScoreButtons();

  if (team) {
    wordText.innerHTML = `
      <div class="point-announce">
        <div class="round-box round-box--team round-box--team-centered point-announce-badge" style="--team-color:${escapeHtml(team.color || "#F4C430")}">
          <span class="round-box-team-icon">${icon(team.icon || "star", { size: 22 })}</span>
          <span class="round-box-value">${escapeHtml(team.name)}</span>
        </div>
        <div class="point-announce-text">ganhou 1 ponto</div>
      </div>
    `;
  } else {
    wordText.textContent = "";
  }
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
  clearCountdown();
  const goToCatalog = () => { window.location.href = "../../index.html#catalogo"; };
  const shown = showScorePopup({
    title: "Sair do jogo?",
    footer: buildExitFooter(goToCatalog),
  });
  if (!shown) goToCatalog();
}

function wireUI() {
  startBtn?.addEventListener("click", () => {
    startGame();
  });

  // "Nova palavra": sem acerto (ou já acertou e só quer seguir) — a
  // rotação de pares continua avançando do mesmo jeito.
  newWordBtn.addEventListener("click", () => {
    if (gameOver) return;
    nextWord();
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

  initPairing();

  // Cada partida sorteia até ROUND_SIZE palavras (evita jogar todas de
  // uma vez).
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

  currentWord = pool[idx];
  idx += 1;
  updateProgress();

  advancePair();
  renderPairRow();

  startRound();
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

  newWordBtn.classList.add("d-none");
  pairRowBig?.classList.add("d-none");
  pairRowBigLabel?.classList.add("d-none");
  wordText.classList.remove("is-countdown", "d-none");
  wordText.textContent = text;
  setGameOverUI(true);
  updateProgress();

  renderPairRow();
  renderTeamScoreButtons();
  timerText.textContent = "--";
  timerBar.style.width = "0%";

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
}

function setGameOverUI(isOver) {
  newWordBtn.disabled = isOver;

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
      // quando zera, para; a rodada continua (admin decide quem cantou/segue)
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
