import { z } from '@hono/zod-openapi';
import { FILTER_FIELDS, FILTER_OPERATORS } from '../search/application.js';

const LISTING_STATUSES = ['created', 'active', 'updated', 'sold', 'removed', 'relisted'];

/**
 * Builds all request/response schemas for the OpenAPI document. Enums that come from
 * configuration (property types, intent clusters, counties) are derived from the loaded config
 * so the documentation always matches the generated data.
 * @param {Object} config
 * @returns {Object.<string, import('zod').ZodType>}
 */
export function createSchemas(config) {
  const property_types = config.calibration.property_types.map(p => p.name);
  const clusters = config.behavior.user_segments.map(s => s.name);
  const counties = config.counties.map(c => c.name);

  // ── Shared building blocks ────────────────────────────────────────────────

  const ListingId = z.string().openapi({ example: `lst-${config.seed}-000001`, description: 'Stable ID: lst-<seed>-<sequence>' });

  const Error = z.object({
    error: z.string().openapi({ example: 'Not found' }),
    listing_id: z.string().optional().openapi({ example: `lst-${config.seed}-999999` }),
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

  const ItemSummary = {
    listing_id: ListingId,
    title: z.string().openapi({ example: '3-bed apartment in Oslo' }),
    county: z.string().openapi({ example: 'Oslo' }),
    municipality: z.string().openapi({ example: 'Oslo' }),
    property_type: z.enum(property_types),
    total_price: z.number().int().openapi({ example: 6233703, description: 'NOK, asking price plus shared costs' }),
  };

  // ── Items ─────────────────────────────────────────────────────────────────

  const Item = z.object({
    ...ItemSummary,
    text: z.string().openapi({ description: 'One-sentence listing text' }),
    body: z.string().openapi({ description: 'Full synthetic description used by the search index' }),
    neighborhood_cluster: z.string().openapi({ example: 'oslo_city_centre' }),
    bedrooms: z.number().int().openapi({ example: 3 }),
    size_m2: z.number().openapi({ example: 90.7 }),
    asking_price: z.number().int().openapi({ example: 5988072 }),
    energy_rating: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G']),
    days_on_market: z.number().int().openapi({ example: 12 }),
    listing_status: z.enum(LISTING_STATUSES),
    amenity_tags: z.array(z.string()).openapi({ example: ['balcony', 'parking'] }),
    business_weight: z.number().openapi({ example: 0.84 }),
    language: z.string().openapi({ example: 'no' }),
    embedding: z.array(z.number()).openapi({ description: 'Synthetic hash-based embedding vector' }),
  }).openapi('Listing');

  // ── Search ────────────────────────────────────────────────────────────────

  const SearchHit = z.object({
    ...ItemSummary,
    text: z.string(),
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
  }).openapi('SearchHit');

  const FacetCounts = z.record(z.string(), z.number().int());

  const Facets = z.object({
    county: FacetCounts,
    municipality: FacetCounts,
    property_type: FacetCounts,
    listing_status: FacetCounts,
  }).openapi('Facets');

  const LatencyBreakdown = z.object({
    preprocess_ms: z.number(),
    retrieval_ms: z.number(),
    rerank_ms: z.number(),
    total_ms: z.number(),
  }).openapi('LatencyBreakdown');

  const SearchQuery = z.object({
    q: z.string().optional().openapi({ example: 'cabin', description: 'Free-text query (Norwegian/English synonyms are expanded)' }),
    county: z.union([z.enum(counties), z.array(z.enum(counties))]).optional()
      .openapi({ description: 'Repeatable: ?county=Oslo&county=Vestland', example: 'Oslo' }),
    property_type: z.enum(property_types).optional(),
    max_price: z.coerce.number().int().min(0).optional().openapi({ example: 5000000, description: 'Upper bound on total_price (NOK)' }),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(10),
  });

  const SearchResponse = z.object({
    query: z.string(),
    filters: z.array(StructuredFilter),
    page: z.number().int(),
    page_size: z.number().int(),
    hits: z.array(SearchHit),
    facets: Facets,
    latency_breakdown: LatencyBreakdown,
  }).openapi('SearchResponse');

  const SearchRequestBody = z.object({
    query_text: z.string().default('').openapi({ example: 'cabin' }),
    filters: z.array(StructuredFilter).default([]),
    page: z.number().int().min(1).optional(),
    page_size: z.number().int().min(1).max(50).optional(),
    profile_context: z.record(z.string(), z.any()).optional(),
    language_hint: z.string().nullable().optional().openapi({ example: 'no' }),
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

  const RecommendationsQuery = SearchQuery.omit({ page: true, page_size: true }).extend({
    cluster: Cluster.optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  });

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
    SitemapResponse, HealthResponse,
  };
}
