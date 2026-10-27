import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { createSchemas } from './schemas.js';
import { publishedAt } from '../generation/published.js';

const SERVICE_NAME = 'api-realestate';
const SERVICE_VERSION = '1.0.0';
const DEFAULT_CLUSTER = 'family_upgraders';

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
  if (query.property_type) filters.push({ field: 'property_type', operator: 'eq', value: query.property_type });
  if (query.max_price != null) filters.push({ field: 'total_price', operator: 'lte', value: query.max_price });
  return {
    query_text: query.q || '',
    filters,
    page: query.page ?? 1,
    page_size: query.page_size ?? 10,
    language_hint: 'no',
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
  const notFound = jsonResponse(s.Error, 'No listing with this ID');
  const jsonBody = schema => ({ required: true, content: { 'application/json': { schema } } });

  return {
    search: createRoute({
      method: 'get', path: '/api/search', tags: ['Search'],
      summary: 'Search listings',
      description: 'Hybrid full-text (FTS5 BM25 with Norwegian/English synonym expansion) and vector search with structured filters, reranking and facets.',
      request: { query: s.SearchQuery },
      responses: { 200: jsonResponse(s.SearchResponse, 'Paged search results with facets'), 400: invalid },
    }),
    item: createRoute({
      method: 'get', path: '/api/listings/{id}', tags: ['Listings'],
      summary: 'Get a listing',
      description: 'Returns the full search document for one listing, with its approximate location and publish time.',
      request: { params: s.IdParam },
      responses: { 200: jsonResponse(s.Item, 'The listing'), 404: notFound },
    }),
    similar: createRoute({
      method: 'get', path: '/api/listings/{id}/similar', tags: ['Listings'],
      summary: 'Get similar listings',
      description: 'Listings similar to the given listing, scored by vector similarity, amenities, price, size and freshness.',
      request: { params: s.IdParam, query: s.LimitQuery },
      responses: { 200: jsonResponse(s.DiscoveryResponse, 'Similar listings'), 400: invalid, 404: notFound },
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
      responses: { 200: jsonResponse(s.RecommendationsResponse, 'Recommended listings'), 400: invalid },
    }),
    sitemap: createRoute({
      method: 'get', path: '/api/sitemap', tags: ['Sitemap'],
      summary: 'All listing IDs',
      description: 'IDs of all active listings, used by the frontend to build sitemap.xml.',
      responses: { 200: jsonResponse(s.SitemapResponse, 'All active listing IDs') },
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
      summary: 'Similar listings (POST)',
      request: { body: jsonBody(s.SimilarRequestBody) },
      responses: { 200: jsonResponse(s.DiscoveryResponse, 'Similar listings'), 400: invalid, 404: notFound },
    }),
    discoverRecommendations: createRoute({
      method: 'post', path: '/discover/recommendations', tags: ['Search (POST)'],
      summary: 'Recommendations for a search (POST)',
      request: { body: jsonBody(s.RecommendationsRequestBody) },
      responses: { 200: jsonResponse(s.DiscoveryResponse, 'Recommended listings'), 400: invalid },
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
  // Adds approximate location and publish time to a listing or hit.
  const withDetails = item => {
    const meta = state.listingMeta.get(item.listing_id);
    return {
      ...item,
      location: meta?.latitude != null
        ? { lat: meta.latitude, lng: meta.longitude, area: meta.location_area, precision: 'approximate' }
        : null,
      published_at: meta ? publishedAt(meta.days_on_market, meta.publish_minute) : null,
    };
  };
  const withHitDetails = result => ({ ...result, hits: result.hits.map(withDetails) });

  app.openapi(routes.search, c => {
    const payload = buildApiSearchPayload(c.req.valid('query'));
    const result = state.app.search(payload);
    return c.json({
      query: payload.query_text,
      filters: payload.filters,
      page: payload.page,
      page_size: payload.page_size,
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
    return c.json(withHitDetails(state.app.discoverSimilar({ listing_id: id, limit })), 200);
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
    const searchResult = state.app.search(payload);
    const recs = state.app.discoverRecommendations({ ...payload, limit }, searchResult.rerankedHits);
    return c.json({ surface: 'search_recommendations', query: query.q, hits: recs.hits.map(withDetails) }, 200);
  });

  app.openapi(routes.sitemap, c => {
    const ids = state.app.documentRepository.list().map(d => d.listing_id);
    return c.json({ listing_ids: ids }, 200);
  });

  app.openapi(routes.rawSearch, c => {
    const result = state.app.search(c.req.valid('json'));
    return c.json({ ...result, hits: result.hits.map(withDetails), rerankedHits: result.rerankedHits.map(withDetails) }, 200);
  });

  app.openapi(routes.discoverSimilar, c => {
    const payload = c.req.valid('json');
    if (!state.app.documentRepository.get(payload.listing_id)) return notFound(c, payload.listing_id);
    return c.json(withHitDetails(state.app.discoverSimilar(payload)), 200);
  });

  app.openapi(routes.discoverRecommendations, c => c.json(withHitDetails(state.app.discoverRecommendations(c.req.valid('json'))), 200));

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

  app.doc31('/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: SERVICE_NAME,
      version: SERVICE_VERSION,
      description: [
        'Synthetic real estate listings: search, listing detail, similar listings, intent feeds and recommendations. All data is generated from a fixed seed; no real listings, addresses or people. Interactive docs: [/docs](/docs).',
        '',
        'Every listing and hit includes:',
        '- `location`: approximate position (`lat`, `lng`, rounded to about 100 m) inside a populated area (`area`, a district or town centre) of the listing\'s municipality. Never an exact address.',
        '- `published_at`: when the ad was published, as ISO 8601 in Norwegian local time with offset. It is relative to today: an ad keeps its age (`days_on_market`) and the date rolls forward daily.',
      ].join('\n'),
    },
    tags: [
      { name: 'Search', description: 'Query-parameter based search' },
      { name: 'Listings', description: 'Single listings and similar listings' },
      { name: 'Discovery', description: 'Intent feeds and recommendations' },
      { name: 'Sitemap', description: 'Bulk ID listing' },
      { name: 'Search (POST)', description: 'Lower-level endpoints taking structured JSON bodies' },
      { name: 'System', description: 'Operational endpoints' },
    ],
  });

  return app;
}
