// Botão de mudo (som da contagem "Prepare-se!") no header dos jogos —
// não aparece no catálogo, só dentro das partidas. Preferência
// compartilhada por todo o site (ver isMuted/setMuted em
// assets/js/countdown-sound.js): mutar num jogo mantém mutado nos
// outros também, sem precisar repetir a escolha.
import { isMuted, setMuted } from "./countdown-sound.js";

const VOLUME_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9a4 4 0 0 1 0 6"/></svg>`;
const VOLUME_X_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M17 9l4 6"/><path d="M21 9l-4 6"/></svg>`;

export function mountSoundMuteButton(container) {
  if (!container) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pgui-btn pgui-btn-outline pgui-btn-sm";
  btn.id = "soundMuteBtn";

  function render() {
    const muted = isMuted();
    btn.innerHTML = muted ? VOLUME_X_ICON : VOLUME_ICON;
    btn.setAttribute("aria-pressed", String(muted));
    btn.setAttribute("aria-label", muted ? "Ativar som" : "Silenciar som");
    btn.title = muted ? "Ativar som do jogo" : "Silenciar som do jogo";
  }

  btn.addEventListener("click", () => setMuted(!isMuted()));
  window.addEventListener("bibflix:sound-muted:change", render);

  render();
  container.prepend(btn);
}
