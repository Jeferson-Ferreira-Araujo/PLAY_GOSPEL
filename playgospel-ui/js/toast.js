// PlayGospel UI — toast.js
// Pilha de notificações efêmeras. PGUIToast.show(msg, {type, duration})
// ou os atalhos .success/.info/.warning/.danger.

import { icon } from './core.js';

let stackEl = null;

function ensureStack() {
  if (stackEl) return stackEl;
  stackEl = document.createElement('div');
  stackEl.className = 'pgui-toast-stack';
  stackEl.setAttribute('role', 'region');
  stackEl.setAttribute('aria-live', 'polite');
  stackEl.setAttribute('aria-label', 'Notificações');
  document.body.appendChild(stackEl);
  return stackEl;
}

const TYPE_ICON = { success: 'check', info: 'info', warning: 'alert-triangle', danger: 'alert-circle' };

/**
 * @param {string} message
 * @param {{type?: 'success'|'info'|'warning'|'danger', duration?: number}} opts
 */
export function show(message, opts = {}) {
  const { type = 'info', duration = 4000 } = opts;
  const stack = ensureStack();

  const toastEl = document.createElement('div');
  toastEl.className = `pgui-toast pgui-toast-${type}`;
  toastEl.setAttribute('role', 'status');
  toastEl.innerHTML = `
    <span class="pgui-toast__icon">${icon(TYPE_ICON[type] || 'info', { size: 18 })}</span>
    <span class="pgui-toast__message"></span>
    <button type="button" class="pgui-toast__close" aria-label="Fechar">${icon('x', { size: 14 })}</button>
  `;
  toastEl.querySelector('.pgui-toast__message').textContent = message;

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    toastEl.classList.remove('is-visible');
    toastEl.classList.add('is-leaving');
    setTimeout(() => toastEl.remove(), 220);
  }

  toastEl.querySelector('.pgui-toast__close').addEventListener('click', dismiss);
  stack.appendChild(toastEl);
  requestAnimationFrame(() => toastEl.classList.add('is-visible'));

  if (duration > 0) setTimeout(dismiss, duration);

  return { dismiss };
}

export const PGUIToast = {
  show,
  success: (message, opts) => show(message, { ...opts, type: 'success' }),
  info: (message, opts) => show(message, { ...opts, type: 'info' }),
  warning: (message, opts) => show(message, { ...opts, type: 'warning' }),
  danger: (message, opts) => show(message, { ...opts, type: 'danger' }),
};
