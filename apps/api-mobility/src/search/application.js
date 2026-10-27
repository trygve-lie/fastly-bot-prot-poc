import { createEmbeddingService } from './embeddingService.js';
import { createQueryPreprocessor } from './queryPreprocessor.js';
import { createSearchBackend } from './backend.js';
import { createReranker } from './reranker.js';
import { createDiscoveryService } from '../discovery/service.js';
import { activeSearchDocuments, buildBehaviorSignalMap, syntheticQueryToSearchRequest } from './adapters.js';
import { compareRecency } from './geoAndRecency.js';

/**
 * Creates an in-memory document repository with a cached list() result.
 * @returns {{ upsert: function, get: function, list: function }}
 */
function createDocumentRepository() {
  const documents = new Map();
  let listCache = null;
  return {
    upsert(doc) { documents.set(doc.listing_id, doc); listCache = null; },
    get(listing_id) { return documents.get(listing_id); },
    list() {
      if (!listCache) listCache = [...documents.values()];
      return listCache;
    },
  };
}

export const FILTER_OPERATORS = ['eq', 'lte', 'gte', 'in'];
export const SORT_ORDERS = ['relevance', 'newest'];
export const FILTER_FIELDS = ['county', 'municipality', 'vehicle_type', 'fuel_type', 'seats', 'asking_price', 'total_price', 'mileage_km', 'days_on_market', 'listing_status', 'feature_tags'];

/**
 * Validates and normalises raw filter objects from a request payload.
 * @param {Object[]|null} rawFilters
 * @returns {import('./adapters.js').StructuredFilter[]}
 */
function parseFilters(rawFilters) {
  const ALLOWED_OPERATORS = new Set(FILTER_OPERATORS);
  const ALLOWED_FIELDS = new Set(FILTER_FIELDS);
  return (rawFilters || []).map(f => {
    if (!ALLOWED_OPERATORS.has(f.operator)) throw new Error(`unsupported filter operator: ${f.operator}`);
    if (!ALLOWED_FIELDS.has(f.field)) throw new Error(`unsupported filter field: ${f.field}`);
    return { field: f.field, operator: f.operator, value: f.value };
  });
}

/**
 * Validates an optional geo radius filter ({ lat, lng, radius_km }).
 * @param {Object|null|undefined} rawGeo
 * @returns {{ lat: number, lng: number, radius_km: number }|null}
 */
function parseGeo(rawGeo) {
  if (rawGeo == null) return null;
  const lat = Number(rawGeo.lat), lng = Number(rawGeo.lng), radius_km = Number(rawGeo.radius_km);
  if (![lat, lng, radius_km].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || radius_km <= 0) {
    throw new Error('geo filter needs numeric lat (-90..90), lng (-180..180) and radius_km > 0');
  }
  return { lat, lng, radius_km };
}

/**
 * Parses and validates a raw HTTP payload into a typed SearchRequest.
 * @param {Object} payload
 * @param {number} defaultPageSize
 * @returns {import('./adapters.js').SearchRequest}
 */
function parseRequest(payload, defaultPageSize) {
  return {
    query_text: String(payload.query_text || ''),
    filters: parseFilters(payload.filters),
    page: parseInt(payload.page) || 1,
    page_size: parseInt(payload.page_size) || defaultPageSize,
    profile_context: payload.profile_context || {},
    language_hint: payload.language_hint || null,
    geo: parseGeo(payload.geo),
    sort: SORT_ORDERS.includes(payload.sort) ? payload.sort : 'relevance',
  };
}

/**
 * Wires together all search and discovery components into a single application object.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/vehicle.js').Vehicle[]|null} vehicles
 * @param {Object|null} behaviorArtifacts
 * @param {{ store?: Object|null, runId?: string|null, preloadedEmbeddings?: Map<string, number[]> }} [options={}]
 * @returns {{ search: function, discoverSimilar: function, discoverRecommendations: function, browseIntentCluster: function, documentRepository: Object }}
 */
export function createSearchApplication(config, vehicles, behaviorArtifacts, { store = null, runId = null, preloadedEmbeddings = new Map() } = {}) {
  const documentRepository = createDocumentRepository();
  const embeddingService = createEmbeddingService(config.search);
  const queryPreprocessor = createQueryPreprocessor(config.search);
  const searchBackend = createSearchBackend(config.search, documentRepository, embeddingService, queryPreprocessor, store);
  const reranker = createReranker(config.search, documentRepository, queryPreprocessor, searchBackend.getTerms);
  const behaviorSignals = (store && runId)
    ? store.getBehaviorSignals(runId)
    : (behaviorArtifacts ? buildBehaviorSignalMap(behaviorArtifacts) : {});
  const discoveryService = createDiscoveryService(config, documentRepository, embeddingService, behaviorSignals);

  if (vehicles) {
    for (const doc of activeSearchDocuments(vehicles)) {
      const pre = preloadedEmbeddings.get(doc.listing_id);
      if (pre) doc.embedding = pre;
      searchBackend.indexDocument(doc);
    }
  }

  /**
   * Runs a hybrid search request through preprocessing, retrieval, and reranking.
   * @param {Object} payload
   * @returns {{ hits: Object[], rerankedHits: Object[], facets: Object, latency_breakdown: Object, expansion_applied: string[] }}
   */
  function search(payload) {
    const request = parseRequest(payload, config.search.default_page_size);
    const t0 = performance.now();
    const t1 = performance.now();
    const preparedQuery = queryPreprocessor.prepare(request.query_text, request.language_hint);
    const preprocessMs = performance.now() - t1;

    const t2 = performance.now();
    const backendResult = searchBackend.search(request, preparedQuery);
    const retrievalMs = performance.now() - t2;

    const t3 = performance.now();
    let reranked = reranker.rerank(backendResult.hits, preparedQuery, request);
    // The reranker re-sorts by score; restore newest-first order when requested.
    if (request.sort === 'newest') {
      reranked = reranked.sort((a, b) => compareRecency(documentRepository.get(a.listing_id), documentRepository.get(b.listing_id)));
    }
    const rerankMs = performance.now() - t3;

    const startIndex = Math.max(request.page - 1, 0) * request.page_size;
    const pagedHits = reranked.slice(startIndex, startIndex + request.page_size);

    return {
      hits: pagedHits,
      rerankedHits: reranked,
      facets: backendResult.facets,
      latency_breakdown: {
        preprocess_ms: Math.round(preprocessMs * 1000) / 1000,
        retrieval_ms: Math.round(retrievalMs * 1000) / 1000,
        rerank_ms: Math.round(rerankMs * 1000) / 1000,
        total_ms: Math.round((performance.now() - t0) * 1000) / 1000,
      },
      expansion_applied: preparedQuery.expandedQueries,
    };
  }

  /**
   * Returns similar vehicle listings for a given listing ID.
   * @param {{ listing_id: string, limit?: number }} payload
   * @returns {Object}
   */
  function discoverSimilar(payload) {
    return discoveryService.similarListings(payload.listing_id, payload.limit);
  }

  /**
   * Returns recommended vehicles derived from a search context; reuses precomputedHits when provided.
   * @param {Object} payload
   * @param {Object[]|null} [precomputedHits=null]
   * @returns {Object}
   */
  function discoverRecommendations(payload, precomputedHits = null) {
    const request = parseRequest(payload, config.search.default_page_size);
    let reranked = precomputedHits;
    if (!reranked) {
      const preparedQuery = queryPreprocessor.prepare(request.query_text, request.language_hint);
      const backendResult = searchBackend.search(request, preparedQuery);
      reranked = reranker.rerank(backendResult.hits, preparedQuery, request);
    }
    return discoveryService.recommendedForSearch(request, reranked, payload.limit);
  }

  /**
   * Returns a browse feed for a named user segment cluster.
   * @param {{ cluster: string, limit?: number }} payload
   * @returns {Object}
   */
  function browseIntentCluster(payload) {
    return discoveryService.browseByIntentCluster(payload.cluster, payload.limit);
  }

  return { search, discoverSimilar, discoverRecommendations, browseIntentCluster, documentRepository };
}
