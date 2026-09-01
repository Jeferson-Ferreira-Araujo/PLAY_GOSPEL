// PlayGospel UI — progress.js
// Atualiza as duas variantes de progresso (linear e circular) a partir
// de {current, total}. Não guarda estado — quem chama decide quando
// atualizar (ex: ao avançar de pergunta).

/**
 * @param {HTMLElement} el elemento raiz com a estrutura .pgui-progress
 * @param {{current:number, total:number, unitLabel?:string}} data
 */
export function updateProgress(el, { current, total, unitLabel = 'Pergunta' } = {}) {
  if (!el) return;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  const currentEl = el.querySelector('.pgui-progress__current');
  const percentEl = el.querySelector('.pgui-progress__percent');
  const fillEl = el.querySelector('.pgui-progress__fill');

  if (currentEl) currentEl.textContent = `${unitLabel} ${current} de ${total}`;
  if (percentEl) percentEl.textContent = `${pct}%`;
  if (fillEl) fillEl.style.width = `${pct}%`;

  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.setAttribute('aria-valuenow', String(pct));
  el.setAttribute('aria-label', `${unitLabel} ${current} de ${total}`);

  return pct;
}

/**
 * @param {HTMLElement} el elemento raiz com a estrutura .pgui-progress-circular
 * @param {{current:number, total:number}} data
 */
export function updateProgressCircular(el, { current, total } = {}) {
  if (!el) return;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  const circle = el.querySelector('.pgui-progress-circular__fill');
  const label = el.querySelector('.pgui-progress-circular__label');

  if (circle) {
    const r = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * r;
    circle.style.strokeDasharray = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference * (1 - pct / 100)}`;
  }
  if (label) label.textContent = `${pct}%`;

  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.setAttribute('aria-valuenow', String(pct));

  return pct;
}
