// PlayGospel UI — animation.js
// Aplica/remove as classes de animations.css de forma programática,
// limpando a classe sozinho quando a animação termina (animationend) —
// assim ela pode ser disparada de novo mais tarde sem se acumular.

const ANIMATION_CLASS = {
  'fade-in': 'pgui-fade-in',
  'fade-out': 'pgui-fade-out',
  'slide-up': 'pgui-slide-up',
  'slide-down': 'pgui-slide-down',
  'scale-in': 'pgui-scale-in',
  shake: 'pgui-shake',
  'flash-success': 'pgui-flash-success',
  'flash-error': 'pgui-flash-error',
};

// Animações contínuas (pulse/glow/spin) não são "one-shot" — quem
// aplica também é responsável por remover quando quiser parar.
const CONTINUOUS_CLASS = {
  pulse: 'pgui-pulse',
  glow: 'pgui-glow',
  spin: 'pgui-spin',
};

/**
 * Dispara uma animação nomeada em `el`. Para as one-shot (fade, slide,
 * scale, shake, flash-*) a classe é removida automaticamente ao terminar.
 * Para as contínuas (pulse, glow, spin) a classe fica até `stopAnimate`.
 * @returns {Promise<void>} resolve quando a animação one-shot terminar
 *   (ou imediatamente, para as contínuas).
 */
export function animate(el, name) {
  if (!el) return Promise.resolve();

  if (CONTINUOUS_CLASS[name]) {
    el.classList.add(CONTINUOUS_CLASS[name]);
    return Promise.resolve();
  }

  const className = ANIMATION_CLASS[name];
  if (!className) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      el.classList.remove(className);
      el.removeEventListener('animationend', finish);
      clearTimeout(fallbackTimer);
      resolve();
    }
    // Fallback: se animationend não disparar por algum motivo (aba não
    // visível, animação interrompida, navegador excêntrico), a classe
    // ainda é removida — nunca fica "travada" para sempre.
    const fallbackTimer = setTimeout(finish, 600);
    el.addEventListener('animationend', finish);
    el.classList.add(className);
  });
}

/** Remove uma animação contínua (pulse/glow/spin) iniciada por animate(). */
export function stopAnimate(el, name) {
  const className = CONTINUOUS_CLASS[name];
  if (el && className) el.classList.remove(className);
}
