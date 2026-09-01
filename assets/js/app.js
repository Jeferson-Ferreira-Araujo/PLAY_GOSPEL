import { Teams } from "./teams.js";
import { icon } from "../../playgospel-ui/js/core.js";
import { initDropdowns } from "../../playgospel-ui/js/dropdown.js";

// Capa compartilhada: usada quando um jogo não tem capa própria (games.json
// sem "cover") e como fallback se a imagem informada falhar ao carregar.
const DEFAULT_COVER = "assets/img/cover-placeholder.svg";

let allGames = [];
let currentGames = []; // lista atualmente exibida (após busca/categoria) — o carrossel navega sobre ela, não sobre allGames
let modalInstance = null;

const VIEW_KEY = "pg_view_mode";
let preferredView = "carousel"; // escolha do usuário no toggle (persiste)
let carouselIndex = 0;

// Categorias calculadas a partir das tags reais do games.json (case-insensitive).
const CATEGORY_RULES = [
  { key: "biblicos", label: "Bíblicos", match: (tags) => tags.some((t) => t.includes("bíblia")) },
  { key: "musica", label: "Música", match: (tags) => tags.some((t) => t.includes("música") || t.includes("louvor")) },
  { key: "desafios", label: "Desafios", match: (tags) => tags.some((t) => t.includes("desafio")) },
  { key: "memorizacao", label: "Memorização", match: (tags) => tags.some((t) => t.includes("memorização") || t.includes("versículos")) },
];
let activeCategory = "all";

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

document.addEventListener("DOMContentLoaded", async () => {
  modalInstance = new bootstrap.Modal(document.getElementById("gameModal"));

  await loadGames();

  // Jogo em destaque aleatório a cada visita
  if (allGames.length) {
    carouselIndex = Math.floor(Math.random() * allGames.length);
  }

  currentGames = allGames;
  renderGames(allGames);
  renderCarousel(allGames);
  wireCarouselControls();
  renderCategoryPills();

  preferredView = loadPreferredView();
  applyView(preferredView);
  wireViewToggle();

  wireSearch();

  // Teams UI (modal + banner no catálogo + rótulo do botão na navbar)
  wireTeamsModal();
  renderTeamsBanner();
  updateTeamsNavButton();
  window.addEventListener("bibflix:teams:change", renderTeamsBanner);
  window.addEventListener("bibflix:teams:change", updateTeamsNavButton);
});

/* =========================
   LOAD CATALOG
========================= */
async function loadGames() {
  try {
    const res = await fetch("games/games.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    allGames = await res.json();

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

    cardWrap.innerHTML = `
      <div class="game-card" role="button" tabindex="0"
           aria-label="Abrir detalhes do jogo ${escapeAttr(game.title)}">
        <span class="game-card-badge">${escapeHtml(getGameCategory(game))}</span>
        <span class="game-card-fav" title="Favoritos (em breve)" aria-hidden="true">★</span>
        <img src="${escapeAttr(game.cover || DEFAULT_COVER)}" alt="${escapeAttr(game.title)}" onerror="this.onerror=null;this.src='${DEFAULT_COVER}';">
        <div class="game-card-body">
          <div class="game-card-title">${escapeHtml(game.title)}</div>
          <div class="game-card-meta">
            <span>👥 2+ equipes</span>
            <span>⏱ ${escapeHtml(game.duration || "Duração variável")}</span>
          </div>
        </div>
      </div>
    `;

    const card = cardWrap.firstElementChild;

    card.addEventListener("click", () => openGameModal(game));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openGameModal(game);
      }
    });

    grid.appendChild(card);
  });

  const filterInfo = document.getElementById("filterInfo");
  if (filterInfo) {
    filterInfo.textContent =
      games.length === allGames.length ? "" : `Mostrando ${games.length} de ${allGames.length}`;
  }
}

/* =========================
   CARROSSEL 3D
========================= */
function renderCarousel(games) {
  const track = document.getElementById("carouselTrack");
  const dotsWrap = document.getElementById("carouselDots");
  if (!track || !dotsWrap) return;

  track.innerHTML = games.map((game, i) => `
    <div class="pg-carousel-card" data-index="${i}" role="button" tabindex="0"
         aria-label="Abrir detalhes do jogo ${escapeAttr(game.title)}">
      <span class="pg-carousel-card-badge">${escapeHtml(getGameCategory(game))}</span>
      <span class="pg-carousel-card-fav" title="Favoritos (em breve)" aria-hidden="true">★</span>
      <img src="${escapeAttr(game.cover || DEFAULT_COVER)}" alt="${escapeAttr(game.title)}" draggable="false" onerror="this.onerror=null;this.src='${DEFAULT_COVER}';">
      <div class="pg-carousel-card-body">
        <div class="pg-carousel-card-title">${escapeHtml(game.title)}</div>
        <div class="pg-carousel-card-desc">${escapeHtml(game.description ?? "")}</div>
        <div class="pg-carousel-card-meta">
          <span>👥 2+ equipes</span>
          <span>⏱ ${escapeHtml(game.duration || "Duração variável")}</span>
        </div>
        <button type="button" class="pg-carousel-card-play" data-index="${i}">▶ Jogar</button>
      </div>
    </div>
  `).join("");

  track.querySelectorAll(".pg-carousel-card").forEach((card) => {
    const i = Number(card.dataset.index);

    card.addEventListener("click", () => {
      if (i === carouselIndex) {
        openGameModal(games[i]);
      } else {
        goToSlide(i);
      }
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        card.click();
      }
    });
  });

  track.querySelectorAll(".pg-carousel-card-play").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const i = Number(btn.dataset.index);
      openGameModal(games[i]);
    });
  });

  dotsWrap.innerHTML = games.map((_, i) => `
    <button type="button" class="pg-carousel-dot" data-index="${i}" aria-label="Ir para o jogo ${i + 1}"></button>
  `).join("");

  dotsWrap.querySelectorAll(".pg-carousel-dot").forEach((dot) => {
    dot.addEventListener("click", () => goToSlide(Number(dot.dataset.index)));
  });

  updateCarouselPositions(games.length);
}

// Aparência de cada "camada" (centro, 1 de cada lado, 2 de cada lado).
// Ângulos contidos (nunca perto de 90°) para não deformar os cards mais afastados.
const CAROUSEL_LAYERS = [
  { xFactor: 0,    rot: 0,  scale: 1,    opacity: 1,    z: 10 },
  { xFactor: 0.66, rot: 30, scale: 0.82, opacity: 0.88, z: 8 },
  { xFactor: 1.18, rot: 38, scale: 0.62, opacity: 0.45, z: 6 },
];
const CAROUSEL_MAX_OFFSET = CAROUSEL_LAYERS.length - 1; // só mostra 2 de cada lado

function updateCarouselPositions(total) {
  const track = document.getElementById("carouselTrack");
  if (!track || !total) return;

  const cards = track.querySelectorAll(".pg-carousel-card");
  const cardWidth = cards[0]?.getBoundingClientRect().width || 250;

  cards.forEach((card) => {
    const i = Number(card.dataset.index);
    let offset = i - carouselIndex;

    // caminho mais curto (permite "circular" pelas pontas)
    if (offset > total / 2) offset -= total;
    if (offset < -total / 2) offset += total;

    const absOffset = Math.abs(offset);
    card.dataset.offset = offset;

    if (absOffset > CAROUSEL_MAX_OFFSET) {
      card.style.opacity = "0";
      card.style.pointerEvents = "none";
      card.style.zIndex = "0";
      return;
    }

    const sign = Math.sign(offset);
    const layer = CAROUSEL_LAYERS[absOffset];
    const tx = sign * layer.xFactor * cardWidth;
    const rot = -sign * layer.rot;

    card.style.transform = `translateX(${tx}px) rotateY(${rot}deg) scale(${layer.scale})`;
    card.style.opacity = String(layer.opacity);
    card.style.zIndex = String(layer.z);
    card.style.pointerEvents = "auto";
    card.style.filter = absOffset === 0 ? "none" : `brightness(${1 - absOffset * 0.1})`;
  });

  document.querySelectorAll(".pg-carousel-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === carouselIndex);
  });
}

// Recalcula ao redimensionar (largura do card muda entre breakpoints)
let carouselResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(carouselResizeTimer);
  carouselResizeTimer = setTimeout(() => {
    if (currentGames.length) updateCarouselPositions(currentGames.length);
  }, 150);
});

function goToSlide(i) {
  const total = currentGames.length;
  if (!total) return;
  carouselIndex = ((i % total) + total) % total;
  updateCarouselPositions(total);
}

function nextSlide() {
  goToSlide(carouselIndex + 1);
}

function prevSlide() {
  goToSlide(carouselIndex - 1);
}

function wireCarouselControls() {
  document.getElementById("carouselPrev")?.addEventListener("click", prevSlide);
  document.getElementById("carouselNext")?.addEventListener("click", nextSlide);

  document.addEventListener("keydown", (e) => {
    const carouselView = document.getElementById("carouselView");
    if (!carouselView || carouselView.classList.contains("d-none")) return;

    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "ArrowLeft") prevSlide();
    if (e.key === "ArrowRight") nextSlide();
  });
}

/* =========================
   VIEW TOGGLE (Carrossel / Grade)
========================= */
function loadPreferredView() {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "carousel";
  } catch {
    return "carousel";
  }
}

function savePreferredView(view) {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {}
}

function applyView(view) {
  const carouselView = document.getElementById("carouselView");
  const dots = document.getElementById("carouselDots");
  const gridView = document.getElementById("gridView");

  const isGrid = view === "grid";
  carouselView?.classList.toggle("d-none", isGrid);
  dots?.classList.toggle("d-none", isGrid);
  gridView?.classList.toggle("d-none", !isGrid);

  document.querySelectorAll(".pg-view-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function wireViewToggle() {
  document.querySelectorAll(".pg-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      preferredView = btn.dataset.view;
      savePreferredView(preferredView);
      applyView(preferredView);
    });
  });
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
    return `
      <span class="pg-team-pill${leading ? " leading" : ""}" style="--pill-color:${escapeAttr(t.color)}">
        <span class="pg-team-pill-icon">${icon(iconName, { size: 13 })}</span>
        ${escapeHtml(t.name)}
        <span class="pg-team-pill-score">${Number(t.score) || 0}</span>
      </span>
    `;
  }).join("");

  banner.innerHTML = `
    <span class="pg-teams-banner-label">Equipes em jogo</span>
    <div class="pg-teams-banner-teams">${pillsHtml}</div>
    <button type="button" class="pg-teams-banner-manage" data-bs-toggle="modal" data-bs-target="#teamsModal">
      Gerenciar equipes
    </button>
  `;

  banner.classList.remove("d-none");
}

function updateTeamsNavButton() {
  const label = document.getElementById("teamsNavBtnLabel");
  if (!label) return;
  label.textContent = Teams.isEnabled() ? "Editar equipes" : "Criar equipes";
}

/* =========================
   MODAL + CONFIG.JSON
========================= */
async function openGameModal(game) {
  // base info
  document.getElementById("modalTitle").textContent = game.title ?? "Jogo";
  document.getElementById("modalDesc").textContent = game.description ?? "";

  // capa + badge de categoria
  const coverImg = document.getElementById("modalCoverImg");
  coverImg.onerror = null;
  coverImg.src = game.cover || DEFAULT_COVER;
  coverImg.alt = game.title ?? "";
  coverImg.onerror = () => {
    coverImg.onerror = null;
    coverImg.src = DEFAULT_COVER;
  };
  document.getElementById("modalCategoryBadge").textContent = getGameCategory(game);

  // meta: jogadores + duração
  document.getElementById("modalMetaBoxes").innerHTML = `
    <div class="pg-gm-meta-box">
      <span class="pg-gm-meta-icon" aria-hidden="true">${icon("users", { size: 16 })}</span>
      <div>
        <div class="pg-gm-meta-title">2+ jogadores</div>
        <div class="pg-gm-meta-sub">Por equipes</div>
      </div>
    </div>
    <div class="pg-gm-meta-box">
      <span class="pg-gm-meta-icon" aria-hidden="true">${icon("clock", { size: 16 })}</span>
      <div>
        <div class="pg-gm-meta-title">${escapeHtml(game.duration || "Duração variável")}</div>
        <div class="pg-gm-meta-sub">Duração média</div>
      </div>
    </div>
  `;

  // carrega config.json e renderiza as seções (só as que existirem de fato)
  const cfg = await loadGameConfig(game);
  renderModalHowTo(cfg);
  await renderModalSettings(cfg, game);

  // botão jogar => URL com querystring
  const playBtn = document.getElementById("playButton");
  playBtn.onclick = (e) => {
    e.preventDefault();

    const settings = collectModalSettings(cfg);
    saveLastSettings(game.id, settings);

    const url = buildGameUrl(game, settings);
    window.location.href = url;
  };

  modalInstance.show();
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
   BUSCA + CATEGORIAS (filtro unificado)
========================= */
function applyFilters() {
  const input = document.getElementById("searchInput");
  const q = (input?.value || "").trim().toLowerCase();

  let filtered = activeCategory === "all"
    ? allGames
    : allGames.filter((g) => matchesCategory(g, activeCategory));

  if (q) {
    filtered = filtered.filter((g) => {
      const text = [g.title, g.description, ...(g.tags ?? [])].join(" ").toLowerCase();
      return text.includes(q);
    });
  }

  currentGames = filtered;
  renderGames(filtered);

  // O carrossel também acompanha o filtro em tempo real
  carouselIndex = 0;
  renderCarousel(filtered);

  const hasResults = filtered.length > 0;
  document.getElementById("carouselView")?.classList.toggle("d-none", !hasResults || preferredView === "grid");
  document.getElementById("carouselDots")?.classList.toggle("d-none", !hasResults || preferredView === "grid");
  document.getElementById("gridView")?.classList.toggle("d-none", !hasResults || preferredView === "carousel");
}

function wireSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", applyFilters);
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
  const status = document.getElementById("teamsStatus");
  const btnSave = document.getElementById("btnTeamsSave");
  if (!status) return;

  const enabled = Teams.isEnabled();
  status.classList.toggle("active", enabled);

  if (!enabled) {
    status.innerHTML = `<span class="pg-status-dot"></span>Desativadas`;
    if (btnSave) btnSave.textContent = "Criar equipes";
    return;
  }

  status.innerHTML = `<span class="pg-status-dot"></span>Ativo • ${Teams.scoreLine()}`;
  if (btnSave) btnSave.textContent = "Salvar alterações";
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
      <input
        type="color"
        class="pg-team-color"
        data-team-color="${i}"
        value="${escapeAttr(colorVal)}"
        aria-label="Cor da equipe ${i + 1}"
      />
      <div class="pgui-dropdown pg-team-icon-dropdown" data-pgui-dropdown data-team-icon-dropdown="${i}">
        <button
          type="button"
          class="pg-team-icon-trigger"
          data-pgui-dropdown-trigger
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-label="Ícone da equipe ${i + 1}"
        ><span data-team-icon-preview="${i}">${icon(iconVal, { size: 16 })}</span></button>
        <div class="pgui-dropdown__menu pg-team-icon-menu" role="listbox">
          ${Teams.teamIconNames.map((name) => `
            <button type="button" class="pgui-dropdown__item pg-team-icon-option" role="option" data-icon-name="${name}" title="${escapeAttr(TEAM_ICON_LABELS[name] || name)}" aria-label="${escapeAttr(TEAM_ICON_LABELS[name] || name)}">
              ${icon(name, { size: 16 })}
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
  btnSave.disabled = !allFilled;

  if (!allFilled) {
    showTeamsError("Preencha o nome de todas as equipes (não pode ficar vazio).");
  } else {
    clearTeamsError();
  }

  return allFilled;
}

function collectTeamsFromForm() {
  const countSel = document.getElementById("teamsCount");
  const count = Number(countSel?.value || 2);

  const teams = [];
  for (let i = 0; i < count; i++) {
    const nameEl = document.querySelector(`[data-team-name="${i}"]`);
    const colorEl = document.querySelector(`[data-team-color="${i}"]`);
    const iconEl = document.querySelector(`[data-team-icon="${i}"]`);

    const name = (nameEl?.value ?? "").trim();
    const color = (colorEl?.value ?? "").trim();
    const iconName = (iconEl?.value ?? "").trim();

    teams.push({ id: `t${i}`, name, color, icon: iconName, score: 0 });
  }
  return teams;
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
  validateTeamsForm();
}

function clearAllNames() {
  const countSel = document.getElementById("teamsCount");
  const count = Number(countSel?.value || 2);

  for (let i = 0; i < count; i++) {
    const input = document.querySelector(`[data-team-name="${i}"]`);
    if (input) input.value = "";
  }
  validateTeamsForm();
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

  const footerActions = document.getElementById("teamsFooterActions");
  const deleteConfirm = document.getElementById("teamsDeleteConfirm");
  const btnDeleteCancel = document.getElementById("btnTeamsDeleteCancel");
  const btnDeleteConfirm = document.getElementById("btnTeamsDeleteConfirm");

  if (!countSel || !teamsModal || !btnSave || !btnReset || !btnDisable) return;

  function hideDeleteConfirm() {
    deleteConfirm?.classList.add("d-none");
    footerActions?.classList.remove("d-none");
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

  // monta form inicial
  buildTeamsForm(Number(countSel.value || 2), true);
  renderTeamsModal();

  // clicar numa opção de quantidade => recria campos
  countToggle?.querySelectorAll(".pg-count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setCount(btn.dataset.count);
      buildTeamsForm(Number(countSel.value || 2), false);
    });
  });

  // valida enquanto digita
  teamsModal.addEventListener("input", (e) => {
    const t = e.target;
    if (t && (t.matches("[data-team-name]") || t.matches("[data-team-color]"))) {
      validateTeamsForm();
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
    if (preview) preview.innerHTML = icon(iconName, { size: 16 });
  });

  // auto
  btnAutoNames?.addEventListener("click", autoFillNames);
  btnClearNames?.addEventListener("click", clearAllNames);

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

  // zerar placar
  btnReset.addEventListener("click", () => {
    Teams.resetScores();
    renderTeamsModal();
  });

  // excluir equipes: pede confirmação inline (em vez de alert nativo)
  btnDisable.addEventListener("click", () => {
    footerActions?.classList.add("d-none");
    deleteConfirm?.classList.remove("d-none");
  });

  btnDeleteCancel?.addEventListener("click", hideDeleteConfirm);

  btnDeleteConfirm?.addEventListener("click", () => {
    Teams.disable();
    renderTeamsModal();
    buildTeamsForm(Number(countSel.value || 2), false);
    hideDeleteConfirm();
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