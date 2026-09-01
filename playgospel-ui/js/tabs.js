// PlayGospel UI — tabs.js
// Liga qualquer [data-pgui-tabs]: clique ou seta (←/→, Home/End) troca
// a aba ativa e o painel correspondente, com ARIA completo.

function activateTab(root, tab) {
  const tabs = Array.from(root.querySelectorAll('.pgui-tabs__tab'));
  const panels = Array.from(root.querySelectorAll('.pgui-tabs__panel'));
  const targetKey = tab.dataset.tab;

  tabs.forEach((t) => {
    const isActive = t === tab;
    t.classList.toggle('is-active', isActive);
    t.setAttribute('aria-selected', String(isActive));
    t.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== targetKey;
  });
}

/** Liga tabs.js a todos [data-pgui-tabs] dentro de `root`. Idempotente. */
export function initTabs(root = document) {
  const groups = root.querySelectorAll ? root.querySelectorAll('[data-pgui-tabs]') : [];

  groups.forEach((group) => {
    if (group.dataset.pguiWired) return;
    group.dataset.pguiWired = 'true';

    const tabs = Array.from(group.querySelectorAll('.pgui-tabs__tab'));
    const list = group.querySelector('.pgui-tabs__list');

    tabs.forEach((tab) => {
      tab.setAttribute('role', 'tab');
      tab.addEventListener('click', () => activateTab(group, tab));
    });

    list?.addEventListener('keydown', (e) => {
      const currentIndex = tabs.indexOf(document.activeElement);
      if (currentIndex === -1) return;

      let nextIndex = null;
      if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') nextIndex = 0;
      else if (e.key === 'End') nextIndex = tabs.length - 1;

      if (nextIndex !== null) {
        e.preventDefault();
        tabs[nextIndex].focus();
        activateTab(group, tabs[nextIndex]);
      }
    });

    const initial = group.querySelector('.pgui-tabs__tab.is-active') || tabs[0];
    if (initial) activateTab(group, initial);
  });
}
