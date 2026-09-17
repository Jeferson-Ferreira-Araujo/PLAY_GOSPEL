// Service worker mínimo: só existe pra habilitar "Adicionar à tela
// inicial" (instalabilidade exige um SW com handler de fetch) e dar uma
// resiliência básica offline — útil pra quem joga num local com sinal
// fraco. Estratégia network-first: sempre tenta a rede primeiro (pra não
// servir versão desatualizada enquanto online) e só cai pro cache quando
// a rede falha de verdade.
const CACHE_NAME = "avivaplay-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/assets/css/styles.css",
  "/assets/js/app.js",
  "/assets/img/avivaplay-logo.webp",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
