// PlayGospel UI — ranking.js
// Renderiza uma lista de equipes (quantidade ilimitada) como uma linha
// cada, ordenada por pontuação, com a equipe atual em destaque e
// scroll automático até ela. Não depende de nenhum armazenamento
// específico — recebe os dados prontos.

import { icon } from './core.js';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/**
 * @param {HTMLElement} el container com a classe .pgui-ranking
 * @param {{id:string, name:string, score:number, color?:string, icon?:string}[]} teams
 * @param {string} [currentTeamId]
 */
export function renderRanking(el, teams, currentTeamId) {
  if (!el) return;

  const sorted = [...(teams || [])].sort((a, b) => (b.score || 0) - (a.score || 0));

  el.innerHTML = sorted.map((team, index) => {
    const isCurrent = team.id === currentTeamId;
    const color = escapeHtml(team.color || '#FFC107');
    const iconMarkup = icon(team.icon || 'star', { size: 12 }) || '<span class="pgui-ranking__dot"></span>';
    return `
      <div class="pgui-ranking__row${isCurrent ? ' is-current' : ''}" style="--team-color:${color}" data-team-id="${escapeHtml(team.id)}">
        <span class="pgui-ranking__pos">${index + 1}</span>
        <span class="pgui-ranking__icon">${iconMarkup}</span>
        <span class="pgui-ranking__name">${escapeHtml(team.name)}</span>
        <span class="pgui-ranking__line" aria-hidden="true"></span>
        <span class="pgui-ranking__score">${Number(team.score) || 0}</span>
      </div>
    `;
  }).join('');

  el.setAttribute('role', 'list');
  el.setAttribute('aria-label', 'Ranking das equipes');

  if (currentTeamId) {
    const currentRow = el.querySelector('.is-current');
    currentRow?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
