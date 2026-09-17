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
    // formulário) — e embaralha a posição de tudo, não só blocos
    // repetidos em sequência, pra não virar um padrão previsível.
    const teamIndexes = teams.map((_, i) => i);
    const fullCycles = Math.floor(minRounds / teamIndexes.length);
    const remainder = minRounds % teamIndexes.length;
    const extra = shuffleArray(teamIndexes).slice(0, remainder);

    const schedule = [];
    for (let c = 0; c < fullCycles; c++) {
      teamIndexes.forEach((teamIndex) => schedule.push({ teamIndex, playerName: null }));
    }
    extra.forEach((teamIndex) => schedule.push({ teamIndex, playerName: null }));
    return shuffleArray(schedule);
  }

  // Com participantes: cada pessoa entra na escala exatamente 1 vez, em
  // ordem totalmente aleatória — garante rodadas suficientes pra todo
  // mundo jogar (o comprimento final pode passar de minRounds; quem
  // chama decide se corta pelo tamanho do pool de perguntas disponível).
  const people = [];
  teams.forEach((team, teamIndex) => {
    const members = Array.isArray(team.members) && team.members.length ? team.members : [null];
    members.forEach((playerName) => people.push({ teamIndex, playerName }));
  });
  return shuffleArray(people);
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
