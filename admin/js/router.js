// Roteador hash minimalista — sem framework, só o suficiente para trocar
// entre "lista de músicas" e "editor de música" dentro de #admin-content.

const routes = [];
let mountEl = null;
let currentCleanup = null;

export function registerRoute(pattern, render) {
  // pattern: ex "/musicas/:id" -> regex com grupos nomeados simples
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        paramNames.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  routes.push({ regex: new RegExp(`^${regexStr}$`), paramNames, render });
}

async function resolve() {
  const hash = window.location.hash.replace(/^#/, '') || '/musicas';
  const [path] = hash.split('?');

  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.paramNames.forEach((name, i) => (params[name] = match[i + 1]));

      if (typeof currentCleanup === 'function') {
        currentCleanup();
        currentCleanup = null;
      }
      mountEl.innerHTML = '';
      currentCleanup = await route.render(mountEl, params);
      return;
    }
  }

  mountEl.innerHTML = '<div class="admin-empty-state"><strong>Página não encontrada</strong></div>';
}

export function navigate(path) {
  window.location.hash = path;
}

export function startRouter(el) {
  mountEl = el;
  window.addEventListener('hashchange', resolve);
  resolve();
}
