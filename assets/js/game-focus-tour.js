// assets/js/game-focus-tour.js
// Destaque de primeira vez sobre o bloco de topo do jogo (.presenter-top:
// mostra de quem é a vez, ou quais equipes disputam, e a rodada/pontos).
// Chamado por todo game.js assim que a tela do jogo aparece (startGame()/
// startFromSettings()) — cobre tanto abrir um jogo direto quanto via
// "Sortear jogos" sem precisar de tratamento especial em nenhum dos dois.
// Só aparece uma vez na vida do navegador (localStorage), nunca mais
// depois disso, em nenhum jogo.
import { Teams } from "./teams.js";

const STORAGE_KEY = "bibflix_game_focus_seen_v1";

function hasSeen() {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return true; }
}

function markSeen() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* nada a fazer */ }
}

/** Mostra o spotlight de primeira vez sobre .presenter-top, se ainda não
 * visto e se houver equipes ativas (sem equipes não há "de quem é a vez"
 * pra explicar). Não faz nada nas vezes seguintes. */
export function showTeamsBlockFocus() {
  if (hasSeen()) return;
  if (!Teams.isEnabled()) return;
  const target = document.querySelector(".presenter-top");
  if (!target) return;

  // Marca como visto já na abertura — mesmo se a pessoa recarregar ou
  // sair no meio, não deve reaparecer depois dessa primeira exibição.
  markSeen();

  const root = document.createElement("div");
  root.className = "pg-game-focus-root";
  root.innerHTML = `
    <div class="pg-game-focus-spotlight" aria-hidden="true"></div>
    <div class="pg-game-focus-card" role="dialog" aria-modal="true" aria-label="Dica">
      <p class="pg-game-focus-text">Fique de olho aqui: é onde aparece de quem é a vez (ou quem está disputando) e os detalhes da rodada.</p>
      <button type="button" class="pgui-btn pgui-btn-primary pgui-btn-sm" data-focus-ok>Entendi</button>
    </div>
  `;
  document.body.appendChild(root);

  const spotlight = root.querySelector(".pg-game-focus-spotlight");
  const card = root.querySelector(".pg-game-focus-card");

  function position() {
    const pad = 10;
    const rect = target.getBoundingClientRect();
    spotlight.style.top = `${rect.top - pad}px`;
    spotlight.style.left = `${rect.left - pad}px`;
    spotlight.style.width = `${rect.width + pad * 2}px`;
    spotlight.style.height = `${rect.height + pad * 2}px`;

    const gutter = 16;
    const cardRect = card.getBoundingClientRect();
    const cardH = cardRect.height || 100;
    let top = rect.bottom + pad + 12;
    if (top + cardH > window.innerHeight - gutter) {
      top = Math.max(gutter, rect.top - pad - 12 - cardH);
    }
    let left = rect.left + rect.width / 2 - cardRect.width / 2;
    left = Math.min(Math.max(left, gutter), window.innerWidth - cardRect.width - gutter);
    card.style.top = `${top}px`;
    card.style.left = `${left}px`;
  }

  function close() {
    window.removeEventListener("resize", position);
    window.removeEventListener("scroll", position, true);
    document.removeEventListener("keydown", onKeydown);
    root.remove();
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  root.querySelector("[data-focus-ok]").addEventListener("click", close);
  window.addEventListener("resize", position);
  window.addEventListener("scroll", position, true);
  document.addEventListener("keydown", onKeydown);

  requestAnimationFrame(position);
}
