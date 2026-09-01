// PlayGospel UI — dropdown.js
// Liga qualquer [data-pgui-dropdown]: clique no trigger abre/fecha,
// clique fora fecha, Esc fecha, setas navegam entre itens. Dispara
// "pgui:dropdown:select" no item clicado (bubbles) para quem quiser
// reagir sem escrever handler próprio.

function closeDropdown(root) {
  const trigger = root.querySelector('[data-pgui-dropdown-trigger]');
  root.classList.remove('is-open');
  trigger?.setAttribute('aria-expanded', 'false');
}

function openDropdown(root) {
  const trigger = root.querySelector('[data-pgui-dropdown-trigger]');
  root.classList.add('is-open');
  trigger?.setAttribute('aria-expanded', 'true');
}

function items(root) {
  return Array.from(root.querySelectorAll('.pgui-dropdown__item'));
}

/** Liga dropdown.js a todos [data-pgui-dropdown] dentro de `root`. Idempotente. */
export function initDropdowns(root = document) {
  const dropdowns = root.querySelectorAll ? root.querySelectorAll('[data-pgui-dropdown]') : [];

  dropdowns.forEach((dropdown) => {
    if (dropdown.dataset.pguiWired) return;
    dropdown.dataset.pguiWired = 'true';

    const trigger = dropdown.querySelector('[data-pgui-dropdown-trigger]');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const isOpen = dropdown.classList.contains('is-open');
      if (isOpen) closeDropdown(dropdown);
      else openDropdown(dropdown);
    });

    dropdown.addEventListener('keydown', (e) => {
      const list = items(dropdown);
      if (!list.length) return;
      const currentIndex = list.indexOf(document.activeElement);

      if (e.key === 'Escape') {
        closeDropdown(dropdown);
        trigger.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown(dropdown);
        list[(currentIndex + 1 + list.length) % list.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openDropdown(dropdown);
        list[(currentIndex - 1 + list.length) % list.length].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        list[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        list[list.length - 1].focus();
      }
    });

    items(dropdown).forEach((item) => {
      item.addEventListener('click', () => {
        item.dispatchEvent(new CustomEvent('pgui:dropdown:select', { bubbles: true, detail: { item } }));
        closeDropdown(dropdown);
        trigger.focus();
      });
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.contains(e.target)) closeDropdown(dropdown);
    });
  });
}

export { openDropdown, closeDropdown };
