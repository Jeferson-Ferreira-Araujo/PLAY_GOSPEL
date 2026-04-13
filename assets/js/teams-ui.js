import { Teams } from "./teams.js";

function el(id) {
  return document.getElementById(id);
}

function renderTeamsModal() {
  const st = Teams.getState();

  const status = el("teamsStatus");
  const score = el("teamsScoreLine");
  const preview = el("teamsPreview");

  if (!status || !score || !preview) return;

  if (!Teams.isEnabled()) {
    status.textContent = "Equipes desativadas";
    preview.textContent = "Crie equipes para alternar turnos e registrar pontuação.";
    score.textContent = "—";
    return;
  }

  status.textContent = `Ativo (${st.teams.length} equipes)`;
  preview.textContent = st.teams.map(t => t.name).join(", ");
  score.textContent = Teams.scoreLine();
}

export function wireTeamsUI() {
  const countSel = el("teamsCount");
  const btnCreate = el("btnTeamsCreate");
  const btnReset = el("btnTeamsReset");
  const btnDisable = el("btnTeamsDisable");

  if (!countSel || !btnCreate || !btnReset || !btnDisable) return;

  btnCreate.addEventListener("click", () => {
    Teams.enableSuggested(Number(countSel.value || 2));
    renderTeamsModal();
  });

  btnReset.addEventListener("click", () => {
    Teams.resetScores();
    renderTeamsModal();
  });

  btnDisable.addEventListener("click", () => {
    Teams.disable();
    renderTeamsModal();
  });

  window.addEventListener("bibflix:teams:change", renderTeamsModal);

  const modal = el("teamsModal");
  modal?.addEventListener("shown.bs.modal", renderTeamsModal);
}