import { Teams } from "./teams.js";

let allGames = [];
let modalInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  modalInstance = new bootstrap.Modal(document.getElementById("gameModal"));

  await loadGames();
  renderGames(allGames);
  wireSearch();

  // Teams UI (modal)
  wireTeamsModal();
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
        <img src="${escapeAttr(game.cover)}" alt="${escapeAttr(game.title)}">
        <div class="game-card-body">
          <div class="game-card-title">${escapeHtml(game.title)}</div>
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
   MODAL + CONFIG.JSON
========================= */
async function openGameModal(game) {
  // base info
  document.getElementById("modalTitle").textContent = game.title ?? "Jogo";
  document.getElementById("modalCover").src = game.cover ?? "";
  document.getElementById("modalCover").alt = game.title ?? "Capa";
  document.getElementById("modalDesc").textContent = game.description ?? "";

  // tags
  const tagsWrap = document.getElementById("modalTags");
  tagsWrap.innerHTML = (game.tags ?? [])
    .map((t) => `<span class="badge text-bg-dark border border-secondary">${escapeHtml(t)}</span>`)
    .join("");

  // controls
  const controlsWrap = document.getElementById("modalControls");
  const controls = game.controls ?? [];
  controlsWrap.innerHTML = controls.length
    ? `<ul class="mb-0">${controls.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
    : `<span class="text-secondary">Não informado</span>`;

  // meta
  const meta = document.getElementById("modalMeta");
  meta.textContent = `ID: ${game.id ?? "-"} • Versão: ${game.version ?? "-"}`;

  // carrega config.json e renderiza
  const cfg = await loadGameConfig(game);
  await renderConfigInModal(cfg, game);

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
async function resolveDynamicOptions(game, dynamicKey) {
  if (dynamicKey !== "categories") return [];

  const wordsPath = `games/${game.id}/words.json`;
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
   RENDER CONFIG (async)
========================= */
async function renderConfigInModal(cfg, game) {
  const wrap = document.getElementById("modalConfig");
  if (!wrap) return;

  const settings = Array.isArray(cfg?.settings) ? cfg.settings : [];
  const howTo = Array.isArray(cfg?.howTo) ? cfg.howTo : [];
  const tips = Array.isArray(cfg?.tips) ? cfg.tips : [];

  const saved = loadLastSettings(game.id);

  const fieldBlocks = [];

  if (settings.length > 0) {
    for (const s of settings) {
      const type = String(s.type || "select").toLowerCase();
      const valueSaved = saved?.[s.key];
      const value = valueSaved ?? s.default ?? "";

      if (type === "select") {
        let options = [];

        if (s.dynamic) {
          options = await resolveDynamicOptions(game, s.dynamic);
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
          <div class="mb-3">
            <label class="form-label small text-secondary mb-1">${escapeHtml(s.label ?? s.key)}</label>
            <select class="form-select form-select-sm bg-dark text-light border-secondary"
                    data-setting-key="${escapeAttr(s.key)}">
              ${optionsHtml}
            </select>
            ${s.help ? `<div class="form-text text-secondary">${escapeHtml(s.help)}</div>` : ""}
          </div>
        `);

        continue;
      }

      if (type === "textarea") {
        const rows = Number(s.rows || 4);
        const placeholder = s.placeholder ? escapeAttr(s.placeholder) : "";

        fieldBlocks.push(`
          <div class="mb-3">
            <label class="form-label small text-secondary mb-1">${escapeHtml(s.label ?? s.key)}</label>
            <textarea
              class="form-control form-control-sm bg-dark text-light border-secondary"
              rows="${rows}"
              placeholder="${placeholder}"
              data-setting-key="${escapeAttr(s.key)}"
            >${escapeHtml(String(value))}</textarea>
            ${s.help ? `<div class="form-text text-secondary">${escapeHtml(s.help)}</div>` : ""}
          </div>
        `);

        continue;
      }
    }
  }

  const howToHtml = howTo.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const tipsHtml = tips.map((x) => `<li>${escapeHtml(x)}</li>`).join("");

  if (settings.length === 0 && howTo.length === 0 && tips.length === 0) {
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = `
    <div class="p-3 rounded-3 border border-secondary bg-black">
      ${settings.length ? `
        <div class="fw-semibold mb-2">Configurações</div>
        ${fieldBlocks.join("")}
      ` : ""}

      ${(settings.length && (howTo.length || tips.length)) ? `
        <hr class="border-secondary my-3">
      ` : ""}

      ${howTo.length ? `
        <div class="small text-secondary mb-1">Como jogar</div>
        <ul class="text-secondary mb-3">${howToHtml}</ul>
      ` : ""}

      ${tips.length ? `
        <div class="small text-secondary mb-1">Dicas</div>
        <ul class="text-secondary mb-0">${tipsHtml}</ul>
      ` : ""}
    </div>
  `;
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
   SEARCH
========================= */
function wireSearch() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();

    const filtered = allGames.filter((g) => {
      const text = [g.title, g.description, ...(g.tags ?? [])].join(" ").toLowerCase();
      return text.includes(q);
    });

    renderGames(filtered);
  });
}

function showEmptyState(show) {
  document.getElementById("emptyState").classList.toggle("d-none", !show);
}

/* =========================
   TEAMS MODAL (CATÁLOGO)
========================= */
function renderTeamsModal() {
  const st = Teams.getState();

  const scoreLine = document.getElementById("teamsScoreLine");
  const preview = document.getElementById("teamsPreview");
  const status = document.getElementById("teamsStatus");

  if (!scoreLine || !preview || !status) return;

  if (!Teams.isEnabled()) {
    status.textContent = "Equipes desativadas";
    scoreLine.textContent = "—";
    preview.textContent = "Crie equipes para alternar turnos e registrar pontos.";
    return;
  }

  status.textContent = `Ativo (${st.teams.length} equipes) • pronto para jogar`;
  scoreLine.textContent = Teams.scoreLine();
  preview.textContent = st.teams.map(t => `${t.name}`).join(", ");
}

function buildTeamsForm(count, keepExisting = true) {
  const wrap = document.getElementById("teamsForm");
  const err = document.getElementById("teamsError");
  if (!wrap) return;

  const st = Teams.getState();
  const existing = (keepExisting && st?.teams?.length) ? st.teams : [];

  const names = Teams.suggestedNames(count);
  const colors = Teams.defaultColors(count);

  wrap.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const prev = existing[i];

    const nameVal = (prev?.name && String(prev.name).trim())
      ? prev.name
      : ""; // começa vazio (obrigatório)

    const colorVal = (prev?.color && String(prev.color).trim())
      ? prev.color
      : colors[i];

    const row = document.createElement("div");
    row.className = "d-flex gap-2 align-items-center";

    row.innerHTML = `
      <div class="flex-grow-1">
        <label class="form-label small text-secondary mb-1">Equipe ${i + 1} (nome)</label>
        <input
          type="text"
          class="form-control form-control-sm bg-black text-light border-secondary"
          data-team-name="${i}"
          placeholder="Ex: ${names[i]}"
          value="${escapeAttr(nameVal)}"
        />
      </div>

      <div style="width: 120px">
        <label class="form-label small text-secondary mb-1">Cor</label>
        <input
          type="color"
          class="form-control form-control-sm bg-black border-secondary"
          data-team-color="${i}"
          value="${escapeAttr(colorVal)}"
          style="height: 32px;"
        />
      </div>
    `;

    wrap.appendChild(row);
  }

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

    const name = (nameEl?.value ?? "").trim();
    const color = (colorEl?.value ?? "").trim();

    teams.push({ id: `t${i}`, name, color, score: 0 });
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
  const teamsModal = document.getElementById("teamsModal");

  const btnAutoNames = document.getElementById("btnTeamsAutoNames");


  const btnSave = document.getElementById("btnTeamsSave");
  const btnReset = document.getElementById("btnTeamsReset");
  const btnDisable = document.getElementById("btnTeamsDisable");

  const btnClearNames = document.getElementById("btnTeamsClearNames");

  if (!countSel || !teamsModal || !btnSave || !btnReset || !btnDisable) return;

  const st = Teams.getState();
  if (st.enabled && st.teams?.length >= 2) {
    countSel.value = String(st.teams.length);
  }

  // monta form inicial
  buildTeamsForm(Number(countSel.value || 2), true);
  renderTeamsModal();

  // muda quantidade => recria campos
  countSel.addEventListener("change", () => {
    buildTeamsForm(Number(countSel.value || 2), false);
  });

  // valida enquanto digita
  teamsModal.addEventListener("input", (e) => {
    const t = e.target;
    if (t && (t.matches("[data-team-name]") || t.matches("[data-team-color]"))) {
      validateTeamsForm();
    }
  });

  // auto
  btnAutoNames?.addEventListener("click", autoFillNames);

  btnClearNames?.addEventListener("click", clearAllNames);


  // criar equipes (salvar)
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

  // desativar
  btnDisable.addEventListener("click", () => {
    Teams.disable();
    renderTeamsModal();
    buildTeamsForm(Number(countSel.value || 2), false);
  });

  // re-render ao abrir
teamsModal.addEventListener("shown.bs.modal", () => {
  const st = Teams.getState();
  if (st.enabled && st.teams?.length >= 2) {
    countSel.value = String(st.teams.length);
  }
  buildTeamsForm(Number(countSel.value || 2), true);
  renderTeamsModal();
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