import { createEmbeddingService } from './embeddingService.js';
import { createQueryPreprocessor } from './queryPreprocessor.js';
import { createSearchBackend } from './backend.js';
import { createReranker } from './reranker.js';
import { createDiscoveryService } from '../discovery/service.js';
import { activeSearchDocuments, buildBehaviorSignalMap, syntheticQueryToSearchRequest } from './adapters.js';

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

/**
 * Validates and normalises raw filter objects from a request payload.
 * @param {Object[]|null} rawFilters
 * @returns {import('./adapters.js').StructuredFilter[]}
 */
function parseFilters(rawFilters) {
  const ALLOWED_OPERATORS = new Set(['eq', 'lte', 'gte', 'in']);
  const ALLOWED_FIELDS = new Set(['county', 'municipality', 'vehicle_type', 'fuel_type', 'seats', 'asking_price', 'total_price', 'mileage_km', 'days_on_market', 'listing_status', 'feature_tags']);
  return (rawFilters || []).map(f => {
    if (!ALLOWED_OPERATORS.has(f.operator)) throw new Error(`unsupported filter operator: ${f.operator}`);
    if (!ALLOWED_FIELDS.has(f.field)) throw new Error(`unsupported filter field: ${f.field}`);
    return { field: f.field, operator: f.operator, value: f.value };
  });
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
    const reranked = reranker.rerank(backendResult.hits, preparedQuery, request);
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
