// PlayGospel UI — modal.js
// Um único overlay reaproveitado (injetado no <body> na primeira
// chamada). API: PGUIModal.open(), .close(), .confirm() — este último
// cobre o caso de diálogo de confirmação (ex: "Tem certeza que deseja
// encerrar este jogo?").

import { trapFocus, icon } from './core.js';

let overlayEl = null;
let releaseFocus = null;
let previouslyFocused = null;
let pendingConfirmResolve = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement('div');
  overlayEl.className = 'pgui-modal-overlay';
  overlayEl.innerHTML = `
    <div class="pgui-modal" role="dialog" aria-modal="true" tabindex="-1">
      <div class="pgui-modal__header">
        <h3 class="pgui-modal__title"></h3>
        <button type="button" class="pgui-modal__close" aria-label="Fechar">${icon('x', { size: 18 })}</button>
      </div>
      <div class="pgui-modal__body"></div>
      <div class="pgui-modal__footer"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl && overlayEl.dataset.dismissable !== 'false') close();
  });
  overlayEl.querySelector('.pgui-modal__close').addEventListener('click', () => {
    if (overlayEl.dataset.dismissable !== 'false') close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlayEl.classList.contains('is-open') && overlayEl.dataset.dismissable !== 'false') {
      close();
    }
  });

  return overlayEl;
}

/**
 * @param {{title?:string, body?:string|HTMLElement, footer?:string|HTMLElement, dismissable?:boolean}} opts
 */
export function open(opts = {}) {
  const { title = '', body = '', footer = '', dismissable = true } = opts;
  const el = ensureOverlay();
  el.dataset.dismissable = String(dismissable);

  el.querySelector('.pgui-modal__title').textContent = title;

  const bodyEl = el.querySelector('.pgui-modal__body');
  bodyEl.innerHTML = '';
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body instanceof HTMLElement) bodyEl.appendChild(body);

  const footerEl = el.querySelector('.pgui-modal__footer');
  footerEl.innerHTML = '';
  if (typeof footer === 'string') footerEl.innerHTML = footer;
  else if (footer instanceof HTMLElement) footerEl.appendChild(footer);

  previouslyFocused = document.activeElement;
  el.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  releaseFocus = trapFocus(el.querySelector('.pgui-modal'));
  requestAnimationFrame(() => el.querySelector('.pgui-modal').focus());

  return el;
}

export function close() {
  if (!overlayEl || !overlayEl.classList.contains('is-open')) return;
  overlayEl.classList.remove('is-open');
  document.body.style.overflow = '';
  releaseFocus?.();
  releaseFocus = null;
  previouslyFocused?.focus?.();

  if (pendingConfirmResolve) {
    const resolve = pendingConfirmResolve;
    pendingConfirmResolve = null;
    resolve(false);
  }
}

/**
 * Diálogo de confirmação. Resolve `true` se confirmado, `false` se
 * cancelado ou fechado de qualquer outra forma (ESC, overlay, ×).
 * @param {{title?:string, message?:string, confirmLabel?:string, cancelLabel?:string}} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts = {}) {
  const { title = 'Atenção!', message = '', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' } = opts;

  return new Promise((resolve) => {
    pendingConfirmResolve = resolve;

    const footer = document.createElement('div');
    footer.className = 'pgui-modal__actions';
    footer.innerHTML = `
      <button type="button" class="pgui-btn pgui-btn-ghost" data-role="cancel">${cancelLabel}</button>
      <button type="button" class="pgui-btn pgui-btn-primary" data-role="confirm">${confirmLabel}</button>
    `;

    function settle(value) {
      const r = pendingConfirmResolve;
      pendingConfirmResolve = null;
      close();
      r?.(value);
    }

    footer.querySelector('[data-role="cancel"]').addEventListener('click', () => settle(false));
    footer.querySelector('[data-role="confirm"]').addEventListener('click', () => settle(true));

    open({ title, body: `<p class="pgui-body">${message}</p>`, footer });
  });
}

export const PGUIModal = { open, close, confirm: confirmDialog };
