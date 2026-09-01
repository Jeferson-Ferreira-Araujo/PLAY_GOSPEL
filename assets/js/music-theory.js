// Teoria musical do Editor de Músicas: tons, mapeamento do teclado físico
// para notas, e presets de instrumento (Tone.js).
//
// Ideia central: as 3 linhas de letras do teclado físico viram 3 oitavas —
// Q W E R T Y U I (grave), A S D F G H J K (padrão) e Z X C V B N M , (aguda) —
// cada uma tocando a escala maior do tom escolhido (Dó Ré Mi Fá Sol Lá Si Dó).
// Mudar o tom só troca qual nota cai na tônica de cada linha; a linha em si
// já deixa clara a oitava, sem precisar de tecla modificadora para lembrar.
//
// Usado tanto pelo admin (gravação) quanto pelo jogo público (reprodução).

export const PITCH_CLASSES = [
  { name: 'C', label: 'Dó' },
  { name: 'C#', label: 'Dó#/Réb' },
  { name: 'D', label: 'Ré' },
  { name: 'D#', label: 'Ré#/Mib' },
  { name: 'E', label: 'Mi' },
  { name: 'F', label: 'Fá' },
  { name: 'F#', label: 'Fá#/Solb' },
  { name: 'G', label: 'Sol' },
  { name: 'G#', label: 'Sol#/Láb' },
  { name: 'A', label: 'Lá' },
  { name: 'A#', label: 'Lá#/Sib' },
  { name: 'B', label: 'Si' },
];

// Tons disponíveis no seletor "Tom".
export const KEYS = PITCH_CLASSES.map((pc, index) => ({
  value: pc.name,
  index,
  label: `${pc.name} (${pc.label} Maior)`,
}));

const BASE_OCTAVE = 4;

// Distância em semitons de cada grau da escala maior até a tônica:
// Dó Ré Mi Fá Sol Lá Si Dó(oitava).
const DIATONIC_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12];

// As 3 linhas de letras do teclado, de cima para baixo no teclado físico.
// Cada uma toca a mesma escala (8 graus), só muda a oitava.
export const KEYBOARD_ROWS = [
  { id: 'low', label: 'Grave', octaveShift: -1, keys: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I'] },
  { id: 'mid', label: 'Padrão', octaveShift: 0, keys: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'] },
  { id: 'high', label: 'Aguda', octaveShift: 1, keys: ['Z', 'X', 'C', 'V', 'B', 'N', 'M', ','] },
];

// Layout físico "achatado": cada tecla já carrega sua linha/oitava e o grau
// da escala que representa.
export const KEYBOARD_LAYOUT = KEYBOARD_ROWS.flatMap((row) =>
  row.keys.map((key, i) => ({
    key,
    row: row.id,
    rowLabel: row.label,
    octaveShift: row.octaveShift,
    semitone: DIATONIC_SEMITONES[i],
    degree: i + 1,
  }))
);

const KEY_BY_CODE = new Map(KEYBOARD_LAYOUT.map((k) => [k.key, k]));

/** Índice (0-11) do tom selecionado dentro de PITCH_CLASSES. */
export function keyIndex(keyValue) {
  const found = KEYS.find((k) => k.value === keyValue);
  return found ? found.index : 0;
}

/** Converte um evento de teclado (ex: "KeyA", "Comma") na tecla lógica do editor (ex: "A", ","). */
export function physicalKeyFromEvent(event) {
  if (event.code === 'Comma') return ',';
  if (event.code && event.code.startsWith('Key')) return event.code.slice(3);
  return (event.key || '').toUpperCase();
}

/**
 * Dada a tecla física pressionada e o tom selecionado, retorna a nota
 * musical correspondente (ex: { note: "F#4", label: "Fá#/Solb" }) ou
 * null se a tecla não fizer parte do mapeamento. A oitava já vem embutida
 * na linha do teclado em que a tecla está (grave/padrão/aguda).
 */
export function resolveNote(physicalKey, keyValue) {
  const mapped = KEY_BY_CODE.get(physicalKey);
  if (!mapped) return null;

  const root = keyIndex(keyValue);
  const total = root + mapped.semitone;
  const pitchClass = total % 12;
  const octave = BASE_OCTAVE + Math.floor(total / 12) + mapped.octaveShift;
  const pc = PITCH_CLASSES[pitchClass];

  return {
    note: `${pc.name}${octave}`,
    label: pc.label,
    semitone: mapped.semitone,
    row: mapped.row,
  };
}

/** Monta as 3 linhas do teclado visual já traduzidas para o tom atual. */
export function buildKeyboardRows(keyValue) {
  return KEYBOARD_ROWS.map((row) => ({
    id: row.id,
    label: row.label,
    octaveShift: row.octaveShift,
    keys: row.keys.map((key) => ({ key, ...resolveNote(key, keyValue) })),
  }));
}

// Presets de instrumento: só afetam o timbre usado na reprodução
// (REC/PLAY e prévias), não a gravação em si.
export const INSTRUMENTS = [
  { value: 'piano', label: 'Piano' },
  { value: 'organ', label: 'Órgão' },
  { value: 'guitar', label: 'Violão' },
  { value: 'synth', label: 'Sintetizador' },
];

// O piano usa amostras reais (Salamander Grand Piano — o mesmo piano dos
// exemplos oficiais do Tone.js) em vez de um oscilador sintetizado, porque
// nenhuma forma de onda simples soa como um piano de verdade. A instância é
// cacheada e compartilhada: baixar as amostras é custoso, então só
// acontece uma vez por sessão, mesmo trocando de instrumento várias vezes.
let sharedPianoSampler = null;
let sharedPianoSamplerPromise = null;

function loadPianoSampler() {
  if (sharedPianoSamplerPromise) return sharedPianoSamplerPromise;
  const Tone = window.Tone;
  sharedPianoSamplerPromise = new Promise((resolve) => {
    const sampler = new Tone.Sampler({
      urls: {
        A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
        A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
        A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
        A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
        A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
        A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
        A6: 'A6.mp3', C7: 'C7.mp3',
      },
      baseUrl: 'https://tonejs.github.io/audio/salamander/',
      release: 1,
      onload: () => {
        sharedPianoSampler = sampler;
        resolve(sampler);
      },
    }).toDestination();
  });
  return sharedPianoSamplerPromise;
}

/** Cria (ou reaproveita) o synth Tone.js configurado para o instrumento escolhido. */
export async function createInstrumentSynth(instrument) {
  const Tone = window.Tone;
  switch (instrument) {
    case 'organ':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.4 },
      }).toDestination();
    case 'guitar':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.15, release: 0.6 },
      }).toDestination();
    case 'synth':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.4, release: 0.3 },
      }).toDestination();
    case 'piano':
    default:
      return loadPianoSampler();
  }
}

/** Descarta um synth criado por createInstrumentSynth — exceto o piano, que é compartilhado. */
export function disposeInstrumentSynth(synth) {
  if (synth && synth !== sharedPianoSampler) synth.dispose();
}
