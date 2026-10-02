import { Hono } from 'hono';

/**
 * Builds a search payload from URLSearchParams.
 * Supports: q, county (repeatable), vehicle_type, max_price, max_mileage, page, page_size.
 * @param {URLSearchParams} p
 * @returns {Object}
 */
function buildApiSearchPayload(p) {
  const counties = p.getAll('county').filter(Boolean);
  const filters = [];
  if (counties.length === 1) filters.push({ field: 'county', operator: 'eq', value: counties[0] });
  else if (counties.length > 1) filters.push({ field: 'county', operator: 'in', value: counties });
  const vehicleType = p.get('vehicle_type');
  if (vehicleType) filters.push({ field: 'vehicle_type', operator: 'eq', value: vehicleType });
  const fuelType = p.get('fuel_type');
  if (fuelType) filters.push({ field: 'fuel_type', operator: 'eq', value: fuelType });
  const maxPrice = p.get('max_price');
  if (maxPrice) filters.push({ field: 'total_price', operator: 'lte', value: parseInt(maxPrice) });
  const maxMileage = p.get('max_mileage');
  if (maxMileage) filters.push({ field: 'mileage_km', operator: 'lte', value: parseInt(maxMileage) });
  return {
    query_text: p.get('q') || '',
    filters,
    page: Math.max(1, parseInt(p.get('page') || '1')),
    page_size: Math.min(50, Math.max(1, parseInt(p.get('page_size') || '10'))),
    language_hint: 'no',
  };
}

/**
 * Creates the API sub-application containing all JSON-returning endpoints.
 * Mounts: POST /search, POST /discover/similar, POST /discover/recommendations,
 * GET /api/vehicles/:id, GET /api/vehicles/:id/similar, GET /api/search,
 * GET /api/recommendations.
 * @param {Object} state - Application state from buildDemoState.
 * @returns {Hono}
 */
export function createApiRouter(state) {
  const app = new Hono();

  app.post('/search', async c => {
    const payload = await c.req.json();
    return c.json(state.app.search(payload));
  });

  app.post('/discover/similar', async c => {
    const payload = await c.req.json();
    return c.json(state.app.discoverSimilar(payload));
  });

  app.post('/discover/recommendations', async c => {
    const payload = await c.req.json();
    return c.json(state.app.discoverRecommendations(payload));
  });

  // ── REST API (/api/*) ──────────────────────────────────────────────────────
  // Intended for consumption by third-party services. All endpoints return JSON.
  // Existing POST endpoints above remain available alongside these GET routes.

  /** GET /api/vehicles/:id — retrieve a single vehicle document by ID. */
  app.get('/api/vehicles/:id', c => {
    const doc = state.app.documentRepository.get(c.req.param('id'));
    if (!doc) return c.json({ error: 'Not found', listing_id: c.req.param('id') }, 404);
    return c.json(doc);
  });

  /** GET /api/vehicles/:id/similar — similar vehicles for a given ID. Query: limit. */
  app.get('/api/vehicles/:id/similar', c => {
    const id = c.req.param('id');
    if (!state.app.documentRepository.get(id)) return c.json({ error: 'Not found', listing_id: id }, 404);
    const limit = parseInt(c.req.query('limit') || '0') || undefined;
    return c.json(state.app.discoverSimilar({ listing_id: id, limit }));
  });

  /**
   * GET /api/search — full-text and filtered search.
   * Query params: q, county (repeatable), vehicle_type, max_price, max_mileage, page, page_size.
   */
  app.get('/api/search', c => {
    const p = new URL(c.req.url, 'http://localhost').searchParams;
    const payload = buildApiSearchPayload(p);
    const result = state.app.search(payload);
    return c.json({
      query: payload.query_text,
      filters: payload.filters,
      page: payload.page,
      page_size: payload.page_size,
      hits: result.hits,
      facets: result.facets,
      latency_breakdown: result.latency_breakdown,
    });
  });

  /**
   * GET /api/recommendations — recommendations for a search or a browse feed when no query.
   * Query params: q, county (repeatable), vehicle_type, max_price, max_mileage, limit, cluster.
   * When q is absent: returns a browse feed for the given cluster (default: commuters).
   * When q is present: runs a search and derives recommendations from the top results.
   */
  /** GET /api/sitemap — all vehicle IDs for sitemap generation. */
  app.get('/api/sitemap', c => {
    const ids = state.app.documentRepository.list().map(d => d.listing_id);
    return c.json({ listing_ids: ids });
  });

  /** GET /api/intent — random intent browse feed; query: limit. */
  app.get('/api/intent', c => {
    const segments = state.config.behavior.user_segments.map(s => s.name);
    const cluster = segments[Math.floor(Math.random() * segments.length)];
    const intent = cluster.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    const limit = parseInt(c.req.query('limit') || '0') || undefined;
    const result = state.app.browseIntentCluster({ cluster, limit });
    return c.json({ intent, cluster, hits: result.hits });
  });

  app.get('/api/recommendations', c => {
    const p = new URL(c.req.url, 'http://localhost').searchParams;
    const limit = parseInt(p.get('limit') || '0') || undefined;
    const queryText = p.get('q') || '';
    if (!queryText) {
      const cluster = p.get('cluster') || 'commuters';
      const result = state.app.browseIntentCluster({ cluster, limit });
      return c.json({ surface: 'browse', cluster, hits: result.hits });
    }
    const payload = buildApiSearchPayload(p);
    const searchResult = state.app.search(payload);
    const recs = state.app.discoverRecommendations({ ...payload, limit }, searchResult.rerankedHits);
    return c.json({ surface: 'search_recommendations', query: queryText, hits: recs.hits });
  });

  return app;
}
