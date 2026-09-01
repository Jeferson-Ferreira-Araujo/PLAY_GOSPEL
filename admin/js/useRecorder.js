// "Hook" de gravação: captura o toque do teclado físico como uma sequência
// de notas com início e duração, prontas para virar níveis de dica.
//
// Não depende de React — é uma factory simples com um padrão de
// assinatura (subscribe/notify) para a UI reagir a mudanças. Este módulo
// é puramente dados/tempo: quem soa as notas (Tone.js) é a página que o
// usa (admin/js/pages/musicEditor.js), mantendo a lógica de gravação
// isolada do áudio e da renderização.
export function createRecorder() {
  let isRecording = false;
  let startedAt = 0; // performance.now() do início da gravação, em segundos
  let notes = []; // [{ note, start, duration }]
  let heldKeys = new Map(); // physicalKey -> { note, start, noteIndex }
  let listeners = new Set();
  let rafId = null;

  function notify() {
    listeners.forEach((fn) => fn(getState()));
  }

  function now() {
    return performance.now() / 1000;
  }

  function getState() {
    return {
      isRecording,
      notes: notes.slice(),
      elapsed: isRecording ? now() - startedAt : totalDuration(),
      noteCount: notes.length,
    };
  }

  function totalDuration() {
    if (notes.length === 0) return 0;
    const last = notes[notes.length - 1];
    return last.start + last.duration;
  }

  function tick() {
    if (!isRecording) return;
    notify();
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (isRecording) return;
    notes = [];
    heldKeys.clear();
    isRecording = true;
    startedAt = now();
    notify();
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (!isRecording) return;
    // Finaliza qualquer nota que ainda esteja com a tecla pressionada.
    const t = now() - startedAt;
    heldKeys.forEach(({ noteIndex }) => {
      const entry = notes[noteIndex];
      if (entry) entry.duration = Math.max(0.05, +(t - entry.start).toFixed(3));
    });
    heldKeys.clear();
    isRecording = false;
    if (rafId) cancelAnimationFrame(rafId);
    notify();
  }

  /** Tecla física pressionada (ignorar auto-repeat do navegador). */
  function noteOn(physicalKey, resolvedNote) {
    if (!isRecording || !resolvedNote || heldKeys.has(physicalKey)) return;
    const start = +(now() - startedAt).toFixed(3);
    const entry = { note: resolvedNote.note, start, duration: 0 };
    notes.push(entry);
    heldKeys.set(physicalKey, { note: resolvedNote.note, start, noteIndex: notes.length - 1 });
    notify();
  }

  /** Tecla física solta. */
  function noteOff(physicalKey) {
    const held = heldKeys.get(physicalKey);
    if (!held) return;
    heldKeys.delete(physicalKey);

    if (isRecording) {
      const t = +(now() - startedAt).toFixed(3);
      const entry = notes[held.noteIndex];
      if (entry) entry.duration = Math.max(0.05, +(t - entry.start).toFixed(3));
    }

    notify();
  }

  /** Remove a última nota gravada (atalho Backspace, antes de salvar). */
  function removeLastNote() {
    if (heldKeys.size > 0) return; // não mexe em nota ainda sendo tocada
    notes.pop();
    notify();
  }

  function reset() {
    isRecording = false;
    if (rafId) cancelAnimationFrame(rafId);
    notes = [];
    heldKeys.clear();
    notify();
  }

  function setNotes(newNotes) {
    notes = newNotes.slice();
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  return {
    start,
    stop,
    noteOn,
    noteOff,
    removeLastNote,
    reset,
    setNotes,
    subscribe,
    getState,
  };
}
