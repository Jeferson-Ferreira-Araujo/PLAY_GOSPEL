// assets/js/match-type.js
// Fonte única dos "formatos" de jogo (games.json "matchType") — ícone,
// rótulo, descrição curta/longa e a imagem ilustrativa (assets/img/
// match-type/*.webp). Consumido pelo catálogo (badge do card + modal de
// detalhes) e pelo modal "como jogar" de disputa sorteada (game-intro.js)
// — um jogo novo só precisa declarar o "matchType" certo em games.json
// pra já entrar com selo, imagem e texto corretos em todo lugar, sem
// precisar tocar em nenhum desses arquivos.
export const MATCH_TYPES = {
  equipe: {
    label: "Equipe",
    icon: "users",
    sub: "Toda a equipe responde junto",
    text: "toda a equipe responde junto — não precisa esperar uma pessoa só, qualquer um pode responder.",
    // Caminho absoluto (barra no início): funciona igual tanto no
    // catálogo (raiz do site) quanto dentro de games/<id>/ (2 níveis
    // abaixo), sem precisar calcular "../../" em cada lugar que usa.
    image: "/assets/img/match-type/equipe.webp",
  },
  disputa: {
    label: "Disputa",
    icon: "flame",
    sub: "2 equipes respondem juntas",
    text: "as equipes respondem juntas ao mesmo tempo — quem acertar primeiro leva o ponto.",
    image: "/assets/img/match-type/disputa.webp",
  },
  rodada: {
    label: "Rodada",
    icon: "refresh",
    sub: "Uma equipe por vez, em turnos",
    text: "as equipes jogam uma de cada vez, em turnos.",
    image: "/assets/img/match-type/rodada.webp",
  },
};
