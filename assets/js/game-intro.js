// assets/js/game-intro.js
//
// Modal "como jogar" mostrado ANTES de cada etapa de uma disputa sorteada
// (ver assets/js/game-draw.js) — só faz sentido aí: fora de uma disputa,
// quem chega num jogo pelo catálogo já viu a seção "Como funciona" no
// modal de detalhes antes de clicar em Jogar. Numa disputa sorteada o
// jogo só se revela ao entrar na página dele, então não há chance
// nenhuma de ver isso antes — este modal cobre essa lacuna.
//
// Fundo desfocado (mesmo backdrop-filter:blur do resto dos popups da
// PlayGospel UI) e não-dispensável (sem X, ESC ou clique fora) — o
// jogador só segue em frente clicando "Começar jogo", pra não começar a
// partida (e, principalmente, nenhum timer) escondido atrás do modal.
import { GameDraw } from "./game-draw.js";
import { openModal, closeModal } from "../../playgospel-ui/js/playgospel-ui.js";
import { icon } from "../../playgospel-ui/js/core.js";

// Mesmo mapa de rótulo/ícone usado no selo do card do catálogo (ver
// MATCH_TYPE_META em assets/js/app.js) + a frase que explica a mecânica
// de turno — dado que não existe em lugar nenhum ainda, só o rótulo.
const MATCH_TYPE_INFO = {
  rodada: { icon: "refresh", label: "Rodada", text: "as equipes jogam uma de cada vez, em turnos." },
  disputa: { icon: "flame", label: "Disputa", text: "todas as equipes jogam ao mesmo tempo, disputando a mesma rodada." },
};

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function currentGameIdFromPath() {
  const m = window.location.pathname.match(/\/games\/([^/]+)\/?(?:index\.html)?$/);
  return m ? m[1] : null;
}

function buildHeader(entry, step, total) {
  const wrap = document.createElement("div");
  wrap.className = "pgui-intro-header";
  wrap.innerHTML = `
    <span class="pgui-intro-icon" aria-hidden="true">🎮</span>
    <div class="pgui-intro-heading">
      <div class="pgui-intro-title">${escapeHtml(entry?.title || "Como jogar")}</div>
      <div class="pgui-intro-subtitle">Jogo ${step} de ${total}</div>
    </div>
  `;
  return wrap;
}

function buildBody(entry) {
  const wrap = document.createElement("div");

  const howTo = Array.isArray(entry?.howTo) ? entry.howTo : [];
  const tips = Array.isArray(entry?.tips) ? entry.tips : [];
  const format = MATCH_TYPE_INFO[entry?.matchType];

  let html = `<div class="pgui-intro-section-label">Como jogar</div>`;

  if (format) {
    html += `
      <div class="pgui-intro-format">
        ${icon(format.icon, { size: 14 })}
        <span><b>${format.label}</b> — ${escapeHtml(format.text)}</span>
      </div>
    `;
  }

  if (howTo.length) {
    html += `
      <div class="pgui-intro-box">
        <ol class="pgui-howto-list">${howTo.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      </div>
    `;
  } else {
    html += `<p class="pgui-body">Bora jogar!</p>`;
  }

  if (tips.length) {
    html += `
      <div class="pgui-intro-tip">
        <span aria-hidden="true">💡</span>
        <span><b>Dica:</b> ${escapeHtml(tips[0])}</span>
      </div>
    `;
  }

  wrap.innerHTML = html;
  return wrap;
}

function buildFooter(onConfirm) {
  const footer = document.createElement("div");
  footer.className = "pgui-modal__actions";
  footer.innerHTML = `<button type="button" class="pgui-btn pgui-btn-primary" data-role="ok">Começar jogo →</button>`;
  footer.querySelector('[data-role="ok"]').addEventListener("click", onConfirm);
  return footer;
}

/**
 * Se a página atual for a etapa da vez de uma disputa sorteada, mostra
 * o modal "como jogar" (nome do jogo, formato rodada/disputa, passo a
 * passo e uma dica) e só resolve quando o usuário clicar "Começar jogo"
 * — quem chama deve aguardar essa Promise antes de iniciar a partida de
 * fato. Fora de uma disputa sorteada (ou se essa página não for a etapa
 * esperada), resolve na hora, sem mostrar nada.
 * @returns {Promise<void>}
 */
export function maybeShowDrawIntro() {
  const draw = GameDraw.getState();
  const gameId = currentGameIdFromPath();

  if (!draw || !GameDraw.isCurrentGame(gameId)) return Promise.resolve();

  const entry = draw.games[draw.index];
  const step = draw.index + 1;
  const total = draw.games.length;

  return new Promise((resolve) => {
    openModal({
      title: buildHeader(entry, step, total),
      body: buildBody(entry),
      footer: buildFooter(() => {
        closeModal();
        resolve();
      }),
      dismissable: false,
    });
  });
}
