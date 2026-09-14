// Seletor de tradução da Bíblia — reaproveitado no catálogo e nos 3
// jogos que citam texto literal de versículo (complete-o-versiculo,
// qual-a-passagem, quem-disse-isso). Ao trocar, BibleVersion.set()
// dispara "bibflix:bible-version:change"; cada jogo escuta esse evento
// pra re-renderizar o texto atual na tradução nova (ver
// assets/js/bible-version.js).
//
// Dropdown próprio (não <select> nativo) pra poder esconder só o
// rótulo de texto no mobile e sobrar um botão de ícone compacto — CSS
// em assets/css/bible-version-picker.css, precisa estar linkado na
// página que chamar mountBibleVersionPicker.
import { BibleVersion, BIBLE_VERSIONS } from "./bible-version.js";

// Livro fechado com cruz grande na capa — um livro aberto sozinho (ícone
// antigo) ficava genérico demais em 16px (podia ser confundido com
// qualquer outro ícone de "livro"/"menu"); a cruz bem grande, mesmo
// pequena a caixa toda, deixa claro que é a Bíblia.
const BOOK_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 3v18"/><path d="M14 7.5v7"/><path d="M11 11h6"/></svg>`;
const CHEVRON_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

function currentVersion() {
  return BIBLE_VERSIONS.find((v) => v.id === BibleVersion.get()) || BIBLE_VERSIONS[0];
}

export function mountBibleVersionPicker(container, { title } = {}) {
  if (!container) return;

  const picker = document.createElement("div");
  picker.className = "pg-bible-version-picker";
  picker.title = title || "Tradução da Bíblia usada nos versículos";

  picker.innerHTML = `
    <button type="button" class="pg-bible-version-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="Tradução da Bíblia">
      ${BOOK_ICON}
      <span class="pg-bible-version-label">${currentVersion().label}</span>
      ${CHEVRON_ICON}
    </button>
    <div class="pg-bible-version-menu" role="listbox" hidden>
      ${BIBLE_VERSIONS.map(
        (v) => `<button type="button" class="pg-bible-version-option" role="option" data-version-id="${v.id}">${v.label}</button>`
      ).join("")}
    </div>
  `;

  const trigger = picker.querySelector(".pg-bible-version-trigger");
  const menu = picker.querySelector(".pg-bible-version-menu");
  const label = picker.querySelector(".pg-bible-version-label");

  function syncActiveOption() {
    const activeId = BibleVersion.get();
    menu.querySelectorAll(".pg-bible-version-option").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.versionId === activeId);
    });
  }

  function close() {
    menu.hidden = true;
    picker.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function open() {
    syncActiveOption();
    menu.hidden = false;
    picker.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) open();
    else close();
  });

  menu.querySelectorAll(".pg-bible-version-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      BibleVersion.set(opt.dataset.versionId);
      label.textContent = currentVersion().label;
      close();
      trigger.focus();
    });
  });

  document.addEventListener("click", (e) => {
    if (!picker.contains(e.target)) close();
  });

  picker.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      close();
      trigger.focus();
    }
  });

  syncActiveOption();
  container.prepend(picker);
}
