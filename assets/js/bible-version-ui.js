// Seletor de tradução da Bíblia (pequeno <select> no topo do jogo) —
// reaproveitado pelos 3 jogos que citam texto literal de versículo
// (complete-o-versiculo, qual-a-passagem, quem-disse-isso). Ao trocar,
// BibleVersion.set() dispara "bibflix:bible-version:change"; cada jogo
// escuta esse evento pra re-renderizar o texto atual na tradução nova
// (ver assets/js/bible-version.js).
import { BibleVersion, BIBLE_VERSIONS } from "./bible-version.js";

export function mountBibleVersionPicker(container) {
  if (!container) return;

  const select = document.createElement("select");
  select.id = "bibleVersionSelect";
  select.className = "form-select form-select-sm bg-dark text-light border-secondary";
  select.style.width = "auto";
  select.setAttribute("aria-label", "Tradução da Bíblia");
  select.title = "Tradução da Bíblia usada nos versículos";

  select.innerHTML = BIBLE_VERSIONS.map(
    (v) => `<option value="${v.id}">${v.label}</option>`
  ).join("");
  select.value = BibleVersion.get();

  select.addEventListener("change", () => BibleVersion.set(select.value));

  container.prepend(select);
}
