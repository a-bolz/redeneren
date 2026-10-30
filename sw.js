const CACHE = 'redeneren-v1';
const ASSETS = [
  '.', 'index.html', 'style.css', 'icon.svg', 'manifest.json',
  'app.js', 'items.js', 'state.js', 'session.js', 'flow.js', 'keypad.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      // CacheStorage is origin-wide and flitsen/rekenen live on the same
      // origin — only ever delete our own app's old caches.
      Promise.all(keys.filter(k => k.startsWith('redeneren-') && k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
