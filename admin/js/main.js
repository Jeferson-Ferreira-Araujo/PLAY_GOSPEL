import { registerRoute, startRouter } from './router.js';
import { renderMusicsList } from './pages/musicsList.js';
import { renderMusicEditor } from './pages/musicEditor.js';

registerRoute('/musicas', renderMusicsList);
registerRoute('/musicas/novo', renderMusicEditor);
registerRoute('/musicas/:id', renderMusicEditor);

startRouter(document.getElementById('admin-content'));
