// Helpers para tocar um trecho de um vídeo do YouTube embutido (sem baixar
// nada — só monta a URL de embed com os parâmetros start/end nativos).
// Usado pela listagem do admin (ouvir a música original) e pelo jogo
// público (revelar a música original ao final da rodada).

/** Extrai o ID de vídeo de qualquer formato comum de link do YouTube. */
export function extractYoutubeId(url) {
  const match = String(url || '').match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/**
 * Monta a URL de embed pra tocar a partir de `start` segundos.
 * Por padrão também para em `end` (útil pro admin comparar o trechinho
 * exato cadastrado); passe `respectEnd: false` pra ignorar o fim e deixar
 * tocar livremente dali em diante — é o que o jogo usa na revelação, já
 * que ali a ideia é a equipe curtir a música o quanto quiser, não só ouvir
 * o pedacinho gravado.
 * Retorna null se o link não for um YouTube válido.
 */
export function buildEmbedUrl(url, start = 0, end = 0, { autoplay = true, respectEnd = true } = {}) {
  const videoId = extractYoutubeId(url);
  if (!videoId) return null;

  const s = Math.max(0, Number(start) || 0);
  const e = Number(end) || 0;

  const params = new URLSearchParams();
  params.set('start', String(s));
  if (respectEnd && e > s) params.set('end', String(e));
  if (autoplay) params.set('autoplay', '1');

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
