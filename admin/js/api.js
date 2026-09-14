// Cliente HTTP para a API de músicas. Isola o front-end do detalhe de
// que hoje isso é um JSON em disco — quando virar banco de dados, só o
// server.js/songsRepository.js muda, este contrato continua o mesmo.

const BASE_URL = '/api/songs';

async function request(url, options) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || `Erro ${res.status}`);
  }
  return data;
}

export const songsApi = {
  list: () => request(BASE_URL),
  get: (id) => request(`${BASE_URL}/${id}`),
  create: (song) => request(BASE_URL, { method: 'POST', body: JSON.stringify(song) }),
  update: (id, song) => request(`${BASE_URL}/${id}`, { method: 'PUT', body: JSON.stringify(song) }),
  remove: (id) => request(`${BASE_URL}/${id}`, { method: 'DELETE' }),
};

// Lê o cadastro de visitantes (nome/WhatsApp/igreja/cidade) direto da
// Planilha Google — o server.js repassa a chamada pro Apps Script
// (assets/js/app.js:65) pra não expor o token de novo aqui.
export const visitorsApi = {
  list: () => request('/api/visitors'),
};
