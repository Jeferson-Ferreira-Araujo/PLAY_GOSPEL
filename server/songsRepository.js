// Camada de acesso a dados das músicas do "Qual é a Música?".
//
// Hoje persiste em admin/data/songs.json. A ideia é que, quando o
// cadastro migrar para um banco de dados, apenas este arquivo mude
// (mesma assinatura de funções) — o server.js e o front-end não
// precisam saber onde os dados realmente moram.

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'admin', 'data', 'songs.json');

// Escritas em fila para evitar duas gravações concorrentes corromperem o JSON.
let writeQueue = Promise.resolve();

async function readAll() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw || '[]');
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function writeAll(songs) {
  writeQueue = writeQueue.then(() =>
    fs.writeFile(DATA_FILE, JSON.stringify(songs, null, 2) + '\n', 'utf-8')
  );
  return writeQueue;
}

async function list() {
  const songs = await readAll();
  return songs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function get(id) {
  const songs = await readAll();
  return songs.find((s) => s.id === id) || null;
}

async function create(song) {
  const songs = await readAll();
  const now = new Date().toISOString();
  const newSong = {
    id: crypto.randomUUID(),
    ...song,
    createdAt: now,
    updatedAt: now,
  };
  songs.push(newSong);
  await writeAll(songs);
  return newSong;
}

async function update(id, patch) {
  const songs = await readAll();
  const index = songs.findIndex((s) => s.id === id);
  if (index === -1) return null;
  const updated = {
    ...songs[index],
    ...patch,
    id: songs[index].id,
    createdAt: songs[index].createdAt,
    updatedAt: new Date().toISOString(),
  };
  songs[index] = updated;
  await writeAll(songs);
  return updated;
}

async function remove(id) {
  const songs = await readAll();
  const index = songs.findIndex((s) => s.id === id);
  if (index === -1) return false;
  songs.splice(index, 1);
  await writeAll(songs);
  return true;
}

module.exports = { list, get, create, update, remove };
