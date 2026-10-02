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
    Promise.all([
      // Clear asset cache on every new SW activation so fresh deploys
      // (including WebAwesome version bumps) always fetch current assets.
      caches.delete(CACHE_NAME),
      // Navigation Preload: Chrome starts the navigation network request in
      // parallel with SW startup, eliminating cold-start latency on navigations.
      self.registration.navigationPreload?.enable(),
    ]).then(() => clients.claim())
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

  if (request.mode === 'navigate') {
    // Network-first for page navigations. Uses the Navigation Preload response
    // when available (already in flight during SW startup) to avoid a redundant
    // second network request. Falls back to a fresh fetch, then to cache offline.
    e.respondWith(
      (async () => {
        try {
          const preload = await e.preloadResponse;
          const response = preload ?? await fetch(request);
          if (response?.ok) {
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, response.clone()));
          }
          return response;
        } catch {
          return caches.match(request);
        }
      })()
    );
    return;
  }

  // Everything else (API calls, manifest, etc.): pass through to network.
  e.respondWith(fetch(request));
});
