// PlayGospel UI — accordion.js
// Liga qualquer [data-pgui-accordion]: clique no trigger expande/recolhe
// o painel (altura animada via max-height). Por padrão só um item fica
// aberto por vez — data-pgui-accordion-multiple="true" libera vários.

import { debounce } from './core.js';

function setOpen(item, isOpen) {
  const trigger = item.querySelector('.pgui-accordion__trigger');
  const panel = item.querySelector('.pgui-accordion__panel');
  if (!trigger || !panel) return;

  item.classList.toggle('is-open', isOpen);
  trigger.setAttribute('aria-expanded', String(isOpen));
  panel.style.maxHeight = isOpen ? `${panel.scrollHeight}px` : '0px';
}

/** Liga accordion.js a todos [data-pgui-accordion] dentro de `root`. Idempotente. */
export function initAccordions(root = document) {
  const groups = root.querySelectorAll ? root.querySelectorAll('[data-pgui-accordion]') : [];

  groups.forEach((group) => {
    if (group.dataset.pguiWired) return;
    group.dataset.pguiWired = 'true';

    const multiple = group.dataset.pguiAccordionMultiple === 'true';
    const items = Array.from(group.querySelectorAll('.pgui-accordion__item'));

    items.forEach((item) => {
      const trigger = item.querySelector('.pgui-accordion__trigger');
      const panel = item.querySelector('.pgui-accordion__panel');
      if (!trigger || !panel) return;

      trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('click', () => {
        const willOpen = !item.classList.contains('is-open');

        if (willOpen && !multiple) {
          items.forEach((other) => { if (other !== item) setOpen(other, false); });
        }

        setOpen(item, willOpen);
      });
    });

    // Se o conteúdo mudar de altura (resize/orientação), reajusta os
    // painéis abertos para não ficarem cortados ou com espaço sobrando.
    window.addEventListener('resize', debounce(() => {
      items.forEach((item) => {
        if (item.classList.contains('is-open')) setOpen(item, true);
      });
    }, 200));
  });
}
