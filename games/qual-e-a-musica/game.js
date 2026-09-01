import { Teams } from '../../assets/js/teams.js';
import { shuffleArray } from '../../assets/js/utils.js';
import { createInstrumentSynth, disposeInstrumentSynth } from '../../assets/js/music-theory.js';
import { createPreviewPlayer } from '../../assets/js/use-preview-player.js';
import { buildEmbedUrl } from '../../assets/js/youtube-embed.js';
import { renderPianoKeyboard } from '../../assets/js/piano-keyboard.js';
import { renderRanking, confirmDialog, showToast } from '../../playgospel-ui/js/playgospel-ui.js';
import { showScorePopup, buildExitFooter } from '../../assets/js/score-popup.js';

const MAX_PLAYS = 2;      // cliques em "Ouvir" por tentativa (equipe + notas atuais)
const MIN_DRAW_N = 1;     // sorteio inicial: entre 1 e 5 notas
const MAX_DRAW_N = 5;
const MAX_NOTES = 7;      // teto absoluto — "Passar" trava ao chegar aqui
const MAX_PASSES = 2;     // no máximo 2 "Passar" por música — a 3ª tentativa
                           // (independente de quantas equipes existam) precisa
                           // responder, pra não ficar indo e voltando à toa

// Dicas: por enquanto não são exibidas no jogo (só continuam disponíveis
// na ferramenta de criação/edição de músicas, no admin). A lógica de
// buscar/montar as dicas continua ativa aqui embaixo — só a exibição fica
// desligada; pra reativar no jogo, basta virar esta flag pra true.
const SHOW_HINTS_IN_GAME = false;

/* ===== Elements ===== */
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');

const teamsReadyBox = document.getElementById('teamsReadyBox');
const teamsReadyRanking = document.getElementById('teamsReadyRanking');
const teamsSetupBox = document.getElementById('teamsSetupBox');
const btnResetScores = document.getElementById('btnResetScores');
const startBtn = document.getElementById('startBtn');
const startBlockedMsg = document.getElementById('startBlockedMsg');

const turnBanner = document.getElementById('turnBanner');
const turnBannerTeam = document.getElementById('turnBannerTeam');
const badgeSong = document.getElementById('badgeSong');
const badgePoints = document.getElementById('badgePoints');
const badgePointsValue = document.getElementById('badgePointsValue');
const stageText = document.getElementById('stageText');

const hintsPanel = document.getElementById('hintsPanel');
const hintsPreviewList = document.getElementById('hintsPreviewList');
const btnDrawNotes = document.getElementById('btnDrawNotes');
const drawHeading = document.getElementById('drawHeading');
const drawIdleCaption = document.getElementById('drawIdleCaption');
const drawSpinCaption = document.getElementById('drawSpinCaption');
const drawResult = document.getElementById('drawResult');
const drawResultNumber = document.getElementById('drawResultNumber');

const drawReel = document.getElementById('drawReel');
const drawReelViewport = document.getElementById('drawReelViewport');
const drawReelTrack = document.getElementById('drawReelTrack');

const pianoKeyboard = document.getElementById('pianoKeyboard');

const miniPlayer = document.getElementById('miniPlayer');
const miniPlayerLabel = document.getElementById('miniPlayerLabel');
const miniPlayerTrack = document.getElementById('miniPlayerTrack');

const replayBtn = document.getElementById('replayBtn');
const replayLabel = document.getElementById('replayLabel');
const replaySubLabel = document.getElementById('replaySubLabel');
const correctBtn = document.getElementById('correctBtn');
const wrongBtn = document.getElementById('wrongBtn');
const passBtn = document.getElementById('passBtn');
const nextSongBtn = document.getElementById('nextSongBtn');
const scoreBtn = document.getElementById('scoreBtn');
const exitBtn = document.getElementById('exitBtn');
const brandLink = document.getElementById('brandLink');

const revealPanel = document.getElementById('revealPanel');
const revealOutcome = document.getElementById('revealOutcome');
const revealTitle = document.getElementById('revealTitle');
const revealArtist = document.getElementById('revealArtist');
const revealHints = document.getElementById('revealHints');
const btnPlayOriginal = document.getElementById('btnPlayOriginal');
const originalEmbed = document.getElementById('originalEmbed');

/* ===== Dados ===== */
let allSongs = [];
let songQueue = [];
let lastSongId = null;
let roundNumber = 0;

/* ===== Sorteio de quem começa cada música =====
   Fila embaralhada de índices de equipe: garante que ninguém começa duas
   músicas seguidas enquanto ainda sobrar equipe que não começou nenhuma
   (evita sempre cair na primeira equipe criada). */
let startTeamQueue = [];
let startTeamQueueSize = 0;

function nextStartingTeamIndex() {
  const n = Teams.getState().teams.length;
  if (!n) return 0;

  if (startTeamQueueSize !== n || startTeamQueue.length === 0) {
    startTeamQueue = shuffleArray(Array.from({ length: n }, (_, i) => i));
    startTeamQueueSize = n;
  }

  return startTeamQueue.shift();
}

/* ===== Estado da rodada (uma música) =====
   roundN: notas da tentativa atual (sorteada, depois +1 a cada "Passar").
   attemptValue: pontos em jogo nesta tentativa (1, depois +1 a cada "Passar"). */
let roundSong = null;
let roundN = 0;
let attemptValue = 1;
let playsRemaining = 0;
let resolving = false;
let awaitingClipEnd = false;

/* ===== Áudio ===== */
let audioStarted = false;
async function ensureAudioStarted() {
  if (audioStarted) return;
  await window.Tone.start();
  audioStarted = true;
}

let activeSynth = null;
let activeInstrument = null;
async function ensureSynthFor(song) {
  if (activeInstrument === song.instrument && activeSynth) return;
  disposeInstrumentSynth(activeSynth);
  activeSynth = await createInstrumentSynth(song.instrument);
  activeInstrument = song.instrument;
}

const previewPlayer = createPreviewPlayer(() => activeSynth);
previewPlayer.subscribe((isPlaying) => {
  if (!isPlaying && awaitingClipEnd) {
    awaitingClipEnd = false;
    onClipFinished();
  }
});

/* ===== Mini player (feedback visual da execução) =====
   Usa exatamente os mesmos start/duration das notas que o previewPlayer
   está tocando, então o preenchimento de cada barra acompanha o som em
   tempo real — inclusive em notas longas, que sem isso pareceriam travadas.
   O teclado visual (pianoHandle) segue os MESMOS timers — mostra qual tecla
   está soando, vista de cima, sem simular mão nenhuma (ver piano-keyboard.js).
   Diferente do mini player (que é só feedback de "tocando agora" e some
   assim que a nota acaba), o teclado FICA na tela depois de tocar — a
   equipe pode olhar pra ele enquanto pensa na resposta e clica nos botões
   (Acertou/Errou/Passar/Ouvir novamente). Só some quando a RODADA muda
   (hideActionButtons, no início de startRound) — nunca pode ficar visível
   junto com o peão (idle ou girando) de uma música diferente. */
let miniPlayerTimers = [];
let pianoHandle = null;
let pianoRangeSong = null; // evita reconstruir o teclado a cada "Ouvir" — só muda quando a música muda

function clearMiniPlayerTimers() {
  miniPlayerTimers.forEach(clearTimeout);
  miniPlayerTimers = [];
}

function stopMiniPlayer() {
  clearMiniPlayerTimers();
  miniPlayer.classList.add('d-none');
  pianoHandle?.releaseAll(); // solta qualquer tecla que ainda estivesse "presa" — mas o teclado em si continua visível
}

/** Mostra o teclado (sem nenhuma tecla acesa ainda) assim que o sorteio
 * termina — já dá uma pista visual de "é aqui que vai acontecer" antes
 * mesmo da equipe clicar em Ouvir. O RANGE (quantas oitavas aparecem) usa a
 * música inteira, não só o trecho tocado agora — assim ele não fica
 * mudando de tamanho a cada "Passar"/nova tentativa dentro da mesma rodada. */
function showPianoForRound() {
  if (pianoRangeSong !== roundSong) {
    pianoHandle = renderPianoKeyboard(pianoKeyboard, roundSong.notes);
    pianoRangeSong = roundSong;
  }
  pianoKeyboard.classList.remove('d-none');
}

function startMiniPlayer(notes) {
  clearMiniPlayerTimers();
  showPianoForRound();

  miniPlayerTrack.innerHTML = notes.map((n, i) => `
    <div class="qam-mini-note" data-i="${i}" style="flex-grow:${Math.max(n.duration, 0.15)}">
      <div class="qam-mini-note-fill"></div>
    </div>
  `).join('');
  miniPlayerLabel.textContent = notes.length > 1 ? `🎵 Tocando nota 1 de ${notes.length}...` : '🎵 Tocando...';
  miniPlayer.classList.remove('d-none');

  const segments = Array.from(miniPlayerTrack.querySelectorAll('.qam-mini-note'));

  notes.forEach((note, i) => {
    const startTimer = setTimeout(() => {
      const seg = segments[i];
      const fill = seg.querySelector('.qam-mini-note-fill');
      seg.classList.add('is-active');
      fill.style.transitionDuration = `${Math.max(note.duration, 0.05)}s`;
      requestAnimationFrame(() => { fill.style.width = '100%'; });
      miniPlayerLabel.textContent = notes.length > 1
        ? `🎵 Tocando nota ${i + 1} de ${notes.length}...`
        : '🎵 Tocando...';
      pianoHandle?.pressKey(note.note);
    }, note.start * 1000);

    const endTimer = setTimeout(() => {
      segments[i].classList.remove('is-active');
      segments[i].classList.add('is-done');
      pianoHandle?.releaseKey(note.note);
    }, (note.start + note.duration) * 1000);

    miniPlayerTimers.push(startTimer, endTimer);
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ===== Carregar músicas ===== */
async function loadSongs() {
  try {
    const res = await fetch('../../admin/data/songs.json', { cache: 'no-store' });
    const raw = await res.json();
    allSongs = (Array.isArray(raw) ? raw : []).filter(
      (s) => Array.isArray(s.notes) && s.notes.length > 0 && s.instrument
    );
  } catch (err) {
    console.error('Erro ao carregar músicas:', err);
    allSongs = [];
    showToast('Erro ao carregar músicas. Verifique se o admin já tem alguma cadastrada.', { type: 'danger' });
  }
  updateStartButton();
}

/* ===== Equipes =====
   Este jogo só faz sentido com pelo menos 2 equipes (a disputa "time da vez
   vs próximo"). A criação de equipes é sempre feita pelo catálogo (fluxo
   original, com nomes/cores personalizados) — aqui só refletimos o estado. */
function renderTeamsPanel() {
  const enabled = Teams.isEnabled();
  teamsReadyBox.classList.toggle('d-none', !enabled);
  teamsSetupBox.classList.toggle('d-none', enabled);
  updateStartButton();
  renderTeamsRanking();
}

/** Ranking: só a pré-visualização da tela de setup (componente completo do
 * PlayGospel UI) — durante o jogo, o placar fica disponível sob demanda
 * pelo botão "🏆 Placar" no cabeçalho, sem ocupar espaço fixo na tela. */
function renderTeamsRanking() {
  if (!Teams.isEnabled()) return;
  const state = Teams.getState();
  const current = Teams.currentTeam();
  renderRanking(teamsReadyRanking, state.teams, current?.id);
}

function updateStartButton() {
  const teamsOk = Teams.isEnabled();
  const songsOk = allSongs.length > 0;
  startBtn.disabled = !(teamsOk && songsOk);

  if (!teamsOk) startBlockedMsg.textContent = '';
  else if (!songsOk) startBlockedMsg.textContent = 'Nenhuma música cadastrada ainda — grave músicas no painel admin.';
  else startBlockedMsg.textContent = '';
}

function renderTurnBanner() {
  const t = Teams.currentTeam();
  turnBanner.classList.toggle('d-none', !t);
  if (!t) return;
  turnBannerTeam.textContent = t.name;
  turnBanner.style.setProperty('--team-color', t.color || '#F4C430');
  updateStickyOffsets();
}

/* ===== Fila de músicas (sorteio aleatório) ===== */
function nextSongFromQueue() {
  if (songQueue.length === 0) {
    let reshuffled = shuffleArray(allSongs);
    if (reshuffled.length > 1 && reshuffled[0].id === lastSongId) {
      [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
    }
    songQueue = reshuffled;
  }
  const song = songQueue.shift();
  lastSongId = song.id;
  return song;
}

/** Some a tela de setup e começa a jogar — usado tanto pelo clique em
 * "Iniciar jogo" quanto pelo início automático via URL (?play=1). */
function startGame() {
  setupScreen.classList.add('d-none');
  gameScreen.classList.remove('d-none');
  scoreBtn.classList.remove('d-none');
  updateStickyOffsets();
  startRound();
}

/* =========================
   AUTO START VIA URL
   ?play=1 — mesmo contrato usado pelos outros jogos (assets/js/app.js,
   buildGameUrl). Só funciona se equipes e músicas já estiverem prontas;
   caso contrário a tela de setup fica como estava (ela já explica o que
   falta), sem inventar uma segunda tela de instruções.
========================= */
function checkAutoStartFromURL() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('play') !== '1') return;
  if (startBtn.disabled) return;
  startGame();
}

/* ===== Fluxo da rodada (uma música) ===== */
function startRound() {
  previewPlayer.stop();
  stopMiniPlayer();
  resolving = false;
  awaitingClipEnd = false;

  roundN = 0;
  attemptValue = 1;
  playsRemaining = 0;
  roundNumber += 1;

  roundSong = nextSongFromQueue();

  // Sorteio automático de quem começa esta música — nunca repete uma
  // equipe antes de todas terem começado uma vez.
  if (Teams.isEnabled()) {
    Teams.setTurn(nextStartingTeamIndex());
  }

  badgeSong.textContent = String(roundNumber);
  badgePointsValue.textContent = 'Pronto para sortear';

  revealPanel.classList.add('d-none');
  originalEmbed.innerHTML = '';
  btnPlayOriginal.textContent = '▶ Ouvir música original';

  hideActionButtons();
  stageText.classList.add('d-none');

  renderTurnBanner();
  showHints();
}

/** Dicas ficam visíveis o resto da rodada inteira (sorteio, execução, repasse)
 * — quando SHOW_HINTS_IN_GAME estiver ligado. Continua montando o conteúdo
 * normalmente mesmo desligado, só não revela o painel. */
function showHints() {
  const hints = roundSong.hints || [];
  hintsPreviewList.innerHTML = hints.length
    ? `<ul>${hints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
    : '<p class="qam-hints-empty">Nenhuma dica cadastrada para esta música.</p>';
  if (SHOW_HINTS_IN_GAME) hintsPanel.classList.remove('d-none');

  drawHeading.textContent = 'Quantas notas?';
  drawHeading.classList.remove('d-none');
  drawIdleCaption.classList.remove('d-none');
  btnDrawNotes.classList.remove('d-none');
  showIdleReel();
}

/** Mostra o "peão" já parado (sem girar) antes do sorteio — só um sinal
 * visual do que vai acontecer ao clicar em Sortear, pra equipe já saber o
 * que esperar. Nenhum resultado é decidido aqui: ao clicar em Sortear, a
 * trilha é reconstruída do zero e o giro real acontece (startDrawNotes). */
let idleReelResizeObserver = null;

function showIdleReel() {
  drawReel.classList.remove('d-none');

  const applyIdlePosition = () => {
    // Enquanto parado, o peão pode ficar visível por um bom tempo (a
    // equipe demora pra clicar em Sortear) — se nesse meio tempo o
    // container mudar de largura (fonte carregando tarde, resize de
    // janela), recalcula pra não deixar o número levemente fora do centro.
    if (drawing || drawReel.classList.contains('d-none')) return;
    updateDrawReelSize();
    const { winnerTile } = buildReelTrack(3); // posição neutra, só de exemplo
    const viewportRect = drawReelViewport.getBoundingClientRect();
    const tileRect = winnerTile.getBoundingClientRect();
    const targetX = (viewportRect.left + viewportRect.width / 2) - (tileRect.left + tileRect.width / 2);
    if (typeof gsap !== 'undefined') gsap.set(drawReelTrack, { x: targetX });
    else drawReelTrack.style.transform = `translateX(${targetX}px)`;
  };

  // Mesmo cuidado de medição do startDrawNotes: só calcula depois que o
  // navegador aplicar o layout do reel recém-revelado.
  requestAnimationFrame(() => requestAnimationFrame(applyIdlePosition));

  if (typeof ResizeObserver !== 'undefined') {
    if (!idleReelResizeObserver) idleReelResizeObserver = new ResizeObserver(applyIdlePosition);
    idleReelResizeObserver.disconnect();
    idleReelResizeObserver.observe(drawReel);
  }
}

function hideActionButtons() {
  btnDrawNotes.classList.add('d-none');
  drawReel.classList.add('d-none');
  drawHeading.classList.add('d-none');
  drawIdleCaption.classList.add('d-none');
  drawSpinCaption.classList.add('d-none');
  drawResult.classList.add('d-none');
  badgePoints.classList.add('d-none');
  replayBtn.classList.add('d-none');
  correctBtn.classList.add('d-none');
  wrongBtn.classList.add('d-none');
  passBtn.classList.add('d-none');
  nextSongBtn.classList.add('d-none');

  // Teclado da música anterior não pode ficar visível junto com o peão
  // (idle ou girando) da música nova — some assim que a rodada nova
  // começa, não só quando o peão termina de girar.
  pianoHandle?.releaseAll();
  pianoKeyboard.classList.add('d-none');
  pianoRangeSong = null;
}

/* ===== Sorteio da quantidade de notas (1 a 5) — "peão" horizontal, GSAP =====
   Só acontece uma vez por música — depois disso, cada "Passar" soma +1
   nota automaticamente, sem precisar sortear de novo.
   O RESULTADO é sempre definido aqui, em JS (Math.random), ANTES de montar
   a trilha visual — o GSAP só anima até esse valor já decidido, nunca o
   contrário. A trilha em si é só o loop fixo 1,2,3,4,5,1,2,3,4,5... (nunca
   embaralhado) — dá voltas suficientes pra um giro satisfatório e termina
   exatamente no valor sorteado. */
const REEL_LAPS = 7; // voltas completas do 1..5 antes de "decidir" onde parar
let drawing = false;

function buildReelTrack(finalValue) {
  // Defesa extra: o peão só conhece os números 1 a 5 (loop fixo). Se algum
  // chamador passasse um valor fora disso, o "while" abaixo nunca bateria
  // e ficaria empurrando itens pro array pra sempre — trava o navegador.
  // Preferível cair num valor válido a travar o jogo inteiro.
  if (!Number.isInteger(finalValue) || finalValue < 1 || finalValue > 5) finalValue = 1;

  drawReelTrack.innerHTML = '';
  if (typeof gsap !== 'undefined') gsap.set(drawReelTrack, { x: 0 });
  else drawReelTrack.style.transform = 'translateX(0px)';

  const values = [];
  let v = 1;
  for (let i = 0; i < REEL_LAPS * 5; i++) {
    values.push(v);
    v = v === 5 ? 1 : v + 1;
  }
  // continua o mesmo ciclo até bater exatamente no valor sorteado.
  while (values[values.length - 1] !== finalValue) {
    values.push(v);
    v = v === 5 ? 1 : v + 1;
  }
  const winnerIndex = values.length - 1;

  // acrescenta mais 2 números depois do sorteado, continuando o mesmo
  // ciclo — sem isso o vencedor ficaria sempre no fim da trilha, sem
  // "próximo" pra aparecer do lado direito quando centralizar.
  for (let i = 0; i < 2; i++) {
    values.push(v);
    v = v === 5 ? 1 : v + 1;
  }

  const tiles = values.map((value) => {
    const tile = document.createElement('div');
    tile.className = 'qam-draw-tile';
    tile.textContent = String(value);
    drawReelTrack.appendChild(tile);
    return tile;
  });
  return { tiles, winnerTile: tiles[winnerIndex] };
}

/** Calcula o tamanho de cada tile a partir da largura REAL do container
 * (responsivo via CSS puro: `width: min(680px, 92vw)`), garantindo que os
 * 5 tiles (1 a 5, sempre todos visíveis — sem cortar o 1 e o 5 nas pontas,
 * que ficava com cara de "quebrado") sempre cabem certinho — em vez de um
 * clamp() fixo que podia estourar a tela em celulares pequenos. */
function updateDrawReelSize() {
  const gapHalf = 6; // metade da margem de cada tile (12px de espaço total por tile)
  const containerWidth = drawReel.getBoundingClientRect().width;
  if (!containerWidth) return;

  const tileSize = Math.max(48, Math.floor(containerWidth / 5) - gapHalf * 2);
  drawReel.style.setProperty('--qam-tile-size', `${tileSize}px`);
  drawReel.style.setProperty('--qam-tile-gap', `${gapHalf}px`);
}

function startDrawNotes() {
  if (drawing) return;
  drawing = true;
  idleReelResizeObserver?.disconnect(); // peão vai animar agora — para de "corrigir" a posição parada

  btnDrawNotes.classList.add('d-none');
  drawHeading.textContent = 'Sorteando...';
  drawIdleCaption.classList.add('d-none');
  drawSpinCaption.classList.remove('d-none');
  stageText.classList.add('d-none');
  drawReel.classList.remove('d-none');

  const maxInitial = Math.min(MAX_DRAW_N, roundSong.notes.length || MAX_DRAW_N);

  // Resultado real, decidido agora — a animação só vai revelar ele. Guardado
  // também numa constante local (drawnValue): o rAF abaixo só roda daqui a
  // 1-2 frames, e "roundN" é uma variável compartilhada do módulo — se
  // nesse meio tempo (ex: navegador atrasado, aba trocada) outra ação
  // mudasse "roundN" por fora, o reel ia tentar montar a trilha pra um
  // número fora do 1-5 e travar num loop infinito dentro de buildReelTrack.
  // Lendo sempre "drawnValue" (nunca "roundN" de novo) o reel fica imune a
  // isso, não importa o que aconteça com o resto do estado nesse intervalo.
  roundN = MIN_DRAW_N + Math.floor(Math.random() * maxInitial);
  const drawnValue = roundN;

  const finishDraw = (winnerTile) => {
    drawing = false;
    drawReel.classList.add('d-none');
    winnerTile.classList.remove('qam-draw-tile--winner');
    showDrawResult();
  };

  // Sem GSAP (ex: CDN bloqueado) — não trava o jogo, só pula a animação.
  if (typeof gsap === 'undefined') {
    updateDrawReelSize();
    const { winnerTile } = buildReelTrack(drawnValue);
    finishDraw(winnerTile);
    return;
  }

  // Só monta a trilha e mede a geometria depois que o navegador terminar
  // de aplicar o layout do reel recém-revelado (tirar o "d-none" não
  // garante que a largura final já esteja disponível no mesmo frame) —
  // sem isso, o cálculo do tamanho/posição podia pegar valores
  // desatualizados e o número sorteado parava fora do centro.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    updateDrawReelSize();
    const { winnerTile } = buildReelTrack(drawnValue);

    // Desloca a trilha até o tile vencedor ficar exatamente centralizado
    // na "área de seleção" — medido via DOM (funciona igual em qualquer
    // largura de tela, desktop ou mobile, sem contas de pixel fixas).
    const viewportRect = drawReelViewport.getBoundingClientRect();
    const tileRect = winnerTile.getBoundingClientRect();
    const targetX = (viewportRect.left + viewportRect.width / 2) - (tileRect.left + tileRect.width / 2);

    gsap.timeline()
      .to(drawReelTrack, {
        x: targetX,
        duration: 2.3,
        ease: 'power4.out', // começa rápido, desacelera progressivamente
      })
      .call(() => winnerTile.classList.add('qam-draw-tile--winner'))
      // efeito de impacto/bounce só no tile vencedor (scale, transform-origin
      // central) — não mexe na posição, então o centro nunca desalinha.
      .to(winnerTile, { scale: 1.2, duration: 0.14, ease: 'power1.out' })
      .to(winnerTile, {
        scale: 1,
        duration: 0.5,
        ease: 'elastic.out(1, 0.4)',
        onComplete: () => setTimeout(() => finishDraw(winnerTile), 450),
      });
  }));
}

/** Revelação rápida do resultado do sorteio (número grande + "notas" +
 * "Prepare-se!") — só acontece depois do SORTEIO inicial, nunca depois de
 * um "Passar" (que já sabe o número na hora, sem girar peão nenhum). Fica
 * na tela por um instante antes de liberar o "Ouvir" (beginAttempt). */
const DRAW_RESULT_DELAY_MS = 1300;

function showDrawResult() {
  drawHeading.classList.add('d-none');
  drawSpinCaption.classList.add('d-none');
  drawResultNumber.textContent = String(roundN);
  drawResult.classList.remove('d-none');

  setTimeout(() => {
    drawResult.classList.add('d-none');
    beginAttempt();
  }, DRAW_RESULT_DELAY_MS);
}

/** Prepara a tentativa atual (recém-sorteada ou após um "Passar" — nesse
 * caso roundN/attemptValue já vêm incrementados de resolveOutcome). */
function beginAttempt() {
  drawHeading.classList.add('d-none');
  drawIdleCaption.classList.add('d-none');
  drawSpinCaption.classList.add('d-none');
  drawResult.classList.add('d-none');

  stageText.classList.remove('d-none');
  stageText.innerHTML = `
    <div class="qam-notes-badge__icon" aria-hidden="true">🎵</div>
    <div class="qam-notes-badge__number">${roundN}</div>
    <div class="qam-notes-badge__label">${roundN === 1 ? 'nota' : 'notas'}</div>
  `;

  // Um badge só pro valor da tentativa — antes tinha um segundo badge
  // ("Chance em dobro") repetindo o mesmo "Vale X pontos" quando passava
  // de 1 ponto, duplicando a informação. Agora é só este aqui, com um 🔥 e
  // um destaque visual (classe --boosted) quando o valor está mais alto.
  const boosted = attemptValue > 1;
  badgePoints.classList.remove('d-none');
  badgePoints.classList.toggle('qam-points-badge--boosted', boosted);
  badgePointsValue.textContent = `${boosted ? '🔥 ' : ''}Vale ${attemptValue} ${attemptValue === 1 ? 'ponto' : 'pontos'}`;

  correctBtn.classList.add('d-none');
  wrongBtn.classList.add('d-none');
  passBtn.classList.add('d-none');

  renderTurnBanner();
  showPianoForRound();

  playsRemaining = MAX_PLAYS;
  updatePlayButtonLabel();
  replayBtn.classList.remove('d-none');
}

function updatePlayButtonLabel() {
  if (playsRemaining <= 0) {
    replayLabel.textContent = 'Sem mais chances';
    replaySubLabel.textContent = '';
    replayBtn.disabled = true;
    return;
  }
  const verb = playsRemaining === MAX_PLAYS ? 'Ouvir música' : 'Ouvir novamente';
  const timesLabel = playsRemaining === 1 ? '1 vez restante' : `${playsRemaining} vezes restantes`;
  replayLabel.textContent = verb;
  replaySubLabel.textContent = timesLabel;
  replayBtn.disabled = false;
}

async function playClip() {
  replayBtn.disabled = true;
  correctBtn.disabled = true;
  wrongBtn.disabled = true;
  passBtn.disabled = true;

  await ensureAudioStarted();
  await ensureSynthFor(roundSong);
  awaitingClipEnd = true;
  const n = Math.min(roundN, roundSong.notes.length);
  const clipNotes = roundSong.notes.slice(0, n);
  previewPlayer.playPreview(roundSong.notes, n);
  startMiniPlayer(clipNotes);
}

/** "Passar" só é permitido até MAX_PASSES vezes por música (pra não ficar
 * indo e voltando entre as equipes à toa) e até o teto de MAX_NOTES notas —
 * vale o que travar primeiro. attemptValue começa em 1 e sobe +1 a cada
 * passe, então attemptValue > MAX_PASSES significa que já passou o máximo. */
function canPassNow() {
  const effectiveMaxNotes = Math.min(MAX_NOTES, roundSong.notes.length || MAX_NOTES);
  return roundN < effectiveMaxNotes && attemptValue <= MAX_PASSES;
}

function onClipFinished() {
  stopMiniPlayer();
  playsRemaining -= 1;
  updatePlayButtonLabel();

  correctBtn.classList.remove('d-none');
  wrongBtn.classList.remove('d-none');
  passBtn.classList.toggle('d-none', !canPassNow());

  correctBtn.disabled = false;
  wrongBtn.disabled = false;
  passBtn.disabled = false;
}

function resolveOutcome(kind) {
  if (resolving) return;

  if (kind === 'pass') {
    if (!canPassNow()) return; // botão já deveria estar travado

    resolving = true;
    Teams.nextTurn();
    resolving = false;

    roundN += 1;
    attemptValue += 1;

    beginAttempt();
    return;
  }

  resolving = true;
  correctBtn.disabled = true;
  wrongBtn.disabled = true;
  passBtn.classList.add('d-none');

  const team = Teams.currentTeam();
  const teamName = team ? team.name : 'A equipe';

  if (kind === 'correct') {
    Teams.addPoint(attemptValue);
    showReveal(`✅ ${escapeHtml(teamName)} acertou e ganhou ${attemptValue} ${attemptValue === 1 ? 'ponto' : 'pontos'}!`, true);
  } else {
    Teams.addPoint(-attemptValue);
    showReveal(`❌ ${escapeHtml(teamName)} errou e perdeu ${attemptValue} ${attemptValue === 1 ? 'ponto' : 'pontos'}.`, false);
  }
}

function showReveal(outcomeHtml, positive) {
  previewPlayer.stop();
  stopMiniPlayer();
  stageText.classList.add('d-none');
  hintsPanel.classList.add('d-none');
  hideActionButtons();

  revealOutcome.innerHTML = outcomeHtml;
  revealOutcome.classList.toggle('qam-reveal-outcome--positive', positive);
  revealOutcome.classList.toggle('qam-reveal-outcome--negative', !positive);
  revealTitle.textContent = roundSong.title;
  revealArtist.textContent = roundSong.artist;

  const hints = roundSong.hints || [];
  revealHints.innerHTML = SHOW_HINTS_IN_GAME && hints.length
    ? `<ul>${hints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
    : '';

  const embedUrl = buildEmbedUrl(roundSong.youtube?.url, roundSong.youtube?.start, roundSong.youtube?.end, { respectEnd: false });
  btnPlayOriginal.classList.toggle('d-none', !embedUrl);

  // Acertou ou errou, tanto faz: a revelação já mostra o vídeo tocando
  // (autoplay) — a equipe sempre vê/ouve a música de verdade no final,
  // não só quando ganha o ponto. O botão vira só um controle de parar/
  // tocar de novo por baixo do vídeo.
  if (embedUrl) {
    originalEmbed.innerHTML = `<iframe width="100%" src="${embedUrl}" title="Música original" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    btnPlayOriginal.textContent = '⏹ Parar';
  } else {
    originalEmbed.innerHTML = '';
    btnPlayOriginal.textContent = '▶ Ouvir música original';
  }

  revealPanel.classList.remove('d-none');
  nextSongBtn.classList.remove('d-none');
}

/* ===== Sair (confirma antes de deixar o jogo, com ou sem equipes) ===== */
async function confirmExit() {
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
  btnResetScores.addEventListener('click', () => {
    Teams.resetScores();
  });

  startBtn.addEventListener('click', startGame);

  btnDrawNotes.addEventListener('click', startDrawNotes);

  replayBtn.addEventListener('click', () => {
    if (playsRemaining <= 0) return;
    playClip();
  });

  correctBtn.addEventListener('click', () => resolveOutcome('correct'));
  wrongBtn.addEventListener('click', () => resolveOutcome('wrong'));
  passBtn.addEventListener('click', () => resolveOutcome('pass'));
  nextSongBtn.addEventListener('click', startRound);

  btnPlayOriginal.addEventListener('click', () => {
    if (originalEmbed.innerHTML) {
      originalEmbed.innerHTML = '';
      btnPlayOriginal.textContent = '▶ Ouvir música original';
      return;
    }
    previewPlayer.stop();
    const embedUrl = buildEmbedUrl(roundSong.youtube?.url, roundSong.youtube?.start, roundSong.youtube?.end, { respectEnd: false });
    if (!embedUrl) return;
    originalEmbed.innerHTML = `<iframe width="100%" src="${embedUrl}" title="Música original" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    btnPlayOriginal.textContent = '⏹ Parar';
  });

  scoreBtn.addEventListener('click', () => showScorePopup());

  exitBtn.addEventListener('click', confirmExit);
  brandLink.addEventListener('click', (e) => {
    // Só confirma se o jogo já estiver em andamento — na tela de
    // configuração não há nada a perder, deixa navegar direto.
    if (gameScreen.classList.contains('d-none')) return;
    e.preventDefault();
    confirmExit();
  });

  window.addEventListener('bibflix:teams:change', renderTurnBanner);
  window.addEventListener('bibflix:teams:change', renderTeamsPanel);
}

/* ===== Alturas do header/topo (para o "sticky stack") =====
   A altura do header e do topo do jogo variam (texto "Vez de: X" muda de
   tamanho, o header quebra linha no mobile) — em vez de um valor fixo em
   px, medimos de verdade e guardamos em custom properties que o CSS usa
   (game.css: #gameScreen .pgui-game-layout__topbar).
   Chamada nos pontos que podem mudar essas alturas (início do jogo, troca
   de vez, resize) + um ResizeObserver como rede de segurança pra qualquer
   outra mudança de conteúdo que não passe por esses pontos. */
function updateStickyOffsets() {
  const header = document.querySelector('.qam-topheader');
  const topbar = document.querySelector('.pgui-game-layout__topbar');
  if (!header || !topbar) return;

  const root = document.documentElement.style;
  root.setProperty('--qam-header-h', `${header.getBoundingClientRect().height}px`);
  root.setProperty('--qam-topbar-h', `${topbar.getBoundingClientRect().height}px`);
}

function watchStickyOffsets() {
  const header = document.querySelector('.qam-topheader');
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

  // A fonte (Poppins/Inter) carrega de forma assíncrona — o texto pode
  // quebrar linha diferente antes/depois dela terminar de carregar.
  document.fonts?.ready?.then(updateStickyOffsets);
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', async () => {
  renderTeamsPanel();
  wireUI();
  watchStickyOffsets();
  await loadSongs();
  checkAutoStartFromURL();
});
