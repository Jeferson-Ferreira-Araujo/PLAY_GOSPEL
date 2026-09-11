// assets/js/game-draw.js
//
// Estado da "disputa sorteada" — 3 jogos aleatórios jogados em sequência,
// com o mesmo placar de equipes valendo pros 3. Guardado em sessionStorage
// (igual às equipes, ver teams.js): fechar o navegador reseta a disputa,
// mas os pontos das equipes continuam (eles moram em bibflix_teams_v1,
// não aqui) — é intencional, sair no meio não deve fazer ninguém perder
// pontuação já conquistada.
//
// Quem inicia a disputa (homepage, ver drawGames() em app.js) já resolve
// os 3 jogos e as configurações aleatórias de cada um (dificuldade etc,
// com o tempo sempre num valor de meio-termo — ver randomizeSettingsForGame)
// antes de chamar start(). Daqui pra frente, score-popup.js consulta esse
// módulo direto (sem precisar de query string na URL) pra saber, em
// qualquer página de jogo: há uma disputa ativa? é a vez deste jogo? é o
// último da disputa?

const KEY = "bibflix_draw_v1";

function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const st = JSON.parse(raw);
    if (!st || !Array.isArray(st.games) || st.games.length !== 3) return null;
    if (typeof st.index !== "number") return null;
    return st;
  } catch {
    return null;
  }
}

function save(st) {
  sessionStorage.setItem(KEY, JSON.stringify(st));
}

// Monta a URL do jogo sempre a partir da ORIGEM do site (não com caminho
// relativo tipo "../x/index.html" resolvido em cima da página atual) —
// de propósito: o formato exato da URL da página atual (com ou sem
// "/index.html" no final, barra final ou não) pode variar conforme o
// host/proxy, e um caminho relativo quebra fácil nesse caso. Como
// game.route no games.json já é sempre relativo à raiz ("games/x/index.html"),
// só prefixa com "/" e resolve contra window.location.origin — funciona
// igual não importa de qual página (catálogo ou outro jogo) for chamado.
function appendSettings(route, settings) {
  const path = "/" + String(route || "").replace(/^\/+/, "");
  const url = new URL(path, window.location.origin);
  url.searchParams.set("play", "1");
  Object.entries(settings || {}).forEach(([k, v]) => url.searchParams.set(k, String(v ?? "")));
  return url.toString();
}

export const GameDraw = {
  /**
   * Começa uma nova disputa sorteada — sobrescreve qualquer uma em
   * andamento (clicar em "Sortear jogos" de novo começa tudo do zero).
   * @param {{id:string, title:string, route:string, settings:object}[]} games — exatamente 3
   * @param {{id:string, score:number}[]} baselineTeams — placar de cada equipe no momento do sorteio, pra apurar o vencedor só da disputa (não do acumulado histórico)
   */
  start(games, baselineTeams) {
    const st = {
      games,
      index: 0,
      baseline: Object.fromEntries((baselineTeams || []).map((t) => [t.id, Number(t.score) || 0])),
      startedAt: new Date().toISOString(),
    };
    save(st);
    return st;
  },

  isActive() {
    return !!load();
  },

  getState() {
    return load();
  },

  /** Jogo da etapa atual da disputa, ou null se não há disputa ativa. */
  currentGame() {
    const st = load();
    return st ? (st.games[st.index] || null) : null;
  },

  /** true se a etapa atual da disputa é o jogo cuja página está aberta agora. */
  isCurrentGame(gameId) {
    const cur = this.currentGame();
    return !!cur && !!gameId && cur.id === gameId;
  },

  isLastGame() {
    const st = load();
    return !!st && st.index >= st.games.length - 1;
  },

  /** Avança pra etapa seguinte e devolve o jogo dela (ou null se já era a última). */
  advance() {
    const st = load();
    if (!st || st.index >= st.games.length - 1) return null;
    st.index += 1;
    save(st);
    return st.games[st.index];
  },

  /** Encerra a disputa (fim natural dos 3 jogos ou interrompida pelo usuário). */
  clear() {
    sessionStorage.removeItem(KEY);
  },

  /** URL completa do jogo (com querystring das configurações sorteadas) —
   * mesmo resultado não importa se chamada a partir do catálogo ou de
   * dentro de outra página de jogo (ver comentário em appendSettings). */
  buildUrl(entry) {
    return appendSettings(entry.route, entry.settings);
  },
};
