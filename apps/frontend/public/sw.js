// Minimal service worker — required for PWA installability.
// Passes all requests through to the network with no caching.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
