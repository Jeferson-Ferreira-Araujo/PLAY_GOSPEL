// assets/js/utils.js
// Utilitários globais para todos os jogos (offline).

export function createCountdownTimer({
  durationSec,
  onTick = () => {},
  onEnd = () => {},
  tickMs = 250
} = {}) {
  let remainingMs = Math.max(0, Math.floor((durationSec ?? 0) * 1000));
  let intervalId = null;
  let running = false;

  const now = () => performance.now();
  let last = 0;

  function emitTick() {
    onTick({
      remainingMs,
      remainingSec: Math.ceil(remainingMs / 1000),
      progress01: durationSec ? Math.max(0, remainingMs / (durationSec * 1000)) : 0
    });
  }

  function start() {
    if (running) return;
    running = true;
    last = now();

    emitTick();

    intervalId = setInterval(() => {
      const t = now();
      const dt = t - last;
      last = t;

      remainingMs = Math.max(0, remainingMs - dt);
      emitTick();

      if (remainingMs <= 0) {
        stop();
        onEnd();
      }
    }, tickMs);
  }

  function stop() {
    running = false;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
  }

  function reset(newDurationSec) {
    stop();
    if (typeof newDurationSec === "number") {
      durationSec = newDurationSec;
    }
    remainingMs = Math.max(0, Math.floor((durationSec ?? 0) * 1000));
    emitTick();
  }

  function getRemainingSec() {
    return Math.ceil(remainingMs / 1000);
  }

  return { start, stop, reset, getRemainingSec };
}

export function shuffleArray(arr) {
  // Fisher-Yates (não muta o original)
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
