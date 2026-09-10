// Routing Middleware da Vercel — roda só nas rotas do matcher abaixo, antes
// de qualquer arquivo estático ser servido.
//
// O painel /admin (editor de músicas) não é usado em produção — só
// localmente (`node server.js`), onde esse middleware nem roda. Então, em
// vez de Basic Auth (teve problema real de navegador não reenviar a senha
// pros arquivos de CSS/JS depois do login), a rota fica simplesmente
// desativada em produção: qualquer coisa em /admin/* vira 404.
//
// Exceção: /admin/data/* continua público — é de lá que o jogo "Qual é a
// Música?" busca o catálogo em produção (fetch direto do JSON estático,
// sem passar pela API) — ver games/qual-e-a-musica/game.js.

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};

export default function middleware(request) {
  const { pathname } = new URL(request.url);

  if (pathname.startsWith('/admin/data/')) {
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
  }

  return new Response('Não encontrado.', { status: 404 });
}
