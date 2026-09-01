// assets/js/scoreboard-ui.js
import { Teams } from "./teams.js";
import { icon } from "../../playgospel-ui/js/core.js";

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function teamIconName(team) {
  return Teams.teamIconNames.includes(team.icon) ? team.icon : "star";
}

/**
 * Desenha o placar de equipes num container e mantém sincronizado.
 * Clicar num time o torna "o time da vez" e soma 1 ponto.
 * @param {HTMLElement} containerEl
 * @param {{ clickable?: boolean, onChange?: (state: object) => void }} [opts]
 * @returns {() => void} função draw, caso seja necessário forçar um redesenho
 */
export function renderTeamScoreboard(containerEl, opts = {}) {
  const { clickable = true, onChange } = opts;
  if (!containerEl) return () => {};

  function draw() {
    if (!Teams.isEnabled()) {
      containerEl.innerHTML = "";
      containerEl.classList.add("d-none");
      return;
    }

    containerEl.classList.remove("d-none");
    const state = Teams.getState();

    containerEl.innerHTML = state.teams.map((team, index) => `
      <button
        type="button"
        class="team-chip${index === state.turn ? " team-chip-active" : ""}"
        data-index="${index}"
        style="--team-color:${escapeHtml(team.color)}"
        ${clickable ? `title="Marcar ponto para ${escapeHtml(team.name)}" aria-label="Marcar ponto para ${escapeHtml(team.name)}"` : ""}
      >
        <span class="team-chip-icon">${icon(teamIconName(team), { size: 13 })}</span>
        <span class="team-chip-name">${escapeHtml(team.name)}</span>
        <span class="team-chip-score">${Number(team.score) || 0}</span>
      </button>
    `).join("");

    if (clickable) {
      containerEl.querySelectorAll(".team-chip").forEach((el) => {
        el.addEventListener("click", () => {
          const index = Number(el.dataset.index);
          Teams.setTurn(index);
          Teams.addPoint(1);
          onChange?.(Teams.getState());
        });
      });
    }
  }

  draw();
  window.addEventListener("bibflix:teams:change", draw);
  return draw;
}
