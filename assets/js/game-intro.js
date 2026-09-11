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
// jogador só segue em frente clicando "Entendi", pra não começar a
// partida (e, principalmente, nenhum timer) escondido atrás do modal.
import { GameDraw } from "./game-draw.js";
import { openModal, closeModal } from "../../playgospel-ui/js/playgospel-ui.js";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function currentGameIdFromPath() {
  const m = window.location.pathname.match(/\/games\/([^/]+)\/?(?:index\.html)?$/);
  return m ? m[1] : null;
}

/**
 * Se a página atual for a etapa da vez de uma disputa sorteada, mostra
 * o modal "como jogar" (nome do jogo no header + passo a passo no body)
 * e só resolve quando o usuário clicar "Entendi" — quem chama deve
 * aguardar essa Promise antes de iniciar a partida de fato. Fora de uma
 * disputa sorteada (ou se essa página não for a etapa esperada), resolve
 * na hora, sem mostrar nada.
 * @returns {Promise<void>}
 */
export function maybeShowDrawIntro() {
  const draw = GameDraw.getState();
  const gameId = currentGameIdFromPath();

  if (!draw || !GameDraw.isCurrentGame(gameId)) return Promise.resolve();

  const entry = draw.games[draw.index];
  const howTo = Array.isArray(entry?.howTo) ? entry.howTo : [];

  return new Promise((resolve) => {
    const body = document.createElement("div");

    if (howTo.length) {
      body.innerHTML = `<ol class="pgui-howto-list">${howTo.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`;
    } else {
      body.innerHTML = `<p class="pgui-body">Bora jogar!</p>`;
    }

    const footer = document.createElement("div");
    footer.className = "pgui-modal__actions";
    footer.innerHTML = `<button type="button" class="pgui-btn pgui-btn-primary" data-role="ok">Entendi</button>`;
    footer.querySelector('[data-role="ok"]').addEventListener("click", () => {
      closeModal();
      resolve();
    });

    openModal({
      title: `🎮 ${entry?.title || "Como jogar"} · Jogo ${draw.index + 1}/${draw.games.length}`,
      body,
      footer,
      dismissable: false,
    });
  });
}
