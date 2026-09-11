// assets/js/score-popup.js
// Popup de placar reaproveitado por todos os jogos — mostrado tanto ao
// sair/encerrar quanto no fim natural do jogo (pedido do usuário: "esse
// placar deve ser exibido sempre ao final ou encerramento da rodada de
// todos os jogos"). Sem equipes ativas não existe placar pra mostrar —
// nesse caso showScorePopup() não faz nada e retorna false, e quem chamou
// deve cair no comportamento de sempre (navegar direto / confirmDialog).
import { Teams } from "./teams.js";
import { GameDraw } from "./game-draw.js";
import { renderRanking, openModal, closeModal, icon } from "../../playgospel-ui/js/playgospel-ui.js";

export { closeModal };

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Deriva o id do jogo (ex: "quem-sou-eu") a partir da URL da própria
// página do jogo (games/<id>/index.html) — assim score-popup.js sabe, sem
// precisar de query string nenhuma, se a página atual é a etapa da vez
// numa disputa sorteada (ver assets/js/game-draw.js).
function currentGameIdFromPath() {
  // Aceita tanto "/games/<id>/index.html" e "/games/<id>/" quanto
  // "/games/<id>" sem barra final (hosts que resolvem diretório sem
  // redirecionar pra URL com "/" continuam sendo reconhecidos).
  const m = window.location.pathname.match(/\/games\/([^/]+)\/?(?:index\.html)?$/);
  return m ? m[1] : null;
}

// true só quando existe uma disputa sorteada ativa E a página de jogo
// aberta agora é exatamente a etapa da vez dela — evita "vazar" o modo
// disputa se alguém abrir outro jogo por fora enquanto uma disputa está
// parada no meio (ver buildExitFooter).
function isDrawStep() {
  return GameDraw.isCurrentGame(currentGameIdFromPath());
}

function buildScorePopupBody(teams, highlightId) {
  const wrap = document.createElement("div");
  wrap.className = "pgui-score-popup";
  const sorted = [...(teams || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  const leader = sorted[0];

  if (leader) {
    const iconName = Teams.teamIconNames.includes(leader.icon) ? leader.icon : "star";
    const banner = document.createElement("div");
    banner.className = "pgui-ranking-leader";
    banner.style.setProperty("--team-color", leader.color || "#FFC107");
    const pts = Number(leader.score) || 0;
    banner.innerHTML = `
      <span class="pgui-ranking-leader__trophy" aria-hidden="true">🏆</span>
      <span class="pgui-ranking-leader__icon">${icon(iconName, { size: 24 })}</span>
      <span class="pgui-ranking-leader__label">Na frente</span>
      <span class="pgui-ranking-leader__name">${escapeHtml(leader.name)}</span>
      <span class="pgui-ranking-leader__points">${pts} ${pts === 1 ? "ponto" : "pontos"}</span>
    `;
    wrap.appendChild(banner);
  }

  if ((teams || []).length > 1) {
    const columns = document.createElement("div");
    columns.className = "pgui-score-popup__columns";
    columns.innerHTML = `<span>Equipe</span><span>Pontos</span>`;
    wrap.appendChild(columns);
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

  // Durante uma disputa sorteada, todo popup de placar (saída, fim de
  // jogo, "Placar" sob demanda) ganha o passo atual no título — contexto
  // útil já que os 3 jogos sorteados não têm nome revelado antes da hora.
  const draw = GameDraw.getState();
  const finalTitle = draw && isDrawStep() ? `${title} · Jogo ${draw.index + 1}/${draw.games.length}` : title;

  openModal({
    title: finalTitle,
    body: buildScorePopupBody(state.teams, current?.id),
    footer,
  });
  return true;
}

/** Monta o rodapé padrão "Continuar jogando" / "Sair" usado no popup de
 * saída — o botão de sair recebe o próprio onConfirm de quem chamou.
 * No meio de uma disputa sorteada, avisa que sair interrompe a disputa
 * (os pontos já marcados continuam valendo) e encerra ela antes de sair. */
export function buildExitFooter(onConfirm) {
  const footer = document.createElement("div");
  footer.className = "pgui-modal__actions";

  const inDraw = isDrawStep();

  footer.innerHTML = `
    ${inDraw ? `<p class="pgui-score-popup__note">⚠️ Isso interrompe a disputa sorteada em andamento — os pontos já marcados continuam valendo.</p>` : ""}
    <button type="button" class="pgui-btn pgui-btn-ghost" data-role="stay">Continuar jogando</button>
    <button type="button" class="pgui-btn pgui-btn-primary" data-role="exit">Sair</button>
  `;
  footer.querySelector('[data-role="stay"]').addEventListener("click", () => closeModal());
  footer.querySelector('[data-role="exit"]').addEventListener("click", () => {
    if (inDraw) GameDraw.clear();
    closeModal();
    onConfirm();
  });
  return footer;
}

/** Monta o rodapé padrão "Voltar ao catálogo" / "Jogar novamente" usado
 * no popup de fim de jogo — ou, no meio de uma disputa sorteada, o
 * rodapé de avanço da disputa ("Próximo jogo sorteado" / "Ver placar
 * final" no último dos 3). */
export function buildPlayAgainFooter(onPlayAgain) {
  const footer = document.createElement("div");
  footer.className = "pgui-modal__actions";

  if (isDrawStep()) {
    const isLast = GameDraw.isLastGame();

    footer.innerHTML = isLast
      ? `<button type="button" class="pgui-btn pgui-btn-primary" data-role="final">🏆 Ver placar final</button>`
      : `
        <a class="pgui-btn pgui-btn-ghost" href="../../index.html#catalogo">Voltar ao catálogo</a>
        <button type="button" class="pgui-btn pgui-btn-primary" data-role="next">▶️ Próximo jogo sorteado</button>
      `;

    footer.querySelector('[data-role="next"]')?.addEventListener("click", () => {
      const next = GameDraw.advance();
      if (next) window.location.href = GameDraw.buildUrl(next);
    });
    footer.querySelector('[data-role="final"]')?.addEventListener("click", () => {
      closeModal();
      showTournamentFinalPopup();
    });
    // "Voltar ao catálogo" no meio da disputa (jogo concluído, mas o
    // usuário optou por não continuar pro próximo) também encerra ela —
    // sem confirmação porque, nesse ponto, a rodada em si já terminou.
    footer.querySelector('a[href]')?.addEventListener("click", () => GameDraw.clear());

    return footer;
  }

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

/** Popup final da disputa sorteada (3º jogo concluído): placar acumulado
 * só da disputa (desde o sorteio, não o histórico geral das equipes) +
 * destaque pra equipe vencedora + botões pra sortear de novo ou voltar. */
export function showTournamentFinalPopup() {
  const draw = GameDraw.getState();
  const state = Teams.getState();
  const baseline = draw?.baseline || {};
  GameDraw.clear();

  const withDelta = (state.teams || []).map((t) => ({
    ...t,
    score: Number(t.score || 0) - Number(baseline[t.id] ?? t.score ?? 0),
  }));

  openModal({
    title: "🎉 Disputa encerrada!",
    body: buildTournamentFinalBody(withDelta),
    footer: buildTournamentFinalFooter(),
  });
}

function buildTournamentFinalBody(teamsWithDelta) {
  const wrap = document.createElement("div");
  wrap.className = "pgui-score-popup";

  const sorted = [...teamsWithDelta].sort((a, b) => (b.score || 0) - (a.score || 0));
  const topScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter((t) => (t.score || 0) === topScore);

  const banner = document.createElement("div");
  banner.className = "pgui-ranking-leader";

  if (winners.length === 1) {
    const w = winners[0];
    const iconName = Teams.teamIconNames.includes(w.icon) ? w.icon : "star";
    banner.style.setProperty("--team-color", w.color || "#FFC107");
    banner.innerHTML = `
      <span class="pgui-ranking-leader__trophy" aria-hidden="true">🏆</span>
      <span class="pgui-ranking-leader__icon">${icon(iconName, { size: 24 })}</span>
      <span class="pgui-ranking-leader__label">Vencedor da disputa</span>
      <span class="pgui-ranking-leader__name">${escapeHtml(w.name)}</span>
      <span class="pgui-ranking-leader__points">${w.score} ${w.score === 1 ? "ponto" : "pontos"}</span>
    `;
  } else {
    banner.innerHTML = `
      <span class="pgui-ranking-leader__trophy" aria-hidden="true">🏆</span>
      <span class="pgui-ranking-leader__label">Empate entre ${winners.length} equipes!</span>
    `;
  }
  wrap.appendChild(banner);

  if (teamsWithDelta.length > 1) {
    const columns = document.createElement("div");
    columns.className = "pgui-score-popup__columns";
    columns.innerHTML = `<span>Equipe</span><span>Pontos na disputa</span>`;
    wrap.appendChild(columns);
  }

  const rankingEl = document.createElement("div");
  rankingEl.className = "pgui-ranking";
  wrap.appendChild(rankingEl);
  renderRanking(rankingEl, teamsWithDelta);

  return wrap;
}

function buildTournamentFinalFooter() {
  const footer = document.createElement("div");
  footer.className = "pgui-modal__actions";
  footer.innerHTML = `
    <a class="pgui-btn pgui-btn-ghost" href="../../index.html#catalogo">Voltar ao catálogo</a>
    <a class="pgui-btn pgui-btn-primary" href="../../index.html?sortear=1#catalogo">🎲 Sortear novos jogos</a>
  `;
  return footer;
}
