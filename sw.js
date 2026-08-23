// LazyLibrarian PWA service worker — shell cache + permanent auth helper
const CACHE = 'll-pwa-v1';
const SHELL = ['/', '/authors', '/css/aquamarine.css', '/css/lazylibrarian-base.css'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

// Network-first for everything (server is always reachable); cache shell as fallback
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API + login always network (never cache auth/session)
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) {
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
  );
});

// Message handler: persist API key for permanent device auth
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SAVE_AUTH') {
    // Store in IndexedDB via cache trick: keep a dedicated auth cache entry
    const key = e.data.apiKey;
    const resp = new Response(JSON.stringify({ apiKey: key }), {
      headers: { 'Content-Type': 'application/json' },
    });
    caches.open('ll-auth').then((c) => c.put('/__auth__', resp));
    e.ports[0].postMessage({ ok: true });
  }
  if (e.data && e.data.type === 'GET_AUTH') {
    caches.match('/__auth__').then((m) => {
      if (m) {
        m.json().then((d) => e.ports[0].postMessage({ apiKey: d.apiKey }));
      } else {
        e.ports[0].postMessage({ apiKey: null });
      }
    });
  }
});
