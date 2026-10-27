import { z } from '@hono/zod-openapi';
import { FILTER_FIELDS, FILTER_OPERATORS } from '../search/application.js';

const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'for_parts'];
const LISTING_STATUSES = ['created', 'active', 'updated', 'sold', 'removed', 'relisted'];

/**
 * Builds all request/response schemas for the OpenAPI document. Enums that come from
 * configuration (categories, intent clusters, counties) are derived from the loaded config
 * so the documentation always matches the generated data.
 * @param {Object} config
 * @returns {Object.<string, import('zod').ZodType>}
 */
export function createSchemas(config) {
  const categories = config.calibration.categories.map(c => c.name);
  const clusters = config.behavior.user_segments.map(s => s.name);
  const counties = config.counties.map(c => c.name);

  // ── Shared building blocks ────────────────────────────────────────────────

  const ListingId = z.string().openapi({ example: `itm-${config.seed}-000001`, description: 'Stable item ID: itm-<seed>-<sequence>' });

  const Error = z.object({
    error: z.string().openapi({ example: 'Not found' }),
    listing_id: z.string().optional().openapi({ example: `itm-${config.seed}-999999` }),
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

  const Image = z.object({
    url: z.string().openapi({ example: '/images/819631233f9a52380bc3.jpg', description: 'Path relative to the service base URL' }),
    alt: z.string().openapi({ example: 'IKEA Stockholm rug 170x240' }),
    width: z.number().int().nullable().openapi({ example: 1024 }),
    height: z.number().int().nullable().openapi({ example: 768 }),
  }).openapi('Image');

  const Location = z.object({
    lat: z.number().openapi({ example: 59.923 }),
    lng: z.number().openapi({ example: 10.761 }),
    area: z.string().openapi({ example: 'Grünerløkka', description: 'District or town centre within the municipality' }),
    precision: z.literal('approximate').openapi({ description: 'Rounded to about 100 m; never an exact address' }),
  }).openapi('Location');

  const ItemSummary = {
    listing_id: ListingId,
    title: z.string().openapi({ example: 'Apple iPhone 13 128 GB' }),
    county: z.string().openapi({ example: 'Oslo' }),
    municipality: z.string().openapi({ example: 'Oslo' }),
    category: z.enum(categories),
    category_label: z.string().openapi({ example: 'Electronics' }),
    subcategory: z.string().openapi({ example: 'phone' }),
    subcategory_label: z.string().openapi({ example: 'Phone' }),
    brand: z.string().nullable().openapi({ example: 'Apple', description: 'null for unbranded goods' }),
    model: z.string().openapi({ example: 'iPhone 13 128 GB' }),
    condition: z.enum(CONDITIONS),
    condition_label: z.string().openapi({ example: 'like-new' }),
    shipping_available: z.boolean(),
    total_price: z.number().int().openapi({ example: 4549, description: 'NOK, asking price plus shipping' }),
    images: z.array(Image).openapi({ description: 'Item photos, first one is the main photo. Empty when the item has no image.' }),
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
    location_cluster: z.string().openapi({ example: 'oslo_city_centre' }),
    seller_type: z.enum(['private', 'shop']),
    sale_type: z.enum(['fixed_price', 'bidding']),
    age_years: z.number().int().min(0).openapi({ example: 2 }),
    color: z.string().nullable().openapi({ example: 'black' }),
    material: z.string().nullable().openapi({ example: null }),
    size: z.string().nullable().openapi({ example: null, description: 'Only set for clothing, shoes and kids clothing' }),
    shipping_cost: z.number().int().openapi({ example: 99, description: '0 when pickup only' }),
    asking_price: z.number().int().openapi({ example: 4450 }),
    days_on_market: z.number().int().openapi({ example: 12 }),
    listing_status: z.enum(LISTING_STATUSES),
    feature_tags: z.array(z.string()).openapi({ example: ['original_box', 'receipt'] }),
    business_weight: z.number().openapi({ example: 0.58 }),
    language: z.string().openapi({ example: 'no' }),
    embedding: z.array(z.number()).openapi({ description: 'Synthetic hash-based embedding vector' }),
  }).openapi('Item');

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
    category: FacetCounts,
    condition: FacetCounts,
    listing_status: FacetCounts,
  }).openapi('Facets');

  const LatencyBreakdown = z.object({
    preprocess_ms: z.number(),
    retrieval_ms: z.number(),
    rerank_ms: z.number(),
    total_ms: z.number(),
  }).openapi('LatencyBreakdown');

  const SearchQuery = z.object({
    q: z.string().optional().openapi({ example: 'brukt sykkel', description: 'Free-text query (Norwegian/English synonyms are expanded)' }),
    county: z.union([z.enum(counties), z.array(z.enum(counties))]).optional()
      .openapi({ description: 'Repeatable: ?county=Oslo&county=Vestland', example: 'Oslo' }),
    category: z.enum(categories).optional(),
    subcategory: z.string().optional().openapi({ example: 'bicycle' }),
    brand: z.string().optional().openapi({ example: 'Trek' }),
    condition: z.enum(CONDITIONS).optional(),
    max_price: z.coerce.number().int().min(0).optional().openapi({ example: 5000, description: 'Upper bound on total_price (NOK)' }),
    shipping: z.enum(['true', 'false']).optional().openapi({ description: 'true = only items that can be shipped' }),
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
    query_text: z.string().default('').openapi({ example: 'brukt sykkel' }),
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

  const Cluster = z.enum(clusters).openapi({ description: 'Intent cluster (user segment)', example: 'bargain_hunters' });

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

  const ImageParam = z.object({
    file: z.string().openapi({ param: { name: 'file', in: 'path' }, example: '819631233f9a52380bc3.jpg' }),
  });

  const HealthResponse = z.object({
    status: z.enum(['ok', 'starting']),
  }).openapi('HealthResponse');

  return {
    Error, ValidationError, StructuredFilter, Item, SearchHit, Facets, LatencyBreakdown,
    SearchQuery, SearchResponse, SearchRequestBody, RawSearchResponse,
    DiscoveryHit, DiscoveryResponse, SimilarRequestBody, RecommendationsRequestBody,
    IntentResponse, RecommendationsQuery, RecommendationsResponse, LimitQuery, IdParam,
    SitemapResponse, HealthResponse, Image, ImageParam, Location,
  };
}
