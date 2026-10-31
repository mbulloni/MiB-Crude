// Service worker of the installable app (MiB-Crude): assets (versioned with ?v=) from the cache, pages always
// from the network (never kept: they hold the data of the signed-in user); without network an offline message.
const CACHE = 'mibcrude-v1';
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Offline</title><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Offline</h1>'
  + '<p>Nessuna connessione: l\'app tornerà disponibile appena la rete è di nuovo raggiungibile.</p>'
  + '<p>No connection: the app will be back as soon as the network is reachable again.</p><button onclick="location.reload()">↻</button></body>';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const url = new URL(req.url);
  // static files of the app and of the theme: cache first (their address changes with every version)
  if (/\/(assets|theme)\//.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }))));
    return;
  }
  // pages: from the network only
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
  }
});
