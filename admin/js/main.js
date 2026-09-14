import { registerRoute, startRouter } from './router.js';
import { renderMusicsList } from './pages/musicsList.js';
import { renderMusicEditor } from './pages/musicEditor.js';
import { renderUsersList } from './pages/usersList.js';

registerRoute('/musicas', renderMusicsList);
registerRoute('/musicas/novo', renderMusicEditor);
registerRoute('/musicas/:id', renderMusicEditor);
registerRoute('/usuarios', renderUsersList);

startRouter(document.getElementById('admin-content'));

// Sincroniza o item ativo do menu lateral com a rota atual.
function syncActiveNav() {
  const route = (window.location.hash.replace(/^#\//, '').split('/')[0]) || 'musicas';
  document.querySelectorAll('.admin-nav-item[data-route]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.route === route);
  });
}
window.addEventListener('hashchange', syncActiveNav);
syncActiveNav();
