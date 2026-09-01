// PlayGospel UI — tooltip.js
// Uma bolha só, compartilhada, mostrada/reposicionada para qualquer
// elemento com [data-pgui-tooltip="texto"] (+ [data-pgui-tooltip-placement]
// opcional: top|bottom|left|right, padrão top).

let bubbleEl = null;
let showTimer = null;

function ensureBubble() {
  if (bubbleEl) return bubbleEl;
  bubbleEl = document.createElement('div');
  bubbleEl.className = 'pgui-tooltip';
  bubbleEl.setAttribute('role', 'tooltip');
  document.body.appendChild(bubbleEl);
  return bubbleEl;
}

function position(target, placement) {
  const rect = target.getBoundingClientRect();
  const bubble = ensureBubble();
  const bubbleRect = bubble.getBoundingClientRect();
  let top;
  let left;

  switch (placement) {
    case 'bottom':
      top = rect.bottom + 8;
      left = rect.left + rect.width / 2 - bubbleRect.width / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - bubbleRect.height / 2;
      left = rect.left - bubbleRect.width - 8;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - bubbleRect.height / 2;
      left = rect.right + 8;
      break;
    default: // top
      top = rect.top - bubbleRect.height - 8;
      left = rect.left + rect.width / 2 - bubbleRect.width / 2;
  }

  bubble.style.top = `${Math.max(4, top)}px`;
  bubble.style.left = `${Math.max(4, Math.min(left, window.innerWidth - bubbleRect.width - 4))}px`;
}

function show(target) {
  const text = target.getAttribute('data-pgui-tooltip');
  if (!text) return;
  const placement = target.getAttribute('data-pgui-tooltip-placement') || 'top';
  const bubble = ensureBubble();
  bubble.textContent = text;
  bubble.classList.add('is-visible');
  position(target, placement);
}

function hide() {
  bubbleEl?.classList.remove('is-visible');
}

/** Liga tooltip.js a todos [data-pgui-tooltip] dentro de `root`. Idempotente. */
export function initTooltips(root = document) {
  const targets = root.querySelectorAll ? root.querySelectorAll('[data-pgui-tooltip]') : [];
  targets.forEach((target) => {
    if (target.dataset.pguiTooltipWired) return;
    target.dataset.pguiTooltipWired = 'true';

    target.addEventListener('mouseenter', () => {
      clearTimeout(showTimer);
      showTimer = setTimeout(() => show(target), 150);
    });
    target.addEventListener('mouseleave', () => {
      clearTimeout(showTimer);
      hide();
    });
    target.addEventListener('focus', () => show(target));
    target.addEventListener('blur', hide);
  });
}
