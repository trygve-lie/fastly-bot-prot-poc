// Minimal service worker — required for PWA installability.
// No fetch handler: requests go straight to the network, so the browser handles
// Fastly's bot challenge (interstitial page, cookies, reloads) natively.
// Re-fetching via respondWith() turns any failed fetch into a hard ERR_FAILED.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
