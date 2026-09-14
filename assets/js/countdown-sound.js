// Bipes da contagem "Prepare-se! 3, 2, 1" — sintetizados na hora via
// Web Audio API (osciladores simples), sem arquivo de áudio: mais leve
// e sem depender de licenciar/hospedar um efeito sonoro.
//
// Navegadores só deixam tocar áudio depois de alguma interação do
// usuário na página. Como a contagem às vezes começa sozinha (ex: modal
// "como jogar" do sorteio, sem clique direto no exato instante do
// primeiro bipe), "destravamos" o AudioContext no primeiro
// clique/toque/tecla em QUALQUER lugar da página, não só no que
// disparou a contagem — padrão comum pra contornar essa restrição.

// Mudo — preferência do site inteiro (não por jogo), igual a tradução
// da Bíblia: ligar/desligar num jogo vale pros outros também, não
// precisa mutar de novo em cada um.
const MUTE_KEY = "bibflix_sound_muted_v1";

export function isMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* best-effort */
  }
  window.dispatchEvent(new CustomEvent("bibflix:sound-muted:change", { detail: muted }));
}

let ctx = null;

function getContext() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  ctx = new AudioContextClass();
  return ctx;
}

function unlock() {
  const c = getContext();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}
["pointerdown", "keydown"].forEach((evt) =>
  document.addEventListener(evt, unlock, { once: true, passive: true })
);

function beep({ freq, duration, volume, type }) {
  if (isMuted()) return;

  const c = getContext();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  // Sobe rápido pro volume alvo e decai suave — evita o "clique" seco
  // de um volume constante ligando/desligando abruptamente.
  gain.gain.setValueAtTime(0.0001, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, c.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);

  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + duration);
}

/** Bipe curto de cada número da contagem regressiva (3, 2, 1). */
export function playCountdownTick() {
  beep({ freq: 660, duration: 0.1, volume: 0.16, type: "sine" });
}

/** Som mais agudo/mais longo quando a contagem chega no fim ("vai!"). */
export function playCountdownGo() {
  beep({ freq: 1046.5, duration: 0.22, volume: 0.2, type: "triangle" });
}

/** Chime de acerto (duas notas subindo) — usado quando uma equipe marca
 * ponto (ex: palavras-misturadas, adivinhe-emoji). Mesma técnica
 * sintetizada de cima, respeitando o mudo igual aos bipes da contagem. */
export function playCorrectSound() {
  beep({ freq: 523.25, duration: 0.1, volume: 0.18, type: "sine" });
  setTimeout(() => beep({ freq: 784, duration: 0.16, volume: 0.2, type: "sine" }), 90);
}
