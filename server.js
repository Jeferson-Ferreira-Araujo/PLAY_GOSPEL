// Servidor local de desenvolvimento/autoria do PlayGospel.
//
// Serve os arquivos estáticos do site (index.html, assets/, games/, admin/)
// e expõe uma API REST simples para o Editor de Músicas (admin/) gravar o
// catálogo de músicas em admin/data/songs.json.
//
// Uso: node server.js  (porta padrão 5177, ajustável via PORT)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const songsRepository = require('./server/songsRepository');

const ROOT = __dirname;
const PORT = process.env.PORT || 5177;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function validateSong(song) {
  if (!song || typeof song !== 'object') return 'Corpo inválido.';
  if (!song.title || !String(song.title).trim()) return 'Nome da música é obrigatório.';
  if (!song.artist || !String(song.artist).trim()) return 'Artista/banda é obrigatório.';
  if (!song.key || !String(song.key).trim()) return 'Tom é obrigatório.';
  if (!Array.isArray(song.notes)) return 'Notas devem ser uma lista.';
  return null;
}

async function handleApi(req, res, pathname) {
  const parts = pathname.split('/').filter(Boolean); // ['api', 'songs', ':id'?]
  const id = parts[2];

  if (parts.length === 2 && req.method === 'GET') {
    return sendJson(res, 200, await songsRepository.list());
  }

  if (parts.length === 2 && req.method === 'POST') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: 'JSON inválido.' });
    }
    const error = validateSong(payload);
    if (error) return sendJson(res, 400, { error });
    const created = await songsRepository.create(payload);
    return sendJson(res, 201, created);
  }

  if (parts.length === 3 && req.method === 'GET') {
    const song = await songsRepository.get(id);
    if (!song) return sendJson(res, 404, { error: 'Música não encontrada.' });
    return sendJson(res, 200, song);
  }

  if (parts.length === 3 && req.method === 'PUT') {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: 'JSON inválido.' });
    }
    const error = validateSong(payload);
    if (error) return sendJson(res, 400, { error });
    const updated = await songsRepository.update(id, payload);
    if (!updated) return sendJson(res, 404, { error: 'Música não encontrada.' });
    return sendJson(res, 200, updated);
  }

  if (parts.length === 3 && req.method === 'DELETE') {
    const ok = await songsRepository.remove(id);
    if (!ok) return sendJson(res, 404, { error: 'Música não encontrada.' });
    return sendJson(res, 204, null);
  }

  return sendJson(res, 404, { error: 'Rota não encontrada.' });
}

function serveStatic(req, res, pathname) {
  let filePath = path.join(ROOT, decodeURIComponent(pathname));
  if (pathname.endsWith('/')) filePath = path.join(filePath, 'index.html');

  // Impede sair da raiz do projeto (path traversal).
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Não encontrado');
    }
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    try {
      return await handleApi(req, res, url.pathname);
    } catch (err) {
      console.error(err);
      return sendJson(res, 500, { error: 'Erro interno do servidor.' });
    }
  }

  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`PlayGospel dev server rodando em http://localhost:${PORT}`);
  console.log(`Editor de Músicas: http://localhost:${PORT}/admin/`);
});
