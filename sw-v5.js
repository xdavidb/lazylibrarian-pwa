// LazyLibrarian PWA — full design layer via service-worker injection
// v2.1 (2026-08-23): ALL design changes injected at page-load. No LL file changes.
// Works on any LazyLibrarian install behind a proxy.
const CACHE = 'll-pwa-v5';
// NOTE: only static assets here. NEVER precache HTML pages like /books —
// they 303-redirect to login when unauthenticated, which makes addAll() fail
// and the whole SW install fails.
const SHELL = ['/ll-pwa/css/lazylibrarian-base.css', '/ll-pwa/css/aquamarine.css',
               '/ll-pwa/css/injected.css', '/ll-pwa/js/injected.js'];

// ---- HTML injections (per-page) ----
// Theme CSS order: lazylibrarian-base (structure) -> aquamarine (colors) -> injected (mobile layout)
function injectCss(html) {
  if (html.indexOf('ll-injected-css') !== -1) return html;
  return html.replace('</head>',
    '<link rel="stylesheet" id="ll-injected-css" href="/ll-pwa/css/lazylibrarian-base.css">' +
    '<link rel="stylesheet" href="/ll-pwa/css/aquamarine.css">' +
    '<link rel="stylesheet" href="/ll-pwa/css/injected.css">' +
    '</head>');
}
function injectJs(html) {
  if (html.indexOf('ll-injected-js') !== -1) return html;
  return html.replace('</body>', '<script id="ll-injected-js" src="/ll-pwa/js/injected.js"></script></body>');
}
// force OUR PWA manifest on every page (LL's own link points at its broken images/manifest.json)
function injectManifest(html) {
  if (html.indexOf('ll-pwa-manifest') !== -1) return html;
  // remove LL's own manifest link if present, then add ours
  html = html.replace(/<link[^>]*rel=["']manifest["'][^>]*>/i, '');
  return html.replace('</head>',
    '<link rel="manifest" id="ll-pwa-manifest" href="/manifest.json">' +
    '<meta name="theme-color" content="#47918a">' +
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">' +
    '</head>');
}
// move length selector to bottom: rewrite DataTables dom strings
function rewriteDom(html) {
  var old = "<'row'<'col-xs-6'l><'col-xs-6'f>><'row'<'col-sm-12'tr>><'row'<'col-sm-5'i><'col-sm-7'p>>";
  var neu = "<'row'<'col-xs-12'f>><'row'<'col-sm-12'tr>><'row'<'col-sm-12'i><'col-sm-12'l><'col-sm-12'p>>";
  return html.split(old).join(neu);
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE && k !== 'll-auth').map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // never touch API (session + api calls stay clean)
  // NOTE: /auth/ login page IS injected (needs theme CSS); only /api excluded
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ll-pwa/')) {
    return;
  }
  // HTML pages: network-first, inject
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept')||'').indexOf('text/html') !== -1) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (!res || res.status !== 200) return res;
        const ct = res.headers.get('content-type') || '';
        if (ct.indexOf('text/html') === -1) return res;
        return res.text().then((html) => {
          html = rewriteDom(html);
          html = injectCss(html);
          html = injectJs(html);
          html = injectManifest(html);
          // body length changed -> strip Content-Length/Encoding or the browser truncates
          const headers = new Headers(res.headers);
          headers.delete('content-length');
          headers.delete('content-encoding');
          return new Response(html, {
            status: res.status,
            statusText: res.statusText,
            headers: headers
          });
        });
      }).catch(() => caches.match(e.request).then((m) => m || caches.match('/')))
    );
    return;
  }
  // static: pass through (SW only injects HTML)
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// auth persistence (for auto-login + permanent device auth)
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SAVE_AUTH') {
    const resp = new Response(JSON.stringify({
      username: e.data.username || '',
      password: e.data.password || '',
      apiKey: e.data.apiKey || ''
    }), { headers: { 'Content-Type': 'application/json' } });
    caches.open('ll-auth').then((c) => c.put('/__auth__', resp));
    e.ports[0].postMessage({ ok: true });
  }
  if (e.data && e.data.type === 'GET_AUTH') {
    caches.match('/__auth__').then((m) => {
      if (m) { m.json().then((d) => e.ports[0].postMessage(d)); }
      else { e.ports[0].postMessage({ username: null, password: null, apiKey: null }); }
    });
  }
});
