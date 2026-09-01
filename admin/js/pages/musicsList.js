import { songsApi } from '../api.js';
import { KEYS, createInstrumentSynth, disposeInstrumentSynth } from '../../../assets/js/music-theory.js';
import { createPreviewPlayer } from '../../../assets/js/use-preview-player.js';
import { extractYoutubeId, buildEmbedUrl } from '../../../assets/js/youtube-embed.js';

function keyLabel(value) {
  const found = KEYS.find((k) => k.value === value);
  return found ? found.value : value;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ICON_PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_STOP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>';
const ICON_CHEVRON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

export async function renderMusicsList(el) {
  el.innerHTML = `
    <div class="admin-header">
      <div class="admin-header-titles">
        <div>
          <h1 class="admin-title">Músicas</h1>
          <p class="admin-subtitle">Catálogo de músicas para o jogo "Qual é a Música?"</p>
        </div>
      </div>
      <a href="#/musicas/novo" class="admin-btn admin-btn-primary">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Nova música
      </a>
    </div>

    <div class="admin-card">
      <div class="admin-list-toolbar">
        <input type="search" class="admin-search-input" id="musicSearch" placeholder="Buscar por título ou artista..." />
      </div>
      <div id="musicsTableWrap"></div>
    </div>
  `;

  const tableWrap = el.querySelector('#musicsTableWrap');
  const searchInput = el.querySelector('#musicSearch');

  tableWrap.innerHTML = '<div class="admin-empty-state">Carregando...</div>';

  let songs = [];
  try {
    songs = await songsApi.list();
  } catch (err) {
    tableWrap.innerHTML = `<div class="admin-empty-state"><strong>Erro ao carregar músicas</strong>${escapeHtml(err.message)}</div>`;
    return;
  }

  // ---- reprodução das notas gravadas (Tone.js) ----
  let audioStarted = false;
  async function ensureAudioStarted() {
    if (audioStarted) return;
    await window.Tone.start();
    audioStarted = true;
  }

  let activeSynth = null;
  let activeInstrument = null;
  const previewPlayer = createPreviewPlayer(() => activeSynth);
  let playingSongId = null;

  previewPlayer.subscribe((playing) => {
    if (!playing) {
      playingSongId = null;
      updatePlayButtons();
    }
  });

  function updatePlayButtons() {
    tableWrap.querySelectorAll('[data-play-notes]').forEach((btn) => {
      const id = btn.getAttribute('data-play-notes');
      const isPlaying = id === playingSongId;
      btn.classList.toggle('is-playing', isPlaying);
      btn.innerHTML = isPlaying ? ICON_STOP : ICON_PLAY;
    });
  }

  async function togglePlayNotes(song) {
    if (playingSongId === song.id) {
      previewPlayer.stop();
      return;
    }
    closeOpenYoutube();
    await ensureAudioStarted();
    if (activeInstrument !== song.instrument) {
      disposeInstrumentSynth(activeSynth);
      activeSynth = await createInstrumentSynth(song.instrument);
      activeInstrument = song.instrument;
    }
    playingSongId = song.id;
    updatePlayButtons();
    previewPlayer.playAll(song.notes || []);
  }

  // ---- trecho da música original (YouTube embed inline) ----
  let openYoutubeId = null;

  function closeOpenYoutube() {
    if (!openYoutubeId) return;
    const container = tableWrap.querySelector(`#yt-${openYoutubeId}`);
    if (container) container.innerHTML = '';
    const btn = tableWrap.querySelector(`[data-play-original="${openYoutubeId}"]`);
    if (btn) btn.innerHTML = `${ICON_PLAY} Ouvir trecho original`;
    openYoutubeId = null;
  }

  function toggleOriginal(song) {
    const container = tableWrap.querySelector(`#yt-${song.id}`);
    const btn = tableWrap.querySelector(`[data-play-original="${song.id}"]`);
    if (!container || !btn) return;

    if (openYoutubeId === song.id) {
      closeOpenYoutube();
      return;
    }

    previewPlayer.stop();
    closeOpenYoutube();

    const embedUrl = buildEmbedUrl(song.youtube?.url, song.youtube?.start, song.youtube?.end);
    if (!embedUrl) return;

    container.innerHTML = `<iframe width="100%" height="200" src="${embedUrl}" title="Música original" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
    btn.innerHTML = `${ICON_STOP} Parar`;
    openYoutubeId = song.id;
  }

  // ---- expandir/recolher linha de detalhes (dicas + original) ----
  const expandedIds = new Set();

  function renderTable(list) {
    if (list.length === 0) {
      tableWrap.innerHTML = `
        <div class="admin-empty-state">
          <strong>Nenhuma música encontrada</strong>
          Cadastre a primeira música para começar a montar o catálogo.
        </div>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Música</th>
            <th>Tom</th>
            <th>Instrumento</th>
            <th>Notas</th>
            <th>Atualizado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map((song) => {
            const isExpanded = expandedIds.has(song.id);
            const hints = song.hints || [];
            const videoId = extractYoutubeId(song.youtube?.url);
            const start = Math.max(0, Number(song.youtube?.start) || 0);
            const end = Number(song.youtube?.end) || 0;
            return `
            <tr>
              <td>
                <div class="admin-table-song">${escapeHtml(song.title)}</div>
                <div class="admin-table-artist">${escapeHtml(song.artist)}</div>
              </td>
              <td><span class="admin-badge">${escapeHtml(keyLabel(song.key))}</span></td>
              <td>${escapeHtml(song.instrument || '—')}</td>
              <td>${(song.notes || []).length}</td>
              <td>${formatDate(song.updatedAt)}</td>
              <td>
                <div class="admin-table-actions">
                  <button class="admin-icon-btn" data-play-notes="${song.id}" title="Ouvir notas gravadas" ${(song.notes || []).length === 0 ? 'disabled' : ''}>${ICON_PLAY}</button>
                  <button class="admin-icon-btn" data-toggle-details="${song.id}" title="Ver dicas e música original">${ICON_CHEVRON}</button>
                  <a class="admin-icon-btn" href="#/musicas/${song.id}" title="Editar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                  </a>
                  <button class="admin-icon-btn danger" data-remove="${song.id}" title="Excluir">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr class="admin-detail-row" data-detail-for="${song.id}" ${isExpanded ? '' : 'style="display:none;"'}>
              <td colspan="6">
                <div class="admin-detail-panel">
                  <div class="admin-detail-block">
                    <strong>Dicas</strong>
                    ${hints.length
                      ? `<ul>${hints.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
                      : '<p class="admin-preview-empty">Nenhuma dica cadastrada.</p>'}
                  </div>
                  <div class="admin-detail-block">
                    <strong>Música original</strong>
                    ${videoId
                      ? `<button type="button" class="admin-btn" data-play-original="${song.id}">${ICON_PLAY} Ouvir trecho original</button>
                         <span class="admin-field-hint">${start}s – ${end}s</span>`
                      : '<p class="admin-preview-empty">Link do YouTube inválido ou não informado.</p>'}
                    <div class="admin-youtube-embed" id="yt-${song.id}"></div>
                  </div>
                </div>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    `;

    updatePlayButtons();

    tableWrap.querySelectorAll('[data-play-notes]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const song = songs.find((s) => s.id === btn.getAttribute('data-play-notes'));
        if (song) togglePlayNotes(song);
      });
    });

    tableWrap.querySelectorAll('[data-play-original]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const song = songs.find((s) => s.id === btn.getAttribute('data-play-original'));
        if (song) toggleOriginal(song);
      });
    });

    tableWrap.querySelectorAll('[data-toggle-details]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-toggle-details');
        const row = tableWrap.querySelector(`[data-detail-for="${id}"]`);
        if (!row) return;
        if (expandedIds.has(id)) {
          expandedIds.delete(id);
          row.style.display = 'none';
          btn.classList.remove('is-active');
        } else {
          expandedIds.add(id);
          row.style.display = '';
          btn.classList.add('is-active');
        }
      });
    });

    tableWrap.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-remove');
        const song = songs.find((s) => s.id === id);
        if (!confirm(`Excluir "${song ? song.title : 'esta música'}"? Essa ação não pode ser desfeita.`)) return;
        try {
          await songsApi.remove(id);
          songs = songs.filter((s) => s.id !== id);
          applyFilter();
        } catch (err) {
          alert(`Erro ao excluir: ${err.message}`);
        }
      });
    });
  }

  function applyFilter() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? songs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))
      : songs;
    renderTable(filtered);
  }

  searchInput.addEventListener('input', applyFilter);
  applyFilter();

  return function cleanup() {
    previewPlayer.stop();
    disposeInstrumentSynth(activeSynth);
  };
}
