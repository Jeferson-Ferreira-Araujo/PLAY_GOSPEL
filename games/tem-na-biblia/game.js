import { Teams } from '../../assets/js/teams.js';
import { shuffleArray, createCountdownTimer } from '../../assets/js/utils.js';
import { renderRanking, confirmDialog } from '../../playgospel-ui/js/playgospel-ui.js';
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from '../../assets/js/score-popup.js';

/* Alfabeto do jogo: todas as letras menos as difíceis (H, K, Q, W, X, Y, Z). */
const LETTERS_ALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V'];

const CATEGORY_LABELS = {
  biblia: 'Tem na Bíblia com...',
  nomes: 'Nomes',
  louvor: 'Louvor',
};

/* ===== Elements ===== */
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');

const categoryRow = document.getElementById('categoryRow');
const timeRow = document.getElementById('timeRow');
const lettersPreview = document.getElementById('lettersPreview');

const teamsReadyBox = document.getElementById('teamsReadyBox');
const teamsReadyRanking = document.getElementById('teamsReadyRanking');
const teamsSetupBox = document.getElementById('teamsSetupBox');
const btnResetScores = document.getElementById('btnResetScores');
const startBtn = document.getElementById('startBtn');

const turnBanner = document.getElementById('turnBanner');
const turnBannerTeam = document.getElementById('turnBannerTeam');
const badgeCategory = document.getElementById('badgeCategory');
const badgeProgress = document.getElementById('badgeProgress');

const playPanel = document.getElementById('playPanel');
const letterDisplay = document.getElementById('letterDisplay');
const timerTime = document.getElementById('timerTime');
const timerBar = document.getElementById('timerBar');

const correctBtn = document.getElementById('correctBtn');
const passBtn = document.getElementById('passBtn');
const restartBtn = document.getElementById('restartBtn');
const endBtn = document.getElementById('endBtn');
const scoreBtn = document.getElementById('scoreBtn');
const exitBtn = document.getElementById('exitBtn');
const brandLink = document.getElementById('brandLink');

/* ===== Estado ===== */
let selectedCategory = 'biblia';
let selectedTime = 10;

let letterPool = [];
let usedLetters = [];
let currentLetter = null;
let attemptedThisLetter = new Set();
let roundActive = false;
let processing = false;

let answerTimerCtl = null;

/* ===== Categoria / tempo (tela de setup) ===== */
function selectCategory(cat) {
  if (!CATEGORY_LABELS[cat]) return;
  selectedCategory = cat;
  categoryRow.querySelectorAll('.ab-choice-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.category === cat);
  });
}

function selectTime(t) {
  selectedTime = t;
  timeRow.querySelectorAll('.ab-choice-btn').forEach((b) => {
    b.classList.toggle('is-active', Number(b.dataset.time) === t);
  });
}

function renderLettersPreview() {
  lettersPreview.innerHTML = LETTERS_ALL.map((l) => `<span>${l}</span>`).join('');
}

/* ===== Equipes =====
   Este jogo só faz sentido com pelo menos 2 equipes (turnos + pontuação).
   A criação de equipes é sempre feita pelo catálogo — aqui só refletimos o estado. */
function renderTeamsPanel() {
  const enabled = Teams.isEnabled();
  teamsReadyBox.classList.toggle('d-none', !enabled);
  teamsSetupBox.classList.toggle('d-none', enabled);
  startBtn.disabled = !enabled;
  renderTeamsRanking();
}

function renderTeamsRanking() {
  if (!Teams.isEnabled()) return;
  const state = Teams.getState();
  const current = Teams.currentTeam();
  renderRanking(teamsReadyRanking, state.teams, current?.id);
}

function renderTurnBanner() {
  const t = Teams.currentTeam();
  turnBanner.classList.toggle('d-none', !t);
  if (!t) return;
  turnBannerTeam.textContent = t.name;
  turnBanner.style.setProperty('--team-color', t.color || '#F4C430');
  updateStickyOffsets();
}

/* ===== Letras ===== */
function initLetterPool() {
  letterPool = shuffleArray(LETTERS_ALL);
  usedLetters = [];
}

/** Sorteia a próxima letra do pool; null quando acabou (fim da rodada). */
function drawNextLetter() {
  if (!letterPool.length) return null;
  currentLetter = letterPool.pop();
  usedLetters.push(currentLetter);
  attemptedThisLetter = new Set();
  return currentLetter;
}

function showLetter() {
  letterDisplay.textContent = currentLetter;
}

function updateBadgeProgress() {
  badgeProgress.textContent = `Letra ${usedLetters.length}/${LETTERS_ALL.length}`;
}

/* ===== Cronômetro por resposta =====
   Tempo esgotado sem resposta conta como "Passou" (sem botão de errar).
   Mesmo estilo/API dos jogos mais recentes (Palavras Misturadas, Emojis):
   texto + barra linear via createCountdownTimer, em vez do anel circular. */
function initTimer() {
  answerTimerCtl = createCountdownTimer({
    durationSec: selectedTime,
    onTick: ({ remainingSec, progress01 }) => {
      timerTime.textContent = `${remainingSec}s`;
      timerBar.style.width = `${Math.round(progress01 * 100)}%`;
    },
    onEnd: () => {
      if (!roundActive) return;
      onPass();
    },
  });
}

function startTimerForTurn() {
  answerTimerCtl.reset(selectedTime);
  answerTimerCtl.start();
}

/* ===== Fluxo da rodada ===== */
function startRoundState() {
  initLetterPool();
  drawNextLetter();
  attemptedThisLetter.add(Teams.currentTeam()?.id);

  updateBadgeProgress();
  showLetter();
  renderTurnBanner();
  startTimerForTurn();
}

/** Some a tela de setup e começa a jogar — usado tanto pelo clique em
 * "Iniciar jogo" quanto pelo início automático via URL (?play=1). */
function startGame() {
  setupScreen.classList.add('d-none');
  gameScreen.classList.remove('d-none');
  scoreBtn.classList.remove('d-none');
  updateStickyOffsets();

  badgeCategory.textContent = CATEGORY_LABELS[selectedCategory];
  Teams.setTurn(0);
  roundActive = true;
  startRoundState();
}

/* =========================
   AUTO START VIA URL
   ?play=1&category=...&time=... — mesmo contrato usado pelos outros jogos
   (assets/js/app.js, buildGameUrl). Só funciona se equipes já estiverem
   prontas; caso contrário a tela de setup fica como estava.
========================= */
function checkAutoStartFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('play') !== '1') return;

  const cat = params.get('category');
  const time = params.get('time');
  if (cat) selectCategory(cat);
  if (time) selectTime(Number(time));

  if (startBtn.disabled) return;
  startGame();
}

function onCorrect() {
  if (!roundActive || processing) return;
  processing = true;

  Teams.addPoint(1);
  const next = drawNextLetter();
  if (next === null) {
    processing = false;
    endRoundNatural();
    return;
  }

  Teams.nextTurn();
  attemptedThisLetter.add(Teams.currentTeam()?.id);

  updateBadgeProgress();
  showLetter();
  renderTurnBanner();
  startTimerForTurn();
  processing = false;
}

/** Passa a vez com a mesma letra — só sorteia letra nova quando o turno
 * voltaria a cair numa equipe que já tentou essa letra sem acertar. */
function onPass() {
  if (!roundActive || processing) return;
  processing = true;

  Teams.nextTurn();
  const newTeamId = Teams.currentTeam()?.id;

  if (attemptedThisLetter.has(newTeamId)) {
    const next = drawNextLetter();
    if (next === null) {
      processing = false;
      endRoundNatural();
      return;
    }
  }
  attemptedThisLetter.add(newTeamId);

  updateBadgeProgress();
  showLetter();
  renderTurnBanner();
  startTimerForTurn();
  processing = false;
}

/** Fim natural da rodada (letras esgotadas): popup em destaque com o
 * placar final, "bem bonito" em vez do card discreto de antes. */
function endRoundNatural() {
  roundActive = false;
  answerTimerCtl.stop();

  correctBtn.classList.add('d-none');
  passBtn.classList.add('d-none');

  showScorePopup({
    title: '🏁 Fim de rodada!',
    footer: buildPlayAgainFooter(resetRoundState),
  });
}

/** Reinicia a rodada (letras + vez do zero) sem tocar no placar — usada
 * tanto pelo botão "Reiniciar" (durante o jogo) quanto por "Jogar novamente"
 * (no popup de fim de rodada). */
function resetRoundState() {
  correctBtn.classList.remove('d-none');
  passBtn.classList.remove('d-none');

  Teams.setTurn(0);
  roundActive = true;
  startRoundState();
}

async function exitToCatalog() {
  const goToCatalog = () => { window.location.href = '../../index.html#catalogo'; };

  const shown = showScorePopup({
    title: '👋 Sair do jogo?',
    footer: buildExitFooter(goToCatalog),
  });
  if (shown) return;

  // Sem equipes ativas não há placar pra mostrar — cai no confirm de sempre.
  const confirmed = await confirmDialog({
    title: '👋 Sair do jogo?',
    message: 'Tem certeza que quer sair?',
    confirmLabel: 'Sair',
    cancelLabel: 'Cancelar',
  });
  if (confirmed) goToCatalog();
}

/* ===== UI wiring ===== */
function wireUI() {
  btnResetScores.addEventListener('click', () => Teams.resetScores());
  startBtn.addEventListener('click', startGame);

  categoryRow.querySelectorAll('.ab-choice-btn').forEach((b) => {
    b.addEventListener('click', () => selectCategory(b.dataset.category));
  });
  timeRow.querySelectorAll('.ab-choice-btn').forEach((b) => {
    b.addEventListener('click', () => selectTime(Number(b.dataset.time)));
  });

  correctBtn.addEventListener('click', onCorrect);
  passBtn.addEventListener('click', onPass);

  restartBtn.addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: '🔁 Reiniciar rodada?',
      message: 'As letras são sorteadas de novo e a vez volta pra primeira equipe. O placar continua igual.',
      confirmLabel: 'Reiniciar',
      cancelLabel: 'Cancelar',
    });
    if (confirmed) resetRoundState();
  });

  scoreBtn.addEventListener('click', () => showScorePopup());

  endBtn.addEventListener('click', exitToCatalog);
  exitBtn.addEventListener('click', exitToCatalog);
  brandLink.addEventListener('click', (e) => {
    // Só confirma se o jogo já estiver em andamento — na tela de
    // configuração não há nada a perder, deixa navegar direto.
    if (gameScreen.classList.contains('d-none')) return;
    e.preventDefault();
    exitToCatalog();
  });

  window.addEventListener('bibflix:teams:change', renderTurnBanner);
  window.addEventListener('bibflix:teams:change', renderTeamsPanel);
}

/* ===== Alturas do header/topo (para o "sticky stack") =====
   Mesma técnica de games/qual-e-a-musica/game.js: medimos de verdade em
   vez de usar um valor fixo em px, porque o texto "Vez de: X" muda de
   tamanho e o header quebra linha no mobile. */
function updateStickyOffsets() {
  const header = document.querySelector('.ab-topheader');
  const topbar = document.querySelector('.pgui-game-layout__topbar');
  if (!header || !topbar) return;

  const root = document.documentElement.style;
  root.setProperty('--ab-header-h', `${header.getBoundingClientRect().height}px`);
  root.setProperty('--ab-topbar-h', `${topbar.getBoundingClientRect().height}px`);
}

function watchStickyOffsets() {
  const header = document.querySelector('.ab-topheader');
  const topbar = document.querySelector('.pgui-game-layout__topbar');
  if (!header || !topbar) return;

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(updateStickyOffsets);
    observer.observe(header);
    observer.observe(topbar);
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(updateStickyOffsets, 150);
  });

  document.fonts?.ready?.then(updateStickyOffsets);
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', () => {
  renderLettersPreview();
  selectCategory('biblia');
  selectTime(10);
  renderTeamsPanel();
  wireUI();
  initTimer();
  watchStickyOffsets();
  checkAutoStartFromURL();
});
