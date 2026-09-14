import { visitorsApi } from '../api.js';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// A planilha pode ter as colunas nomeadas de formas ligeiramente
// diferentes dependendo de como o Apps Script foi escrito — tenta achar
// o valor em qualquer uma das variações conhecidas antes de desistir.
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  return '';
}

export async function renderUsersList(el) {
  el.innerHTML = `
    <div class="admin-header">
      <div class="admin-header-titles">
        <div>
          <h1 class="admin-title">Usuários</h1>
          <p class="admin-subtitle">Cadastros feitos no modal de boas-vindas do site</p>
        </div>
      </div>
    </div>

    <div class="admin-card">
      <div class="admin-list-toolbar">
        <input type="search" class="admin-search-input" id="userSearch" placeholder="Buscar por nome, igreja ou cidade..." />
      </div>
      <div id="usersTableWrap"></div>
    </div>
  `;

  const tableWrap = el.querySelector('#usersTableWrap');
  const searchInput = el.querySelector('#userSearch');

  tableWrap.innerHTML = '<div class="admin-empty-state">Carregando...</div>';

  let rows = [];
  try {
    const data = await visitorsApi.list();
    rows = Array.isArray(data) ? data : [];
  } catch (err) {
    tableWrap.innerHTML = `<div class="admin-empty-state"><strong>Erro ao carregar usuários</strong>${escapeHtml(err.message)}</div>`;
    return;
  }

  function renderTable(list) {
    if (list.length === 0) {
      tableWrap.innerHTML = `
        <div class="admin-empty-state">
          <strong>Nenhum cadastro encontrado</strong>
          Ninguém preencheu o formulário de boas-vindas ainda.
        </div>`;
      return;
    }

    tableWrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>WhatsApp</th>
            <th>Igreja</th>
            <th>Cidade</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((row) => `
            <tr>
              <td>${escapeHtml(pick(row, ['name', 'Nome', 'nome'])) || '—'}</td>
              <td>${escapeHtml(pick(row, ['whatsapp', 'WhatsApp'])) || '—'}</td>
              <td>${escapeHtml(pick(row, ['church', 'Igreja', 'igreja'])) || '—'}</td>
              <td>${escapeHtml(pick(row, ['city', 'Cidade', 'cidade'])) || '—'}</td>
              <td>${formatDate(pick(row, ['timestamp', 'Timestamp', 'Carimbo de data/hora', 'seenAt']))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function applyFilter() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => [
          pick(r, ['name', 'Nome', 'nome']),
          pick(r, ['church', 'Igreja', 'igreja']),
          pick(r, ['city', 'Cidade', 'cidade']),
        ].some((v) => String(v).toLowerCase().includes(q)))
      : rows;
    renderTable(filtered);
  }

  searchInput.addEventListener('input', applyFilter);
  applyFilter();
}
