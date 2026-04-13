import { shuffleArray } from "../../assets/js/utils.js";

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const btnFullscreen = document.getElementById("btnFullscreen");
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

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

// referência (se existir no HTML)
const referenceEl = document.getElementById("referenceText");

let items = [];       // lista base
let pool = [];        // ordem embaralhada
let idx = 0;          // qual personagem atual
let hintIndex = 0;    // quantas dicas já revelamos (0..3)
let gameOver = false;

document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  checkAutoStartFromURL(); // ✅ NOVO
});

async function loadData() {
  const res = await fetch("./data.json", { cache: "no-store" });
  const data = await res.json();
  items = (data.items ?? []).filter(Boolean);
  updateProgress();
}

/* =========================
   AUTO START VIA URL
   ?play=1
========================= */
function checkAutoStartFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("play") !== "1") return;

  startGame();
}

function wireUI() {
  btnFullscreen?.addEventListener("click", toggleFullscreen);

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

  // ✅ Sair agora volta para o catálogo principal
  exitBtn.addEventListener("click", () => {
    window.location.href = "../../index.html#catalogo";
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

    if (k === "f") toggleFullscreen();
  });
}

function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  restartGame();
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  pool = shuffleArray(items);
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
}

function getCurrent() {
  return pool[idx];
}

function revealNextHint() {
  const cur = getCurrent();
  if (!cur) return;

  const hints = (cur.hints ?? []).slice(0, 3);
  if (hintIndex >= hints.length) {
    statusText.textContent = "Todas as dicas já foram exibidas.";
    showAnswerBtn.classList.remove("d-none");
    return;
  }

  const li = document.createElement("li");
  li.textContent = hints[hintIndex];
  hintsList.appendChild(li);

  hintIndex += 1;

  if (hintIndex >= 3) {
    statusText.textContent = "Última dica exibida. Se ninguém acertar, mostre a resposta.";
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
  showAnswerBtn.classList.add("d-none");

  const total = pool.length || items.length || 0;
  badgeProgress.textContent = `${total}/${total}`;
}

function setGameOverUI(isOver) {
  showHintBtn.disabled = isOver;
  showAnswerBtn.disabled = isOver;
  nextBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

/* ===== Fullscreen ===== */
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      btnFullscreen.textContent = "Sair da tela cheia";
    } else {
      await document.exitFullscreen();
      btnFullscreen.textContent = "Tela cheia";
    }
  } catch {}
}

document.addEventListener("fullscreenchange", () => {
  if (!btnFullscreen) return;
  btnFullscreen.textContent = document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia";
});