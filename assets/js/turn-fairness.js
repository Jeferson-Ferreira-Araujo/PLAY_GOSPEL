// assets/js/turn-fairness.js
// Escala justa de quem joga cada rodada nos jogos "uma equipe por vez"
// (ver Teams.nextTurn/currentPlayer em teams.js). Corrige dois vieses do
// revezamento sequencial simples (turn = (turn+1) % nEquipes, e o
// ponteiro de integrante avançando sempre na mesma ordem):
//
//  1. Ordem das equipes sempre 1,2,3,1,2,3... — quando o total de
//     rodadas não é múltiplo do nº de equipes, a 1ª equipe do
//     formulário sempre ganhava a rodada "extra".
//  2. Ordem das pessoas dentro de uma equipe sempre a mesma (a ordem em
//     que ficaram no sorteio), nunca embaralhada — e times com muita
//     gente podiam nem chegar a jogar todo mundo dentro de uma partida.
//
// Montada 1x no início de cada partida (buildFairSchedule) e consumida
// por índice de rodada — cada posição já traz a equipe E a pessoa exatas
// daquela rodada, sem repetir ninguém até todo mundo ter jogado.
import { Teams } from "./teams.js";
import { shuffleArray } from "./utils.js";

/** Embaralha uma lista agrupando por chave (ex: equipe) e intercalando —
 * sempre tira do grupo com mais itens restantes, nunca repetindo o grupo
 * do item anterior — assim a mesma equipe nunca joga 2 rodadas seguidas
 * (a menos que ela sozinha tenha mais da metade dos itens, caso em que a
 * repetição é matematicamente inevitável). Um shuffleArray() comum não
 * garante isso: embaralhar uma sequência já alternada (ex: 0,1,0,1...)
 * pode facilmente devolver "0,0,..." de novo. */
function shuffleNoAdjacentRepeats(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const queues = [...groups.values()].map((g) => shuffleArray(g));

  const result = [];
  let lastQueueIndex = -1;
  while (queues.some((q) => q.length)) {
    let pick = -1;
    let bestLen = -1;
    queues.forEach((q, i) => {
      if (!q.length || i === lastQueueIndex) return;
      if (q.length > bestLen) { bestLen = q.length; pick = i; }
    });
    // Só cai aqui se o único grupo com itens restantes for o mesmo do
    // item anterior — repetição inevitável (ex: uma equipe com mais da
    // metade das pessoas sorteadas).
    if (pick === -1) pick = queues.findIndex((q) => q.length);
    result.push(queues[pick].shift());
    lastQueueIndex = pick;
  }
  return result;
}

/**
 * @param {number} minRounds - rodadas mínimas do jogo (ex: 10 — tamanho
 *   padrão do pool de perguntas). Se houver gente sorteada, a escala pode
 *   ficar maior que isso (uma rodada por pessoa), nunca menor — a menos
 *   que forceTeamOnly esteja ligado (ver abaixo).
 * @param {{ forceTeamOnly?: boolean }} [opts] - forceTeamOnly: ignora os
 *   participantes sorteados e usa só a ordem das equipes, mesmo que haja
 *   gente cadastrada — pros jogos onde a resposta não deve ficar restrita
 *   a 1 pessoa só (ex: Qual a Passagem, "qualquer um pode responder").
 * @returns {{ teamIndex: number, playerName: string|null }[]}
 */
export function buildFairSchedule(minRounds, opts = {}) {
  const state = Teams.getState();
  const teams = state.teams || [];
  if (!teams.length) return [];

  const hasMembers = !opts.forceTeamOnly && teams.some((t) => Array.isArray(t.members) && t.members.length);

  if (!hasMembers) {
    // Sem participantes sorteados — só a ordem das equipes importa. Uma
    // rodada por equipe garante turnos iguais; se minRounds não for
    // múltiplo do nº de equipes, sorteia aleatoriamente quais equipes
    // ficam com a rodada extra (em vez de sempre as primeiras do
    // formulário). A intercalação (shuffleNoAdjacentRepeats), não um
    // shuffle comum, garante que a mesma equipe nunca jogue 2 rodadas
    // seguidas — só embaralhar tudo no fim destrói a alternação (ex:
    // "0,1,0,1" embaralhado podia virar "0,0,1,1").
    const teamIndexes = teams.map((_, i) => i);
    const fullCycles = Math.floor(minRounds / teamIndexes.length);
    const remainder = minRounds % teamIndexes.length;
    const extra = shuffleArray(teamIndexes).slice(0, remainder);

    const raw = [];
    for (let c = 0; c < fullCycles; c++) {
      teamIndexes.forEach((teamIndex) => raw.push({ teamIndex, playerName: null }));
    }
    extra.forEach((teamIndex) => raw.push({ teamIndex, playerName: null }));
    return shuffleNoAdjacentRepeats(raw, (e) => e.teamIndex);
  }

  // Com participantes: cada pessoa entra na escala exatamente 1 vez —
  // garante rodadas suficientes pra todo mundo jogar (o comprimento final
  // pode passar de minRounds; quem chama decide se corta pelo tamanho do
  // pool de perguntas disponível). Intercalado por equipe (não um shuffle
  // simples) pra mesma equipe nunca jogar 2 rodadas seguidas, mesmo que
  // ela tenha mais gente sorteada que as outras.
  const people = [];
  teams.forEach((team, teamIndex) => {
    const members = Array.isArray(team.members) && team.members.length ? team.members : [null];
    members.forEach((playerName) => people.push({ teamIndex, playerName }));
  });
  return shuffleNoAdjacentRepeats(people, (e) => e.teamIndex);
}

/**
 * Pra jogos onde o número de "vezes" por rodada não é fixo (ex: Uma
 * Letra — cada letra pode passar por várias equipes até alguém acertar,
 * não dá pra saber de antemão quantas vezes cada equipe vai jogar).
 * Monta, por equipe, uma ordem embaralhada dos índices dos integrantes —
 * consumida 1 por vez (advanceMemberForTeam), reembaralhando sozinha
 * quando todo mundo daquela equipe já jogou nesse ciclo (assim ninguém
 * repete antes de todo mundo da equipe ter tido a vez).
 * @returns {Record<number, { order: number[], pos: number }>}
 */
export function buildMemberQueues() {
  const queues = {};
  (Teams.getState().teams || []).forEach((team, teamIndex) => {
    const n = Array.isArray(team.members) ? team.members.length : 0;
    queues[teamIndex] = { order: n ? shuffleArray([...Array(n).keys()]) : [], pos: 0 };
  });
  return queues;
}

/** Aponta o integrante da vez de uma equipe pro próximo da fila
 * embaralhada (ver buildMemberQueues) — não faz nada se a equipe não
 * tiver participantes sorteados. */
export function advanceMemberForTeam(queues, teamIndex) {
  const q = queues[teamIndex];
  if (!q || !q.order.length) return;
  if (q.pos >= q.order.length) {
    q.order = shuffleArray(q.order);
    q.pos = 0;
  }
  Teams.setMemberIndex(teamIndex, q.order[q.pos]);
  q.pos += 1;
}

/** Aplica uma posição da escala: muda a equipe da vez e, se houver
 * pessoa definida, aponta o ponteiro de integrante direto pra ela (em
 * vez de avançar sequencialmente) — dispara "bibflix:teams:change"
 * (ver Teams.save), então qualquer tela que já escute esse evento pra
 * redesenhar o "vez da equipe" atualiza sozinha. */
export function applyScheduleEntry(entry) {
  if (!entry) return;
  Teams.setTurn(entry.teamIndex);
  if (entry.playerName != null) {
    const team = Teams.getState().teams[entry.teamIndex];
    const idx = team?.members?.indexOf(entry.playerName) ?? -1;
    if (idx >= 0) Teams.setMemberIndex(entry.teamIndex, idx);
  }
}
