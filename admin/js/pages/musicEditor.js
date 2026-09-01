import { songsApi } from '../api.js';
import {
  KEYS,
  INSTRUMENTS,
  buildKeyboardRows,
  resolveNote,
  physicalKeyFromEvent,
  createInstrumentSynth,
  disposeInstrumentSynth,
} from '../../../assets/js/music-theory.js';
import { createRecorder } from '../useRecorder.js';
import { createPreviewPlayer, computePreviews } from '../../../assets/js/use-preview-player.js';

function formatTime(seconds) {
  const s = Math.max(0, seconds || 0);
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  const ms = Math.floor((s * 1000) % 1000).toString().padStart(3, '0');
  return `${mm}:${ss}.${ms}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export async function renderMusicEditor(el, params) {
  const isEditing = Boolean(params.id);
  let song = null;

  if (isEditing) {
    try {
      song = await songsApi.get(params.id);
    } catch (err) {
      el.innerHTML = `<div class="admin-empty-state"><strong>Erro ao carregar música</strong>${escapeHtml(err.message)}</div>`;
      return;
    }
  }

  const form = {
    title: song?.title || '',
    artist: song?.artist || '',
    key: song?.key || KEYS[0].value,
    instrument: song?.instrument || INSTRUMENTS[0].value,
    youtubeUrl: song?.youtube?.url || '',
    ytStart: song?.youtube?.start ?? '',
    ytEnd: song?.youtube?.end ?? '',
  };

  el.innerHTML = `
    <div class="admin-header">
      <div class="admin-header-titles">
        <button type="button" class="admin-back-btn" id="backBtn" title="Voltar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h1 class="admin-title">Editor de Músicas</h1>
          <p class="admin-subtitle">Cadastro de músicas para o jogo "Qual é a Música?"</p>
        </div>
      </div>
      <a href="#/musicas" class="admin-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Voltar para lista
      </a>
    </div>

    <div class="admin-grid">
      <div class="admin-main-col">

        <section class="admin-card">
          <h2 class="admin-card-title"><span class="admin-step-badge">1</span>Informações da música</h2>

          <div class="admin-field-grid" style="margin-bottom:16px;">
            <div class="admin-field">
              <label>Nome da música <span class="req">*</span></label>
              <input type="text" id="f-title" placeholder="Ex: Porque Ele Vive" value="${escapeHtml(form.title)}" />
            </div>
            <div class="admin-field">
              <label>Artista / Banda <span class="req">*</span></label>
              <input type="text" id="f-artist" placeholder="Ex: Harpa Cristã" value="${escapeHtml(form.artist)}" />
            </div>
            <div class="admin-field">
              <label>Link da música original (YouTube) <span class="req">*</span></label>
              <input type="url" id="f-youtube" placeholder="https://www.youtube.com/watch?v=xxxxxxxxxxx" value="${escapeHtml(form.youtubeUrl)}" />
            </div>
          </div>

          <div class="admin-field-grid admin-field-grid-4">
            <div class="admin-field">
              <label>Tom <span class="req">*</span></label>
              <select id="f-key">
                ${KEYS.map((k) => `<option value="${k.value}" ${k.value === form.key ? 'selected' : ''}>${escapeHtml(k.label)}</option>`).join('')}
              </select>
              <span class="admin-field-hint">O teclado será transposto automaticamente para este tom.</span>
            </div>
            <div class="admin-field">
              <label>Instrumento</label>
              <select id="f-instrument">
                ${INSTRUMENTS.map((i) => `<option value="${i.value}" ${i.value === form.instrument ? 'selected' : ''}>${escapeHtml(i.label)}</option>`).join('')}
              </select>
              <span class="admin-field-hint" id="instrumentHint">O instrumento será usado apenas para reprodução.</span>
            </div>
            <div class="admin-field">
              <label>Início (segundos)</label>
              <input type="number" id="f-yt-start" min="0" step="1" value="${escapeHtml(form.ytStart)}" />
            </div>
            <div class="admin-field">
              <label>Término (segundos)</label>
              <input type="number" id="f-yt-end" min="0" step="1" value="${escapeHtml(form.ytEnd)}" />
              <span class="admin-field-hint">Usados para tocar a música original ao final da rodada.</span>
            </div>
          </div>
        </section>

        <section class="admin-card">
          <h2 class="admin-card-title"><span class="admin-step-badge">2</span>Gravação da introdução</h2>

          <div class="admin-rec-toolbar">
            <button type="button" class="admin-btn admin-btn-rec" id="recBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>
              REC
            </button>
            <button type="button" class="admin-btn" id="stopBtn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
              STOP
            </button>
            <button type="button" class="admin-btn" id="playBtn" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              PLAY
            </button>

            <div class="admin-rec-readout">
              <div class="admin-rec-stat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                <div>
                  <div class="admin-rec-stat-value" id="elapsedValue">00:00.000</div>
                  <div class="admin-rec-stat-label">Tempo da gravação</div>
                </div>
              </div>
              <div class="admin-rec-stat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <div>
                  <div class="admin-rec-stat-value" id="noteCountValue">0</div>
                  <div class="admin-rec-stat-label">Notas gravadas</div>
                </div>
              </div>
            </div>
          </div>

          <div class="admin-keyboard-toggle">
            <span>Use o teclado do computador para tocar</span>
            <button type="button" class="admin-switch is-on" id="toggleKeyboard" role="switch" aria-checked="true"></button>
            <span>Mostrar teclas</span>
          </div>

          <div class="admin-keyboard" id="keyboardWrap"></div>

          <div class="admin-tips-grid">
            <div class="admin-tip-box gold">
              <strong>💡 Dicas</strong>
              <ul>
                <li>Toque pelo menos 8 notas para uma melhor experiência no jogo.</li>
                <li>Use a introdução da música, não precisa tocar a música inteira.</li>
                <li>Toque no ritmo original da música.</li>
                <li>Se a melodia passar de uma oitava, use a linha de cima (grave) ou de baixo (aguda) do teclado.</li>
              </ul>
            </div>
            <div class="admin-tip-box blue">
              <strong>⌨️ Teclas especiais</strong>
              <dl>
                <div><dt>Backspace</dt><dd>— apaga última nota (antes de salvar)</dd></div>
                <div><dt>Space</dt><dd>— reproduzir durante a gravação</dd></div>
                <div><dt>Q...I / A...K / Z...,</dt><dd>— oitava grave / padrão / aguda</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section class="admin-card">
          <h2 class="admin-card-title"><span class="admin-step-badge">3</span>Dicas extras (opcional)</h2>
          <p class="admin-field-hint" style="margin-bottom:14px;">Frases que o apresentador pode revelar como pista, além das notas tocadas. Ex: "Essa canção tem referências nos evangelhos de João e Mateus". Adicione quantas quiser.</p>
          <div class="admin-hints-list" id="hintsList"></div>
          <button type="button" class="admin-btn" id="addHintBtn" style="margin-top:12px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            Adicionar dica
          </button>
        </section>

        <section class="admin-card">
          <h2 class="admin-card-title"><span class="admin-step-badge">4</span>Salvar música</h2>
          <div class="admin-save-bar">
            <span class="admin-save-status" id="saveStatus"></span>
            <button type="button" class="admin-btn" id="clearBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Limpar tudo
            </button>
            <button type="button" class="admin-btn admin-btn-primary" id="saveBtn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>
              Salvar música
            </button>
          </div>
        </section>
      </div>

      <div class="admin-side-col">
        <section class="admin-card">
          <h2 class="admin-card-title">🎵 Como funciona</h2>
          <ol class="admin-info-list" style="list-style:none;">
            <li><span class="admin-info-badge">1</span>Escolha o tom da música.</li>
            <li><span class="admin-info-badge">2</span>Clique em REC e toque a introdução usando o teclado do computador.</li>
            <li><span class="admin-info-badge">3</span>Clique em STOP quando terminar.</li>
            <li><span class="admin-info-badge">4</span>As notas e os níveis serão gerados automaticamente.</li>
            <li><span class="admin-info-badge">5</span>Informe o link da música original e salve.</li>
          </ol>
        </section>

        <section class="admin-card">
          <h2 class="admin-card-title">Prévia dos níveis (dicas)</h2>
          <p class="admin-preview-desc">Cada nível tocará do início até o final da respectiva nota.</p>
          <div class="admin-preview-list" id="previewList"></div>
          <div class="admin-preview-total" id="previewTotal"></div>
        </section>
      </div>
    </div>
  `;

  // ---- referências ----
  const fTitle = el.querySelector('#f-title');
  const fArtist = el.querySelector('#f-artist');
  const fYoutube = el.querySelector('#f-youtube');
  const fKey = el.querySelector('#f-key');
  const fInstrument = el.querySelector('#f-instrument');
  const fYtStart = el.querySelector('#f-yt-start');
  const fYtEnd = el.querySelector('#f-yt-end');

  const recBtn = el.querySelector('#recBtn');
  const stopBtn = el.querySelector('#stopBtn');
  const playBtn = el.querySelector('#playBtn');
  const elapsedValue = el.querySelector('#elapsedValue');
  const noteCountValue = el.querySelector('#noteCountValue');
  const toggleKeyboard = el.querySelector('#toggleKeyboard');
  const keyboardWrap = el.querySelector('#keyboardWrap');
  const previewList = el.querySelector('#previewList');
  const previewTotal = el.querySelector('#previewTotal');
  const saveStatus = el.querySelector('#saveStatus');
  const saveBtn = el.querySelector('#saveBtn');
  const clearBtn = el.querySelector('#clearBtn');
  const backBtn = el.querySelector('#backBtn');

  // ---- dicas extras (texto livre, quantidade arbitrária) ----
  const hintsList = el.querySelector('#hintsList');
  const addHintBtn = el.querySelector('#addHintBtn');
  let hints = song?.hints?.length ? [...song.hints] : [''];

  function renderHints() {
    hintsList.innerHTML = hints.map((h, i) => `
      <div class="admin-hint-row">
        <input type="text" class="admin-hint-input" data-index="${i}" placeholder="Ex: Um milagre de Jesus" value="${escapeHtml(h)}" />
        <button type="button" class="admin-icon-btn danger" data-remove-hint="${i}" title="Remover dica">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `).join('');

    hintsList.querySelectorAll('.admin-hint-input').forEach((input) => {
      input.addEventListener('input', () => {
        hints[Number(input.getAttribute('data-index'))] = input.value;
      });
    });
    hintsList.querySelectorAll('[data-remove-hint]').forEach((btn) => {
      btn.addEventListener('click', () => {
        hints.splice(Number(btn.getAttribute('data-remove-hint')), 1);
        if (hints.length === 0) hints.push('');
        renderHints();
      });
    });
  }
  renderHints();

  addHintBtn.addEventListener('click', () => {
    hints.push('');
    renderHints();
    const inputs = hintsList.querySelectorAll('.admin-hint-input');
    inputs[inputs.length - 1]?.focus();
  });

  // ---- estado de áudio ----
  const instrumentHint = el.querySelector('#instrumentHint');
  const defaultInstrumentHint = instrumentHint.textContent;

  let synth = null;
  let synthReady = false;

  async function loadSynth(instrument) {
    synthReady = false;
    refreshTransportButtons();
    instrumentHint.textContent = instrument === 'piano'
      ? 'Carregando som do piano...'
      : defaultInstrumentHint;

    const loaded = await createInstrumentSynth(instrument);
    // Se o usuário trocou de instrumento de novo enquanto isso carregava, ignora.
    if (fInstrument.value !== instrument) return;

    synth = loaded;
    synthReady = true;
    instrumentHint.textContent = defaultInstrumentHint;
    refreshTransportButtons();
  }

  let audioStarted = false;
  async function ensureAudioStarted() {
    if (audioStarted) return;
    await window.Tone.start();
    audioStarted = true;
  }

  const recorder = createRecorder();
  const previewPlayer = createPreviewPlayer(() => synth);

  if (song?.notes?.length) recorder.setNotes(song.notes);

  // ---- teclado visual (3 linhas = 3 oitavas fixas) ----
  function renderKeyboard() {
    const rows = buildKeyboardRows(fKey.value);
    keyboardWrap.innerHTML = rows.map((row) => `
      <div class="admin-keyboard-row" data-octave="${row.id}">
        <span class="admin-keyboard-row-label">${escapeHtml(row.label)}</span>
        <div class="admin-keyboard-row-keys">
          ${row.keys.map((k) => `
            <div class="admin-key" data-key="${k.key}" title="${escapeHtml(k.note)}">
              <span class="admin-key-code">${k.key === ',' ? ',' : k.key}</span>
              <span class="admin-key-note">${escapeHtml(k.label)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }
  renderKeyboard();

  function setKeyActive(physicalKey, active) {
    const tile = keyboardWrap.querySelector(`[data-key="${physicalKey}"]`);
    if (tile) tile.classList.toggle('is-active', active);
  }

  // ---- preview list (níveis) ----
  function renderPreviewList() {
    const notes = recorder.getState().notes;
    const previews = computePreviews(notes);
    if (previews.length === 0) {
      previewList.innerHTML = '<div class="admin-preview-empty">Grave a introdução para ver os níveis.</div>';
      previewTotal.textContent = '';
      return;
    }
    previewList.innerHTML = previews.map((p) => `
      <div class="admin-preview-row">
        <button type="button" class="admin-preview-play" data-level="${p.level}" title="Tocar nível ${p.level}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </button>
        <span class="admin-preview-label">Nível ${p.level}</span>
        <span class="admin-preview-time">0.00s – ${p.endTime.toFixed(2)}s</span>
      </div>
    `).join('');
    previewTotal.textContent = `Total de notas: ${notes.length}`;

    previewList.querySelectorAll('[data-level]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await ensureAudioStarted();
        previewPlayer.playPreview(recorder.getState().notes, Number(btn.getAttribute('data-level')));
      });
    });
  }

  // ---- estado de gravação/reprodução (REC/STOP/PLAY) ----
  function refreshTransportButtons() {
    const state = recorder.getState();
    recBtn.disabled = state.isRecording || !synthReady;
    recBtn.classList.toggle('is-recording', state.isRecording);
    stopBtn.disabled = !state.isRecording;
    playBtn.disabled = state.isRecording || state.notes.length === 0 || !synthReady;
  }

  recorder.subscribe((state) => {
    elapsedValue.textContent = formatTime(state.elapsed);
    noteCountValue.textContent = String(state.noteCount);
    refreshTransportButtons();
    renderPreviewList();
  });

  recBtn.addEventListener('click', async () => {
    await ensureAudioStarted();
    previewPlayer.stop();
    recorder.start();
  });

  stopBtn.addEventListener('click', () => {
    recorder.stop();
  });

  playBtn.addEventListener('click', async () => {
    await ensureAudioStarted();
    previewPlayer.playAll(recorder.getState().notes);
  });

  clearBtn.addEventListener('click', () => {
    if (!confirm('Limpar todos os campos e a gravação atual?')) return;
    fTitle.value = '';
    fArtist.value = '';
    fYoutube.value = '';
    fYtStart.value = '';
    fYtEnd.value = '';
    fKey.value = KEYS[0].value;
    fInstrument.value = INSTRUMENTS[0].value;
    fInstrument.dispatchEvent(new Event('change'));
    renderKeyboard();
    recorder.reset();
    hints = [''];
    renderHints();
    saveStatus.textContent = '';
    saveStatus.className = 'admin-save-status';
  });

  fKey.addEventListener('change', renderKeyboard);
  fInstrument.addEventListener('change', () => {
    disposeInstrumentSynth(synth);
    synth = null;
    loadSynth(fInstrument.value);
  });

  toggleKeyboard.addEventListener('click', () => {
    const isOn = toggleKeyboard.classList.toggle('is-on');
    toggleKeyboard.setAttribute('aria-checked', String(isOn));
    keyboardWrap.style.display = isOn ? '' : 'none';
  });

  // ---- captura do teclado físico ----
  function isTypingTarget(target) {
    const tag = (target?.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'select' || tag === 'textarea';
  }

  // Guarda a nota exata tocada em cada tecla física, para que soltar a
  // tecla solte a MESMA nota mesmo se o tom for trocado enquanto ela
  // ainda está pressionada.
  const heldNotes = new Map();

  async function onKeyDown(e) {
    if (isTypingTarget(e.target)) return;

    if (e.code === 'Space') {
      e.preventDefault();
      await ensureAudioStarted();
      previewPlayer.playAll(recorder.getState().notes);
      return;
    }
    if (e.code === 'Backspace') {
      e.preventDefault();
      recorder.removeLastNote();
      return;
    }
    if (e.repeat) return;

    const physicalKey = physicalKeyFromEvent(e);
    const resolved = resolveNote(physicalKey, fKey.value);
    if (!resolved) return;

    setKeyActive(physicalKey, true);
    await ensureAudioStarted();
    if (synth) synth.triggerAttack(resolved.note);
    heldNotes.set(physicalKey, resolved.note);
    if (recorder.getState().isRecording) recorder.noteOn(physicalKey, resolved);
  }

  function onKeyUp(e) {
    if (isTypingTarget(e.target)) return;
    const physicalKey = physicalKeyFromEvent(e);
    const heldNote = heldNotes.get(physicalKey);
    if (!heldNote) return;
    heldNotes.delete(physicalKey);

    setKeyActive(physicalKey, false);
    if (synth) synth.triggerRelease(heldNote);
    if (recorder.getState().isRecording) recorder.noteOff(physicalKey);
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // ---- salvar ----
  function setStatus(message, type) {
    saveStatus.textContent = message;
    saveStatus.className = `admin-save-status${type ? ` is-${type}` : ''}`;
  }

  function goToList() {
    window.location.hash = '/musicas';
  }

  backBtn.addEventListener('click', goToList);

  saveBtn.addEventListener('click', async () => {
    const notes = recorder.getState().notes;
    const payload = {
      title: fTitle.value.trim(),
      artist: fArtist.value.trim(),
      key: fKey.value,
      instrument: fInstrument.value,
      notes,
      previews: computePreviews(notes),
      hints: hints.map((h) => h.trim()).filter(Boolean),
      youtube: {
        url: fYoutube.value.trim(),
        start: Number(fYtStart.value) || 0,
        end: Number(fYtEnd.value) || 0,
      },
    };

    if (!payload.title || !payload.artist || !payload.youtube.url) {
      setStatus('Preencha nome, artista e link do YouTube.', 'error');
      return;
    }
    if (notes.length === 0) {
      setStatus('Grave pelo menos uma nota antes de salvar.', 'error');
      return;
    }

    saveBtn.disabled = true;
    setStatus('Salvando...', '');

    try {
      if (isEditing) {
        await songsApi.update(params.id, payload);
        setStatus('Música atualizada!', 'success');
        setTimeout(goToList, 600);
      } else {
        await songsApi.create(payload);
        setStatus('Música salva! Pronto para a próxima.', 'success');
        // Fluxo rápido: limpa o formulário e fica pronto para cadastrar a próxima música.
        fTitle.value = '';
        fArtist.value = '';
        fYoutube.value = '';
        fYtStart.value = '';
        fYtEnd.value = '';
        recorder.reset();
        hints = [''];
        renderHints();
        fTitle.focus();
      }
    } catch (err) {
      setStatus(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  refreshTransportButtons();
  renderPreviewList();
  loadSynth(form.instrument);

  // ---- limpeza ao sair da tela ----
  return function cleanup() {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    previewPlayer.stop();
    recorder.stop();
    disposeInstrumentSynth(synth);
  };
}
