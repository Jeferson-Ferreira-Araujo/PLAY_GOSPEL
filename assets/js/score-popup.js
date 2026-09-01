// assets/js/score-popup.js
// Popup de placar reaproveitado por todos os jogos — mostrado tanto ao
// sair/encerrar quanto no fim natural do jogo (pedido do usuário: "esse
// placar deve ser exibido sempre ao final ou encerramento da rodada de
// todos os jogos"). Sem equipes ativas não existe placar pra mostrar —
// nesse caso showScorePopup() não faz nada e retorna false, e quem chamou
// deve cair no comportamento de sempre (navegar direto / confirmDialog).
import { Teams } from "./teams.js";
import { renderRanking, openModal, closeModal, icon } from "../../playgospel-ui/js/playgospel-ui.js";

export { closeModal };

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function buildScorePopupBody(teams, highlightId) {
  const wrap = document.createElement("div");
  const sorted = [...(teams || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  const leader = sorted[0];

  if (leader) {
    const iconName = Teams.teamIconNames.includes(leader.icon) ? leader.icon : "star";
    const banner = document.createElement("div");
    banner.className = "pgui-ranking-leader";
    banner.style.setProperty("--team-color", leader.color || "#FFC107");
    const pts = Number(leader.score) || 0;
    banner.innerHTML = `
      <span class="pgui-ranking-leader__icon">${icon(iconName, { size: 24 })}</span>
      <span class="pgui-ranking-leader__label">Na frente</span>
      <span class="pgui-ranking-leader__name">${escapeHtml(leader.name)}</span>
      <span class="pgui-ranking-leader__points">${pts} ${pts === 1 ? "ponto" : "pontos"}</span>
    `;
    wrap.appendChild(banner);
  }

  const rankingEl = document.createElement("div");
  rankingEl.className = "pgui-ranking";
  wrap.appendChild(rankingEl);
  renderRanking(rankingEl, teams, highlightId);

  return wrap;
}

/**
 * Mostra o placar atual num popup (destaque pra equipe líder + ranking
 * completo). Não faz nada e retorna false se não houver equipes ativas.
 * @param {{title?:string, footer?:HTMLElement|string}} [opts]
 * @returns {boolean} true se o popup foi mostrado
 */
export function showScorePopup(opts = {}) {
  if (!Teams.isEnabled()) return false;

  const { title = "🏆 Placar", footer } = opts;
  const state = Teams.getState();
  const current = Teams.currentTeam();

  openModal({
    title,
    body: buildScorePopupBody(state.teams, current?.id),
    footer,
  });
  return true;
}

/** Monta o rodapé padrão "Continuar jogando" / "Sair" usado no popup de
 * saída — o botão de sair recebe o próprio onConfirm de quem chamou. */
export function buildExitFooter(onConfirm) {
  const footer = document.createElement("div");
  footer.className = "pgui-modal__actions";
  footer.innerHTML = `
    <button type="button" class="pgui-btn pgui-btn-ghost" data-role="stay">Continuar jogando</button>
    <button type="button" class="pgui-btn pgui-btn-primary" data-role="exit">Sair</button>
  `;
  footer.querySelector('[data-role="stay"]').addEventListener("click", () => closeModal());
  footer.querySelector('[data-role="exit"]').addEventListener("click", () => {
    closeModal();
    onConfirm();
  });
  return footer;
}

/** Monta o rodapé padrão "Voltar ao catálogo" / "Jogar novamente" usado
 * no popup de fim de jogo. */
export function buildPlayAgainFooter(onPlayAgain) {
  const footer = document.createElement("div");
  footer.className = "pgui-modal__actions";
  footer.innerHTML = `
    <a class="pgui-btn pgui-btn-ghost" href="../../index.html#catalogo">Voltar ao catálogo</a>
    <button type="button" class="pgui-btn pgui-btn-primary" data-role="again">🔁 Jogar novamente</button>
  `;
  footer.querySelector('[data-role="again"]').addEventListener("click", () => {
    closeModal();
    onPlayAgain();
  });
  return footer;
}
