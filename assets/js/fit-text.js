// assets/js/fit-text.js
//
// Ajusta dinamicamente o tamanho da fonte do texto central (.stage-text)
// de cada jogo pra sempre caber dentro do .presenter-center, mesmo depois
// de "Mostrar resposta" acrescentar mais conteúdo abaixo (explicação,
// passagem, referência...) — em vez de confiar só num tamanho fixo por
// viewport (clamp em vw, que não sabe quanto espaço realmente sobra numa
// tela baixa ou depois da resposta aparecer), mede o espaço de verdade
// (scrollHeight/scrollWidth vs. clientHeight/clientWidth do container) e
// reduz a fonte até caber, sem cortar nem depender só da rolagem.
//
// O "teto" de tamanho continua vindo do CSS de cada jogo (clamp em
// .stage-text) — este módulo só reduz a partir dali quando o conteúdo
// realmente não cabe; nunca aumenta além do que o CSS já definiria.
//
// Uso: watchStageText(document.querySelector(".presenter-center")) uma
// vez, na inicialização de cada jogo. Dali em diante, o próprio módulo
// reage sozinho a: texto novo (palavra/pergunta trocou, resposta
// revelada), resize, rotação de tela e entrar/sair de tela cheia.

const STEP_PX = 2;
const MIN_FONT_PX = 15;
const MIN_SECONDARY_FONT_PX = 13;
const GUARD_MAX_ITER = 300;

// Textos que aparecem DEPOIS de "Mostrar resposta" (explicação, passagem,
// referência...) — cada jogo usa um nome de classe diferente pro texto
// principal da resposta, por isso a lista. Encolhidos só depois do texto
// central (.stage-text) já estar no mínimo e ainda assim não caber.
const SECONDARY_SELECTOR = ".explain-text, .ref-text, .answer-text, .ae-answer-text, .reference-text";

// Blocos que envolvem a resposta (título + texto + referência) — mesma
// ideia da lista acima, mas pro espaçamento (padding/margem) deles, não
// o texto. Só entra em jogo se, mesmo com todo texto no tamanho mínimo,
// ainda sobrar conteúdo demais pra tela (telas bem baixas).
const SECONDARY_BOX_SELECTOR = ".explain-box, .answer, .ae-answer, .reference-display, .result-wrap";
const SPACING_MIN_SCALE = 0.4;
const SPACING_STEP = 0.08;

const containers = new Set();
let scheduled = false;

function fits(container) {
  return (
    container.scrollHeight <= container.clientHeight + 1 &&
    container.scrollWidth <= container.clientWidth + 1
  );
}

// Lê o tamanho "natural" (definido pelo CSS/clamp do jogo) limpando
// qualquer ajuste inline de uma rodada anterior — assim, se a tela
// cresceu (ex: saiu do celular deitado, ou parou de mostrar a resposta),
// o texto volta a crescer até esse teto antes de checar overflow de novo.
function naturalFontSize(el) {
  const prevInline = el.style.fontSize;
  el.style.fontSize = "";
  const natural = parseFloat(getComputedStyle(el).fontSize);
  el.style.fontSize = prevInline;
  return natural;
}

// Lê padding/margem "naturais" (do CSS) de um elemento, limpando ajuste
// inline de uma rodada anterior — mesma lógica de naturalFontSize().
function naturalSpacing(el) {
  const prevPadding = el.style.padding;
  const prevMarginTop = el.style.marginTop;
  el.style.padding = "";
  el.style.marginTop = "";
  const cs = getComputedStyle(el);
  const spacing = {
    paddingTop: parseFloat(cs.paddingTop) || 0,
    paddingRight: parseFloat(cs.paddingRight) || 0,
    paddingBottom: parseFloat(cs.paddingBottom) || 0,
    paddingLeft: parseFloat(cs.paddingLeft) || 0,
    marginTop: parseFloat(cs.marginTop) || 0,
  };
  el.style.padding = prevPadding;
  el.style.marginTop = prevMarginTop;
  return spacing;
}

function applySpacingScale(el, natural, scale) {
  el.style.paddingTop = `${natural.paddingTop * scale}px`;
  el.style.paddingRight = `${natural.paddingRight * scale}px`;
  el.style.paddingBottom = `${natural.paddingBottom * scale}px`;
  el.style.paddingLeft = `${natural.paddingLeft * scale}px`;
  el.style.marginTop = `${natural.marginTop * scale}px`;
}

function fitOne(container) {
  const el = container.querySelector(".stage-text");
  if (!el || !el.textContent.trim()) return;

  const maxFont = naturalFontSize(el);
  el.style.fontSize = `${maxFont}px`;

  // Textos secundários (resposta/explicação/referência, se já revelados)
  // também voltam ao tamanho natural (CSS) antes de qualquer ajuste —
  // senão um encolhimento de uma rodada anterior "gruda" mesmo quando já
  // sobra espaço de novo.
  const secondaryEls = Array.from(container.querySelectorAll(SECONDARY_SELECTOR));
  const secondaryMax = secondaryEls.map((sEl) => {
    const natural = naturalFontSize(sEl);
    sEl.style.fontSize = `${natural}px`;
    return natural;
  });

  // Espaçamento dos blocos de resposta + gap do container também voltam
  // ao natural aqui (mesmo motivo dos textos acima) — só entram no jogo
  // de novo lá na 3ª fase, se ainda for preciso.
  const boxEls = Array.from(container.querySelectorAll(SECONDARY_BOX_SELECTOR));
  const boxNatural = boxEls.map(naturalSpacing);
  const containerGap = parseFloat(getComputedStyle(container).rowGap) || 0;
  boxEls.forEach((boxEl, i) => applySpacingScale(boxEl, boxNatural[i], 1));
  container.style.rowGap = `${containerGap}px`;

  if (fits(container)) return;

  // 1ª fase: encolhe só o texto central (tem mais margem, de ~100px até
  // o mínimo legível) — cobre a maioria dos casos sozinho.
  let size = maxFont;
  let guard = GUARD_MAX_ITER;
  while (guard-- > 0 && size > MIN_FONT_PX && !fits(container)) {
    size -= STEP_PX;
    el.style.fontSize = `${size}px`;
  }

  // 2ª fase: se ainda não coube (texto central já no mínimo e o bloco de
  // resposta/explicação é grande demais pra tela), encolhe os textos
  // secundários também, cada um até o próprio mínimo.
  if (secondaryEls.length && !fits(container)) {
    let secondarySizes = secondaryMax.slice();
    guard = GUARD_MAX_ITER;
    while (guard-- > 0 && !fits(container) && secondarySizes.some((s) => s > MIN_SECONDARY_FONT_PX)) {
      secondarySizes = secondarySizes.map((s) => Math.max(MIN_SECONDARY_FONT_PX, s - STEP_PX));
      secondaryEls.forEach((sEl, i) => {
        sEl.style.fontSize = `${secondarySizes[i]}px`;
      });
    }
  }

  // 3ª fase: texto já todo no mínimo e ainda não coube — sobra o
  // espaçamento (padding/margem dos blocos de resposta + gap do próprio
  // container). Encolhe os dois juntos, proporcionalmente, até um piso
  // (nunca vira zero — só aperta, não gruda o conteúdo todo).
  if (!fits(container)) {
    let scale = 1;
    guard = GUARD_MAX_ITER;
    while (guard-- > 0 && !fits(container) && scale > SPACING_MIN_SCALE) {
      scale = Math.max(SPACING_MIN_SCALE, scale - SPACING_STEP);
      boxEls.forEach((boxEl, i) => applySpacingScale(boxEl, boxNatural[i], scale));
      container.style.rowGap = `${containerGap * scale}px`;
    }
  }

  // Se mesmo assim não coube (conteúdo excepcionalmente longo numa tela
  // muito pequena), o overflow-y:auto do .presenter-center continua ali
  // como rede de segurança — rola em vez de cortar.
}

function runAll() {
  scheduled = false;
  containers.forEach(fitOne);
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(runAll);
}

let globalListenersWired = false;
function wireGlobalListeners() {
  if (globalListenersWired) return;
  globalListenersWired = true;
  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);
  document.addEventListener("fullscreenchange", schedule);
}

/** Passa a cuidar do texto central dentro de `container` (normalmente
 * .presenter-center). Reage sozinho a mudanças de texto (MutationObserver),
 * de layout do próprio container (ResizeObserver) e da janela/tela. */
export function watchStageText(container) {
  if (!container || containers.has(container)) return;
  containers.add(container);

  const mo = new MutationObserver(schedule);
  mo.observe(container, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class"],
  });

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
  }

  wireGlobalListeners();
  schedule();
}
