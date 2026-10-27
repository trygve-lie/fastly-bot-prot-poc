import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { createSchemas } from './schemas.js';
import { createResponseCache } from './responseCache.js';
import { publishedAt } from '../generation/published.js';

const SERVICE_NAME = 'api-recommerce';
const SERVICE_VERSION = '1.0.0';
const RESPONSE_CACHE_ENTRIES = 1000;
const DEFAULT_CLUSTER = 'bargain_hunters';

/**
 * Formats Zod validation failures into the service's ValidationError shape (HTTP 400).
 * Shared by every route via OpenAPIHono's defaultHook.
 * @param {{ success: boolean, error?: import('zod').ZodError }} result
 * @param {import('hono').Context} c
 * @returns {Response|undefined}
 */
function validationErrorHook(result, c) {
  if (result.success) return undefined;
  return c.json({
    error: 'Invalid request',
    issues: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  }, 400);
}

/**
 * Converts validated search query parameters into a search payload with structured filters.
 * @param {Object} query - Output of the SearchQuery schema.
 * @returns {Object}
 */
function buildApiSearchPayload(query) {
  const counties = [].concat(query.county ?? []);
  const filters = [];
  if (counties.length === 1) filters.push({ field: 'county', operator: 'eq', value: counties[0] });
  else if (counties.length > 1) filters.push({ field: 'county', operator: 'in', value: counties });
  if (query.category) filters.push({ field: 'category', operator: 'eq', value: query.category });
  if (query.subcategory) filters.push({ field: 'subcategory', operator: 'eq', value: query.subcategory });
  if (query.brand) filters.push({ field: 'brand', operator: 'eq', value: query.brand });
  if (query.condition) filters.push({ field: 'condition', operator: 'eq', value: query.condition });
  if (query.min_price != null) filters.push({ field: 'total_price', operator: 'gte', value: query.min_price });
  if (query.max_price != null) filters.push({ field: 'total_price', operator: 'lte', value: query.max_price });
  if (query.shipping === 'true') filters.push({ field: 'shipping_available', operator: 'eq', value: true });
  return {
    query_text: query.q || '',
    filters,
    page: query.page ?? 1,
    page_size: query.page_size ?? 10,
    geo: query.radius_km != null ? { lat: query.lat, lng: query.lng, radius_km: query.radius_km } : null,
    sort: query.sort ?? 'relevance',
  };
}

/**
 * Returns an OpenAPI response entry with a JSON body.
 * @param {import('zod').ZodType} schema
 * @param {string} description
 * @returns {Object}
 */
function jsonResponse(schema, description) {
  return { description, content: { 'application/json': { schema } } };
}

/**
 * Defines every route of the API (path, parameters, request bodies, response schemas).
 * The definitions drive request validation and the generated OpenAPI document.
 * @param {ReturnType<typeof createSchemas>} s
 * @returns {Object.<string, Object>}
 */
function defineRoutes(s) {
  const invalid = jsonResponse(s.ValidationError, 'Invalid request parameters');
  const notFound = jsonResponse(s.Error, 'No item with this ID');
  const jsonBody = schema => ({ required: true, content: { 'application/json': { schema } } });

  return {
    search: createRoute({
      method: 'get', path: '/api/search', tags: ['Search'],
      summary: 'Search items',
      description: 'Hybrid full-text (FTS5 BM25 with Norwegian/English synonym expansion) and vector search with structured filters, reranking and facets. Filter by price with `min_price`/`max_price`, by distance with `lat` + `lng` + `radius_km` (hits then include `distance_km`), and use `sort=newest` for the most recently published first. Results are capped at the 50 best (or, with `sort=newest`, 50 newest) matches.',
      request: { query: s.SearchQuery },
      responses: { 200: jsonResponse(s.SearchResponse, 'Paged search results with facets'), 400: invalid },
    }),
    item: createRoute({
      method: 'get', path: '/api/items/{id}', tags: ['Items'],
      summary: 'Get an item',
      description: 'Returns the full search document for one second-hand item, with its images, approximate location and publish time.',
      request: { params: s.IdParam },
      responses: { 200: jsonResponse(s.Item, 'The item'), 404: notFound },
    }),
    similar: createRoute({
      method: 'get', path: '/api/items/{id}/similar', tags: ['Items'],
      summary: 'Get similar items',
      description: 'Items similar to the given item, scored by subcategory, brand, vector similarity, features, price, condition and freshness.',
      request: { params: s.IdParam, query: s.LimitQuery },
      responses: { 200: jsonResponse(s.DiscoveryResponse, 'Similar items'), 400: invalid, 404: notFound },
    }),
    intent: createRoute({
      method: 'get', path: '/api/intent', tags: ['Discovery'],
      summary: 'Random intent feed',
      description: 'Picks a random intent cluster (user segment) and returns its browse feed. Each call may return a different intent.',
      request: { query: s.LimitQuery },
      responses: { 200: jsonResponse(s.IntentResponse, 'Intent label and its browse feed'), 400: invalid },
    }),
    recommendations: createRoute({
      method: 'get', path: '/api/recommendations', tags: ['Discovery'],
      summary: 'Recommendations or browse feed',
      description: `Without \`q\`: browse feed for \`cluster\` (default \`${DEFAULT_CLUSTER}\`). With \`q\`: runs a search and derives diversified recommendations from the results.`,
      request: { query: s.RecommendationsQuery },
      responses: { 200: jsonResponse(s.RecommendationsResponse, 'Recommended items'), 400: invalid },
    }),
    sitemap: createRoute({
      method: 'get', path: '/api/sitemap', tags: ['Sitemap'],
      summary: 'All item IDs',
      description: 'IDs of all active items, used by the frontend to build sitemap.xml.',
      responses: { 200: jsonResponse(s.SitemapResponse, 'All active item IDs') },
    }),
    rawSearch: createRoute({
      method: 'post', path: '/search', tags: ['Search (POST)'],
      summary: 'Search with a structured request body',
      description: 'Lower-level search taking structured filters directly. Returns both the current page and the full reranked candidate pool.',
      request: { body: jsonBody(s.SearchRequestBody) },
      responses: { 200: jsonResponse(s.RawSearchResponse, 'Search results'), 400: invalid },
    }),
    discoverSimilar: createRoute({
      method: 'post', path: '/discover/similar', tags: ['Search (POST)'],
      summary: 'Similar items (POST)',
      request: { body: jsonBody(s.SimilarRequestBody) },
      responses: { 200: jsonResponse(s.DiscoveryResponse, 'Similar items'), 400: invalid, 404: notFound },
    }),
    discoverRecommendations: createRoute({
      method: 'post', path: '/discover/recommendations', tags: ['Search (POST)'],
      summary: 'Recommendations for a search (POST)',
      request: { body: jsonBody(s.RecommendationsRequestBody) },
      responses: { 200: jsonResponse(s.DiscoveryResponse, 'Recommended items'), 400: invalid },
    }),
  };
}

/**
 * Creates the API sub-application containing all JSON-returning endpoints, with request
 * validation and an OpenAPI 3.1 document at GET /openapi.json generated from the route definitions.
 * @param {Object} state - Application state from buildDemoState.
 * @returns {OpenAPIHono}
 */
export function createApiRouter(state) {
  const app = new OpenAPIHono({ defaultHook: validationErrorHook });
  const schemas = createSchemas(state.config);
  const routes = defineRoutes(schemas);
  const notFound = (c, id) => c.json({ error: 'Not found', listing_id: id }, 404);
  // Adds images, approximate location and publish time to an item or hit.
  const withDetails = ({ latitude, longitude, publish_minute, ...item }) => {
    // latitude/longitude/publish_minute are internal search-document fields; exposed as location/published_at.
    const meta = state.listingMeta.get(item.listing_id);
    return {
      ...item,
      images: (state.images.get(item.listing_id) ?? []).map(({ file, alt, width, height }) => ({ url: `/images/${file}`, alt, width, height })),
      location: meta?.latitude != null
        ? { lat: meta.latitude, lng: meta.longitude, area: meta.location_area, precision: 'approximate' }
        : null,
      published_at: meta ? publishedAt(meta.days_on_market, meta.publish_minute) : null,
    };
  };
  const withHitDetails = result => ({ ...result, hits: result.hits.map(withDetails) });
  // Search and discovery results are cached per validated request. Cached results are never mutated:
  // withDetails() copies every hit. X-Cache tells whether a response was served from the cache.
  const cache = createResponseCache(RESPONSE_CACHE_ENTRIES);
  const cached = (c, key, compute) => {
    const { value, hit } = cache.getOrCompute(key, compute);
    c.header('X-Cache', hit ? 'HIT' : 'MISS');
    return value;
  };

  app.openapi(routes.search, c => {
    const payload = buildApiSearchPayload(c.req.valid('query'));
    const result = cached(c, `search:${JSON.stringify(payload)}`, () => state.app.search(payload));
    return c.json({
      query: payload.query_text,
      filters: payload.filters,
      page: payload.page,
      page_size: payload.page_size,
      geo: payload.geo,
      sort: payload.sort,
      hits: result.hits.map(withDetails),
      facets: result.facets,
      latency_breakdown: result.latency_breakdown,
    }, 200);
  });

  app.openapi(routes.item, c => {
    const { id } = c.req.valid('param');
    const doc = state.app.documentRepository.get(id);
    if (!doc) return notFound(c, id);
    return c.json(withDetails(doc), 200);
  });

  app.openapi(routes.similar, c => {
    const { id } = c.req.valid('param');
    if (!state.app.documentRepository.get(id)) return notFound(c, id);
    const { limit } = c.req.valid('query');
    return c.json(withHitDetails(cached(c, `similar:${id}:${limit ?? ''}`, () => state.app.discoverSimilar({ listing_id: id, limit }))), 200);
  });

  app.openapi(routes.intent, c => {
    const segments = state.config.behavior.user_segments.map(seg => seg.name);
    const cluster = segments[Math.floor(Math.random() * segments.length)];
    const intent = cluster.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    const { limit } = c.req.valid('query');
    const result = state.app.browseIntentCluster({ cluster, limit });
    return c.json({ intent, cluster, hits: result.hits.map(withDetails) }, 200);
  });

  app.openapi(routes.recommendations, c => {
    const query = c.req.valid('query');
    const { limit } = query;
    if (!query.q) {
      const cluster = query.cluster || DEFAULT_CLUSTER;
      const result = state.app.browseIntentCluster({ cluster, limit });
      return c.json({ surface: 'browse', cluster, hits: result.hits.map(withDetails) }, 200);
    }
    const payload = buildApiSearchPayload(query);
    const recs = cached(c, `recommendations:${limit ?? ''}:${JSON.stringify(payload)}`, () => {
      const searchResult = state.app.search(payload);
      return state.app.discoverRecommendations({ ...payload, limit }, searchResult.rerankedHits);
    });
    return c.json({ surface: 'search_recommendations', query: query.q, hits: recs.hits.map(withDetails) }, 200);
  });

  app.openapi(routes.sitemap, c => {
    const ids = state.app.documentRepository.list().map(d => d.listing_id);
    return c.json({ listing_ids: ids }, 200);
  });

  app.openapi(routes.rawSearch, c => {
    const body = c.req.valid('json');
    const result = cached(c, `rawSearch:${JSON.stringify(body)}`, () => state.app.search(body));
    return c.json({ ...result, hits: result.hits.map(withDetails), rerankedHits: result.rerankedHits.map(withDetails) }, 200);
  });

  app.openapi(routes.discoverSimilar, c => {
    const payload = c.req.valid('json');
    if (!state.app.documentRepository.get(payload.listing_id)) return notFound(c, payload.listing_id);
    return c.json(withHitDetails(cached(c, `discoverSimilar:${JSON.stringify(payload)}`, () => state.app.discoverSimilar(payload))), 200);
  });

  app.openapi(routes.discoverRecommendations, c => {
    const body = c.req.valid('json');
    return c.json(withHitDetails(cached(c, `discoverRecommendations:${JSON.stringify(body)}`, () => state.app.discoverRecommendations(body))), 200);
  });

  // /health is served by server.js (it must answer before state is ready); document it here.
  app.openAPIRegistry.registerPath({
    method: 'get', path: '/health', tags: ['System'],
    summary: 'Health check',
    description: 'Returns 200 once demo state is built, 503 while the service is starting.',
    responses: {
      200: jsonResponse(schemas.HealthResponse, 'Service is ready'),
      503: jsonResponse(schemas.HealthResponse, 'Service is still building its data'),
    },
  });

  // /images/{file} is served by routes/images.js (binary response); document it here.
  app.openAPIRegistry.registerPath({
    method: 'get', path: '/images/{file}', tags: ['Images'],
    summary: 'Get an item image',
    description: 'Serves an image referenced by `images[].url` on items and hits. File names are content hashes, so responses are cacheable forever (`Cache-Control: immutable`).',
    request: { params: schemas.ImageParam },
    responses: {
      200: { description: 'The image', content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } }, 'image/png': { schema: { type: 'string', format: 'binary' } }, 'image/webp': { schema: { type: 'string', format: 'binary' } } } },
      404: jsonResponse(schemas.Error, 'No image with this file name'),
    },
  });

  // The OpenAPI document never changes at runtime: generate it once (on first request, after all
  // routes are registered) instead of on every request.
  const openApiConfig = {
    openapi: '3.1.0',
    info: {
      title: SERVICE_NAME,
      version: SERVICE_VERSION,
      description: [
        'Synthetic second-hand (recommerce) listings: search, item detail, similar items, intent feeds and recommendations. All data is generated from a fixed seed; brands are real, sellers and locations are synthetic. Interactive docs: [/docs](/docs).',
        '',
        'Every item and hit includes:',
        '- `images`: photos (`url`, `alt`, `width`, `height`), main photo first. `url` is relative to this service, e.g. `/images/<hash>.jpg`. The list is empty when an item has no image.',
        '- `location`: approximate position (`lat`, `lng`, rounded to about 100 m) inside a populated area (`area`, a district or town centre) of the item\'s municipality. Never an exact address.',
        '- `published_at`: when the ad was published, as ISO 8601 in Norwegian local time with offset. It is relative to today: an ad keeps its age (`days_on_market`) and the date rolls forward daily.',
        '',
        'CORS is open: browsers on any origin can call the API (no credentials).',
      ].join('\n'),
    },
    tags: [
      { name: 'Search', description: 'Query-parameter based search' },
      { name: 'Items', description: 'Single items and similar items' },
      { name: 'Discovery', description: 'Intent feeds and recommendations' },
      { name: 'Sitemap', description: 'Bulk ID listing' },
      { name: 'Images', description: 'Item photos' },
      { name: 'Search (POST)', description: 'Lower-level endpoints taking structured JSON bodies' },
      { name: 'System', description: 'Operational endpoints' },
    ],
  };
  let openApiDocument = null;
  app.get('/openapi.json', c => c.json(openApiDocument ??= app.getOpenAPI31Document(openApiConfig)));

  return app;
}
