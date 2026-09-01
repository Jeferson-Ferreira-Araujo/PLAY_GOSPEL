// PlayGospel UI — timer.js
// Cronômetro circular, animado, JS puro. Cria e controla um único
// timer por elemento; a cor (normal/aviso/perigo) e o estado pausado
// são refletidos via atributo data-state, lido pelo timer.css.

/**
 * @param {HTMLElement} el elemento raiz com a estrutura .pgui-timer
 * @param {{
 *   duration?: number,
 *   onTick?: (info: {remainingMs:number, remainingSec:number}) => void,
 *   onEnd?: () => void,
 *   warningThreshold?: number,
 *   dangerThreshold?: number,
 *   tickMs?: number,
 * }} opts
 */
export function createTimer(el, opts = {}) {
  const {
    duration = 30,
    onTick = () => {},
    onEnd = () => {},
    warningThreshold = 0.5,
    dangerThreshold = 0.2,
    tickMs = 200,
  } = opts;

  const circle = el.querySelector('.pgui-timer__fill');
  const timeLabel = el.querySelector('.pgui-timer__time');
  const radius = circle ? circle.r.baseVal.value : 44;
  const circumference = 2 * Math.PI * radius;
  if (circle) circle.style.strokeDasharray = `${circumference}`;

  let totalMs = Math.max(0, duration * 1000);
  let remainingMs = totalMs;
  let intervalId = null;
  let status = 'idle'; // idle | running | paused | ended
  let lastTs = 0;

  function formatTime(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function render() {
    const fraction = totalMs > 0 ? Math.max(0, remainingMs / totalMs) : 0;
    if (circle) circle.style.strokeDashoffset = `${circumference * (1 - fraction)}`;
    if (timeLabel) timeLabel.textContent = formatTime(remainingMs);

    let state = 'normal';
    if (status === 'paused') state = 'paused';
    else if (fraction <= dangerThreshold) state = 'danger';
    else if (fraction <= warningThreshold) state = 'warning';
    el.dataset.state = state;
  }

  function stopInterval() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  function tick() {
    const now = performance.now();
    const delta = now - lastTs;
    lastTs = now;
    remainingMs = Math.max(0, remainingMs - delta);
    render();
    onTick({ remainingMs, remainingSec: Math.ceil(remainingMs / 1000) });

    if (remainingMs <= 0) {
      stopInterval();
      status = 'ended';
      render();
      onEnd();
    }
  }

  function start() {
    if (status === 'running') return;
    status = 'running';
    lastTs = performance.now();
    stopInterval();
    intervalId = setInterval(tick, tickMs);
    render();
  }

  function pause() {
    if (status !== 'running') return;
    status = 'paused';
    stopInterval();
    render();
  }

  function resume() {
    if (status !== 'paused') return;
    start();
  }

  /** Reseta o cronômetro; opcionalmente troca a duração total (em segundos). */
  function reset(newDurationSec) {
    stopInterval();
    if (typeof newDurationSec === 'number') {
      totalMs = Math.max(0, newDurationSec * 1000);
    }
    remainingMs = totalMs;
    status = 'idle';
    render();
  }

  /** Ajusta o tempo restante (em segundos) sem alterar o total. */
  function setTime(seconds) {
    remainingMs = Math.max(0, seconds * 1000);
    render();
  }

  render();

  return {
    start,
    pause,
    resume,
    reset,
    setTime,
    getRemainingSec: () => Math.ceil(remainingMs / 1000),
  };
}
