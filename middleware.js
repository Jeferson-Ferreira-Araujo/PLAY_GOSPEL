// Routing Middleware da Vercel — roda só nas rotas do matcher abaixo, antes
// de qualquer arquivo estático ser servido. Protege o painel /admin com
// Basic Auth (usuário/senha no popup nativo do navegador) enquanto ele não
// tiver login de verdade.
//
// IMPORTANTE: usuário e senha vêm de variáveis de ambiente (ADMIN_USER /
// ADMIN_PASS), configuradas no painel da Vercel (Project Settings →
// Environment Variables) — nunca ficam no código/repositório. Sem essas
// variáveis configuradas, o acesso fica bloqueado por padrão (fail-closed),
// em vez de abrir sem senha por engano.
//
// Só roda em produção (Vercel) — o servidor local (server.js / `serve`) não
// executa Routing Middleware, então em dev o /admin continua aberto direto.

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};

function unauthorized() {
  return new Response('Autenticação necessária.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="PlayGospel Admin"',
      // Sem isso, um 401 de antes (ex: senha ainda errada) pode ficar
      // guardado no cache do navegador e continuar sendo servido pro
      // CSS/JS mesmo depois de logar certo — layout quebrado mesmo com
      // login correto.
      'Cache-Control': 'no-store',
    },
  });
}

export default function middleware(request) {
  const { pathname } = new URL(request.url);

  // /admin/data/* precisa continuar público sem senha: é de lá que o jogo
  // "Qual é a Música?" busca o catálogo em produção (fetch direto do JSON
  // estático, sem passar pela API) — ver games/qual-e-a-musica/game.js.
  // Só a UI do editor (e o resto de /admin) fica atrás da senha.
  if (pathname.startsWith('/admin/data/')) {
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
  }

  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;

  // Sem as variáveis configuradas na Vercel, nega tudo — nunca deixa aberto.
  if (!expectedUser || !expectedPass) return unauthorized();

  const authHeader = request.headers.get('authorization') || '';
  const [scheme, encoded] = authHeader.split(' ');
  if (scheme !== 'Basic' || !encoded) return unauthorized();

  let decoded = '';
  try {
    decoded = atob(encoded);
  } catch {
    return unauthorized();
  }

  const sepIndex = decoded.indexOf(':');
  const user = sepIndex === -1 ? decoded : decoded.slice(0, sepIndex);
  const pass = sepIndex === -1 ? '' : decoded.slice(sepIndex + 1);

  if (user !== expectedUser || pass !== expectedPass) return unauthorized();

  // Credenciais corretas — deixa a requisição seguir normalmente pro
  // arquivo estático pedido (equivalente ao next() de @vercel/functions,
  // sem precisar adicionar essa dependência só por isso).
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
