// Tour guiado de primeiro acesso — evidencia as funções mais importantes
// do catálogo (equipes, escolher jogo, sortear, tradução da Bíblia,
// como jogar, divirta-se) com um "spotlight" recortado sobre cada
// elemento. Pulável a qualquer momento (botão "Pular" ou Esc); quem
// concluir ou pular nunca mais vê
// de novo (controle de "visto" fica por conta de quem chama startTour,
// via onEnd — este módulo só cuida da apresentação visual).

const STEPS = [
  {
    selector: "#teamsNavBtn",
    emoji: "👥",
    title: "1. Crie suas equipes",
    text: "Mesmo que seja só você e mais uma pessoa, crie as equipes aqui — dê um nome e uma cor pra cada uma, e sorteie os participantes entre elas se quiser. Nos jogos por turno, a pessoa da vez dentro da equipe também é sorteada a cada rodada.",
  },
  {
    selector: "#gamesGrid",
    emoji: "🎮",
    title: "2. Escolha o jogo",
    text: "Aqui está o catálogo completo. Use os filtros de categoria pra achar mais rápido o estilo que sua turma curte.",
  },
  {
    selector: "#btnDrawGames",
    emoji: "🎲",
    title: "3. Na dúvida, sorteie",
    text: "Sem ideia de qual jogar? Esse botão sorteia 3 jogos pra vocês jogarem em sequência, com o mesmo placar valendo pra todos.",
  },
  {
    selector: "#bibleVersionPickerHeader",
    emoji: "📖",
    title: "4. Escolha a tradução",
    text: "Prefere Almeida ou NTLH? Escolha aqui a tradução da Bíblia — vale para os jogos que citam versículos.",
  },
  {
    selector: "#navHowToBtn",
    emoji: "❓",
    title: "5. Veja como jogar",
    text: "Cada jogo mostra suas instruções antes de começar. E aqui no topo você confere as regras gerais quando quiser.",
  },
  {
    selector: null,
    emoji: "🎉",
    title: "6. Divirta-se!",
    text: "Agora é só reunir seus irmãos, aprender mais da Palavra e se divertir juntos. Dica: durante as partidas, use o ícone de tela cheia no topo do jogo pra aproveitar melhor a tela, principalmente no celular. Deus abençoe!",
  },
];

let state = null;

function buildOverlay() {
  const root = document.createElement("div");
  root.className = "pg-tour-root";
  root.innerHTML = `
    <div class="pg-tour-spotlight" aria-hidden="true"></div>
    <div class="pg-tour-card" role="dialog" aria-modal="true" aria-label="Tour de boas-vindas">
      <button type="button" class="pg-tour-skip" data-tour-skip>Pular tour</button>
      <div class="pg-tour-emoji" data-tour-emoji></div>
      <h3 class="pg-tour-title" data-tour-title></h3>
      <p class="pg-tour-text" data-tour-text></p>
      <div class="pg-tour-footer">
        <div class="pg-tour-dots" data-tour-dots></div>
        <div class="pg-tour-actions">
          <button type="button" class="pgui-btn pgui-btn-ghost pgui-btn-sm pg-tour-btn-prev" data-tour-prev>Anterior</button>
          <button type="button" class="pgui-btn pgui-btn-primary pgui-btn-sm pg-tour-btn-next" data-tour-next></button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function positionForStep(root, step) {
  const spotlight = root.querySelector(".pg-tour-spotlight");
  const card = root.querySelector(".pg-tour-card");
  const target = step.selector ? document.querySelector(step.selector) : null;

  if (!target) {
    // Passo final (ou seletor que sumiu) — sem spotlight, cartão centralizado.
    spotlight.style.display = "none";
    card.classList.add("pg-tour-card--centered");
    card.style.top = "";
    card.style.left = "";
    return;
  }

  card.classList.remove("pg-tour-card--centered");
  target.scrollIntoView({ block: "center", behavior: "auto" });

  const pad = 10;
  const rect = target.getBoundingClientRect();
  spotlight.style.display = "block";
  spotlight.style.top = `${rect.top - pad}px`;
  spotlight.style.left = `${rect.left - pad}px`;
  spotlight.style.width = `${rect.width + pad * 2}px`;
  spotlight.style.height = `${rect.height + pad * 2}px`;

  // Posiciona o cartão embaixo do alvo; se não couber, tenta em cima;
  // sempre preso dentro da viewport (gutter de 16px nas bordas).
  const gutter = 16;
  const cardRect = card.getBoundingClientRect();
  const cardW = cardRect.width || 320;
  const cardH = cardRect.height || 160;

  let top = rect.bottom + pad + 12;
  if (top + cardH > window.innerHeight - gutter) {
    const above = rect.top - pad - 12 - cardH;
    top = above > gutter ? above : Math.max(gutter, window.innerHeight - cardH - gutter);
  }

  let left = rect.left + rect.width / 2 - cardW / 2;
  left = Math.min(Math.max(left, gutter), window.innerWidth - cardW - gutter);

  card.style.top = `${top}px`;
  card.style.left = `${left}px`;
}

function render() {
  const { root, index } = state;
  const step = STEPS[index];

  root.querySelector("[data-tour-emoji]").textContent = step.emoji;
  root.querySelector("[data-tour-title]").textContent = step.title;
  root.querySelector("[data-tour-text]").textContent = step.text;

  const dots = root.querySelector("[data-tour-dots]");
  dots.innerHTML = STEPS.map((_, i) => `<span class="pg-tour-dot${i === index ? " is-active" : ""}"></span>`).join("");

  const prevBtn = root.querySelector("[data-tour-prev]");
  prevBtn.classList.toggle("d-none", index === 0);

  const nextBtn = root.querySelector("[data-tour-next]");
  nextBtn.textContent = index === STEPS.length - 1 ? "Concluir" : "Próximo";

  // Só mede/posiciona depois do texto novo estar no DOM (afeta a altura do
  // cartão) — um frame é suficiente.
  requestAnimationFrame(() => positionForStep(root, step));
}

function goTo(delta) {
  if (!state) return;
  const next = state.index + delta;
  if (next < 0) return;
  if (next >= STEPS.length) {
    end();
    return;
  }
  state.index = next;
  render();
}

function reposition() {
  if (!state) return;
  positionForStep(state.root, STEPS[state.index]);
}

function end() {
  if (!state) return;
  const { root, onEnd } = state;
  window.removeEventListener("resize", reposition);
  window.removeEventListener("scroll", reposition, true);
  document.removeEventListener("keydown", onKeydown);
  root.remove();
  state = null;
  onEnd?.();
}

function onKeydown(e) {
  if (e.key === "Escape") end();
  else if (e.key === "ArrowRight") goTo(1);
  else if (e.key === "ArrowLeft") goTo(-1);
}

/** Inicia o tour guiado. `onEnd` roda ao concluir OU pular (mesmo
 * resultado prático: quem chamou deve marcar como "visto"). Não faz nada
 * se já houver um tour em andamento. */
export function startOnboardingTour({ onEnd } = {}) {
  if (state) return;

  const root = buildOverlay();
  state = { root, index: 0, onEnd };

  root.querySelector("[data-tour-skip]").addEventListener("click", end);
  root.querySelector("[data-tour-prev]").addEventListener("click", () => goTo(-1));
  root.querySelector("[data-tour-next]").addEventListener("click", () => goTo(1));

  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  document.addEventListener("keydown", onKeydown);

  render();
}
