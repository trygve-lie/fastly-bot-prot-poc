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
  // Clear the asset cache on every new SW activation. This ensures that a
  // fresh deployment (including a WebAwesome version bump) always re-fetches
  // current assets on first access. The cache is rebuilt on demand from there.
  e.waitUntil(caches.delete(CACHE_NAME).then(() => clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  if (isImmutableAsset(request.url)) {
    // Cache-first: versioned immutable assets (WebAwesome CSS/JS, icons).
    // A cache hit returns instantly; a miss fetches from the network and
    // populates the cache for all subsequent requests.
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
    // Network-first for page navigations: always try the network so users
    // see fresh content. Cache the response as an offline fallback.
    e.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (API calls, manifest, etc.): pass through to network.
  e.respondWith(fetch(request));
});
