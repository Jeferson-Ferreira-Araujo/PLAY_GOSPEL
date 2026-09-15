// Botão de tela cheia — aparece tanto no header da página inicial quanto
// no das telas de jogo (mountFullscreenButton é chamado nos dois). Ajuda
// a aproveitar melhor a tela, principalmente no celular.
//
// No mobile, tela cheia por si só não ganha muito espaço (o header
// continua lá do mesmo jeito) — por isso, só no mobile (ver media query
// em assets/css/fullscreen-ui.css), ativar tela cheia também esconde o
// header inteiro (.game-topbar ou .pg-header, dependendo da página):
// marca, nav, placar, ícones. Sobra só o conteúdo (catálogo ou jogo).
// Como o header some, um botão "fechar" flutuante (não dentro do header)
// aparece no lugar, no canto superior direito.
//
// A tela cheia NÃO sobrevive a navegação entre páginas (comportamento
// padrão do navegador) — trocar de página sempre sai da tela cheia,
// mesmo entre páginas do próprio site.
const EXPAND_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
const COMPRESS_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3v3a2 2 0 0 1-2 2H4"/><path d="M15 3v3a2 2 0 0 0 2 2h3"/><path d="M9 21v-3a2 2 0 0 0-2-2H4"/><path d="M15 21v-3a2 2 0 0 1 2-2h3"/></svg>`;
const CLOSE_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>`;

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

// Botão flutuante só de "fechar" (X) — mostrado no lugar do header
// quando ele some (ver comentário no topo do arquivo). Fica fora do
// .game-topbar de propósito, direto em <body>, senão sumiria junto.
function ensureCloseButton() {
  let btn = document.getElementById("fullscreenCloseBtn");
  if (btn) return btn;

  btn = document.createElement("button");
  btn.type = "button";
  btn.id = "fullscreenCloseBtn";
  btn.className = "game-fullscreen-close";
  btn.innerHTML = CLOSE_ICON;
  btn.setAttribute("aria-label", "Sair da tela cheia");
  btn.title = "Sair da tela cheia";
  btn.addEventListener("click", toggleFullscreen);

  document.body.appendChild(btn);
  return btn;
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

  const closeBtn = ensureCloseButton();

  function render() {
    const fs = isFullscreen();
    btn.innerHTML = fs ? COMPRESS_ICON : EXPAND_ICON;
    btn.setAttribute("aria-pressed", String(fs));
    btn.setAttribute("aria-label", fs ? "Sair da tela cheia" : "Tela cheia");
    btn.title = fs ? "Sair da tela cheia" : "Tela cheia";

    // A classe no <body> é o gatilho pro CSS (game-base.css) esconder o
    // header e mostrar o botão flutuante — só tem efeito visual no
    // mobile (ver media query lá), no desktop não muda nada.
    document.body.classList.toggle("is-fullscreen", fs);
  }

  btn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", render);

  render();
  container.prepend(btn);
}
