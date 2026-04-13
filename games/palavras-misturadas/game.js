import { createCountdownTimer, shuffleArray } from "../../assets/js/utils.js";

const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const categorySelect = document.getElementById("categorySelect");
const timeSelect = document.getElementById("timeSelect");
const startBtn = document.getElementById("startBtn");

const btnFullscreen = document.getElementById("btnFullscreen");

const scrambledWordEl = document.getElementById("scrambledWord");
const answerBox = document.getElementById("answerBox");
const answerText = document.getElementById("answerText");

const badgeCategory = document.getElementById("badgeCategory");
const badgeRound = document.getElementById("badgeRound");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const newWordBtn = document.getElementById("newWordBtn");
const showAnswerBtn = document.getElementById("showAnswerBtn");
const restartTimerBtn = document.getElementById("restartTimerBtn");
const exitBtn = document.getElementById("exitBtn");

// NOVOS
const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

let data = null;
let currentCategory = null;
let currentWord = "";
let round = 0;

let timer = null;
let selectedDurationSec = 30;

// pool sem repetição (sessão atual)
let wordPool = [];
let poolIndex = 0;

let gameOver = false;

document.addEventListener("DOMContentLoaded", async () => {
  await loadWords();
  wireUI();
  checkAutoStartFromURL(); // NOVO
});

async function loadWords() {
  const res = await fetch("./words.json", { cache: "no-store" });
  data = await res.json();

  categorySelect.innerHTML =
    `<option value="" disabled selected>Selecione...</option>` +
    data.categories
      .map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)}</option>`)
      .join("");

  if (data.categories.length) {
    categorySelect.value = data.categories[0].id;
  }
}

function wireUI() {
  btnFullscreen.addEventListener("click", toggleFullscreen);

  timeSelect.addEventListener("change", () => {
    selectedDurationSec = Number(timeSelect.value || 0);
  });

  startBtn.addEventListener("click", () => {
    const catId = categorySelect.value;
    if (!catId) return;

    currentCategory = data.categories.find(c => c.id === catId);
    selectedDurationSec = Number(timeSelect.value || 0);

    startGame();
  });

  newWordBtn.addEventListener("click", () => {
    if (gameOver) return;
    nextWord();
    if (!gameOver) startOrResetTimer(true);
  });

  showAnswerBtn.addEventListener("click", () => {
    answerBox.classList.toggle("d-none");
    showAnswerBtn.textContent = answerBox.classList.contains("d-none")
      ? "Mostrar resposta"
      : "Ocultar resposta";
  });

  restartTimerBtn.addEventListener("click", () => {
    if (gameOver) return;
    startOrResetTimer(true);
  });

  playAgainBtn.addEventListener("click", () => {
    // reinicia a sessão do jogo na mesma categoria e tempo
    round = 0;
    setGameOverUI(false);
    buildWordPool();
    nextWord();
    if (!gameOver) startOrResetTimer(true);
  });

  exitBtn.addEventListener("click", () => {
    stopTimer();
  setGameOverUI(false);
  gameOver = false;

  gameScreen.classList.add("d-none");
  setupScreen.classList.remove("d-none");

  answerBox.classList.add("d-none");
  showAnswerBtn.textContent = "Mostrar resposta";

  window.location.href = "../../index.html";

    
  });

  // atalhos (modo apresentação)
  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    if (e.code === "Space") {
      e.preventDefault();
      if (gameOver) return;
      nextWord();
      if (!gameOver) startOrResetTimer(true);
    }

    if (e.key.toLowerCase() === "f") toggleFullscreen();
  });
}

function startGame() {


  answerBox.classList.add("d-none");
  showAnswerBtn.textContent = "Mostrar resposta";

  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");

  badgeCategory.textContent = currentCategory.name;

  round = 0;
  setGameOverUI(false);
  gameOver = false;

  buildWordPool();

  createOrUpdateTimer();
  nextWord();
  if (!gameOver) startOrResetTimer(true);
}

/* ===========================
   Pool sem repetição
=========================== */

function buildWordPool() {
  const words = (currentCategory?.words ?? []).filter(Boolean);
  wordPool = shuffleArray(words);
  poolIndex = 0;
}

function getNextWordNoRepeat() {
  if (!wordPool.length) return null;
  if (poolIndex >= wordPool.length) return null; // acabou => encerra
  const w = wordPool[poolIndex];
  poolIndex += 1;
  return w;
}

/* ===========================
   Game flow
=========================== */

function setGameOverUI(isOver) {
  gameOver = isOver;

  newWordBtn.disabled = isOver;
  restartTimerBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

function endGame() {
  stopTimer();

  scrambledWordEl.textContent = "FIM DE JOGO";
  timerText.textContent = "Encerrado";
  timerBar.style.width = "0%";
  timerBar.classList.remove("bg-danger");

  setGameOverUI(true);
}

function nextWord() {
  const words = currentCategory?.words ?? [];
  if (!words.length) {
    currentWord = "";
    scrambledWordEl.textContent = "SEM PALAVRAS";
    endGame();
    return;
  }

  const next = getNextWordNoRepeat();
  if (!next) {
    endGame();
    return;
  }

  round += 1;
  badgeRound.textContent = `Rodada ${round}`;

  answerBox.classList.add("d-none");
  showAnswerBtn.textContent = "Mostrar resposta";

  currentWord = next;
  answerText.textContent = currentWord;

  scrambledWordEl.textContent = scrambleKeepSpaces(currentWord);
}

/* ===========================
   Scramble
=========================== */

function scrambleKeepSpaces(phrase) {
  // Mantém espaços. Embaralha cada token separado por espaço.
  return phrase
    .split(" ")
    .map(word => scrambleToken(word))
    .join(" ");
}

function scrambleToken(token) {
  const chars = Array.from(token);
  if (chars.length <= 1) return token;

  const original = chars.join("");
  for (let tries = 0; tries < 6; tries++) {
    const shuffled = shuffleArray(chars).join("");
    if (shuffled !== original) return shuffled;
  }
  return token;
}

/* ===========================
   Timer (global util)
=========================== */

function createOrUpdateTimer() {
  stopTimer();

  if (selectedDurationSec <= 0) {
    timerText.textContent = "Sem tempo";
    timerBar.style.width = "0%";
    timerBar.classList.remove("bg-danger");
    timer = null;
    return;
  }

  timer = createCountdownTimer({
    durationSec: selectedDurationSec,
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

      // troca automaticamente para a próxima palavra.
      // se acabar o pool => endGame()
      setTimeout(() => {
        if (gameOver) return;
        nextWord();
        if (!gameOver) startOrResetTimer(true);
      }, 350);
    }
  });
}

function startOrResetTimer(forceReset = false) {
  createOrUpdateTimer();

  if (!timer) {
    timerText.textContent = "Sem tempo";
    return;
  }

  timer.reset(selectedDurationSec);
  timer.start();
}

function stopTimer() {
  if (timer) timer.stop();
}

/* ===========================
   Fullscreen
=========================== */

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      btnFullscreen.textContent = "Sair da tela cheia";
    } else {
      await document.exitFullscreen();
      btnFullscreen.textContent = "Tela cheia";
    }
  } catch {
    // pode falhar em alguns browsers/tablets sem gesto explícito
  }
}

document.addEventListener("fullscreenchange", () => {
  btnFullscreen.textContent = document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia";
});

/* ===========================
   Helpers
=========================== */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

function checkAutoStartFromURL() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("play") !== "1") return;

  const categoryFromUrl = params.get("category");
  const timeFromUrl = params.get("time");

  // aplica categoria
  if (categoryFromUrl) {
    categorySelect.value = categoryFromUrl;
  }

  // aplica tempo
  if (timeFromUrl) {
    timeSelect.value = timeFromUrl;
    selectedDurationSec = Number(timeFromUrl);
  }

  // define categoria atual
  const catId = categorySelect.value;
  if (!catId) return;

  currentCategory = data.categories.find(c => c.id === catId);

  startGame();
}