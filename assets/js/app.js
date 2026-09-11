import { Teams } from "./teams.js";
import { GameDraw } from "./game-draw.js";
import { icon } from "../../playgospel-ui/js/core.js";
import { initDropdowns } from "../../playgospel-ui/js/dropdown.js";
import { confirmDialog } from "../../playgospel-ui/js/modal.js";

// Capa compartilhada: usada quando um jogo não tem capa própria (games.json
// sem "cover") e como fallback se a imagem informada falhar ao carregar.
const DEFAULT_COVER = "assets/img/cover-placeholder.svg";

// Formato do jogo (games.json "matchType") — mostrado como selo no canto
// da capa no catálogo. "disputa": todas as equipes competem pela mesma
// pergunta/desafio ao mesmo tempo, quem responder primeiro pontua (ex:
// Palavras Embaralhadas). "rodada": as equipes jogam uma de cada vez, em
// turnos (indicador "Vez de..." dentro do jogo). Jogos sem o campo ainda
// não foram classificados — não mostra selo nesse caso.
const MATCH_TYPE_META = {
  disputa: { label: "Disputa", icon: "flame", sub: "Todas as equipes respondem juntas" },
  rodada: { label: "Rodada", icon: "refresh", sub: "Uma equipe por vez, em turnos" },
};

// Modal de boas-vindas (nome/igreja) — some depois da primeira vez que o
// visitante fecha (de qualquer jeito: X, Enter, Esc, clique fora). Fica em
// localStorage puro (permanente, não por sessão de aba como o Teams) —
// nunca mais aparece pra quem já viu, mesmo fechando e voltando outro dia.
const WELCOME_KEY = "bibflix_visitor_v1";

// App da Web do Google Apps Script (doPost em uma Planilha Google) — pra
// onde os dados do modal de boas-vindas são enviados, se algum campo foi
// preenchido. Best-effort: nunca bloqueia nem quebra a experiência do
// usuário se falhar (rede offline, script removido etc).
const WELCOME_SHEET_URL = "https://script.google.com/macros/s/AKfycbxh45f8NeFzOFDLtnP3lxxF_LP3Ze0mqU2sq28BpUYBv1LvRWLINs34KgDnwE4Pn3KhZw/exec";

// "Trava" simples contra bots genéricos que varrem URLs de Apps Script
// abertas — não impede alguém que vasculhe o JS do site com calma (esse
// token fica público aqui, junto da URL), mas barra a varredura
// automática comum. O doPost() do lado do Script só grava se bater.
const WELCOME_SHEET_TOKEN = "1cddb869b1d3e46c97972c9a41b615485e9e15305256d5a4";

function sendWelcomeToSheet(payload) {
  // Sem nenhum campo preenchido não vale a pena mandar — só uma linha
  // vazia poluindo a planilha (fechar sem preencher continua funcionando
  // normalmente, só não gera registro nenhum).
  if (!payload.name && !payload.whatsapp && !payload.church && !payload.city) return;

  try {
    fetch(WELCOME_SHEET_URL, {
      method: "POST",
      mode: "no-cors", // Apps Script não manda CORS de resposta — não
                        // precisamos ler a resposta mesmo, só disparar.
      body: JSON.stringify({
        ...payload,
        token: WELCOME_SHEET_TOKEN,
        language: navigator.language || "",
        referrer: document.referrer || "",
      }),
    }).catch(() => {}); // falha de rede não deve incomodar o usuário
  } catch {
    // ambiente sem fetch (não deveria acontecer) — ignora silenciosamente
  }
}

let allGames = [];
let currentGames = []; // lista atualmente exibida (após busca/categoria) — o carrossel navega sobre ela, não sobre allGames
let modalInstance = null;
let modalGame = null; // jogo cujo modal está aberto agora (p/ reavaliar o aviso de equipes ao vivo)
let teamMembersModalInstance = null;

// Participantes sorteados por equipe, indexado pela posição no form
// (0..3) — vive só enquanto o modal de Equipes está aberto; some se
// fechar sem salvar. Prefiltrado com o que já tiver sido salvo antes
// (ver buildTeamsForm) e incluído no save final (ver collectTeamsFromForm).
let teamDraw = {};

// Modal de Equipes: uma VISÃO RESUMO (quando já existem equipes — nomes,
// participantes, excluir/zerar) e uma VISÃO ASSISTENTE de 2 passos pra
// criar/editar (quantidade+nomes → participantes, só se pedir sorteio).
// As ações de manutenção não aparecem durante a criação — não faz
// sentido "excluir" ou "zerar placar" de algo que ainda nem existe.
let currentTeamsStep = 1;
// "yes" | "no" | null — resposta de "Quer sortear as pessoas entre as
// equipes?" no passo 1. Só libera Próximo (yes) ou Criar equipes (no)
// depois de escolhida; reseta toda vez que a visão assistente é aberta.
let drawChoice = null;

const TEAMS_STEP_TITLES = {
  1: "Quantidade e equipes",
  2: "Participantes",
};

function showTeamsSummaryView() {
  document.getElementById("teamsSummaryView")?.classList.remove("d-none");
  document.getElementById("teamsWizardView")?.classList.add("d-none");
  document.getElementById("teamsSummaryFooter")?.classList.remove("d-none");
  document.getElementById("teamsWizardFooter")?.classList.add("d-none");
  document.getElementById("teamsDeleteConfirm")?.classList.add("d-none");
  renderTeamsSummary();
}

function showTeamsWizardView() {
  document.getElementById("teamsSummaryView")?.classList.add("d-none");
  document.getElementById("teamsWizardView")?.classList.remove("d-none");
  document.getElementById("teamsSummaryFooter")?.classList.add("d-none");
  document.getElementById("teamsWizardFooter")?.classList.remove("d-none");
  document.getElementById("teamsDeleteConfirm")?.classList.add("d-none");
  drawChoice = null;
  document.querySelectorAll("[data-ask]").forEach((btn) => btn.classList.remove("active"));
  goToTeamsStep(1);
}

function goToTeamsStep(step) {
  currentTeamsStep = step;

  document.querySelectorAll("[data-step-panel]").forEach((panel) => {
    panel.classList.toggle("d-none", Number(panel.dataset.stepPanel) !== step);
  });

  document.querySelectorAll("[data-step-dot]").forEach((dot) => {
    const dotStep = Number(dot.dataset.stepDot);
    dot.classList.toggle("active", dotStep === step);
    dot.classList.toggle("done", dotStep < step);
  });

  const titleEl = document.getElementById("teamsStepTitle");
  if (titleEl) titleEl.textContent = TEAMS_STEP_TITLES[step] ?? "";

  const btnBack = document.getElementById("btnTeamsBack");
  if (step === 1) {
    // "Voltar" no passo 1 só existe se tinha um resumo pra voltar (ou
    // seja, se já existiam equipes antes de entrar no assistente) — numa
    // criação do zero não tem pra onde voltar.
    btnBack?.classList.toggle("d-none", !Teams.isEnabled());
    updateTeamsStep1Cta();
  } else {
    btnBack?.classList.remove("d-none");
    document.getElementById("btnTeamsNext")?.classList.add("d-none");
    renderDrawTeamsPreview();
    updateTeamsStep2Cta();
  }
}

// Só libera "Criar equipes"/"Salvar alterações" no passo 2 depois que
// TODAS as equipes têm participantes sorteados (ou já tinham de uma
// edição anterior — ver teamDraw em buildTeamsForm) — sem isso dava pra
// entrar no passo 2 (respondendo "Sim" pro sorteio) e salvar sem nunca
// ter clicado em "Sortear agora", deixando as equipes sem ninguém apesar
// de ter pedido o sorteio.
function updateTeamsStep2Cta() {
  if (currentTeamsStep !== 2) return;
  const countSel = document.getElementById("teamsCount");
  const count = Number(countSel?.value || 2);
  let complete = true;
  for (let i = 0; i < count; i++) {
    if (!teamDraw[i]?.length) {
      complete = false;
      break;
    }
  }
  document.getElementById("btnTeamsSave")?.classList.toggle("d-none", !complete);
}

// Só libera avançar/criar depois que (a) os nomes estão válidos e (b) a
// pergunta do sorteio foi respondida — Sim mostra "Próximo", Não mostra
// "Criar equipes" direto, e sem responder nenhum dos dois aparece.
function updateTeamsStep1Cta() {
  if (currentTeamsStep !== 1) return;
  const valid = validateTeamsForm();
  document.getElementById("btnTeamsNext")?.classList.toggle("d-none", !(valid && drawChoice === "yes"));
  document.getElementById("btnTeamsSave")?.classList.toggle("d-none", !(valid && drawChoice === "no"));
}

// Categorias calculadas a partir das tags reais do games.json (case-insensitive).
const CATEGORY_RULES = [
  { key: "biblicos", label: "Bíblicos", match: (tags) => tags.some((t) => t.includes("bíblia")) },
  { key: "musica", label: "Música", match: (tags) => tags.some((t) => t.includes("música") || t.includes("louvor")) },
  { key: "desafios", label: "Desafios", match: (tags) => tags.some((t) => t.includes("desafio")) },
  { key: "memorizacao", label: "Conhecimento", match: (tags) => tags.some((t) => t.includes("memorização") || t.includes("versículos")) },
];
let activeCategory = "all";

// Versículos curtos pro rodapé — um sorteado a cada carregamento da
// página (ver renderFooterVerse). Curadoria de versículos bem
// conhecidos e curtos, pra caber numa linha só do rodapé.
const FOOTER_VERSES = [
  "O Senhor é o meu pastor; nada me faltará. — Salmos 23:1",
  "Tudo posso naquele que me fortalece. — Filipenses 4:13",
  "O amor é paciente, o amor é bondoso. — 1 Coríntios 13:4",
  "Porque para Deus nada é impossível. — Lucas 1:37",
  "Entrega o teu caminho ao Senhor; confia nele. — Salmos 37:5",
  "A alegria do Senhor é a vossa força. — Neemias 8:10",
  "Não temas, porque eu sou contigo. — Isaías 41:10",
  "Deem graças ao Senhor, porque ele é bom. — Salmos 107:1",
  "Buscai primeiro o Reino de Deus. — Mateus 6:33",
  "O Senhor é a minha luz e a minha salvação. — Salmos 27:1",
  "Amai-vos uns aos outros. — João 13:34",
  "Tudo tem o seu tempo determinado. — Eclesiastes 3:1",
  "Confia no Senhor de todo o teu coração. — Provérbios 3:5",
  "Alegrai-vos sempre no Senhor. — Filipenses 4:4",
  "A palavra de Deus é lâmpada para os meus pés. — Salmos 119:105",
];

function renderFooterVerse() {
  const el = document.getElementById("footerVerse");
  if (!el) return;
  el.textContent = FOOTER_VERSES[Math.floor(Math.random() * FOOTER_VERSES.length)];
}

// Limite de caracteres pro nome de uma equipe — nomes muito longos
// quebravam o layout dos cards/placar (banner, modal de fim de jogo,
// etc.), então trunca a digitação e barra o "Criar equipes" além disso.
const TEAM_NAME_MAX_LENGTH = 20;

// Letras (com acento — "Águias", "Sião"), números e espaço só — sem
// símbolo/emoji/pontuação, pra não ficar feio nos cards/placar. Qualquer
// caractere fora disso é removido em tempo real (ver sanitizeTeamName).
const TEAM_NAME_INVALID_CHARS = /[^\p{L}\p{N} ]/gu;

function sanitizeTeamName(value) {
  return String(value ?? "").replace(TEAM_NAME_INVALID_CHARS, "");
}

// Nomes em pt-BR pros ícones de equipe (Teams.teamIconNames) — só pra
// acessibilidade/tooltip, a lista de nomes válidos continua vindo do Teams.
const TEAM_ICON_LABELS = {
  paw: "Pata (leão)",
  flame: "Fogo",
  cloud: "Nuvem",
  tree: "Árvore",
  harp: "Harpa",
  star: "Estrela",
  heart: "Coração",
  flag: "Bandeira",
  book: "Livro",
  crown: "Coroa",
  trophy: "Troféu",
  music: "Música",
  "music-note": "Nota musical",
  users: "Pessoas",
  check: "Certo",
};

function getGameCategory(game) {
  const tags = (game.tags ?? []).map((t) => String(t).toLowerCase());
  const rule = CATEGORY_RULES.find((r) => r.match(tags));
  return rule ? rule.label : "Jogo";
}

function matchesCategory(game, key) {
  if (key === "all") return true;
  const tags = (game.tags ?? []).map((t) => String(t).toLowerCase());
  const rule = CATEGORY_RULES.find((r) => r.key === key);
  return rule ? rule.match(tags) : true;
}

/* =========================
   MODAL DE BOAS-VINDAS
========================= */
function wireWelcomeModal() {
  const el = document.getElementById("welcomeModal");
  if (!el) return;

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(WELCOME_KEY) || "null");
  } catch {
    saved = null;
  }

  // Já visto antes (em qualquer visita passada) — nunca mais mostra.
  if (saved && saved.seen) return;

  const nameInput = document.getElementById("welcomeName");
  const whatsappInput = document.getElementById("welcomeWhatsapp");
  const churchInput = document.getElementById("welcomeChurch");
  const cityInput = document.getElementById("welcomeCity");
  const btnEnter = document.getElementById("btnWelcomeEnter");

  // Prefilling defensivo: se por algum motivo já existir um rascunho salvo
  // sem "seen" (não deveria acontecer no fluxo normal), não pede de novo.
  if (saved?.name && nameInput) nameInput.value = saved.name;
  if (saved?.whatsapp && whatsappInput) whatsappInput.value = saved.whatsapp;
  if (saved?.church && churchInput) churchInput.value = saved.church;
  if (saved?.city && cityInput) cityInput.value = saved.city;

  const modal = bootstrap.Modal.getOrCreateInstance(el);

  // Fechar de qualquer jeito (X, Esc, clique fora, ou o botão "Entrar")
  // marca como visto e grava o que estiver preenchido (campos são sempre
  // opcionais) — só precisa gravar uma vez, aqui, não em cada botão.
  el.addEventListener("hidden.bs.modal", () => {
    const payload = {
      name: nameInput?.value.trim() || "",
      whatsapp: whatsappInput?.value.trim() || "",
      church: churchInput?.value.trim() || "",
      city: cityInput?.value.trim() || "",
    };
    localStorage.setItem(
      WELCOME_KEY,
      JSON.stringify({ seen: true, ...payload, seenAt: new Date().toISOString() })
    );
    sendWelcomeToSheet(payload);
  }, { once: true });

  btnEnter?.addEventListener("click", () => modal.hide());

  modal.show();
}

/* =========================
   MODAL "APOIE ESSE PROJETO" — botão de copiar a chave PIX
========================= */
function wireSupportModal() {
  const btn = document.getElementById("btnCopyPix");
  const keyEl = document.getElementById("supportPixKey");
  if (!btn || !keyEl) return;

  const label = btn.querySelector("span");
  const original = label?.textContent || "Copiar";
  let resetTimer = null;

  btn.addEventListener("click", async () => {
    const key = keyEl.textContent.trim();
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      // navegadores sem permissão de clipboard (ou http) — fallback
      const range = document.createRange();
      range.selectNodeContents(keyEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try { document.execCommand("copy"); } catch { /* nada a fazer */ }
      sel.removeAllRanges();
    }
    btn.classList.add("is-copied");
    if (label) label.textContent = "Copiado!";
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      btn.classList.remove("is-copied");
      if (label) label.textContent = original;
    }, 2000);
  });
}

/* =========================
   MODAL DE RETORNO — pra quem já preencheu o cadastro (bibflix_visitor_v1)
   e voltou depois. Mostra, quando faz sentido:
   1. "Bem-vindo de volta, <nome>" + CTA das redes — 1x só, na 1ª volta
      num dia diferente do primeiro acesso.
   2. Aviso de jogo(s) novo(s) — sempre que aparecer jogo que o
      visitante ainda não viu (comparado com o snapshot `knownGames`).
   Roda depois de loadGames() (precisa de allGames).
========================= */
function persistVisitor(v) {
  try {
    localStorage.setItem(WELCOME_KEY, JSON.stringify(v));
  } catch {
    /* localStorage indisponível — sem drama, é best-effort */
  }
}

function maybeShowReturnModal() {
  let v = null;
  try {
    v = JSON.parse(localStorage.getItem(WELCOME_KEY) || "null");
  } catch {
    v = null;
  }
  // Ainda não passou pelo modal de boas-vindas — nada a fazer aqui.
  if (!v || !v.seen) return;

  const el = document.getElementById("returnModal");
  const body = document.getElementById("returnModalBody");
  if (!el || !body) return;

  const firstName = (v.name || "").trim().split(/\s+/)[0] || "";
  const playableIds = allGames.filter((g) => !g.unavailable).map((g) => g.id);

  // --- jogos novos desde a última visita ---
  let newGames = [];
  const hadSnapshot = Array.isArray(v.knownGames);
  if (hadSnapshot) {
    newGames = allGames.filter((g) => !g.unavailable && !v.knownGames.includes(g.id));
  }
  // Sem snapshot ainda (visitante de antes dessa feature): registra o
  // estado atual sem anunciar nada — senão avisaria dos 10 de uma vez.
  if (!hadSnapshot) v.knownGames = playableIds;

  // --- "bem-vindo de volta" (1x, em dia diferente do 1º acesso) ---
  const firstDay = v.seenAt ? new Date(v.seenAt).toDateString() : null;
  const isDifferentDay = firstDay && firstDay !== new Date().toDateString();
  const showWelcomeBack = Boolean(isDifferentDay && !v.welcomeBackShown);

  if (!showWelcomeBack && newGames.length === 0) {
    persistVisitor(v); // pode ter só criado o snapshot
    return;
  }

  const tiktokSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.82c-.9-.8-1.46-1.96-1.46-3.25h-3.1v13.4c0 1.5-1.22 2.72-2.72 2.72a2.72 2.72 0 0 1 0-5.44c.27 0 .53.04.78.11V10.3a5.83 5.83 0 0 0-.78-.05A5.85 5.85 0 0 0 3.4 16.1a5.85 5.85 0 0 0 5.87 5.85 5.85 5.85 0 0 0 5.85-5.85V9.15a8.9 8.9 0 0 0 5.18 1.66V7.7a5.5 5.5 0 0 1-3.7-1.88Z"/></svg>';
  const instaSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';

  let html = "";

  if (showWelcomeBack) {
    html += `
      <div class="pg-return-section">
        <h2 class="pg-return-title">Bem-vindo de volta${firstName ? `, ${escapeHtml(firstName)}` : ""}! 👋</h2>
        <p class="pg-return-text">Esperamos que tenha sido uma experiência incrível usar o Avivaplay.</p>
        <p class="pg-return-text">Dá uma olhada nas nossas redes sociais e deixa um comentário — vamos adorar saber como foi!</p>
        <div class="pg-return-social">
          <a href="https://www.tiktok.com/@avivaplay" target="_blank" rel="noopener noreferrer" class="pg-return-social-btn">${tiktokSvg} TikTok</a>
          <a href="https://www.instagram.com/avivaplay" target="_blank" rel="noopener noreferrer" class="pg-return-social-btn">${instaSvg} Instagram</a>
        </div>
      </div>`;
  }

  if (newGames.length) {
    const titles = newGames.map((g) => `<b>${escapeHtml(g.title)}</b>`);
    const lista = titles.length === 1
      ? `o jogo ${titles[0]}`
      : `${titles.slice(0, -1).join(", ")} e ${titles[titles.length - 1]}`;
    html += `
      <div class="pg-return-section pg-return-section--new">
        <h2 class="pg-return-title">${firstName ? `Ei, ${escapeHtml(firstName)}! ` : ""}Novidade! 🎉</h2>
        <p class="pg-return-text">Adicionamos ${lista} — tô esperando você jogar!</p>
        <div class="pg-return-newgames">
          ${newGames.map((g) => `<button type="button" class="pg-return-game-btn" data-return-game="${escapeAttr(g.id)}">${escapeHtml(g.title)}</button>`).join("")}
        </div>
      </div>`;
  }

  body.innerHTML = html;

  const modal = bootstrap.Modal.getOrCreateInstance(el);

  body.querySelectorAll("[data-return-game]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = allGames.find((x) => x.id === btn.dataset.returnGame);
      modal.hide();
      if (g) openGameModal(g);
    });
  });

  el.addEventListener("hidden.bs.modal", () => {
    if (showWelcomeBack) v.welcomeBackShown = true;
    // Depois de mostrar, tudo que está no catálogo agora vira "conhecido".
    v.knownGames = playableIds;
    persistVisitor(v);
  }, { once: true });

  modal.show();
}

document.addEventListener("DOMContentLoaded", async () => {
  modalInstance = new bootstrap.Modal(document.getElementById("gameModal"));
  teamMembersModalInstance = new bootstrap.Modal(document.getElementById("teamMembersModal"));

  renderFooterVerse();
  wireWelcomeModal();
  wireSupportModal();

  await loadGames();

  currentGames = allGames;
  renderGames(allGames);
  renderCategoryPills();
  maybeShowReturnModal();

  // Teams UI (modal + banner no catálogo + rótulo do botão na navbar)
  wireTeamsModal();
  renderTeamsBanner();
  updateTeamsNavButton();
  window.addEventListener("bibflix:teams:change", renderTeamsBanner);
  window.addEventListener("bibflix:teams:change", updateTeamsNavButton);
  window.addEventListener("bibflix:teams:change", updateModalTeamsGate);

  // Link "Crie as equipes" dentro do aviso do modal de detalhes: fecha
  // este modal e abre o de equipes por cima.
  document.getElementById("modalTeamsWarningLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    modalInstance.hide();
    const teamsModalEl = document.getElementById("teamsModal");
    const teamsModal = bootstrap.Modal.getInstance(teamsModalEl) || new bootstrap.Modal(teamsModalEl);
    teamsModal.show();
  });

  // Sortear jogos (disputa de 3 jogos aleatórios em sequência)
  wireDrawGames();
  maybeAutoRedraw();
});

/* =========================
   LOAD CATALOG
========================= */
// Fisher-Yates — embaralha em vez de só usar Math.random() no sort
// (aquilo tende a distribuição enviesada).
function shuffleArray(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Nova ordem a cada carregamento da página, pra não ficar sempre os
// mesmos jogos primeiro/visíveis.
function shuffleGames(arr) {
  return shuffleArray(arr);
}

// Distribui uma lista de nomes igualmente entre N equipes, em ordem
// aleatória (round-robin depois de embaralhar) — se a divisão não for
// exata, as primeiras equipes ficam com uma pessoa a mais, não é
// problema (pedido explícito do usuário).
function distributeNames(names, teamCount) {
  const buckets = Array.from({ length: teamCount }, () => []);
  shuffleArray(names).forEach((name, i) => {
    buckets[i % teamCount].push(name);
  });
  return buckets;
}

async function loadGames() {
  try {
    const res = await fetch("games/games.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Embaralha os disponíveis, mas jogos "unavailable" (ver games.json)
    // sempre vão pro fim — não misturam com o resto e não sobem pro topo
    // sozinhos de vez em quando. .sort é estável, então cada grupo mantém
    // a ordem embaralhada entre si.
    allGames = shuffleGames(await res.json())
      .sort((a, b) => Number(Boolean(a.unavailable)) - Number(Boolean(b.unavailable)));

    const countEl = document.getElementById("gamesCount");
    if (countEl) countEl.textContent = `${allGames.length} jogo(s) no catálogo`;
  } catch (err) {
    console.error("Falha ao carregar games.json", err);
    const countEl = document.getElementById("gamesCount");
    if (countEl) countEl.textContent = "Erro ao carregar catálogo";
    showEmptyState(true);
  }
}

/* =========================
   RENDER (Netflix-like row)
========================= */
function renderGames(games) {
  const grid = document.getElementById("gamesGrid");
  grid.innerHTML = "";

  showEmptyState(games.length === 0);

  games.forEach((game) => {
    const cardWrap = document.createElement("div");
    const unavailable = Boolean(game.unavailable);
    const matchType = MATCH_TYPE_META[game.matchType];

    // Jogo ainda não liberado: capa em preto-e-branco + selo "Em breve"
    // por cima — o card fica completamente inerte (sem clique, sem foco
    // por teclado, sem abrir o modal); a rota do jogo também redireciona
    // direto pro catálogo se alguém tentar acessar por URL (ver o
    // <script> no topo de games/qual-e-a-musica/index.html).
    cardWrap.innerHTML = `
      <div class="game-card${unavailable ? " is-unavailable" : ""}"${unavailable ? "" : ' role="button" tabindex="0"'}
           aria-disabled="${unavailable}"
           aria-label="${unavailable ? `${escapeAttr(game.title)} — indisponível no momento` : `Abrir detalhes do jogo ${escapeAttr(game.title)}`}">
        <div class="game-card-media">
          <img src="${escapeAttr(game.cover || DEFAULT_COVER)}" alt="${escapeAttr(game.title)}" width="500" height="500" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${DEFAULT_COVER}';">
          ${matchType ? `
            <span class="game-card-matchtype game-card-matchtype--${escapeAttr(game.matchType)}">
              ${icon(matchType.icon, { size: 11 })}
              ${matchType.label}
            </span>
          ` : ""}
          ${unavailable ? `
            <div class="game-card-unavailable">
              <span class="game-card-unavailable-badge">
                ${icon("lock", { size: 12 })}
                Em breve
              </span>
            </div>
          ` : ""}
        </div>
        <div class="game-card-body">
          <div class="game-card-title">${escapeHtml(game.title)}</div>
        </div>
      </div>
    `;

    const card = cardWrap.firstElementChild;

    if (!unavailable) {
      card.addEventListener("click", () => openGameModal(game));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openGameModal(game);
        }
      });
    }

    grid.appendChild(card);
  });

  const filterInfo = document.getElementById("filterInfo");
  if (filterInfo) {
    filterInfo.textContent =
      games.length === allGames.length ? "" : `Mostrando ${games.length} de ${allGames.length}`;
  }
}


/* =========================
   PLACAR DE EQUIPES (banner no catálogo)
========================= */
function renderTeamsBanner() {
  const banner = document.getElementById("teamsBanner");
  if (!banner) return;

  if (!Teams.isEnabled()) {
    banner.classList.add("d-none");
    banner.innerHTML = "";
    return;
  }

  const state = Teams.getState();
  const teams = [...state.teams].sort((a, b) => b.score - a.score);
  const topScore = teams[0]?.score ?? 0;
  const isTie = teams.every((t) => t.score === topScore);

  const pillsHtml = teams.map((t) => {
    const leading = !isTie && t.score === topScore;
    const iconName = Teams.teamIconNames.includes(t.icon) ? t.icon : "star";
    const hasMembers = Array.isArray(t.members) && t.members.length > 0;
    return `
      <div class="pg-team-pill${leading ? " leading" : ""}" style="--pill-color:${escapeAttr(t.color)}">
        <div class="pg-team-pill-info">
          <span class="pg-team-pill-icon">${icon(iconName, { size: 16 })}</span>
          <span class="pg-team-pill-name">${escapeHtml(t.name)}</span>
          ${hasMembers ? `
            <button type="button" class="pg-team-pill-members-btn" data-team-pill-members="${escapeAttr(t.id)}" title="Ver participantes" aria-label="Ver participantes de ${escapeAttr(t.name)}">
              ${icon("users", { size: 13 })}
            </button>
          ` : ""}
        </div>
        <div class="pg-team-pill-score-wrap">
          <div class="pg-team-score-box" title="Pontuação de ${escapeAttr(t.name)}">
            <span class="pg-team-score-value">${Number(t.score) || 0}</span>
            <span class="pg-team-score-label">pts</span>
          </div>
          ${leading ? `<span class="pg-team-pill-leader" title="Na frente">${icon("crown", { size: 14 })}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");

  // Com o máximo de 4 equipes, os cards preenchem a linha toda — nesse
  // caso centraliza (sem esticar) pra não sobrar espaço vazio de um lado
  // só. Com menos equipes (2 ou 3), mantém alinhado à esquerda de
  // propósito (pedido do usuário).
  const isFull = teams.length >= 4;

  banner.innerHTML = `
    <button type="button" class="pg-teams-banner-toggle" id="teamsBannerToggle" aria-expanded="false" aria-controls="teamsBannerTeams">
      <span class="pg-teams-banner-label">
        ${icon("users", { size: 18 })}
        Equipes em jogo
      </span>
      <span class="pg-teams-banner-chevron">${icon("chevron-down", { size: 16 })}</span>
    </button>
    <div class="pg-teams-banner-teams${isFull ? " is-full" : ""}" id="teamsBannerTeams">${pillsHtml}</div>
  `;

  banner.classList.remove("d-none");

  // No mobile, o placar começa fechado (colapsado) pra não empurrar a
  // lista de jogos pra fora da dobra — em telas maiores o CSS ignora
  // esse estado e sempre mostra as equipes (ver @media max-width:600px).
  const toggleBtn = banner.querySelector("#teamsBannerToggle");
  toggleBtn?.addEventListener("click", () => {
    const isOpen = banner.classList.toggle("is-open");
    toggleBtn.setAttribute("aria-expanded", String(isOpen));
  });

  // Botão "ver participantes" de cada card — mesmo modal compartilhado
  // usado dentro do modal de Equipes, populado com os dados já salvos.
  banner.querySelectorAll("[data-team-pill-members]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const teamId = btn.dataset.teamPillMembers;
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;
      openTeamMembersModal({ name: team.name, color: team.color, icon: team.icon, members: team.members });
    });
  });
}

function updateTeamsNavButton() {
  const label = document.getElementById("teamsNavBtnLabel");
  if (!label) return;
  label.textContent = Teams.isEnabled() ? "Editar equipes" : "Criar equipes";
}

/* =========================
   SORTEAR JOGOS — disputa de 3 jogos aleatórios jogados em sequência,
   com o mesmo placar de equipes valendo pros 3 (ver assets/js/game-draw.js
   pro estado, assets/js/game-intro.js pro modal "como jogar" de cada
   etapa, e score-popup.js pro avanço entre etapas dentro do jogo).

   O modal #drawModal abre já animando os 3 blocos (ver runDraw); o único
   passo que espera confirmação do usuário é o botão final "Vamos jogar!".
========================= */
function wireDrawGames() {
  document.getElementById("btnDrawGames")?.addEventListener("click", () => { startDrawFlow(); });

  // Só aqui o primeiro jogo é revelado de fato (a navegação em si já
  // mostra qual é) — nada antes disso denuncia os 3 jogos sorteados.
  document.getElementById("btnStartDraw")?.addEventListener("click", () => {
    const first = GameDraw.currentGame();
    if (first) window.location.href = GameDraw.buildUrl(first);
  });
}

// Depois do 3º jogo, "Sortear novos jogos" (ver buildTournamentFinalFooter
// em score-popup.js) volta pro catálogo com ?sortear=1 — aqui a gente
// detecta isso e dispara um sorteio novo automaticamente (equipes já
// estão ativas nesse ponto).
function maybeAutoRedraw() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("sortear") !== "1") return;

  const url = new URL(window.location.href);
  url.searchParams.delete("sortear");
  window.history.replaceState({}, "", url.toString());

  startDrawFlow();
}

// Clique no botão "Sortear jogos" do catálogo (ou redesenho automático,
// ver maybeAutoRedraw) — checa equipes e, se tudo certo, abre o modal já
// sorteando.
async function startDrawFlow() {
  if (!Teams.isEnabled()) {
    const wantsToCreate = await confirmDialog({
      title: "Crie as equipes primeiro",
      message: "Pra sortear jogos, você precisa ter pelo menos 2 equipes ativas.",
      confirmLabel: "Criar equipes",
      cancelLabel: "Fechar",
    });
    if (wantsToCreate) {
      const teamsModalEl = document.getElementById("teamsModal");
      (bootstrap.Modal.getInstance(teamsModalEl) || new bootstrap.Modal(teamsModalEl)).show();
    }
    return;
  }

  resetDrawModal();
  const modalEl = document.getElementById("drawModal");
  (bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl)).show();
  runDraw();
}

// Volta o modal pro estado inicial — chamado toda vez que ele abre, pra
// não sobrar estado de uma disputa sorteada anterior (blocos
// "assentados", nota "prontos" visível etc.).
function resetDrawModal() {
  document.getElementById("drawModalTitle").textContent = "🎲 Sorteando...";
  document.getElementById("drawReadyNote")?.classList.add("d-none");
  document.getElementById("btnStartDraw")?.classList.add("d-none");

  document.querySelectorAll(".pg-draw-block").forEach((block) => {
    block.classList.remove("is-settled");
    const label = block.querySelector(".pg-draw-block-label");
    if (label) label.textContent = "🎲";
  });
}

// Sorteia de verdade (jogos + configurações) enquanto os 3 blocos animam
// na tela, depois libera o botão "Vamos jogar!".
async function runDraw() {
  // Jogos "em breve" (unavailable) ficam fora do sorteio, óbvio.
  const pool = allGames.filter((g) => !g.unavailable);
  if (pool.length < 3) return; // catálogo pequeno demais — não deveria acontecer

  const chosen = shuffleArray(pool).slice(0, 3);

  // Monta o sorteio de verdade em paralelo com a animação (não trava a
  // UI esperando os fetch de config.json de cada jogo). howTo/matchType
  // vão junto no jogo sorteado — é o que assets/js/game-intro.js usa pra
  // montar o modal "como jogar" de cada etapa (nome, passo a passo e se
  // é rodada ou disputa), sem precisar buscar o config.json/games.json
  // de novo lá na página do jogo.
  //
  // "drawHowTo" (quando existir no config.json) tem prioridade sobre o
  // "howTo" normal — alguns jogos começam o passo a passo com "Escolha a
  // categoria/dificuldade e o tempo", instrução que não faz sentido no
  // sorteio (as configurações já saem sorteadas sozinhas, ver
  // randomizeSettingsForGame). "drawHowTo" é a versão desse passo a
  // passo sem esse primeiro passo.
  const builtPromise = (async () => {
    const built = [];
    for (const game of chosen) {
      const cfg = await loadGameConfig(game);
      const howTo = Array.isArray(cfg?.drawHowTo) ? cfg.drawHowTo : (Array.isArray(cfg?.howTo) ? cfg.howTo : []);
      built.push({
        id: game.id,
        title: game.title,
        route: game.route,
        settings: await randomizeSettingsForGame(game, cfg),
        howTo,
        matchType: game.matchType || null,
      });
    }
    return built;
  })();

  await animateDrawBlocks(pool.map((g) => g.title));
  const built = await builtPromise;

  // Placar de cada equipe no momento do sorteio — o popup final compara
  // com o placar de lá pra cá, pra apurar o vencedor só da disputa (não
  // o acumulado histórico das equipes).
  const baseline = Teams.getState().teams.map((t) => ({ id: t.id, score: t.score }));
  GameDraw.start(built, baseline);

  document.getElementById("drawModalTitle").textContent = "✅ Jogos sorteados!";
  document.getElementById("drawReadyNote")?.classList.remove("d-none");
  document.getElementById("btnStartDraw")?.classList.remove("d-none");
}

// Efeito visual de "sorteando": cada um dos 3 blocos cicla rapidamente
// por nomes de jogos do catálogo (não necessariamente os sorteados de
// verdade — é só pra dar a sensação de aleatoriedade) e "assenta" num
// cadeado em tempos escalonados, tipo caça-níquel. O jogo de verdade só
// é revelado ao entrar nele — o bloco nunca mostra o nome real.
function animateDrawBlocks(candidateTitles) {
  const blocks = [...document.querySelectorAll(".pg-draw-block")];
  if (!blocks.length) return Promise.resolve();

  return new Promise((resolve) => {
    const durations = [900, 1250, 1650]; // cascata: cada bloco assenta em um tempo diferente
    let settledCount = 0;

    blocks.forEach((block, i) => {
      const label = block.querySelector(".pg-draw-block-label");
      const spin = setInterval(() => {
        label.textContent = pickRandom(candidateTitles) || "🎲";
      }, 90);

      setTimeout(() => {
        clearInterval(spin);
        label.textContent = "🔒";
        block.classList.add("is-settled");
        settledCount += 1;
        if (settledCount === blocks.length) resolve();
      }, durations[i] ?? 1650);
    });
  });
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Pro tempo de resposta especificamente, nunca sorteia o extremo mais
// curto nem o mais longo — sempre um valor de meio-termo, pra não juntar
// dificuldade alta com tempo curto (ou fácil com tempo longo demais).
// "0" (sem tempo) fica de fora do cálculo por ser um extremo também.
function pickBalancedTime(values) {
  const nums = values
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b);
  if (!nums.length) return values[0];
  return nums[Math.floor((nums.length - 1) / 2)];
}

// Monta as configurações da rodada sorteada pra um jogo, no mesmo formato
// que collectModalSettings() produz a partir do formulário do modal —
// mas escolhendo os valores sozinho em vez de ler campos da tela:
// dificuldade/categoria saem aleatórias, tempo sai equilibrado
// (pickBalancedTime), e campos de texto livre (word-list etc.) mantêm o
// padrão do jogo — não faz sentido sortear um texto.
async function randomizeSettingsForGame(game, cfg) {
  const result = {};
  const settings = Array.isArray(cfg?.settings) ? cfg.settings : [];

  for (const s of settings) {
    const type = String(s.type || "select").toLowerCase();

    if (type !== "select") {
      result[s.key] = s.default ?? "";
      continue;
    }

    let values;
    if (s.dynamic) {
      const options = await resolveDynamicOptions(game, s.dynamic, s.dynamicSource);
      values = options.map((opt) => opt.value);
    } else {
      values = (s.options ?? []).map((opt) => (opt && typeof opt === "object" ? opt.value : opt));
    }
    if (!values.length) continue;

    result[s.key] = s.key === "time" ? pickBalancedTime(values) : pickRandom(values);
  }

  return result;
}

/* =========================
   MODAL + CONFIG.JSON
========================= */
async function openGameModal(game) {
  // base info
  document.getElementById("modalTitle").textContent = game.title ?? "Jogo";

  // badge de categoria (a capa não aparece no modal — só nos cards do catálogo)
  document.getElementById("modalCategoryBadge").textContent = getGameCategory(game);

  // meta: formato do jogo (rodada = uma equipe por vez / disputa = todas
  // juntas) — sem isso, ninguém sabia como a dinâmica funciona antes de
  // clicar em Jogar. Jogos sem matchType classificado não mostram nada
  // aqui (melhor vazio do que um selo errado).
  const format = MATCH_TYPE_META[game.matchType];
  document.getElementById("modalMetaBoxes").innerHTML = format ? `
    <div class="pg-gm-meta-box">
      <span class="pg-gm-meta-icon" aria-hidden="true">${icon(format.icon, { size: 16 })}</span>
      <div>
        <div class="pg-gm-meta-title">${escapeHtml(format.label)}</div>
        <div class="pg-gm-meta-sub">${escapeHtml(format.sub)}</div>
      </div>
    </div>
  ` : "";

  // carrega config.json e renderiza as seções (só as que existirem de fato)
  const cfg = await loadGameConfig(game);
  renderModalHowTo(cfg);
  await renderModalSettings(cfg, game);

  // botão jogar => URL com querystring
  const playBtn = document.getElementById("playButton");
  playBtn.onclick = (e) => {
    e.preventDefault();
    if (playBtn.classList.contains("disabled")) return;

    const settings = collectModalSettings(cfg);
    saveLastSettings(game.id, settings);

    const url = buildGameUrl(game, settings);
    window.location.href = url;
  };

  // Aviso de equipes obrigatórias — a tela de configuração de cada jogo
  // não existe mais (ela bloqueava "Iniciar" sem equipes); esse aviso
  // aqui no modal cumpre o mesmo papel, um passo antes.
  modalGame = game;
  updateModalTeamsGate();

  modalInstance.show();
}

function updateModalTeamsGate() {
  const game = modalGame;
  if (!game) return;

  const unavailableWarning = document.getElementById("modalUnavailableWarning");
  const warning = document.getElementById("modalTeamsWarning");
  const playBtn = document.getElementById("playButton");

  // Jogo indisponível trava o botão sozinho — nem chega a checar equipes
  // (não faz sentido mostrar os dois avisos juntos).
  if (game.unavailable) {
    unavailableWarning?.classList.remove("d-none");
    warning?.classList.add("d-none");
    playBtn?.classList.add("disabled");
    playBtn?.setAttribute("aria-disabled", "true");
    return;
  }
  unavailableWarning?.classList.add("d-none");

  const blocked = Boolean(game.teams?.required) && !Teams.isEnabled();

  warning?.classList.toggle("d-none", !blocked);
  playBtn?.classList.toggle("disabled", blocked);
  playBtn?.setAttribute("aria-disabled", blocked ? "true" : "false");
}

/* carrega games/<id>/config.json (ou game.config no games.json) */
async function loadGameConfig(game) {
  const path = game.config || `games/${game.id}/config.json`;
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* =========================
   DYNAMIC SOURCES (categories)
========================= */
async function resolveDynamicOptions(game, dynamicKey, sourceFile) {
  if (dynamicKey !== "categories") return [];

  const wordsPath = `games/${game.id}/${sourceFile || "words.json"}`;
  try {
    const res = await fetch(wordsPath, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const cats = Array.isArray(data?.categories) ? data.categories : [];
    return cats
      .filter((c) => c && c.id && c.name)
      .map((c) => ({ value: c.id, label: c.name }));
  } catch {
    return [];
  }
}

/* =========================
   RENDER CONFIG (async) — só renderiza as seções que o config.json do
   jogo realmente declara (nada de campo/feature inventado).
========================= */
function renderModalHowTo(cfg) {
  const section = document.getElementById("modalHowToSection");
  const list = document.getElementById("modalHowTo");
  const columns = document.getElementById("modalColumns");
  const items = Array.isArray(cfg?.howTo) ? cfg.howTo : [];

  if (!items.length) {
    section.classList.add("d-none");
    list.innerHTML = "";
    columns?.classList.add("pg-gm-columns--no-right");
    return;
  }

  list.innerHTML = items.map((text, i) => `
    <li>
      <span class="pg-gm-howto-num">${i + 1}</span>
      <span>${escapeHtml(text)}</span>
    </li>
  `).join("");
  section.classList.remove("d-none");
  columns?.classList.remove("pg-gm-columns--no-right");
}

async function renderModalSettings(cfg, game) {
  const section = document.getElementById("modalSettingsSection");
  const wrap = document.getElementById("modalConfig");
  const settings = Array.isArray(cfg?.settings) ? cfg.settings : [];

  if (!settings.length) {
    section.classList.add("d-none");
    wrap.innerHTML = "";
    return;
  }

  const saved = loadLastSettings(game.id);
  const fieldBlocks = [];

  for (const s of settings) {
    const type = String(s.type || "select").toLowerCase();
    const valueSaved = saved?.[s.key];

    if (type === "select") {
      let options = [];

      if (s.dynamic) {
        options = await resolveDynamicOptions(game, s.dynamic, s.dynamicSource);
      } else {
        const raw = s.options ?? [];
        options = raw.map((opt) => {
          if (opt && typeof opt === "object") {
            return { value: opt.value, label: opt.label ?? opt.value };
          }
          return { value: opt, label: opt };
        });
      }

      const finalValue = valueSaved ?? s.default ?? (options[0]?.value ?? "");

      const optionsHtml = options
        .map((opt) => {
          const ov = String(opt.value);
          const selected = String(finalValue) === ov ? "selected" : "";
          return `<option value="${escapeAttr(ov)}" ${selected}>${escapeHtml(String(opt.label))}</option>`;
        })
        .join("");

      fieldBlocks.push(`
        <div class="pgui-field">
          <label class="pgui-field__label">${escapeHtml(s.label ?? s.key)}</label>
          <select class="pgui-select" data-setting-key="${escapeAttr(s.key)}">
            ${optionsHtml}
          </select>
          ${s.help ? `<div class="pg-gm-field-help">${escapeHtml(s.help)}</div>` : ""}
        </div>
      `);

      continue;
    }

    if (type === "textarea") {
      const rows = Number(s.rows || 4);
      const placeholder = s.placeholder ? escapeAttr(s.placeholder) : "";
      const value = valueSaved ?? s.default ?? "";

      fieldBlocks.push(`
        <div class="pgui-field pgui-field--full">
          <label class="pgui-field__label">${escapeHtml(s.label ?? s.key)}</label>
          <textarea
            class="pgui-textarea"
            rows="${rows}"
            placeholder="${placeholder}"
            data-setting-key="${escapeAttr(s.key)}"
          >${escapeHtml(String(value))}</textarea>
          ${s.help ? `<div class="pg-gm-field-help">${escapeHtml(s.help)}</div>` : ""}
        </div>
      `);

      continue;
    }

    if (type === "word-list") {
      const rows = parseWordListValue(valueSaved ?? s.default ?? "");
      if (!rows.length) rows.push("");
      const placeholder = s.placeholder ? escapeAttr(s.placeholder) : "";

      const rowsHtml = rows.map((val) => `
        <div class="pg-gm-wordlist-row">
          <input type="text" class="pgui-input pg-gm-wordlist-input" value="${escapeAttr(val)}" placeholder="${placeholder}">
          <button type="button" class="pg-gm-wordlist-remove" aria-label="Remover palavra">&times;</button>
        </div>
      `).join("");

      fieldBlocks.push(`
        <div class="pgui-field pgui-field--full pg-gm-wordlist">
          <label class="pgui-field__label">${escapeHtml(s.label ?? s.key)}</label>
          <div class="pg-gm-wordlist-items">${rowsHtml}</div>
          <button type="button" class="pg-gm-wordlist-add">+ Adicionar palavra</button>
          <input type="hidden" data-setting-key="${escapeAttr(s.key)}" value="${escapeAttr(rows.filter(Boolean).join(", "))}">
          ${s.help ? `<div class="pg-gm-field-help">${escapeHtml(s.help)}</div>` : ""}
        </div>
      `);

      continue;
    }
  }

  wrap.innerHTML = fieldBlocks.join("");
  wireWordListFields(wrap);
  section.classList.remove("d-none");
}

/* campo "word-list": uma palavra por input, sem depender do usuário
   lembrar de separar por vírgula — o hidden input mantém o valor
   compatível com o formato que collectModalSettings/buildGameUrl já usam. */
function parseWordListValue(text) {
  return String(text || "")
    .split(/[,;\n]/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wireWordListFields(container) {
  container.querySelectorAll(".pg-gm-wordlist").forEach((field) => {
    const itemsWrap = field.querySelector(".pg-gm-wordlist-items");
    const addBtn = field.querySelector(".pg-gm-wordlist-add");
    const hidden = field.querySelector('input[type="hidden"]');
    const placeholder = itemsWrap.querySelector(".pg-gm-wordlist-input")?.placeholder || "";

    function sync() {
      const values = Array.from(itemsWrap.querySelectorAll(".pg-gm-wordlist-input"))
        .map((input) => input.value.trim())
        .filter(Boolean);
      hidden.value = values.join(", ");
    }

    function addRow() {
      const row = document.createElement("div");
      row.className = "pg-gm-wordlist-row";
      row.innerHTML = `
        <input type="text" class="pgui-input pg-gm-wordlist-input" placeholder="${escapeAttr(placeholder)}">
        <button type="button" class="pg-gm-wordlist-remove" aria-label="Remover palavra">&times;</button>
      `;
      itemsWrap.appendChild(row);
      row.querySelector("input").focus();
    }

    addBtn.addEventListener("click", addRow);

    itemsWrap.addEventListener("click", (e) => {
      const removeBtn = e.target.closest(".pg-gm-wordlist-remove");
      if (!removeBtn) return;
      removeBtn.closest(".pg-gm-wordlist-row")?.remove();
      sync();
    });

    itemsWrap.addEventListener("input", sync);

    sync();
  });
}

function collectModalSettings(cfg) {
  const result = {};
  if (!cfg?.settings?.length) return result;

  cfg.settings.forEach((s) => {
    const el = document.querySelector(`[data-setting-key="${CSS.escape(s.key)}"]`);
    if (!el) return;

    let v = (el.value ?? "").trim();

    if (typeof s.default === "number") {
      const n = Number(v);
      if (!Number.isNaN(n)) v = n;
    }

    result[s.key] = v;
  });

  return result;
}

function saveLastSettings(gameId, settings) {
  try {
    localStorage.setItem(`pg_last_${gameId}`, JSON.stringify(settings));
  } catch {}
}

function loadLastSettings(gameId) {
  try {
    const raw = localStorage.getItem(`pg_last_${gameId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function buildGameUrl(game, settings) {
  const url = new URL(game.route ?? "#", window.location.href);
  url.searchParams.set("play", "1");

  Object.entries(settings).forEach(([k, v]) => {
    url.searchParams.set(k, String(v ?? ""));
  });

  return url.toString();
}

/* =========================
   CATEGORIAS (filtro)
========================= */
// Sem busca por texto — todos os jogos já ficam visíveis na tela e os
// filtros de categoria dão conta de achar o que quiser (removida a
// busca por pedido do usuário, 2026-09-09).
function applyFilters() {
  const filtered = activeCategory === "all"
    ? allGames
    : allGames.filter((g) => matchesCategory(g, activeCategory));

  currentGames = filtered;
  renderGames(filtered);
}

function renderCategoryPills() {
  const wrap = document.getElementById("categoryPills");
  if (!wrap) return;

  const rulesWithCount = CATEGORY_RULES
    .map((rule) => ({ ...rule, count: allGames.filter((g) => matchesCategory(g, rule.key)).length }))
    .filter((rule) => rule.count > 0);

  const pills = [
    { key: "all", label: "Todos os jogos", count: allGames.length },
    ...rulesWithCount,
  ];

  wrap.innerHTML = pills.map((p) => `
    <button type="button" class="pg-category-pill${activeCategory === p.key ? " active" : ""}" data-category="${p.key}">
      ${escapeHtml(p.label)}
      <span class="pg-category-pill-count">${p.count}</span>
    </button>
  `).join("");

  wrap.querySelectorAll(".pg-category-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.category;
      renderCategoryPills();
      applyFilters();
    });
  });
}

function showEmptyState(show) {
  document.getElementById("emptyState").classList.toggle("d-none", !show);
}

/* =========================
   TEAMS MODAL (CATÁLOGO)
========================= */
function renderTeamsModal() {
  const btnSave = document.getElementById("btnTeamsSave");
  if (!btnSave) return;

  btnSave.textContent = Teams.isEnabled() ? "Salvar alterações" : "Criar equipes";
}

// Visão "resumo" (abre quando já existem equipes — botão "Editar
// equipes" no header): nome/ícone/cor/placar de cada equipe + quem foi
// sorteado pra ela, se houver. Só leitura — pra mexer de verdade, o
// botão "Editar equipes" do rodapé leva pro assistente.
function renderTeamsSummary() {
  const list = document.getElementById("teamsSummaryList");
  if (!list) return;

  const state = Teams.getState();
  const teams = state.teams ?? [];

  if (!teams.length) {
    list.innerHTML = `<p class="pg-teams-draw-hint">Nenhuma equipe criada ainda.</p>`;
    return;
  }

  list.innerHTML = teams.map((t) => {
    const iconName = Teams.teamIconNames.includes(t.icon) ? t.icon : "star";
    const hasMembers = Array.isArray(t.members) && t.members.length > 0;
    return `
      <div class="pg-team-row-summary">
        <span class="pg-team-row-summary-icon" style="--pill-color:${escapeAttr(t.color)}">${icon(iconName, { size: 15 })}</span>
        <span class="pg-team-row-summary-name">${escapeHtml(t.name)}</span>
        <span class="pg-team-row-summary-score">${Number(t.score) || 0} pts</span>
      </div>
      ${hasMembers ? `
        <div class="pg-team-row-preview" data-team-summary-members="${escapeAttr(t.id)}" style="--pill-color:${escapeAttr(t.color)}" title="Ver todos os participantes">
          <span class="pg-team-row-preview-names">
            ${icon("users", { size: 12 })}
            ${escapeHtml(t.members.join(", "))}
          </span>
        </div>
      ` : ""}
    `;
  }).join("");

  list.querySelectorAll("[data-team-summary-members]").forEach((row) => {
    row.addEventListener("click", () => {
      const team = teams.find((t) => t.id === row.dataset.teamSummaryMembers);
      if (!team) return;
      openTeamMembersModal({ name: team.name, color: team.color, icon: team.icon, members: team.members });
    });
  });
}

function buildTeamsForm(count, keepExisting = true) {
  const wrap = document.getElementById("teamsForm");
  const err = document.getElementById("teamsError");
  if (!wrap) return;

  const st = Teams.getState();
  const existing = (keepExisting && st?.teams?.length) ? st.teams : [];

  const names = Teams.suggestedNames(count);
  const colors = Teams.defaultColors(count);
  const icons = Teams.defaultIcons(count);

  wrap.innerHTML = "";

  // Recomeça o mapa de participantes sorteados a partir do que já tinha
  // sido salvo (mesma posição) — igual à lógica de placar em
  // collectTeamsFromForm. Qualquer sorteio pendente (ainda não aceito)
  // que estivesse em andamento também é descartado, já que os índices
  // podem não corresponder mais depois de trocar a quantidade.
  teamDraw = {};
  for (let i = 0; i < count; i++) {
    if (Array.isArray(existing[i]?.members) && existing[i].members.length) {
      teamDraw[i] = existing[i].members;
    }
  }
  const drawLabel = document.getElementById("btnDrawPeopleLabel");
  if (drawLabel) drawLabel.textContent = "Sortear agora";
  resetDrawNamesList();

  for (let i = 0; i < count; i++) {
    const prev = existing[i];

    const nameVal = (prev?.name && String(prev.name).trim())
      ? prev.name
      : ""; // começa vazio (obrigatório)

    const colorVal = (prev?.color && String(prev.color).trim())
      ? prev.color
      : colors[i];

    const iconVal = (prev?.icon && Teams.teamIconNames.includes(prev.icon))
      ? prev.icon
      : icons[i];

    const row = document.createElement("div");
    row.className = "pg-team-row";

    row.innerHTML = `
      <div class="pg-team-color-wrap" title="Clique pra escolher a cor da equipe">
        <input
          type="color"
          class="pg-team-color"
          data-team-color="${i}"
          value="${escapeAttr(colorVal)}"
          aria-label="Cor da equipe ${i + 1}"
        />
        <span class="pg-team-color-edit" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
        </span>
      </div>
      <div class="pgui-dropdown pg-team-icon-dropdown" data-pgui-dropdown data-team-icon-dropdown="${i}">
        <button
          type="button"
          class="pg-team-icon-trigger"
          data-team-icon-trigger="${i}"
          style="--icon-color:${escapeAttr(colorVal)}"
          data-pgui-dropdown-trigger
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-label="Ícone da equipe ${i + 1} — clique pra trocar"
          title="Clique pra escolher o ícone da equipe"
        ><span data-team-icon-preview="${i}">${icon(iconVal, { size: 20 })}</span></button>
        <div class="pgui-dropdown__menu pg-team-icon-menu" role="listbox">
          ${Teams.teamIconNames.map((name) => `
            <button type="button" class="pgui-dropdown__item pg-team-icon-option${name === iconVal ? " active" : ""}" role="option" data-icon-name="${name}" title="${escapeAttr(TEAM_ICON_LABELS[name] || name)}" aria-label="${escapeAttr(TEAM_ICON_LABELS[name] || name)}">
              ${icon(name, { size: 18 })}
            </button>
          `).join("")}
        </div>
      </div>
      <input type="hidden" data-team-icon="${i}" value="${escapeAttr(iconVal)}">
      <input
        type="text"
        class="pg-team-name-input"
        data-team-name="${i}"
        placeholder="Ex: ${names[i]}"
        value="${escapeAttr(nameVal)}"
        maxlength="${TEAM_NAME_MAX_LENGTH}"
        aria-label="Nome da equipe ${i + 1}"
      />
    `;

    wrap.appendChild(row);
  }

  initDropdowns(wrap);

  if (err) {
    err.classList.add("d-none");
    err.textContent = "";
  }

  // botão criar equipes: revalida sempre que digitar
  validateTeamsForm();
}

function showTeamsError(msg) {
  const err = document.getElementById("teamsError");
  if (!err) return;
  err.textContent = msg;
  err.classList.remove("d-none");
}

function clearTeamsError() {
  const err = document.getElementById("teamsError");
  if (!err) return;
  err.classList.add("d-none");
  err.textContent = "";
}

function validateTeamsForm() {
  const countSel = document.getElementById("teamsCount");
  const btnSave = document.getElementById("btnTeamsSave");
  if (!countSel || !btnSave) return false;

  const count = Number(countSel.value || 2);
  const names = [];

  for (let i = 0; i < count; i++) {
    const input = document.querySelector(`[data-team-name="${i}"]`);
    const name = (input?.value ?? "").trim();
    names.push(name);
  }

  const allFilled = names.every(n => n.length > 0);
  // O input já tem maxlength, mas valida de novo aqui — o maxlength não
  // barra colar um texto maior, só limita a digitação normal.
  const allWithinLimit = names.every(n => n.length <= TEAM_NAME_MAX_LENGTH);
  // A sanitização ao vivo (ver o listener "input" em wireTeamsModal) já
  // remove símbolo/emoji digitado ou colado — isso aqui é só uma trava
  // extra pro caso de o valor vir de outro jeito (ex: nome salvo antes
  // dessa regra existir).
  const allValidChars = names.every(n => sanitizeTeamName(n) === n);
  const valid = allFilled && allWithinLimit && allValidChars;
  btnSave.disabled = !valid;

  if (!allFilled) {
    showTeamsError("Preencha o nome de todas as equipes (não pode ficar vazio).");
  } else if (!allWithinLimit) {
    showTeamsError(`O nome da equipe pode ter no máximo ${TEAM_NAME_MAX_LENGTH} caracteres.`);
  } else if (!allValidChars) {
    showTeamsError("O nome da equipe só pode ter letras, números e espaços.");
  } else {
    clearTeamsError();
  }

  return valid;
}

function collectTeamsFromForm() {
  const countSel = document.getElementById("teamsCount");
  const count = Number(countSel?.value || 2);

  // Mantém o placar de quem já existia (mesma posição do form) — só
  // equipe nova (índice além do que já tinha) começa do zero. Sem isso,
  // editar nome/cor/ícone e salvar zerava a pontuação de todo mundo.
  const existing = Teams.getState()?.teams ?? [];

  const teams = [];
  for (let i = 0; i < count; i++) {
    const nameEl = document.querySelector(`[data-team-name="${i}"]`);
    const colorEl = document.querySelector(`[data-team-color="${i}"]`);
    const iconEl = document.querySelector(`[data-team-icon="${i}"]`);

    const name = (nameEl?.value ?? "").trim();
    const color = (colorEl?.value ?? "").trim();
    const iconName = (iconEl?.value ?? "").trim();
    const score = Number(existing[i]?.score ?? 0);
    // Participantes sorteados (opcional) — mantém o que já tinha sido
    // aceito antes se essa equipe não passou por um novo sorteio agora.
    const members = Array.isArray(teamDraw[i]) ? teamDraw[i] : (existing[i]?.members ?? []);

    teams.push({ id: `t${i}`, name, color, icon: iconName, score, members });
  }
  return teams;
}

/* =========================
   SORTEIO DE PARTICIPANTES ENTRE EQUIPES
========================= */
// Campos separados (um por pessoa) em vez de um textarea com "um nome
// por linha" — a pessoa às vezes esquecia de quebrar linha certinho (ou
// usava vírgula) e o sorteio saía errado juntando/cortando nomes. Um
// input por pessoa não tem como dar esse tipo de erro de digitação.
const DRAW_NAMES_INITIAL_ROWS = 4;

function createDrawNameRow(value = "") {
  const row = document.createElement("div");
  row.className = "pg-teams-draw-name-row";
  row.innerHTML = `
    <input type="text" class="pg-teams-draw-name-input" data-draw-name-input placeholder="Nome da pessoa" value="${escapeAttr(value)}">
    <button type="button" class="pg-teams-draw-name-remove" data-draw-name-remove aria-label="Remover esse campo" title="Remover">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="M6 6 18 18"/></svg>
    </button>
  `;
  return row;
}

function resetDrawNamesList(count = DRAW_NAMES_INITIAL_ROWS) {
  const list = document.getElementById("drawNamesList");
  if (!list) return;
  list.innerHTML = "";
  for (let i = 0; i < count; i++) {
    list.appendChild(createDrawNameRow());
  }
}

function collectDrawNames() {
  return [...document.querySelectorAll("[data-draw-name-input]")]
    .map((input) => input.value.trim())
    .filter((n) => n.length > 0);
}

// Monta, no passo 3, uma versão só-leitura de cada equipe (ícone + nome,
// como está no passo 2) seguida do resultado do sorteio — assim dá pra
// ver quem ficou em cada equipe sem precisar de um bloco de cartões
// separado, mesmo essa etapa estando numa tela própria agora.
function renderDrawTeamsPreview() {
  const wrap = document.getElementById("drawTeamsPreview");
  if (!wrap) return;

  const count = Number(document.getElementById("teamsCount")?.value || 2);
  wrap.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const nameEl = document.querySelector(`[data-team-name="${i}"]`);
    const colorEl = document.querySelector(`[data-team-color="${i}"]`);
    const iconEl = document.querySelector(`[data-team-icon="${i}"]`);
    const name = (nameEl?.value ?? "").trim() || `Equipe ${i + 1}`;
    const colorVal = colorEl?.value ?? "#F4C430";
    const iconVal = Teams.teamIconNames.includes(iconEl?.value) ? iconEl.value : "star";

    const summary = document.createElement("div");
    summary.className = "pg-team-row-summary";
    summary.innerHTML = `
      <span class="pg-team-row-summary-icon" style="--pill-color:${escapeAttr(colorVal)}">${icon(iconVal, { size: 15 })}</span>
      <span class="pg-team-row-summary-name">${escapeHtml(name)}</span>
    `;
    wrap.appendChild(summary);

    const preview = document.createElement("div");
    preview.className = "pg-team-row-preview d-none";
    preview.dataset.teamRowPreview = String(i);
    wrap.appendChild(preview);

    if (teamDraw[i]?.length) {
      updateTeamRowPreview(i, teamDraw[i], colorVal);
    }
  }
}

// Preenche (ou esconde, se ninguém foi sorteado) a linha logo abaixo do
// nome da equipe (no resumo do passo 3) com quem ficou nela.
function updateTeamRowPreview(i, members, color) {
  const preview = document.querySelector(`[data-team-row-preview="${i}"]`);
  if (!preview) return;

  if (!members?.length) {
    preview.classList.add("d-none");
    preview.innerHTML = "";
    return;
  }

  const colorVal = color ?? document.querySelector(`[data-team-color="${i}"]`)?.value ?? "#F4C430";
  preview.style.setProperty("--pill-color", colorVal);
  preview.title = "Ver todos os participantes";
  preview.innerHTML = `
    <span class="pg-team-row-preview-names">
      ${icon("users", { size: 12 })}
      ${escapeHtml(members.join(", "))}
    </span>
  `;
  preview.classList.remove("d-none");
}

// Cada clique em "Sortear agora" já vale como resultado final — sem
// "usar esse sorteio" separado. Grava direto em teamDraw (entra no save
// quando "Criar equipes" for clicado) e atualiza a prévia embaixo de
// cada equipe; clicar de novo (mesmo com gente nova adicionada) só
// reembaralha e substitui o resultado anterior.
function commitDrawResult(buckets) {
  buckets.forEach((members, i) => {
    teamDraw[i] = members;
    updateTeamRowPreview(i, members);
  });
  const drawLabel = document.getElementById("btnDrawPeopleLabel");
  if (drawLabel) drawLabel.textContent = "Sortear novamente";
  updateTeamsStep2Cta();
}

function openTeamMembersModal({ name, color, icon: iconName, members }) {
  const titleEl = document.getElementById("teamMembersModalTitle");
  const listEl = document.getElementById("teamMembersModalList");
  if (!titleEl || !listEl || !teamMembersModalInstance) return;

  const safeIcon = Teams.teamIconNames.includes(iconName) ? iconName : "star";
  titleEl.innerHTML = `
    <span class="pg-team-members-modal-icon" style="--pill-color:${escapeAttr(color || "#F4C430")}">${icon(safeIcon, { size: 16 })}</span>
    ${escapeHtml(name || "Equipe")}
  `;

  listEl.innerHTML = (members?.length ? members : [])
    .map((m) => `<li>${escapeHtml(m)}</li>`)
    .join("") || `<li class="pg-team-members-empty">Nenhum participante sorteado pra essa equipe ainda.</li>`;

  teamMembersModalInstance.show();
}

function autoFillNames() {
  const countSel = document.getElementById("teamsCount");
  const count = Number(countSel?.value || 2);
  const names = Teams.suggestedNames(count);

  for (let i = 0; i < count; i++) {
    const input = document.querySelector(`[data-team-name="${i}"]`);
    if (!input) continue;
    if (!(input.value || "").trim()) input.value = names[i];
  }
  updateTeamsStep1Cta();
}

function clearAllNames() {
  const countSel = document.getElementById("teamsCount");
  const count = Number(countSel?.value || 2);

  for (let i = 0; i < count; i++) {
    const input = document.querySelector(`[data-team-name="${i}"]`);
    if (input) input.value = "";

    // Limpar o nome da equipe também tira quem tinha sido sorteado pra
    // ela — antes só o nome era limpo e a lista de participantes ficava
    // esquecida, associada a um nome que nem existe mais.
    delete teamDraw[i];
    updateTeamRowPreview(i, []);
  }
  updateTeamsStep1Cta();
}


function wireTeamsModal() {
  const countSel = document.getElementById("teamsCount");
  const countToggle = document.getElementById("teamsCountToggle");
  const teamsModal = document.getElementById("teamsModal");

  const btnAutoNames = document.getElementById("btnTeamsAutoNames");
  const btnSave = document.getElementById("btnTeamsSave");
  const btnReset = document.getElementById("btnTeamsReset");
  const btnDisable = document.getElementById("btnTeamsDisable");
  const btnClearNames = document.getElementById("btnTeamsClearNames");

  const summaryFooter = document.getElementById("teamsSummaryFooter");
  const deleteConfirm = document.getElementById("teamsDeleteConfirm");
  const btnDeleteCancel = document.getElementById("btnTeamsDeleteCancel");
  const btnDeleteConfirm = document.getElementById("btnTeamsDeleteConfirm");
  const btnEdit = document.getElementById("btnTeamsEdit");

  const btnBack = document.getElementById("btnTeamsBack");
  const btnNext = document.getElementById("btnTeamsNext");

  if (!countSel || !teamsModal || !btnSave || !btnReset || !btnDisable) return;

  function hideDeleteConfirm() {
    deleteConfirm?.classList.add("d-none");
    summaryFooter?.classList.remove("d-none");
  }

  function syncCountButtons() {
    countToggle?.querySelectorAll(".pg-count-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.count === countSel.value);
    });
  }

  function setCount(n) {
    countSel.value = String(n);
    syncCountButtons();
  }

  const st = Teams.getState();
  if (st.enabled && st.teams?.length >= 2) {
    // Se equipes antigas (de antes do limite de 4) ainda estiverem salvas,
    // o formulário abre já ajustado ao novo teto em vez de quebrar.
    setCount(Math.min(st.teams.length, 4));
  } else {
    syncCountButtons();
  }

  // monta form + decide qual visão mostrar (resumo se já tem equipes,
  // assistente se for criar do zero)
  buildTeamsForm(Number(countSel.value || 2), true);
  renderTeamsModal();
  if (Teams.isEnabled()) {
    showTeamsSummaryView();
  } else {
    showTeamsWizardView();
  }

  // clicar numa opção de quantidade => recria campos
  countToggle?.querySelectorAll(".pg-count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setCount(btn.dataset.count);
      buildTeamsForm(Number(countSel.value || 2), false);
      updateTeamsStep1Cta();
    });
  });

  // ---- Pergunta "Quer sortear as pessoas entre as equipes?" ----
  document.querySelectorAll("[data-ask]").forEach((btn) => {
    btn.addEventListener("click", () => {
      drawChoice = btn.dataset.ask;
      document.querySelectorAll("[data-ask]").forEach((b) => b.classList.toggle("active", b === btn));
      updateTeamsStep1Cta();
    });
  });

  // ---- Navegação entre os 2 passos do assistente ----
  btnBack?.addEventListener("click", () => {
    if (currentTeamsStep === 2) {
      goToTeamsStep(1);
      return;
    }
    // Voltar no passo 1 só aparece quando tinha um resumo pra voltar.
    showTeamsSummaryView();
  });

  btnNext?.addEventListener("click", () => {
    if (!validateTeamsForm() || drawChoice !== "yes") return;
    goToTeamsStep(2);
  });

  // "Editar equipes" na visão resumo => entra no assistente
  btnEdit?.addEventListener("click", () => {
    buildTeamsForm(Number(countSel.value || 2), true);
    showTeamsWizardView();
  });

  // valida enquanto digita
  teamsModal.addEventListener("input", (e) => {
    const t = e.target;
    if (!t) return;

    // Remove símbolo/emoji na hora (também cobre colar texto, que dispara
    // "input" igual) mantendo o cursor no lugar em vez de pular pro fim.
    if (t.matches("[data-team-name]")) {
      const original = t.value;
      const sanitized = sanitizeTeamName(original);
      if (sanitized !== original) {
        const caret = t.selectionStart ?? original.length;
        const removedBeforeCaret = original.slice(0, caret).length - sanitizeTeamName(original.slice(0, caret)).length;
        t.value = sanitized;
        const newCaret = Math.max(0, caret - removedBeforeCaret);
        t.setSelectionRange(newCaret, newCaret);
      }
    }

    if (t.matches("[data-team-name]") || t.matches("[data-team-color]")) {
      updateTeamsStep1Cta();
    }

    // Ícone acompanha a cor da equipe em tempo real — reforça que os dois
    // pertencem à mesma equipe (não são dois controles soltos).
    if (t.matches("[data-team-color]")) {
      const i = t.dataset.teamColor;
      const trigger = document.querySelector(`[data-team-icon-trigger="${i}"]`);
      if (trigger) trigger.style.setProperty("--icon-color", t.value);
    }
  });

  // seleção de ícone (dropdown.js dispara "pgui:dropdown:select" no item clicado)
  teamsModal.addEventListener("pgui:dropdown:select", (e) => {
    const option = e.detail?.item;
    const dropdown = option?.closest("[data-team-icon-dropdown]");
    if (!option || !dropdown) return;

    const i = dropdown.dataset.teamIconDropdown;
    const iconName = option.dataset.iconName;

    const hidden = document.querySelector(`[data-team-icon="${i}"]`);
    if (hidden) hidden.value = iconName;

    const preview = document.querySelector(`[data-team-icon-preview="${i}"]`);
    if (preview) preview.innerHTML = icon(iconName, { size: 20 });

    dropdown.querySelectorAll(".pg-team-icon-option").forEach((opt) => {
      opt.classList.toggle("active", opt === option);
    });
  });

  // auto
  btnAutoNames?.addEventListener("click", autoFillNames);
  btnClearNames?.addEventListener("click", clearAllNames);

  // ---- Passo 2: sorteio de participantes entre as equipes ----
  const drawNamesList = document.getElementById("drawNamesList");
  const btnDrawAddName = document.getElementById("btnDrawAddName");
  const btnDrawPeople = document.getElementById("btnDrawPeople");

  btnDrawAddName?.addEventListener("click", () => {
    drawNamesList?.appendChild(createDrawNameRow());
    drawNamesList?.lastElementChild?.querySelector("input")?.focus();
  });

  // Remover um campo específico (delegado, já que os campos são
  // adicionados dinamicamente) — sempre deixa pelo menos 1 campo, pra
  // não sumir com o painel inteiro.
  drawNamesList?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-draw-name-remove]");
    if (!removeBtn) return;
    if (drawNamesList.children.length <= 1) {
      const input = removeBtn.closest(".pg-teams-draw-name-row")?.querySelector("input");
      if (input) input.value = "";
      return;
    }
    removeBtn.closest(".pg-teams-draw-name-row")?.remove();
  });

  btnDrawPeople?.addEventListener("click", () => {
    const drawErr = document.getElementById("drawError");
    const names = collectDrawNames();
    const count = Number(countSel.value || 2);

    if (names.length === 0) {
      if (drawErr) {
        drawErr.textContent = "Preencha o nome de pelo menos uma pessoa.";
        drawErr.classList.remove("d-none");
      }
      return;
    }

    // Precisa de pelo menos 1 nome por equipe — com 4 equipes e só 3
    // nomes, uma delas ficaria sem ninguém. Bloqueia o sorteio até a
    // quantidade de nomes bater (ou a pessoa reduzir o nº de equipes).
    if (names.length < count) {
      if (drawErr) {
        const faltam = count - names.length;
        // "ou reduza a quantidade de equipes" só faz sentido com 3+ —
        // com 2 (o mínimo) não dá pra reduzir.
        const alternativa = count > 2 ? " (ou reduza a quantidade de equipes)" : "";
        drawErr.textContent = `Você escolheu ${count} equipes, mas digitou só ${names.length} ${names.length === 1 ? "nome" : "nomes"} — faltam pelo menos ${faltam} ${faltam === 1 ? "nome" : "nomes"}${alternativa}.`;
        drawErr.classList.remove("d-none");
      }
      return;
    }
    drawErr?.classList.add("d-none");

    // Sorteia e já grava como resultado final — sem etapa de "aceitar"
    // separada. Clicar de novo (mesmo com gente nova adicionada à
    // lista) reembaralha tudo e substitui o resultado anterior; o que
    // estiver valendo no momento de "Criar equipes" é o que é salvo.
    commitDrawResult(distributeNames(names, count));
  });

  // Clicar na linha "quem ficou aqui" abre o modal com a lista completa
  // (útil quando tem muita gente e o texto trunca).
  teamsModal.addEventListener("click", (e) => {
    const preview = e.target.closest("[data-team-row-preview]");
    if (!preview) return;
    const i = preview.dataset.teamRowPreview;
    const members = teamDraw[i] ?? [];
    if (!members.length) return;

    const nameEl = document.querySelector(`[data-team-name="${i}"]`);
    const colorEl = document.querySelector(`[data-team-color="${i}"]`);
    const iconEl = document.querySelector(`[data-team-icon="${i}"]`);
    openTeamMembersModal({
      name: (nameEl?.value ?? "").trim() || `Equipe ${Number(i) + 1}`,
      color: colorEl?.value,
      icon: iconEl?.value,
      members,
    });
  });

  // criar/salvar equipes
  btnSave.addEventListener("click", () => {
    if (!validateTeamsForm()) return;

    const teams = collectTeamsFromForm();
    Teams.enableCustom(teams);
    renderTeamsModal();

    // fecha modal
    const bsModal = bootstrap.Modal.getInstance(teamsModal) || new bootstrap.Modal(teamsModal);
    bsModal.hide();
  });

  // zerar placar — continua na visão resumo, só atualiza os números
  btnReset.addEventListener("click", () => {
    Teams.resetScores();
    renderTeamsModal();
    renderTeamsSummary();
  });

  // excluir equipes: pede confirmação inline (em vez de alert nativo)
  btnDisable.addEventListener("click", () => {
    summaryFooter?.classList.add("d-none");
    deleteConfirm?.classList.remove("d-none");
  });

  btnDeleteCancel?.addEventListener("click", hideDeleteConfirm);

  btnDeleteConfirm?.addEventListener("click", () => {
    Teams.disable();
    renderTeamsModal();
    setCount(2);
    buildTeamsForm(2, false);
    hideDeleteConfirm();
    // Não sobrou equipe nenhuma — só o assistente de criação faz
    // sentido agora, não tem mais resumo pra mostrar.
    showTeamsWizardView();
  });

  // re-render ao abrir
  teamsModal.addEventListener("shown.bs.modal", () => {
    const st = Teams.getState();
    if (st.enabled && st.teams?.length >= 2) {
      setCount(st.teams.length);
    }
    buildTeamsForm(Number(countSel.value || 2), true);
    renderTeamsModal();
    hideDeleteConfirm();
    // Já tem equipe? Mostra o resumo. Senão, direto pro assistente de criação.
    if (Teams.isEnabled()) {
      showTeamsSummaryView();
    } else {
      showTeamsWizardView();
    }
  });

  // re-render ao mudar via evento
  window.addEventListener("bibflix:teams:change", renderTeamsModal);
}

/* =========================
   HELPERS
========================= */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}