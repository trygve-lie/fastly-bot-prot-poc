import { z } from '@hono/zod-openapi';
import { FILTER_FIELDS, FILTER_OPERATORS, SORT_ORDERS } from '../search/application.js';

const LISTING_STATUSES = ['created', 'active', 'updated', 'sold', 'removed', 'relisted'];

/**
 * Cross-field query rules: lat, lng and radius_km go together, and min_price must not exceed max_price.
 * @param {Object} query
 * @param {import('zod').RefinementCtx} ctx
 */
function geoAndPriceRules(query, ctx) {
  const geoParams = ['lat', 'lng', 'radius_km'].filter(k => query[k] != null);
  if (geoParams.length && geoParams.length < 3) {
    ctx.addIssue({ code: 'custom', path: ['radius_km'], message: 'lat, lng and radius_km must be given together' });
  }
  if (query.min_price != null && query.max_price != null && query.min_price > query.max_price) {
    ctx.addIssue({ code: 'custom', path: ['min_price'], message: 'min_price must not be greater than max_price' });
  }
}

/**
 * Builds all request/response schemas for the OpenAPI document. Enums that come from
 * configuration (vehicle types, intent clusters, counties) are derived from the loaded config
 * so the documentation always matches the generated data.
 * @param {Object} config
 * @returns {Object.<string, import('zod').ZodType>}
 */
export function createSchemas(config) {
  const vehicle_types = config.calibration.vehicle_types.map(v => v.name);
  const clusters = config.behavior.user_segments.map(s => s.name);
  const counties = config.counties.map(c => c.name);

  // ── Shared building blocks ────────────────────────────────────────────────

  const ListingId = z.string().openapi({ example: `veh-${config.seed}-000001`, description: 'Stable ID: veh-<seed>-<sequence>' });

  const Error = z.object({
    error: z.string().openapi({ example: 'Not found' }),
    listing_id: z.string().optional().openapi({ example: `veh-${config.seed}-999999` }),
  }).openapi('Error');

  const ValidationError = z.object({
    error: z.literal('Invalid request'),
    issues: z.array(z.object({
      path: z.string().openapi({ example: 'page_size' }),
      message: z.string().openapi({ example: 'Too big: expected number to be <=50' }),
    })),
  }).openapi('ValidationError');

  const StructuredFilter = z.object({
    field: z.enum(FILTER_FIELDS),
    operator: z.enum(FILTER_OPERATORS),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  }).openapi('StructuredFilter', { example: { field: 'total_price', operator: 'lte', value: 5000 } });

  const Location = z.object({
    lat: z.number().openapi({ example: 59.923 }),
    lng: z.number().openapi({ example: 10.761 }),
    area: z.string().openapi({ example: 'Grünerløkka', description: 'District or town centre within the municipality' }),
    precision: z.literal('approximate').openapi({ description: 'Rounded to about 100 m; never an exact address' }),
  }).openapi('Location');

  const ItemSummary = {
    listing_id: ListingId,
    title: z.string().openapi({ example: '2022 Volkswagen Polo' }),
    county: z.string().openapi({ example: 'Oslo' }),
    municipality: z.string().openapi({ example: 'Oslo' }),
    vehicle_type: z.enum(vehicle_types),
    make: z.string().openapi({ example: 'Volkswagen' }),
    model: z.string().openapi({ example: 'Polo' }),
    total_price: z.number().int().openapi({ example: 585829, description: 'NOK, asking price plus fees' }),
    location: Location.nullable().openapi({ description: 'Approximate position inside a populated area of the municipality' }),
    published_at: z.string().nullable().openapi({
      example: '2026-10-24T20:14:00+02:00',
      description: 'When the ad was published (ISO 8601, Norwegian local time). Relative to today: an ad keeps its age (days_on_market) and the date rolls forward daily.',
    }),
  };

  // ── Items ─────────────────────────────────────────────────────────────────

  const Item = z.object({
    ...ItemSummary,
    text: z.string().openapi({ description: 'One-sentence listing text' }),
    body: z.string().openapi({ description: 'Full synthetic description used by the search index' }),
    location_cluster: z.string().openapi({ example: 'oslo_valley_edge' }),
    fuel_type: z.enum(['electric', 'hybrid', 'petrol', 'diesel']),
    seats: z.number().int().openapi({ example: 5 }),
    mileage_km: z.number().int().openapi({ example: 79700 }),
    asking_price: z.number().int().openapi({ example: 583466 }),
    days_on_market: z.number().int().openapi({ example: 12 }),
    listing_status: z.enum(LISTING_STATUSES),
    feature_tags: z.array(z.string()).openapi({ example: ['heated_seats', 'navigation'] }),
    business_weight: z.number().openapi({ example: 0.84 }),
    language: z.string().openapi({ example: 'no' }),
    embedding: z.array(z.number()).openapi({ description: 'Synthetic hash-based embedding vector' }),
  }).openapi('Vehicle');

  // ── Search ────────────────────────────────────────────────────────────────

  const SearchHit = z.object({
    ...ItemSummary,
    text: z.string(),
    fuel_type: z.enum(['electric', 'hybrid', 'petrol', 'diesel']),
    mileage_km: z.number().int(),
    score: z.number().openapi({ description: 'Final blended score (retrieval + rerank)' }),
    lexical_score: z.number(),
    vector_score: z.number(),
    rerank_score: z.number(),
    business_score: z.number(),
    filter_match_score: z.number(),
    geo_fit_score: z.number(),
    price_fit_score: z.number(),
    freshness_score: z.number(),
    popularity_score: z.number(),
    explanation: z.string(),
    distance_km: z.number().optional().openapi({ example: 1.24, description: 'Distance from lat/lng; only set when searching within a radius' }),
  }).openapi('SearchHit');

  const FacetCounts = z.record(z.string(), z.number().int());

  const Facets = z.object({
    county: FacetCounts,
    municipality: FacetCounts,
    vehicle_type: FacetCounts,
    listing_status: FacetCounts,
  }).openapi('Facets');

  const LatencyBreakdown = z.object({
    preprocess_ms: z.number(),
    retrieval_ms: z.number(),
    rerank_ms: z.number(),
    total_ms: z.number(),
  }).openapi('LatencyBreakdown');

  const SearchQueryBase = z.object({
    q: z.string().optional().openapi({ example: 'elbil oslo', description: 'Free-text query (Norwegian/English synonyms are expanded)' }),
    county: z.union([z.enum(counties), z.array(z.enum(counties))]).optional()
      .openapi({ description: 'Repeatable: ?county=Oslo&county=Vestland', example: 'Oslo' }),
    vehicle_type: z.enum(vehicle_types).optional(),
    min_price: z.coerce.number().int().min(0).optional().openapi({ example: 100000, description: 'Lower bound on total_price (NOK)' }),
    max_price: z.coerce.number().int().min(0).optional().openapi({ example: 400000, description: 'Upper bound on total_price (NOK)' }),
    lat: z.coerce.number().min(-90).max(90).optional().openapi({ example: 59.9139, description: 'Latitude of the search centre. Use together with lng and radius_km.' }),
    lng: z.coerce.number().min(-180).max(180).optional().openapi({ example: 10.7522, description: 'Longitude of the search centre. Use together with lat and radius_km.' }),
    radius_km: z.coerce.number().gt(0).max(500).optional().openapi({ example: 5, description: 'Only vehicles within this distance of lat/lng. Use together with lat and lng.' }),
    sort: z.enum(SORT_ORDERS).default('relevance').openapi({ description: '`relevance` (default) or `newest` (most recently published first)' }),
    max_mileage: z.coerce.number().int().min(0).optional().openapi({ example: 100000, description: 'Upper bound on mileage_km' }),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(10),
  });
  const SearchQuery = SearchQueryBase.superRefine(geoAndPriceRules);

  const GeoFilter = z.object({
    lat: z.number().min(-90).max(90).openapi({ example: 59.9139 }),
    lng: z.number().min(-180).max(180).openapi({ example: 10.7522 }),
    radius_km: z.number().gt(0).max(500).openapi({ example: 5 }),
  }).openapi('GeoFilter', { description: 'Only results within radius_km of lat/lng' });

  const SearchResponse = z.object({
    query: z.string(),
    filters: z.array(StructuredFilter),
    geo: GeoFilter.nullable(),
    sort: z.enum(SORT_ORDERS),
    page: z.number().int(),
    page_size: z.number().int(),
    hits: z.array(SearchHit),
    facets: Facets,
    latency_breakdown: LatencyBreakdown,
  }).openapi('SearchResponse');

  const SearchRequestBody = z.object({
    query_text: z.string().default('').openapi({ example: 'elbil oslo' }),
    filters: z.array(StructuredFilter).default([]),
    page: z.number().int().min(1).optional(),
    page_size: z.number().int().min(1).max(50).optional(),
    profile_context: z.record(z.string(), z.any()).optional(),
    language_hint: z.string().nullable().optional().openapi({ example: 'no', description: 'Accepted for compatibility; not used' }),
    geo: GeoFilter.nullable().optional(),
    sort: z.enum(SORT_ORDERS).default('relevance').openapi({ description: '`relevance` (default) or `newest`' }),
  }).openapi('SearchRequest');

  const RawSearchResponse = z.object({
    hits: z.array(SearchHit).openapi({ description: 'Current page of reranked hits' }),
    rerankedHits: z.array(SearchHit).openapi({ description: 'Full reranked candidate pool' }),
    facets: Facets,
    latency_breakdown: LatencyBreakdown,
    expansion_applied: z.array(z.string()).openapi({ description: 'Synonym-expanded query variants' }),
  }).openapi('RawSearchResponse');

  // ── Discovery & intent ────────────────────────────────────────────────────

  const DiscoveryHit = z.object({
    ...ItemSummary,
    score: z.number(),
    explanation: z.string(),
  }).openapi('DiscoveryHit');

  const DiscoveryResponse = z.object({
    surface: z.enum(['similar_listings', 'recommended_for_search', 'browse_by_intent_cluster']),
    hits: z.array(DiscoveryHit),
    metadata: z.record(z.string(), z.any()),
  }).openapi('DiscoveryResponse');

  const SimilarRequestBody = z.object({
    listing_id: ListingId,
    limit: z.number().int().min(1).max(50).optional(),
  }).openapi('SimilarRequest');

  const RecommendationsRequestBody = SearchRequestBody.extend({
    limit: z.number().int().min(1).max(50).optional(),
  }).openapi('RecommendationsRequest');

  const Cluster = z.enum(clusters).openapi({ description: 'Intent cluster (user segment)', example: clusters[0] });

  const IntentResponse = z.object({
    intent: z.string().openapi({ example: 'Bargain Hunters', description: 'Human-readable intent label' }),
    cluster: Cluster,
    hits: z.array(DiscoveryHit),
  }).openapi('IntentResponse');

  const RecommendationsQuery = SearchQueryBase.omit({ page: true, page_size: true, sort: true }).extend({
    cluster: Cluster.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }).superRefine(geoAndPriceRules);

  const RecommendationsResponse = z.object({
    surface: z.enum(['browse', 'search_recommendations']),
    cluster: Cluster.optional().openapi({ description: 'Set when surface = browse' }),
    query: z.string().optional().openapi({ description: 'Set when surface = search_recommendations' }),
    hits: z.array(DiscoveryHit),
  }).openapi('RecommendationsResponse');

  const LimitQuery = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
  });

  const IdParam = z.object({
    id: ListingId.openapi({ param: { name: 'id', in: 'path' } }),
  });

  const SitemapResponse = z.object({
    listing_ids: z.array(ListingId),
  }).openapi('SitemapResponse');

  const HealthResponse = z.object({
    status: z.enum(['ok', 'starting']),
  }).openapi('HealthResponse');

  return {
    Error, ValidationError, StructuredFilter, Item, SearchHit, Facets, LatencyBreakdown,
    SearchQuery, SearchResponse, SearchRequestBody, RawSearchResponse,
    DiscoveryHit, DiscoveryResponse, SimilarRequestBody, RecommendationsRequestBody,
    IntentResponse, RecommendationsQuery, RecommendationsResponse, LimitQuery, IdParam,
    SitemapResponse, HealthResponse, Location,
  };
}
