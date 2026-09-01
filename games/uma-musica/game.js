import { shuffleArray } from "../../assets/js/utils.js";
import { renderTeamScoreboard } from "../../assets/js/scoreboard-ui.js";
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from "../../assets/js/score-popup.js";

const teamsScoreboard = document.getElementById("teamsScoreboard");

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const startBtn = document.getElementById("startBtn");

const customWordsInput = document.getElementById("customWordsInput");

const wordText = document.getElementById("wordText");
const badgeProgress = document.getElementById("badgeProgress");

const newWordBtn = document.getElementById("newWordBtn");
const exitBtn = document.getElementById("exitBtn");
const brandLink = document.getElementById("brandLink");
const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

let baseWords = [];       // vem do words.json (fixo)
let roundWords = [];      // base + custom (só desta rodada)
let pool = [];            // pool embaralhado da rodada
let idx = 0;
let gameOver = false;

document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  wireUI();
  renderTeamScoreboard(teamsScoreboard);
  checkAutoStartFromURL(); // ✅ novo fluxo
});

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
========================= */
function checkAutoStartFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("play") !== "1") return;

  // se vier custom na URL, preenche o textarea do setup (mesmo que não apareça)
  const custom = params.get("custom");
  if (customWordsInput && custom) {
    customWordsInput.value = decodeURIComponent(custom);
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

  newWordBtn.addEventListener("click", () => {
    if (gameOver) return;
    nextWord();
  });

  playAgainBtn.addEventListener("click", () => {
    restartGame(); // reembaralha e reinicia usando as mesmas roundWords
  });

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
      nextWord();
    }
  });
}

function startGame() {
  // monta as palavras desta rodada (base + custom do textarea)
  roundWords = buildRoundWords();

  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");

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

  // embaralha a ordem a cada reinício
  pool = shuffleArray(roundWords);
  idx = 0;

  nextWord();
}

function nextWord() {
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

  wordText.textContent = w;
  updateProgress();
}

function updateProgress() {
  const total = pool.length || roundWords.length || baseWords.length || 0;
  const done = Math.min(idx, total);
  badgeProgress.textContent = `${done}/${total}`;
}

function endGame(text) {
  gameOver = true;
  wordText.textContent = text;
  setGameOverUI(true);
  updateProgress();

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