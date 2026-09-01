// Teclado de piano visual (vista de cima — só as teclas, sem mão nenhuma)
// usado pra mostrar quais notas estão soando durante a reprodução de um
// trecho gravado. Isso aqui não usa o Tone.js em nada — o Tone.js só toca o
// SOM; este módulo só desenha teclas de piano em HTML/CSS e liga/desliga a
// classe "is-active" de cada uma. A sincronia com o áudio é feita por quem
// chama pressKey/releaseKey nos mesmos instantes (start/duration) que já
// disparam o som — ver use-preview-player.js e o "mini player" do jogo.

const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Cada tecla preta fica centralizada na fronteira entre duas teclas brancas
// da mesma oitava — o número é o índice (dentro da oitava, 0 a 7) dessa
// fronteira: C(0) D(1) E(2) F(3) G(4) A(5) B(6) próximo-C(7).
const BLACK_BOUNDARY = { 'C#': 1, 'D#': 2, 'F#': 4, 'G#': 5, 'A#': 6 };

function parseNote(value) {
  const m = /^([A-G]#?)(-?\d+)$/.exec(String(value || ''));
  if (!m) return null;
  return { pitch: m[1], octave: Number(m[2]) };
}

/** Monta as teclas (brancas + pretas) cobrindo, com 1 tecla branca de folga
 * de cada lado, da menor à maior oitava presentes em `notes` — em vez de um
 * teclado gigante fixo onde a maioria das teclas nunca seria usada. */
function buildRange(notes) {
  const parsed = notes
    .map((n) => parseNote(typeof n === 'string' ? n : n?.note))
    .filter(Boolean);
  if (!parsed.length) return { whiteKeys: [], blackKeys: [] };

  const rawMinOctave = Math.min(...parsed.map((p) => p.octave));
  const rawMaxOctave = Math.max(...parsed.map((p) => p.octave));

  // Folga de 1 oitava só quando a música cabe numa oitava só — dá uma
  // presença visual melhor pro teclado sem ficar apertado. Músicas que já
  // atravessam 2+ oitavas (ex: uma frase que sobe de A5 pra C6) NÃO ganham
  // outra oitava inteira de cada lado — isso dobrava o teclado de tamanho
  // (2 oitavas viravam 4) e deixava as teclas finas demais pra ler, com
  // cara de "torto" numa tela comprimida. Sem folga nesse caso, as teclas
  // ficam bem mais largas e legíveis.
  const spanOctaves = rawMaxOctave - rawMinOctave + 1;
  const padding = spanOctaves <= 1 ? 1 : 0;
  const minOctave = rawMinOctave - padding;
  const maxOctave = rawMaxOctave + padding;

  const whiteKeys = [];
  const blackKeys = [];
  let whiteIndex = 0;

  for (let octave = minOctave; octave <= maxOctave; octave++) {
    const octaveStart = whiteIndex;
    WHITE_NAMES.forEach((name) => {
      whiteKeys.push({ note: `${name}${octave}` });
      whiteIndex++;
    });
    Object.entries(BLACK_BOUNDARY).forEach(([name, boundary]) => {
      blackKeys.push({ note: `${name}${octave}`, boundaryIndex: octaveStart + boundary });
    });
  }

  return { whiteKeys, blackKeys };
}

/**
 * Renderiza o teclado dentro de `container` (substitui o conteúdo atual) e
 * devolve um handle pra sincronizar visualmente com a reprodução:
 *   pressKey(note) / releaseKey(note) / releaseAll() / destroy()
 * `notes` só define o RANGE do teclado (menor/maior nota) — pressKey aceita
 * qualquer nota dentro desse range, não precisa ser da mesma lista.
 */
export function renderPianoKeyboard(container, notes) {
  const { whiteKeys, blackKeys } = buildRange(notes || []);
  container.innerHTML = '';

  if (!whiteKeys.length) {
    return { pressKey() {}, releaseKey() {}, releaseAll() {}, destroy() {} };
  }

  container.style.setProperty('--qam-piano-white-count', String(whiteKeys.length));

  const whiteRow = document.createElement('div');
  whiteRow.className = 'qam-piano__white-row';
  whiteKeys.forEach(({ note }) => {
    const el = document.createElement('div');
    el.className = 'qam-piano__key qam-piano__key--white';
    el.dataset.note = note;
    whiteRow.appendChild(el);
  });
  container.appendChild(whiteRow);

  blackKeys.forEach(({ note, boundaryIndex }) => {
    const el = document.createElement('div');
    el.className = 'qam-piano__key qam-piano__key--black';
    el.dataset.note = note;
    el.style.setProperty('--qam-piano-boundary', String(boundaryIndex));
    container.appendChild(el);
  });

  const keyEls = new Map(
    [...container.querySelectorAll('[data-note]')].map((el) => [el.dataset.note, el])
  );

  return {
    pressKey(note) {
      keyEls.get(note)?.classList.add('is-active');
    },
    releaseKey(note) {
      keyEls.get(note)?.classList.remove('is-active');
    },
    releaseAll() {
      keyEls.forEach((el) => el.classList.remove('is-active'));
    },
    destroy() {
      container.innerHTML = '';
    },
  };
}
