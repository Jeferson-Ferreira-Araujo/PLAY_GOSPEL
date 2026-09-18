import { Teams } from '../../assets/js/teams.js';
import { shuffleArray, createCountdownTimer } from '../../assets/js/utils.js';
import { renderRanking, confirmDialog, icon } from '../../playgospel-ui/js/playgospel-ui.js';
import { showScorePopup, buildExitFooter, buildPlayAgainFooter } from '../../assets/js/score-popup.js';
import { maybeShowDrawIntro } from '../../assets/js/game-intro.js';
import { showTeamsBlockFocus } from '../../assets/js/game-focus-tour.js';
import { buildMemberQueues, advanceMemberForTeam } from '../../assets/js/turn-fairness.js';
import { playCountdownTick, playCountdownGo } from '../../assets/js/countdown-sound.js';
import { mountSoundMuteButton } from '../../assets/js/sound-mute-ui.js';
import { mountFullscreenButton } from '../../assets/js/fullscreen-ui.js';

/* Alfabeto do jogo: todas as letras menos as difíceis (H, K, Q, W, X, Y, Z). */
const LETTERS_ALL = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'R', 'S', 'T', 'U', 'V'];

// Máximo de rodadas (letras) por partida (evita jogar o alfabeto inteiro de
// uma vez).
const ROUND_SIZE = 10;

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
const turnBannerIcon = document.getElementById('turnBannerIcon');
const turnBannerTeam = document.getElementById('turnBannerTeam');
const turnBannerPlayer = document.getElementById('turnBannerPlayer');
const badgeCategory = document.getElementById('badgeCategory');
const badgeProgress = document.getElementById('badgeProgress');

const playPanel = document.getElementById('playPanel');
const letterDisplay = document.getElementById('letterDisplay');
const readyBtn = document.getElementById('readyBtn');
const timerRow = document.getElementById('answerTimer');
const timerTime = document.getElementById('timerTime');
const timerBar = document.getElementById('timerBar');

const correctBtn = document.getElementById('correctBtn');
const wrongBtn = document.getElementById('wrongBtn');
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
let memberQueues = {}; // fila embaralhada de integrantes por equipe (ver assets/js/turn-fairness.js)
let countdownInterval = null;

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
  if (turnBannerIcon) turnBannerIcon.innerHTML = icon(t.icon || 'star', { size: 18 });
  turnBannerTeam.textContent = t.name;
  turnBanner.style.setProperty('--team-color', t.color || '#F4C430');

  const player = Teams.currentPlayer();
  if (turnBannerPlayer) {
    turnBannerPlayer.textContent = player ? `— ${player}` : '';
    turnBannerPlayer.classList.toggle('d-none', !player);
  }

  updateStickyOffsets();
}

/* ===== Letras ===== */
function initLetterPool() {
  letterPool = shuffleArray(LETTERS_ALL).slice(0, ROUND_SIZE);
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
  letterDisplay.classList.remove('ab-letter-display--countdown');
  letterDisplay.textContent = currentLetter;
}

/* ===== Espera a confirmação de "Começar" antes de cada letra — como as
   equipes/pessoas revezam, sempre precisa desse momento pra "chamar"
   quem vai jogar antes da contagem aparecer (mesmo padrão de
   games/palavras-misturadas/game.js e games/adivinhe-emoji/game.js). */
function showReadyState() {
  clearCountdown();
  answerTimerCtl?.stop();
  timerRow?.classList.add('d-none');

  letterDisplay.classList.add('d-none');
  readyBtn.classList.remove('d-none');

  renderTurnBanner();
}

/* ===== Contagem "3, 2, 1" antes de cada letra — dá tempo da equipe (e
   pessoa, se sorteada) se preparar antes do cronômetro de resposta
   começar. */
function startCountdown() {
  clearCountdown();
  readyBtn.classList.add('d-none');
  letterDisplay.classList.remove('d-none');
  letterDisplay.classList.add('ab-letter-display--countdown');

  let n = 3;
  letterDisplay.textContent = String(n);
  playCountdownTick();

  countdownInterval = setInterval(() => {
    n -= 1;
    if (n > 0) {
      letterDisplay.textContent = String(n);
      playCountdownTick();
      return;
    }
    clearCountdown();
    playCountdownGo();
    showLetter();
    timerRow?.classList.remove('d-none');
    startTimerForTurn();
  }, 1000);
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

function updateBadgeProgress() {
  const total = usedLetters.length + letterPool.length;
  badgeProgress.textContent = `${usedLetters.length}/${total}`;
}

/* ===== Cronômetro por resposta =====
   Tempo esgotado sem resposta conta como "Passou" (sem botão de errar).
   Mesmo estilo/API dos jogos mais recentes (Palavras Embaralhadas, Emojis):
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
  memberQueues = buildMemberQueues();
  advanceMemberForTeam(memberQueues, Teams.getState().turn);
  attemptedThisLetter.add(Teams.currentTeam()?.id);

  updateBadgeProgress();
  showReadyState();
}

/** Some a tela de setup e começa a jogar — usado tanto pelo clique em
 * "Iniciar jogo" quanto pelo início automático via URL (?play=1). */
function startGame() {
  setupScreen.classList.add('d-none');
  gameScreen.classList.remove('d-none');
  scoreBtn.classList.remove('d-none');
  showTeamsBlockFocus();
  updateStickyOffsets();

  badgeCategory.textContent = CATEGORY_LABELS[selectedCategory];
  Teams.setTurn(0);
  roundActive = true;
  startRoundState();
}

/* =========================
   AUTO START — a tela de configuração ficou só no modal do catálogo
   (que já barra "Jogar" sem equipes ativas — ver assets/js/app.js).
   Se mesmo assim alguém cair aqui sem equipes (link direto, por
   exemplo), volta pro catálogo em vez de mostrar uma tela quebrada.
========================= */
async function checkAutoStartFromURL() {
  if (!Teams.isEnabled()) {
    window.location.href = '../../index.html#catalogo';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const cat = params.get('category');
  const time = params.get('time');
  if (cat) selectCategory(cat);
  if (time) selectTime(Number(time));

  await maybeShowDrawIntro();
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
  advanceMemberForTeam(memberQueues, Teams.getState().turn);
  attemptedThisLetter.add(Teams.currentTeam()?.id);

  updateBadgeProgress();
  showReadyState();
  processing = false;
}

/** Passa a vez ou registra erro com a mesma letra — só sorteia letra nova
 * quando o turno voltaria a cair numa equipe que já tentou essa letra sem
 * acertar. Compartilhado por "Passou" (não tentou) e "Errou" (tentou e
 * falou palavra errada). */
function advanceTurnSameLetter() {
  Teams.nextTurn();
  advanceMemberForTeam(memberQueues, Teams.getState().turn);
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
  showReadyState();
  processing = false;
}

function onPass() {
  if (!roundActive || processing) return;
  processing = true;
  advanceTurnSameLetter();
}

/** Time atual falou uma palavra errada: desconta o ponto que estava em
 * jogo e passa a vez (mesma letra), igual ao "Passou". */
function onWrong() {
  if (!roundActive || processing) return;
  processing = true;

  Teams.addPoint(-1);
  advanceTurnSameLetter();
}

/** Fim natural da rodada (letras esgotadas): popup em destaque com o
 * placar final, "bem bonito" em vez do card discreto de antes. */
function endRoundNatural() {
  roundActive = false;
  answerTimerCtl.stop();
  clearCountdown();

  correctBtn.classList.add('d-none');
  wrongBtn.classList.add('d-none');
  passBtn.classList.add('d-none');
  readyBtn.classList.add('d-none');

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
  wrongBtn.classList.remove('d-none');
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
  wrongBtn.addEventListener('click', onWrong);
  passBtn.addEventListener('click', onPass);
  readyBtn.addEventListener('click', startCountdown);

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
  // Clicar na logo sempre volta direto pro catálogo, sem confirmação —
  // só o botão "Sair" explícito pergunta antes (ver exitBtn acima).

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
  mountFullscreenButton(document.querySelector('.pgui-header__actions'));
  mountSoundMuteButton(document.querySelector('.pgui-header__actions'));
  checkAutoStartFromURL();
});
