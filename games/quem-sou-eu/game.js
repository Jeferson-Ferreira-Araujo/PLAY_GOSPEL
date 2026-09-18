import { shuffleArray } from "../../assets/js/utils.js";
import { Teams } from "../../assets/js/teams.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";
import { maybeShowDrawIntro } from "../../assets/js/game-intro.js";
import { showTeamsBlockFocus } from "../../assets/js/game-focus-tour.js";
import { playCountdownTick } from "../../assets/js/countdown-sound.js";
import { mountSoundMuteButton } from "../../assets/js/sound-mute-ui.js";
import { mountFullscreenButton } from "../../assets/js/fullscreen-ui.js";

// Máximo de rodadas por partida (evita jogar todos os personagens de uma vez).
const ROUND_SIZE = 10;

const scoreBtn = document.getElementById("scoreBtn");
const pointsBox = document.getElementById("pointsBox");
const pointsValue = document.getElementById("pointsValue");

const turnBanner = document.getElementById("turnBanner");
const turnBannerTeam = document.getElementById("turnBannerTeam");
const turnBannerPlayer = document.getElementById("turnBannerPlayer");

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");

const badgeProgress = document.getElementById("badgeProgress");

const hintsList = document.getElementById("hintsList");

const answerBox = document.getElementById("answerBox");
const answerText = document.getElementById("answerText");

const showHintBtn = document.getElementById("showHintBtn");
const correctBtn = document.getElementById("correctBtn");
const passBtn = document.getElementById("passBtn");
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
let hintIndex = 0;    // quantas dicas já foram reveladas (0..3)
let attemptValue = 1; // pontos em jogo na dica atual — 1, +1 a cada "Passar a vez"
let gameOver = false;

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  updateScoreBtn();
  window.addEventListener("bibflix:teams:change", () => {
    renderTurnBanner();
    updateScoreBtn();
  });
  mountFullscreenButton(document.querySelector(".game-topbar-actions"));
  mountSoundMuteButton(document.querySelector(".game-topbar-actions"));
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

/* ===== Vez da equipe (banner) — mesmo padrão dos outros jogos por turno
   (ver verdadeiro-ou-falso/game.js). ===== */
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

  const player = Teams.currentPlayer();
  if (turnBannerPlayer) {
    turnBannerPlayer.textContent = player || "";
    turnBannerPlayer.classList.toggle("d-none", !player);
  }
}

function updatePointsBox() {
  if (pointsValue) pointsValue.textContent = `Vale ${attemptValue} ${attemptValue === 1 ? "ponto" : "pontos"}`;
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
async function checkAutoStartFromURL() {
  if (!Teams.isEnabled()) {
    window.location.href = "../../index.html#catalogo";
    return;
  }
  await maybeShowDrawIntro();
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
    beginFirstHint();
  });

  correctBtn.addEventListener("click", () => {
    if (gameOver) return;
    onCorrect();
  });

  passBtn.addEventListener("click", () => {
    if (gameOver) return;
    onPass();
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
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    const k = e.key.toLowerCase();

    if (k === "d") {
      if (gameOver) return;
      // Mesma tecla cobre a ação principal do momento: 1ª dica (jogo
      // parado) ou passar a vez (dica já em andamento) — o que estiver
      // visível na hora.
      if (!showHintBtn.classList.contains("d-none")) beginFirstHint();
      else if (!passBtn.classList.contains("d-none")) onPass();
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
  showTeamsBlockFocus();
  if (Teams.isEnabled()) Teams.setTurn(0);
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
  attemptValue = 1;
  updateProgress();
  buildHintPlaceholders();
  renderTurnBanner();
  updatePointsBox();
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

function maxHintsForCurrent() {
  const cur = getCurrent();
  return Math.min((cur?.hints ?? []).length, 3);
}

// Preenche o marcador "N." que já estava na tela (ver buildHintPlaceholders)
// em vez de criar um item novo — o jogador já via "1. 2. 3." vazios.
function revealHintAt(i) {
  const cur = getCurrent();
  if (!cur) return;
  const hints = (cur.hints ?? []).slice(0, 3);

  const li = hintsList.children[i];
  if (li) {
    li.textContent = hints[i];
    li.classList.remove("hint-pending");
  }

  // Esse jogo não tem contagem "3,2,1" (não é por turno cronometrado) —
  // o mesmo som de tick marca o momento de cada dica nova aparecendo.
  playCountdownTick();
}

// 1ª dica da rodada — mostrada pra equipe que já está na vez (não passa
// a vez pra ninguém: quem inicia a rodada é sempre quem terminou a
// rodada anterior, ver onCorrect/onPass).
function beginFirstHint() {
  revealHintAt(0);
  showHintBtn.classList.add("d-none");
  correctBtn.classList.remove("d-none");
  passBtn.classList.remove("d-none");
}

// Equipe da vez acertou: pontua o valor em jogo nessa dica e passa a vez
// pra próxima equipe começar a próxima rodada (personagem novo).
function onCorrect() {
  if (Teams.isEnabled()) {
    Teams.addPoint(attemptValue);
    Teams.nextTurn();
  }
  finishRound();
}

// "Passar a vez": time atual não sabe — a próxima dica vale mais e vai
// pra próxima equipe da sequência (ver Teams.nextTurn). Sem mais dicas
// pra mostrar, a rodada acaba sem ninguém pontuar.
function onPass() {
  if (Teams.isEnabled()) Teams.nextTurn();
  attemptValue += 1;
  hintIndex += 1;

  if (hintIndex < maxHintsForCurrent()) {
    revealHintAt(hintIndex);
    renderTurnBanner();
    updatePointsBox();
  } else {
    finishRound();
  }
}

// Fim da rodada (acertou ou esgotaram as dicas) — mostra a resposta e
// deixa só "Próximo" disponível. A equipe da vez em Teams (já avançada
// por onCorrect/onPass) é quem começa a próxima rodada.
function finishRound() {
  const cur = getCurrent();
  if (!cur) return;

  answerText.textContent = cur.name ?? "—";
  if (referenceEl) {
    referenceEl.textContent = cur.reference ? `📖 Referência: ${cur.reference}` : "";
  }
  answerBox.classList.remove("d-none");

  correctBtn.classList.add("d-none");
  passBtn.classList.add("d-none");
  // "Próximo" só aparece agora — as 3 dicas (ou até menos, se acertou
  // antes) e a resposta já precisam estar na tela primeiro.
  nextBtn.classList.remove("d-none");

  renderTurnBanner();
}

function nextItem() {
  idx += 1;
  loadCurrentItem();
}

function clearRoundUI() {
  hintsList.innerHTML = "";
  answerBox.classList.add("d-none");
  answerText.textContent = "";

  if (referenceEl) referenceEl.textContent = "";

  showHintBtn.classList.remove("d-none");
  correctBtn.classList.add("d-none");
  passBtn.classList.add("d-none");
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

  answerBox.classList.add("d-none");
  showHintBtn.classList.add("d-none");
  correctBtn.classList.add("d-none");
  passBtn.classList.add("d-none");
  turnBanner?.classList.add("d-none");

  const total = pool.length || items.length || 0;
  badgeProgress.textContent = `${total}/${total}`;

  showScorePopup({
    title: "🏁 Fim de jogo!",
    footer: buildPlayAgainFooter(restartGame),
  });
}

function setGameOverUI(isOver) {
  showHintBtn.disabled = isOver;
  correctBtn.disabled = isOver;
  passBtn.disabled = isOver;
  nextBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}