// PlayGospel UI — playgospel-ui.js
// Agregador: reexporta todos os componentes (import * as PlayGospelUI
// from '.../playgospel-ui.js' dá acesso a tudo por um só namespace) e
// liga automaticamente, no DOMContentLoaded, os componentes puramente
// declarativos (tabs, accordion, dropdown, tooltip) via data-pgui-*.
//
// Quem precisa de controle programático (timer, progress, ranking,
// modal, toast, animation) importa o módulo específico direto — não
// dá pra "declarar" um cronômetro só com HTML, ele precisa de start/
// pause/reset vindos da lógica do jogo.

export * from './core.js';
export * from './timer.js';
export * from './progress.js';
export * from './ranking.js';
export * from './animation.js';

export { PGUIModal, open as openModal, close as closeModal, confirmDialog } from './modal.js';
export { PGUIToast, show as showToast } from './toast.js';

export { initTooltips } from './tooltip.js';
export { initDropdowns, openDropdown, closeDropdown } from './dropdown.js';
export { initTabs } from './tabs.js';
export { initAccordions } from './accordion.js';

import { initTooltips } from './tooltip.js';
import { initDropdowns } from './dropdown.js';
import { initTabs } from './tabs.js';
import { initAccordions } from './accordion.js';

/** Liga todos os componentes declarativos dentro de `root`. Chame de
 * novo depois de injetar HTML novo dinamicamente (ex: um novo card
 * com abas) — é idempotente, não religa o que já está ligado. */
export function autoInit(root = document) {
  initTabs(root);
  initAccordions(root);
  initDropdowns(root);
  initTooltips(root);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => autoInit());
  } else {
    autoInit();
  }
}
