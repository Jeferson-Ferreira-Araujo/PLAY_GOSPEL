import { shuffleArray, createCountdownTimer } from "../../assets/js/utils.js";

/* ===== Elements (setup) ===== */
const setupScreen = document.getElementById("setupScreen");
const gameScreen = document.getElementById("gameScreen");

const btnFullscreen = document.getElementById("btnFullscreen");
const startBtn = document.getElementById("startBtn");
const difficultySelect = document.getElementById("difficultySelect");
const timeSelect = document.getElementById("timeSelect");

/* ===== Elements (presenter) ===== */
const badgeDifficulty = document.getElementById("badgeDifficulty");
const badgeProgress = document.getElementById("badgeProgress");
const badgeScore = document.getElementById("badgeScore");

const statementText = document.getElementById("statementText");

const resultWrap = document.getElementById("resultWrap");
const resultPill = document.getElementById("resultPill");
const noteText = document.getElementById("noteText");
const referenceText = document.getElementById("referenceText");

const timerText = document.getElementById("timerText");
const timerBar = document.getElementById("timerBar");

const trueBtn = document.getElementById("trueBtn");
const falseBtn = document.getElementById("falseBtn");
const revealBtn = document.getElementById("revealBtn");
const nextBtn = document.getElementById("nextBtn");
const restartTimerBtn = document.getElementById("restartTimerBtn");
const exitBtn = document.getElementById("exitBtn");

const playAgainBtn = document.getElementById("playAgainBtn");
const gameOverNotice = document.getElementById("gameOverNotice");

/* ===== State ===== */
let data = null;

let currentDifficulty = "hard";
let durationSec = 20;

let pool = [];
let idx = 0;

let current = null; // { statement, answer(boolean), reference, note? }
let answered = false;

let score = 0;

let timer = null;
let gameOver = false;

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  wireUI();
  checkAutoStartFromURL(); // ✅ novo fluxo
});

async function loadData() {
  const res = await fetch("data.json", { cache: "no-store" });
  data = await res.json();
}

/* =========================
   AUTO START VIA URL
   ?play=1&difficulty=hard&time=20
========================= */
function checkAutoStartFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("play") !== "1") return;

  const diff = params.get("difficulty");
  const t = params.get("time");

  if (difficultySelect && diff) difficultySelect.value = diff;
  if (timeSelect && t != null) timeSelect.value = String(t);

  currentDifficulty = difficultySelect?.value || currentDifficulty;
  durationSec = Number(timeSelect?.value || durationSec);

  startGame();
}

/* ===== UI wiring ===== */
function wireUI() {
  btnFullscreen?.addEventListener("click", toggleFullscreen);

  startBtn?.addEventListener("click", () => {
    currentDifficulty = difficultySelect.value;
    durationSec = Number(timeSelect.value || 0);
    startGame();
  });

  trueBtn.addEventListener("click", () => choose(true));
  falseBtn.addEventListener("click", () => choose(false));

  revealBtn.addEventListener("click", () => {
    if (!current) return;
    showExplanation(); // modo ensino
  });

  nextBtn.addEventListener("click", () => {
    if (gameOver) return;
    nextStatement();
  });

  restartTimerBtn.addEventListener("click", () => {
    if (gameOver) return;
    resetAndStartTimer();
  });

  playAgainBtn.addEventListener("click", () => restartGame());

  // ✅ sair volta pro catálogo principal
  exitBtn.addEventListener("click", () => {
    window.location.href = "../../index.html#catalogo";
  });

  // atalhos
  document.addEventListener("keydown", (e) => {
    if (gameScreen.classList.contains("d-none")) return;

    const k = e.key.toLowerCase();

    // cuidado: F é falso e também fullscreen.
    // Aqui: Ctrl+F fica de boa (busca do browser), F sozinho = FALSO.
    if (k === "v") trueBtn.click();
    if (k === "f" && !e.ctrlKey) falseBtn.click();
    if (k === "n" || k === " ") nextBtn.click();
    if (k === "r") revealBtn.click();

    // fullscreen com tecla separada: "g" (game) pra evitar conflito
    if (k === "g") toggleFullscreen();
  });
}

/* ===== Game flow ===== */
function startGame() {
  setupScreen.classList.add("d-none");
  gameScreen.classList.remove("d-none");
  restartGame();
}

function restartGame() {
  gameOver = false;
  setGameOverUI(false);

  currentDifficulty = difficultySelect.value;
  durationSec = Number(timeSelect.value || 0);

  badgeDifficulty.textContent = difficultyLabel(currentDifficulty);

  const list = (data?.[currentDifficulty] ?? []).filter(Boolean);
  pool = shuffleArray(list);
  idx = 0;
  score = 0;
  updateScore();

  if (!pool.length) {
    endGame("SEM PERGUNTAS");
    return;
  }

  loadAtIndex(idx);
  updateProgress();
  resetAndStartTimer();
}

function nextStatement() {
  stopTimer();

  idx += 1;
  if (idx >= pool.length) {
    endGame("FIM DE JOGO");
    return;
  }

  loadAtIndex(idx);
  updateProgress();
  resetAndStartTimer();
}

function loadAtIndex(i) {
  current = pool[i];
  answered = false;

  statementText.textContent = current.statement ?? "—";

  // esconder resultado/explicação
  resultWrap.classList.add("d-none");
  resultPill.textContent = "—";
  noteText.textContent = "—";
  referenceText.textContent = "—";

  setAnswerButtonsEnabled(true);
  revealBtn.textContent = "Mostrar explicação";
}

/* ===== Choose ===== */
function choose(choice) {
  if (!current || answered || gameOver) return;

  answered = true;
  stopTimer();

  const correct = choice === Boolean(current.answer);

  if (correct) {
    score += 1;
    updateScore();
  }

  showResult(correct, choice);
  showExplanation();

  setAnswerButtonsEnabled(false);
}

function showResult(correct, choice) {
  resultWrap.classList.remove("d-none");

  const expected = current.answer ? "VERDADEIRO" : "FALSO";
  const chosen = choice ? "VERDADEIRO" : "FALSO";

  if (correct) {
    resultPill.textContent = `✅ Acertou! (${chosen})`;
    resultPill.style.borderColor = "rgba(25,135,84,.55)";
  } else {
    resultPill.textContent = `❌ Errou! Você marcou ${chosen}. Resposta: ${expected}.`;
    resultPill.style.borderColor = "rgba(220,53,69,.55)";
  }
}

function showExplanation() {
  if (!current) return;

  resultWrap.classList.remove("d-none");

  const expected = current.answer ? "VERDADEIRO" : "FALSO";

  let note = current.note;
  if (!note) {
    note = current.answer
      ? "A afirmação está de acordo com o texto."
      : "A afirmação é falsa; confira a referência para entender o detalhe/pegadinha.";
  }

  noteText.textContent = `${expected}: ${note}`;
  referenceText.textContent = current.reference ? `📖 ${current.reference}` : "—";

  revealBtn.textContent = "Explicação exibida";
}

/* ===== Progress / Score ===== */
function updateProgress() {
  const total = pool.length || 0;
  const done = Math.min(idx + 1, total);
  badgeProgress.textContent = total ? `${done}/${total}` : "0/0";
}

function updateScore() {
  badgeScore.textContent = `${score} acertos`;
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

      if (!answered && current && !gameOver) {
        answered = true;
        setAnswerButtonsEnabled(false);

        resultWrap.classList.remove("d-none");
        const expected = current.answer ? "VERDADEIRO" : "FALSO";
        resultPill.textContent = `⏰ Tempo! Resposta: ${expected}.`;
        resultPill.style.borderColor = "rgba(255,193,7,.55)";
        showExplanation();
      }
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

/* ===== UI helpers ===== */
function setAnswerButtonsEnabled(enabled) {
  trueBtn.disabled = !enabled;
  falseBtn.disabled = !enabled;
}

function setGameOverUI(isOver) {
  nextBtn.disabled = isOver;
  restartTimerBtn.disabled = isOver;
  trueBtn.disabled = isOver;
  falseBtn.disabled = isOver;
  revealBtn.disabled = isOver;

  playAgainBtn.classList.toggle("d-none", !isOver);
  gameOverNotice.classList.toggle("d-none", !isOver);
}

function endGame(text) {
  stopTimer();
  gameOver = true;
  setGameOverUI(true);

  statementText.textContent = text;

  resultWrap.classList.remove("d-none");
  resultPill.textContent = `✅ Você fez ${score} acertos de ${pool.length}.`;
  resultPill.style.borderColor = "rgba(25,135,84,.55)";

  noteText.textContent = "Clique em Jogar novamente para reembaralhar as perguntas.";
  referenceText.textContent = "—";

  badgeProgress.textContent = `${pool.length}/${pool.length}`;
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

/* ===== Helpers ===== */
function difficultyLabel(v) {
  if (v === "easy") return "Fácil";
  if (v === "medium") return "Médio";
  return "Difícil";
}