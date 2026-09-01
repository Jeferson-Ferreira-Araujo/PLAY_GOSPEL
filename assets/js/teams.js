// assets/js/teams.js
const KEY = "bibflix_teams_v1";
const SESSION_KEY = "bibflix_session_v1";

function ensureSession() {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
    localStorage.removeItem(KEY);
  }
}

function safeState() {
  return { enabled: false, teams: [], turn: 0 };
}

function load() {
  ensureSession();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return safeState();
    const st = JSON.parse(raw);
    if (!st || typeof st !== "object") return safeState();
    if (!Array.isArray(st.teams)) st.teams = [];
    if (typeof st.turn !== "number") st.turn = 0;
    if (typeof st.enabled !== "boolean") st.enabled = false;
    return st;
  } catch {
    return safeState();
  }
}

function save(state) {
  ensureSession();
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent("bibflix:teams:change", { detail: state }));
}

function clampTurn(st) {
  if (!st.teams.length) st.turn = 0;
  else st.turn = ((st.turn % st.teams.length) + st.teams.length) % st.teams.length;
}

function suggestNames(n) {
  const presets = [
    "Leões", "Águias", "Valentes", "Guerreiros", "Sal", "Luz",
    "Discípulos", "Profetas", "Reis", "Atos", "Romanos", "Sião",
    "Oliveira", "Sementes", "Pescadores", "Aliança"
  ];
  const out = [];
  const used = new Set();
  while (out.length < n) {
    const name = presets[Math.floor(Math.random() * presets.length)];
    if (!used.has(name)) {
      used.add(name);
      out.push(name);
    }
  }
  return out;
}

function defaultColors(n) {
  const p = ["#F5C518", "#00C2FF", "#7CFF6B", "#FF6B6B", "#B37CFF", "#FF9F1C"];
  return Array.from({ length: n }, (_, i) => p[i % p.length]);
}

// Nomes de ícones do conjunto já existente em playgospel-ui/js/core.js (ICONS) —
// curadoria voltada ao tema (natureza/força/adoração) em vez de ícones de UI
// genéricos, pra combinar com nomes de equipe como "Leões", "Sal e Luz" etc.
const TEAM_ICON_NAMES = [
  "paw", "flame", "cloud", "tree", "harp",
  "star", "heart", "flag", "book", "crown",
];

function defaultIcons(n) {
  return Array.from({ length: n }, (_, i) => TEAM_ICON_NAMES[i % TEAM_ICON_NAMES.length]);
}

export const Teams = {
  isEnabled() {
    const st = load();
    clampTurn(st);
    return st.enabled && st.teams.length >= 2;
  },

  getState() {
    const st = load();
    clampTurn(st);
    return st;
  },

  // Exposto para UI
  suggestedNames(count = 2) {
    return suggestNames(count);
  },

  // Exposto para UI
  defaultColors(count = 2) {
    return defaultColors(count);
  },

  // Exposto para UI
  teamIconNames: TEAM_ICON_NAMES,

  // Exposto para UI
  defaultIcons(count = 2) {
    return defaultIcons(count);
  },

  // Criação via UI (nomes/cores/ícones custom)
  enableCustom(teams) {
    const cleaned = (teams || []).map((t, i) => ({
      id: t.id ?? `t${i}`,
      name: String(t.name ?? "").trim(),
      color: String(t.color ?? "").trim() || defaultColors(teams.length)[i],
      icon: String(t.icon ?? "").trim() || defaultIcons(teams.length)[i],
      score: Number(t.score ?? 0)
    }));

    const st = {
      enabled: cleaned.length >= 2,
      teams: cleaned,
      turn: 0
    };

    save(st);
    return st;
  },

  // Atalho: sugeridos (um clique)
  enableSuggested(count = 2) {
    const names = suggestNames(count);
    const colors = defaultColors(count);
    const icons = defaultIcons(count);
    const teams = names.map((name, i) => ({ id: `t${i}`, name, color: colors[i], icon: icons[i], score: 0 }));
    return this.enableCustom(teams);
  },

  disable() {
    const st = safeState();
    save(st);
    return st;
  },

  resetScores() {
    const st = load();
    st.teams = (st.teams || []).map(t => ({ ...t, score: 0 }));
    st.turn = 0;
    st.enabled = st.teams.length >= 2;
    save(st);
    return st;
  },

  currentTeam() {
    const st = load();
    clampTurn(st);
    if (!st.enabled || !st.teams.length) return null;
    return st.teams[st.turn];
  },

  nextTurn() {
    const st = load();
    clampTurn(st);
    if (!st.enabled || !st.teams.length) return st;
    st.turn = (st.turn + 1) % st.teams.length;
    save(st);
    return st;
  },

  setTurn(index) {
    const st = load();
    if (!st.enabled || !st.teams.length) return st;
    st.turn = index;
    clampTurn(st);
    save(st);
    return st;
  },

  addPoint(points = 1) {
    const st = load();
    clampTurn(st);
    if (!st.enabled || !st.teams.length) return st;
    st.teams[st.turn].score = Number(st.teams[st.turn].score || 0) + Number(points || 0);
    save(st);
    return st;
  },

  scoreLine() {
    const st = load();
    if (!st.enabled) return "";
    return st.teams.map(t => `${t.name} ${t.score}`).join(" • ");
  }
};