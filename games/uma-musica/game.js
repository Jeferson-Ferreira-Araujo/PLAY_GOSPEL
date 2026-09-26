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

const revealBtn = document.getElementById("revealBtn");
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
// Contagem "3,2,1" antes de revelar a palavra (ver startPrepareCountdown) —
// só depois do clique em "Mostrar Palavra"/"Próxima Palavra", nunca sozinha.
const PREP_COUNTDOWN_START = 3;
let timer = null;
let countdownInterval = null;

let currentWord = "";    // palavra sorteada pra rodada atual (mostrada só depois do "Começar rodada")
let pointGiven = false;  // ponto já dado nesta rodada — evita clique duplo nos botões de equipe

// Índice (dentro de currentPair) de quem marcou o ponto nesta rodada —
// mostra o badge "+1" piscando no bloco da equipe (ver pairTeamsHtml).
// Zera ao avançar pra próxima rodada (ver nextWord/restartGame).
let scoredTeamIndex = null;

// ===== Rodízio de pares (2 equipes por rodada) =====
// Formato "disputa": as 2 equipes do par veem a mesma palavra ao mesmo
// tempo, e quem cantar uma música com ela primeiro marca o ponto (ver
// teamScoreButtons). Com só 2 equipes ativas, o par é sempre o mesmo. Com
// 3+, a ordem é embaralhada uma vez no início da partida e o par avança
// uma posição a cada rodada (A x B, B x C, C x A, repete...) — mesmo
// padrão de games/palavras-misturadas/game.js e games/quem-disse-isso/game.js.
let pairOrder = [];
let pairCursor = -1;
let currentPair = null; // par da rodada ativa (dono dos botões de pontuação) — null antes da 1ª rodada
let previewPair = null; // par do bloco grande "Preparem-se", já calculado mas ainda não em jogo
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

// Calcula o próximo par do rodízio (troca quem representa cada equipe do
// par que acabou de jogar, em ordem embaralhada — sem repetir ninguém da
// equipe até todo mundo dela ter jogado) SEM tocar em currentPair — o
// resultado só vira a rodada ativa quando o usuário clicar em "Mostrar
// Palavra"/"Próxima Palavra" (ver onRevealClick), permitindo mostrar o
// próximo par em destaque enquanto os botões de pontuação da rodada
// anterior ainda estão na tela.
function computeNextPair() {
  const n = Teams.getState().teams.length;
  if (pairOrder.length !== n) initPairing();

  if (currentPair) {
    advanceMemberForTeam(memberQueues, currentPair[0]);
    advanceMemberForTeam(memberQueues, currentPair[1]);
  }

  pairCursor = (pairCursor + 1) % n;
  const a = pairOrder[pairCursor % n];
  const b = pairOrder[(pairCursor + 1) % n];
  return [a, b];
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function teamIconName(team) {
  return Teams.teamIconNames.includes(team.icon) ? team.icon : "star";
}

// Monta o HTML de um par (equipe x equipe) — usado tanto no bloco pequeno
// do topo (#pairRow, rodada ativa) quanto no bloco grande centralizado de
// espera (#pairRowBig, próxima rodada), pra não duplicar a marcação.
function pairTeamsHtml(pair, { showBadge = false } = {}) {
  const state = Teams.getState();
  return pair.map((teamIndex) => {
    const team = state.teams[teamIndex];
    if (!team) return "";
    const player = Teams.playerOf(teamIndex);
    // Badge "+1" piscando no bloco de quem acabou de marcar o ponto —
    // só no bloco pequeno da rodada ativa, nunca no de espera da próxima
    // (ver scoredTeamIndex/showBadge).
    const scored = showBadge && teamIndex === scoredTeamIndex;
    return `
      <div class="um-pair-team" style="--team-color:${escapeHtml(team.color)}">
        <span class="um-pair-team-icon">${icon(teamIconName(team), { size: 18 })}</span>
        <span class="um-pair-team-text">
          <span class="um-pair-team-name">${escapeHtml(team.name)}</span>
          ${player ? `<span class="um-pair-team-player">${escapeHtml(player)}</span>` : ""}
        </span>
        ${scored ? `<span class="um-pair-score-badge">+1</span>` : ""}
      </div>
    `;
  }).join(`<div class="um-pair-vs">×</div>`);
}

// Bloco pequeno do topo — sempre a rodada ATIVA (currentPair), inclusive
// durante o período de espera pra próxima rodada (mantém o "+1" visível
// se alguém marcou ponto depois que o tempo já tinha acabado).
function renderPairRow() {
  const has = Boolean(currentPair) && !gameOver;
  pairRow?.classList.toggle("d-none", !has);
  if (pairRow) pairRow.innerHTML = has ? pairTeamsHtml(currentPair, { showBadge: true }) : "";
}

// Bloco grande central "Preparem-se" — a PRÓXIMA rodada (previewPair),
// mostrado sem contagem enquanto se espera o clique em "Mostrar
// Palavra"/"Próxima Palavra" (ver showPreviewPair).
function renderPreviewBlock() {
  const has = Boolean(previewPair);
  pairRowBig?.classList.toggle("d-none", !has);
  pairRowBigLabel?.classList.toggle("d-none", !has);
  if (pairRowBig) pairRowBig.innerHTML = has ? pairTeamsHtml(previewPair) : "";
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
      // addPointTo (não addPoint+setTurn): soma direto na equipe clicada
      // sem tocar em st.turn — setTurn tem o efeito colateral de avançar
      // o memberTurn da equipe que "sai" da vez, o que bagunçaria o
      // rodízio de integrantes por fila própria deste jogo (memberQueues).
      Teams.addPointTo(index, 1);

      pointGiven = true;
      scoredTeamIndex = index;
      markPointGiven();
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

/* ===== Espera "Preparem-se" antes de cada rodada — SEM contagem: dá
   tempo pras duas equipes (ou pessoas sorteadas) do próximo par se
   preparem antes de qualquer coisa aparecer, com um botão manual
   ("Mostrar Palavra"/"Próxima Palavra") pra só então iniciar a contagem
   e revelar a palavra (ver onRevealClick/revealWord). O bloco pequeno do
   topo (rodada ativa/currentPair) e os botões de pontuação continuam
   como estavam — é assim que dá pra marcar ponto com atraso depois que
   o tempo da rodada anterior já acabou (ver finishRound). */
function showPreviewPair() {
  if (gameOver) return;
  // Já calculado (ex.: tempo acabou e mostrou o próximo par, mas alguém
  // ainda marcou ponto depois disso, com atraso) — não recalcula, senão
  // o rodízio avançaria um par a mais sem ninguém ter jogado ele.
  if (previewPair) return;

  clearCountdown();
  stopTimer();

  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  previewPair = computeNextPair();
  renderPreviewBlock();

  revealBtn.textContent = idx === 0 ? "Mostrar Palavra" : "Próxima Palavra";
  revealBtn.classList.remove("d-none");
}

// Clique em "Mostrar Palavra"/"Próxima Palavra": a rodada de espera passa
// a ser a rodada ativa (currentPair) e a contagem "3,2,1" começa.
function onRevealClick() {
  if (gameOver || !previewPair) return;

  revealBtn.classList.add("d-none");
  currentPair = previewPair;
  previewPair = null;
  pointGiven = false;
  scoredTeamIndex = null;

  startPrepareCountdown();
}

/* Contagem "3, 2, 1" antes de revelar a palavra — mesmo padrão visual dos
   outros jogos (dígito grande dourado, .stage-text.is-countdown em
   assets/css/game-base.css) e o mesmo som de tick/"vai". O bloco grande
   do par (já com o par que vai jogar) continua em tela durante a
   contagem toda. */
function startPrepareCountdown() {
  clearCountdown();
  stopTimer();
  timerRow?.classList.add("d-none");
  wordText.classList.remove("d-none");
  wordText.classList.add("is-countdown");

  let n = PREP_COUNTDOWN_START;
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
    revealWord();
  }, 1000);
}

// Fim da contagem: some o bloco grande de espera, volta o bloco pequeno
// do topo (agora com o novo currentPair) e revela a palavra.
function revealWord() {
  pairRowBig?.classList.add("d-none");
  pairRowBigLabel?.classList.add("d-none");

  currentWord = pool[idx];
  idx += 1;
  updateProgress();

  renderPairRow();
  wordText.textContent = currentWord;
  timerRow?.classList.remove("d-none");
  startTimer();
  renderTeamScoreButtons();
}

async function loadWords() {
  const res = await fetch("./words.json", { cache: "no-store" });
  const data = await res.json();
  baseWords = (data.words ?? []).filter(Boolean);

  // setup inicial
  roundWords = [...baseWords];
  updateProgress();
}

// Ponto dado: para o tempo, esconde os botões de pontuação (só um ponto
// por rodada) e o bloco do par no topo ganha o badge "+1" piscando na
// equipe que marcou (ver scoredTeamIndex/pairTeamsHtml) — e a rodada já
// se encerra (ver finishRound), sem precisar esperar o tempo acabar.
function markPointGiven() {
  renderTeamScoreButtons();
  renderPairRow();
  finishRound();
}

// Encerra a rodada ativa (por ponto marcado OU tempo esgotado): some a
// palavra e o timer, e já mostra o próximo par em destaque — os botões
// de pontuação da rodada que terminou continuam na tela (se ainda não
// marcou ponto) pra dar folga a quem cantou mas não deu tempo de clicar.
function finishRound() {
  stopTimer();
  clearCountdown();
  timerRow?.classList.add("d-none");
  wordText.classList.add("d-none");
  wordText.classList.remove("is-countdown");
  showPreviewPair();
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

  // "Mostrar Palavra"/"Próxima Palavra": só existe durante a espera
  // "Preparem-se" (ver showPreviewPair) — inicia a contagem e revela a
  // palavra do par que está em destaque.
  revealBtn.addEventListener("click", onRevealClick);

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
      if (gameOver || revealBtn.classList.contains("d-none")) return;
      revealBtn.click();
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

  stopTimer();
  clearCountdown();

  initPairing();
  previewPair = null;
  scoredTeamIndex = null;
  pointGiven = false;

  // Cada partida sorteia até ROUND_SIZE palavras (evita jogar todas de
  // uma vez).
  pool = shuffleArray(roundWords).slice(0, ROUND_SIZE);
  idx = 0;
  updateProgress();

  pairRow?.classList.add("d-none");
  timerRow?.classList.add("d-none");
  wordText.classList.add("d-none");
  teamScoreButtons?.classList.add("d-none");

  if (!pool.length) {
    endGame("SEM PALAVRAS");
    return;
  }

  showPreviewPair();
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
  scoredTeamIndex = null;
  previewPair = null;

  revealBtn.classList.add("d-none");
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
  revealBtn.disabled = isOver;

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
      // Tempo esgotado sem ponto: a palavra some e já mostra o próximo
      // par em destaque — os botões de pontuação da rodada que passou
      // continuam na tela por conta própria (ver finishRound/
      // renderTeamScoreButtons), pra dar folga a quem cantou mas o
      // administrador não deu tempo de clicar.
      if (!pointGiven) finishRound();
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
