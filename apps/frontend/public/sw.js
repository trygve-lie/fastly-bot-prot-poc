const CACHE_NAME = 'wa-assets';

// Path prefixes for immutable versioned assets — safe to cache forever per URL.
// New WebAwesome version = new URL paths = new cache entries automatically.
const IMMUTABLE_PREFIXES = ['/public/awesome/', '/icons/'];

function isImmutableAsset(url) {
  try {
    const { origin, pathname } = new URL(url);
    if (origin !== self.location.origin) return false;
    return IMMUTABLE_PREFIXES.some(p => pathname.startsWith(p));
  } catch {
    return false;
  }
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    // Clear asset cache on every new SW activation so fresh deploys
    // (including WebAwesome version bumps) always fetch current assets.
    caches.delete(CACHE_NAME).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  if (isImmutableAsset(request.url)) {
    // Cache-first: versioned immutable assets (WebAwesome CSS/JS, icons).
    e.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // All other requests (navigations, API calls, manifest, etc.): pass through to network.
  // Navigations are intentionally not intercepted — the SW must not add latency
  // to page loads since that can exceed Chrome's view transition tolerance on mobile.
  e.respondWith(fetch(request));
});
