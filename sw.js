/* DESPERTAR — service worker
   Arquivos do site: rede primeiro (sempre a versão nova quando há internet) e cópia guardada quando está offline.
   Fontes do Google: cópia guardada primeiro. Outros domínios (como a API do Telegram) passam direto. */
const VERSAO = 'despertar-v8';
const ESSENCIAIS = ['./', 'index.html', 'css/style.css', 'js/data.js', 'js/app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== VERSAO + '-fontes').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp.ok) { const copia = resp.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
        return resp;
      } catch (err) {
        const c = await caches.open(VERSAO);
        return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('index.html') : undefined) || Response.error();
      }
    })());
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSAO + '-fontes').then(async c => {
      const guardada = await c.match(req); if (guardada) return guardada;
      try { const resp = await fetch(req); if (resp.ok || resp.type === 'opaque') c.put(req, resp.clone()); return resp; } catch (err) { return Response.error(); }
    }));
  }
});
