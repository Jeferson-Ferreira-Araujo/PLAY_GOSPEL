// PlayGospel UI — core.js
// Helpers compartilhados por todos os outros módulos. Nada aqui depende
// de nenhum outro arquivo da biblioteca — é a base de todo o resto.

/** Atalho para querySelector. */
export function qs(sel, root = document) {
  return root.querySelector(sel);
}

/** Atalho para querySelectorAll, já como array. */
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

let uidCounter = 0;
/** Gera um id único (para ligar aria-* entre elementos). */
export function uid(prefix = 'pgui') {
  uidCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

/** Debounce simples — usado por componentes que reagem a resize/scroll. */
export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Prende o foco (Tab/Shift+Tab) dentro de `container` — usado por Modal e
 * Dropdown. Retorna uma função para liberar o foco (chamar ao fechar).
 */
export function trapFocus(container) {
  const focusableSelector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function focusables() {
    return qsa(focusableSelector, container);
  }

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);
  return () => container.removeEventListener('keydown', onKeydown);
}

/** Liga/desliga o estado visual de carregamento de um botão (.pgui-btn). */
export function setButtonLoading(button, isLoading) {
  if (!button) return;
  button.classList.toggle('is-loading', Boolean(isLoading));
  button.disabled = Boolean(isLoading);
  if (isLoading) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

/* =====================================================
   ÍCONES — conjunto próprio, estilo outline (semelhante ao Lucide),
   sem depender de nenhuma biblioteca externa. Cada entrada é o miolo
   de um <svg viewBox="0 0 24 24">.
   ===================================================== */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1"/><path d="M16.5 5.5a3 3 0 0 1 0 6"/><path d="M21.5 20v-1a4.5 4.5 0 0 0-3-4.24"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 5H5a2 2 0 0 0 0 4h1"/><path d="M16 5h3a2 2 0 0 1 0 4h-1"/><path d="M9 20h6"/><path d="M12 13v4"/>',
  star: '<path d="M12 3.5 14.5 9l6 .8-4.4 4 1.2 5.9L12 16.9 6.7 19.7l1.2-5.9-4.4-4 6-.8L12 3.5Z"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'music-note': '<path d="M9 18V6l9-1"/><circle cx="7" cy="19" r="2.5"/>',
  play: '<path d="M6 4.5v15l13-7.5-13-7.5Z"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>',
  'arrow-left': '<path d="M19 12H5"/><path d="M11 18 5 12l6-6"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  x: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01"/><path d="M11 11h1v5h1"/>',
  'alert-triangle': '<path d="M12 3.5 22 20H2L12 3.5Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  'volume-x': '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9l4 6"/><path d="M21 9l-4 6"/>',
  maximize: '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/>',
  minimize: '<path d="M9 4v3a1 1 0 0 1-1 1H5"/><path d="M15 4v3a1 1 0 0 0 1 1h3"/><path d="M9 20v-3a1 1 0 0 0-1-1H5"/><path d="M15 20v-3a1 1 0 0 1 1-1h3"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'chevron-up': '<path d="M6 15l6-6 6 6"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5v-13Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5v-13Z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 4v4h-4"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 20v-4h4"/>',
  'skip-forward': '<path d="M5 5v14l10-7L5 5Z"/><path d="M18 5v14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18"/><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a15.6 15.6 0 0 1-3.4 4.4"/><path d="M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.3 0 2.5-.2 3.6-.6"/><path d="M9.5 9.8a2.5 2.5 0 0 0 3.6 3.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  'more-horizontal': '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 19h16"/>',

  // Conjunto temático (emblemas de equipe): natureza/força/adoração.
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  tree: '<path d="M12 3 7 10h3l-4 6h4v5h4v-5h4l-4-6h3Z"/>',
  harp: '<path d="M6 21V5l11 5v11"/><path d="M9 21V9"/><path d="M12 21V11"/><path d="M15 21V13"/>',
  paw: '<ellipse cx="12" cy="17" rx="5" ry="4"/><circle cx="5" cy="10" r="2.2"/><circle cx="10" cy="6" r="2.2"/><circle cx="15" cy="6.5" r="2.2"/><circle cx="19" cy="10.5" r="2.2"/>',
  crown: '<path d="M4 18 3 8l5 4 4-6 4 6 5-4-1 10Z"/>',
};

export const ICON_NAMES = Object.keys(ICONS);

/** Retorna o markup de um ícone (string). Usar com innerHTML/insertAdjacentHTML. */
export function icon(name, { size = 20, className = '' } = {}) {
  const inner = ICONS[name];
  if (!inner) return '';
  return `<svg class="pgui-icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
