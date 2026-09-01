// "Hook" de reprodução: toca a sequência gravada (inteira ou até um nível
// específico) e calcula automaticamente os intervalos de cada nível de
// dica — o coração do "não quero configurar manualmente esses intervalos".
//
// Usado tanto pelo admin (prévias por nível) quanto pelo jogo público
// (tocar as N primeiras notas escolhidas pela equipe).

/**
 * A partir das notas gravadas, gera um nível de dica para cada nota:
 * o nível N termina exatamente no fim da N-ésima nota.
 */
export function computePreviews(notes) {
  return notes.map((note, index) => ({
    level: index + 1,
    endTime: +(note.start + note.duration).toFixed(3),
  }));
}

export function createPreviewPlayer(getSynth) {
  let timers = [];
  let listeners = new Set();
  let playing = false;

  function notify() {
    listeners.forEach((fn) => fn(playing));
  }

  function stop() {
    timers.forEach(clearTimeout);
    timers = [];
    const synth = getSynth();
    if (synth) synth.releaseAll();
    if (playing) {
      playing = false;
      notify();
    }
  }

  /** Toca uma lista de notas (com start/duration relativos ao início). */
  function playNotes(notes) {
    stop();
    if (!notes.length) return;

    const synth = getSynth();
    if (!synth) return;

    playing = true;
    notify();

    // Cada nota ainda é DISPARADA por um setTimeout (assim `stop()` consegue
    // cancelar as que não tocaram ainda), mas o INSTANTE em que ela soa é
    // calculado uma única vez aqui, a partir do relógio de áudio (Tone.now())
    // — não fica "à mercê" de quando o setTimeout de cada nota realmente
    // dispara. Sem isso, se a aba ficasse ocupada por um instante (troca de
    // aba, alguma renderização pesada) e os setTimeouts atrasassem, as notas
    // acabavam disparando quase todas juntas quando o navegador finalmente
    // "desafogava" — soando como se a música tivesse acelerado. Com o
    // horário absoluto, quem manda no timing é o relógio de áudio (preciso
    // por natureza), então mesmo uma chamada um pouco atrasada ainda agenda
    // a nota pra soar no instante certo.
    const Tone = window.Tone;
    const startAt = Tone ? Tone.now() + 0.05 : null;

    notes.forEach((note) => {
      const t = setTimeout(() => {
        const when = startAt !== null ? startAt + note.start : undefined;
        synth.triggerAttackRelease(note.note, Math.max(0.05, note.duration), when);
      }, note.start * 1000);
      timers.push(t);
    });

    const last = notes[notes.length - 1];
    const totalMs = (last.start + last.duration) * 1000 + 60;
    const endTimer = setTimeout(() => {
      playing = false;
      notify();
    }, totalMs);
    timers.push(endTimer);
  }

  /** Toca a gravação completa. */
  function playAll(notes) {
    playNotes(notes);
  }

  /** Toca do início até o final da N-ésima nota (nível de dica). */
  function playPreview(notes, level) {
    playNotes(notes.slice(0, level));
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(playing);
    return () => listeners.delete(listener);
  }

  return { playAll, playPreview, stop, subscribe };
}
