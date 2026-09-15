// Botão de tela cheia no header dos jogos — não aparece no catálogo, só
// dentro das partidas. Ajuda a aproveitar melhor a tela, principalmente
// no celular (some a barra de endereço do navegador).
const EXPAND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
const COMPRESS_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3v3a2 2 0 0 1-2 2H4"/><path d="M15 3v3a2 2 0 0 0 2 2h3"/><path d="M9 21v-3a2 2 0 0 0-2-2H4"/><path d="M15 21v-3a2 2 0 0 1 2-2h3"/></svg>`;

function isFullscreen() {
  return Boolean(document.fullscreenElement);
}

function toggleFullscreen() {
  if (isFullscreen()) {
    document.exitFullscreen?.().catch(() => {});
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

export function mountFullscreenButton(container) {
  if (!container) return;
  // iOS Safari e navegadores sem suporte não têm Fullscreen API — sem
  // isso o botão apareceria sem fazer nada.
  if (!document.documentElement.requestFullscreen) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pgui-btn pgui-btn-outline pgui-btn-sm";
  btn.id = "fullscreenBtn";

  function render() {
    const fs = isFullscreen();
    btn.innerHTML = fs ? COMPRESS_ICON : EXPAND_ICON;
    btn.setAttribute("aria-pressed", String(fs));
    btn.setAttribute("aria-label", fs ? "Sair da tela cheia" : "Tela cheia");
    btn.title = fs ? "Sair da tela cheia" : "Tela cheia";
  }

  btn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", render);

  render();
  container.prepend(btn);
}
