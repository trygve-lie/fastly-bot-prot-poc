import { createEmbeddingService } from './embeddingService.js';
import { createQueryPreprocessor } from './queryPreprocessor.js';
import { createSearchBackend } from './backend.js';
import { createReranker } from './reranker.js';
import { createDiscoveryService } from '../discovery/service.js';
import { activeSearchDocuments, buildBehaviorSignalMap, syntheticQueryToSearchRequest } from './adapters.js';

/**
 * @typedef {Object} DocumentRepository
 * @property {function(Object): void} upsert
 * @property {function(string): Object} get
 * @property {function(): Object[]} list
 */

/**
 * Creates an in-memory document repository with a cached list() result.
 * @returns {DocumentRepository}
 */
function createDocumentRepository() {
  const documents = new Map();
  let listCache = null;
  return {
    /** @param {Object} doc */
    upsert(doc) { documents.set(doc.listing_id, doc); listCache = null; },
    /** @param {string} listing_id @returns {Object} */
    get(listing_id) { return documents.get(listing_id); },
    /** @returns {Object[]} */
    list() {
      if (!listCache) listCache = [...documents.values()];
      return listCache;
    },
  };
}

/**
 * Validates and normalises raw filter objects from an HTTP payload.
 * @param {Object[]|null} rawFilters
 * @returns {import('./adapters.js').StructuredFilter[]}
 */
function parseFilters(rawFilters) {
  const ALLOWED_OPERATORS = new Set(['eq', 'lte', 'gte', 'in']);
  const ALLOWED_FIELDS = new Set(['county', 'municipality', 'property_type', 'bedrooms', 'asking_price', 'total_price', 'energy_rating', 'days_on_market', 'listing_status', 'amenity_tags']);
  return (rawFilters || []).map(f => {
    if (!ALLOWED_OPERATORS.has(f.operator)) throw new Error(`unsupported filter operator: ${f.operator}`);
    if (!ALLOWED_FIELDS.has(f.field)) throw new Error(`unsupported filter field: ${f.field}`);
    return { field: f.field, operator: f.operator, value: f.value };
  });
}

/**
 * Parses and normalises a raw search payload into a typed SearchRequest.
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
 * @typedef {Object} AppOptions
 * @property {Object|null} [store=null] - Open SQLite store (enables FTS5 and SQL behavior signals).
 * @property {string|null} [runId=null] - Run ID used to query behavior signals from the store.
 * @property {Map<string, number[]>} [preloadedEmbeddings=new Map()] - Pre-computed embeddings keyed by listing_id.
 */

/**
 * @typedef {Object} SearchResponse
 * @property {Object[]} hits - Paged, reranked search hits.
 * @property {Object[]} rerankedHits - Full pre-pagination reranked list (for recommendations reuse).
 * @property {import('./backend.js').FacetCounts} facets
 * @property {{ preprocess_ms: number, retrieval_ms: number, rerank_ms: number, total_ms: number }} latency_breakdown
 * @property {string[]} expansion_applied
 */

/**
 * Wires together all search and discovery components into a single application object.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/listing.js').Listing[]|null} listings
 * @param {Object|null} behaviorArtifacts
 * @param {AppOptions} [options={}]
 * @returns {{ search: function, discoverSimilar: function, discoverRecommendations: function, browseIntentCluster: function, documentRepository: DocumentRepository }}
 */
export function createSearchApplication(config, listings, behaviorArtifacts, { store = null, runId = null, preloadedEmbeddings = new Map() } = {}) {
  const documentRepository = createDocumentRepository();
  const embeddingService = createEmbeddingService(config.search);
  const queryPreprocessor = createQueryPreprocessor(config.search);
  const searchBackend = createSearchBackend(config.search, documentRepository, embeddingService, queryPreprocessor, store);
  const reranker = createReranker(config.search, documentRepository, queryPreprocessor, searchBackend.getTerms);
  const behaviorSignals = (store && runId)
    ? store.getBehaviorSignals(runId)
    : (behaviorArtifacts ? buildBehaviorSignalMap(behaviorArtifacts) : {});
  const discoveryService = createDiscoveryService(config, documentRepository, embeddingService, behaviorSignals);

  if (listings) {
    for (const doc of activeSearchDocuments(listings)) {
      const pre = preloadedEmbeddings.get(doc.listing_id);
      if (pre) doc.embedding = pre;
      searchBackend.indexDocument(doc);
    }
  }

  /**
   * Executes a hybrid search and returns paged, reranked hits with facets and latency breakdown.
   * @param {Object} payload - Raw HTTP request body.
   * @returns {SearchResponse}
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
   * Returns similar listings for a given listing ID.
   * @param {{ listing_id: string, limit?: number }} payload
   * @returns {Object}
   */
  function discoverSimilar(payload) {
    return discoveryService.similarListings(payload.listing_id, payload.limit);
  }

  /**
   * Returns recommended listings for the current search context, optionally reusing pre-computed hits.
   * @param {Object} payload - Search payload (same shape as search).
   * @param {Object[]|null} [precomputedHits=null] - If provided, skips the internal search+rerank.
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
   * Returns browse results for a named intent cluster.
   * @param {{ cluster: string, limit?: number }} payload
   * @returns {Object}
   */
  function browseIntentCluster(payload) {
    return discoveryService.browseByIntentCluster(payload.cluster, payload.limit);
  }

  return { search, discoverSimilar, discoverRecommendations, browseIntentCluster, documentRepository };
}
