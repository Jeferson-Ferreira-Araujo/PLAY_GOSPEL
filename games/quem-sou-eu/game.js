import { shuffleArray } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { icon } from "../../playgospel-ui/js/core.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";

// Máximo de rodadas por partida (evita jogar todos os personagens de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");
const teamScoreButtons = document.getElementById("teamScoreButtons");
const pointsBox = document.getElementById("pointsBox");

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");

const badgeProgress = document.getElementById("badgeProgress");
const statusText = document.getElementById("statusText");

const hintsList = document.getElementById("hintsList");

const answerBox = document.getElementById("answerBox");
const answerText = document.getElementById("answerText");

const showHintBtn = document.getElementById("showHintBtn");
const showAnswerBtn = document.getElementById("showAnswerBtn");
const nextBtn = document.getElementById("nextBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

// referência (se existir no HTML)
const referenceEl = document.getElementById("referenceText");

let items = [];       // lista base
let pool = [];        // ordem embaralhada
let idx = 0;          // qual personagem atual
let hintIndex = 0;    // quantas dicas já revelamos (0..3)
let gameOver = false;

// Resposta revelada e ponto já dado nesta rodada — controlam quando os
// botões "X acertou" aparecem/ficam habilitados (ver renderTeamScoreButtons).
let answerRevealed = false;
let pointGiven = false;

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  renderTeamScoreButtons();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTeamScoreButtons();
    updateScoreBtn();
  });
  checkAutoStartFromURL(); // ✅ NOVO
});

// Placar sob demanda (igual ao "Qual é a Música?") — em vez de um placar
// fixo no cabeçalho, um botão que abre o popup com o ranking. Só aparece
// durante o jogo (não na tela de configuração) e só com equipes ativas.
function updateScoreBtn() {
  if (!scoreBtn) return;
  const show = !gameScreen.classList.contains("d-none") && Teams.isEnabled();
  scoreBtn.classList.toggle("d-none", !show);
  pointsBox?.classList.toggle("d-none", !show);
}

/* ===== Formato "disputa": um botão de pontuação por equipe ativa =====
   Todas as equipes veem as mesmas dicas ao mesmo tempo; quem administra o
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
  // Só aparecem depois que a resposta certa foi revelada na tela — assim
  // quem administra confere antes de dar o ponto pra equipe certa.
  if (!teamScoreButtons) return;

  if (!Teams.isEnabled() || !answerRevealed || gameOver) {
    teamScoreButtons.innerHTML = "";
    teamScoreButtons.classList.add("d-none");
    return;
  }

  const state = Teams.getState();
  teamScoreButtons.classList.remove("d-none");

  teamScoreButtons.innerHTML = state.teams.map((team, index) => `
    <button
      type="button"
      class="qs-team-btn"
      data-index="${index}"
      style="--team-color:${escapeHtml(team.color)}"
      ${pointGiven ? "disabled" : ""}
    >
      <span class="qs-team-btn-icon">${icon(teamIconName(team), { size: 16 })}</span>
      <span>${escapeHtml(team.name)} acertou</span>
    </button>
  `).join("");

  teamScoreButtons.querySelectorAll(".qs-team-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (gameOver || pointGiven) return;

      const index = Number(btn.dataset.index);
      Teams.setTurn(index);
      Teams.addPoint(1);

      pointGiven = true;
      renderTeamScoreButtons();
    });
  });
}

async function loadData() {
  const res = await fetch("./data.json", { cache: "no-store" });
  const data = await res.json();
  items = (data.items ?? []).filter(Boolean);
  updateProgress();
}

/* =========================
   AUTO START — a tela de configuração ficou só no modal do catálogo
   (que já barra "Jogar" sem equipes ativas — ver assets/js/app.js). Se
   mesmo assim alguém cair aqui sem equipes (link direto, por exemplo),
   volta pro catálogo em vez de mostrar um jogo sem placar.
========================= */
function checkAutoStartFromURL() {
  if (!Teams.isEnabled()) {
    window.location.href = "../../index.html#catalogo";
    return;
  }
  startGame();
}

/* ===== Sair (confirma antes de deixar o jogo, com ou sem equipes) ===== */
function confirmExit() {
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

  showHintBtn.addEventListener("click", () => {
    if (gameOver) return;
    revealNextHint();
  });

  showAnswerBtn.addEventListener("click", () => {
    if (gameOver) return;
    revealAnswer();
  });

  nextBtn.addEventListener("click", () => {
    if (gameOver) return;
    nextItem();
  });

  playAgainBtn.addEventListener("click", () => {
    restartGame();
  });

  scoreBtn?.addEventListener("click", () => showScorePopup());

  // ✅ Sair agora volta para o catálogo principal
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

    const k = e.key.toLowerCase();

    if (k === "d") {
      if (gameOver) return;
      revealNextHint();
    }

    if (k === "n") {
      if (gameOver) return;
      nextItem();
    }
  });
}

function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  updateScoreBtn();
  restartGame();
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  // Cada partida sorteia até ROUND_SIZE personagens (evita jogar todos de
  // uma vez).
  pool = shuffleArray(items).slice(0, ROUND_SIZE);
  idx = 0;

  loadCurrentItem();
}

function loadCurrentItem() {
  clearRoundUI();

  if (!pool.length) {
    endGame("SEM PERSONAGENS");
    return;
  }

  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  hintIndex = 0;
  statusText.textContent = "Revele uma dica por vez.";
  updateProgress();
  buildHintPlaceholders();
}

function getCurrent() {
  return pool[idx];
}

// Mostra desde já os marcadores "1. 2. 3." vazios (sem o texto da dica) —
// assim o jogador já sabe quantas dicas essa rodada vai ter, mesmo antes
// de qualquer uma ser revelada.
function buildHintPlaceholders() {
  const cur = getCurrent();
  if (!cur) return;

  const total = Math.min((cur.hints ?? []).length, 3);
  hintsList.innerHTML = "";

  for (let i = 0; i < total; i++) {
    const li = document.createElement("li");
    li.className = "hint-pending";
    li.textContent = "· · ·";
    hintsList.appendChild(li);
  }
}

function revealNextHint() {
  const cur = getCurrent();
  if (!cur) return;

  const hints = (cur.hints ?? []).slice(0, 3);
  if (hintIndex >= hints.length) {
    statusText.textContent = "Todas as dicas já foram exibidas.";
    // Sem mais dicas pra mostrar — some com o botão, só resta "Mostrar resposta".
    showHintBtn.classList.add("d-none");
    showAnswerBtn.classList.remove("d-none");
    return;
  }

  // Preenche o marcador "N." que já estava na tela (ver buildHintPlaceholders)
  // em vez de criar um item novo — o jogador já via "1. 2. 3." vazios.
  const li = hintsList.children[hintIndex];
  if (li) {
    li.textContent = hints[hintIndex];
    li.classList.remove("hint-pending");
  }

  hintIndex += 1;

  if (hintIndex >= hints.length) {
    statusText.textContent = "Última dica exibida. Se ninguém acertar, mostre a resposta.";
    showHintBtn.classList.add("d-none");
    showAnswerBtn.classList.remove("d-none");
  } else {
    statusText.textContent = `Dica ${hintIndex}/3 exibida.`;
  }
}

function revealAnswer() {
  const cur = getCurrent();
  if (!cur) return;

  answerText.textContent = cur.name ?? "—";

  if (referenceEl) {
    referenceEl.textContent = cur.reference ? `📖 Referência: ${cur.reference}` : "";
  }

  answerBox.classList.remove("d-none");
  statusText.textContent = "Resposta exibida. Clique em Próximo.";

  // Resposta já está na tela — "Mostrar dica"/"Mostrar resposta" não fazem
  // mais sentido, só resta ir pra próxima rodada (e, com equipes, dar o ponto).
  showHintBtn.classList.add("d-none");
  showAnswerBtn.classList.add("d-none");

  answerRevealed = true;
  renderTeamScoreButtons();
}

function nextItem() {
  idx += 1;
  loadCurrentItem();
}

function clearRoundUI() {
  hintsList.innerHTML = "";
  answerBox.classList.add("d-none");
  answerText.textContent = "";

  answerRevealed = false;
  pointGiven = false;
  renderTeamScoreButtons();

  if (referenceEl) referenceEl.textContent = "";

  showHintBtn.classList.remove("d-none");
  showAnswerBtn.classList.add("d-none");
}

function updateProgress() {
  const total = pool.length || items.length || 0;
  const done = Math.min(idx + 1, total);
  badgeProgress.textContent = total ? `${done}/${total}` : `0/0`;
}

function endGame(text) {
  gameOver = true;
  setGameOverUI(true);

  hintsList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = text;
  hintsList.appendChild(li);

  statusText.textContent = "Encerrado.";
  answerBox.classList.add("d-none");
  showHintBtn.classList.add("d-none");
  showAnswerBtn.classList.add("d-none");

  const total = pool.length || items.length || 0;
  badgeProgress.textContent = `${total}/${total}`;

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
}

function setGameOverUI(isOver) {
  showHintBtn.disabled = isOver;
  showAnswerBtn.disabled = isOver;
  nextBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}