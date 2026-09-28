/**
 * Concatenates all searchable text fields of a search document into a single string.
 * @param {import('./adapters.js').SearchDocument} doc
 * @returns {string}
 */
function documentText(doc) {
  return [
    doc.title,
    doc.body,
    doc.county,
    doc.municipality,
    doc.location_cluster.replace(/_/g, ' '),
    doc.feature_tags.map(t => t.replace(/_/g, ' ')).join(' '),
  ].join(' ');
}

/**
 * Returns true if a document satisfies all structured filters.
 * @param {import('./adapters.js').SearchDocument} doc
 * @param {import('./adapters.js').StructuredFilter[]} filters
 * @returns {boolean}
 */
function matchesFilters(doc, filters) {
  for (const flt of filters) {
    const fieldValue = doc[flt.field];
    if (flt.operator === 'eq' && fieldValue !== flt.value) return false;
    if (flt.operator === 'lte' && fieldValue > flt.value) return false;
    if (flt.operator === 'gte' && fieldValue < flt.value) return false;
    if (flt.operator === 'in') {
      const candidates = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
      const expected = Array.isArray(flt.value) ? flt.value : [flt.value];
      if (!candidates.some(c => expected.includes(c))) return false;
    }
  }
  return true;
}

/**
 * Queries the FTS5 virtual table and returns a normalised BM25 score map, or null on failure/unavailability.
 * @param {Object|null} store
 * @param {string} queryText
 * @param {string} ftsTable
 * @returns {Map<string, number>|null}
 */
function queryFTS5(store, queryText, ftsTable, countyValues = null) {
  if (!store || !queryText.trim()) return null;
  try {
    let sql, params;
    if (countyValues && countyValues.length > 0) {
      const placeholders = countyValues.map(() => '?').join(', ');
      sql = `SELECT listing_id, -bm25(${ftsTable}) as score FROM ${ftsTable} WHERE text_content MATCH ? AND county IN (${placeholders}) ORDER BY score DESC LIMIT 200`;
      params = [queryText, ...countyValues];
    } else {
      sql = `SELECT listing_id, -bm25(${ftsTable}) as score FROM ${ftsTable} WHERE text_content MATCH ? ORDER BY score DESC LIMIT 200`;
      params = [queryText];
    }
    const rows = store.db.prepare(sql).all(...params);
    if (!rows.length) return new Map();
    const maxScore = rows[0].score;
    return new Map(rows.map(r => [r.listing_id, maxScore > 0 ? r.score / maxScore : 0]));
  } catch (_) {
    return null;
  }
}

/**
 * Creates the hybrid search backend (BM25 + cosine vector, with FTS5 when available).
 * @param {{ lexical_weight: number, vector_weight: number, business_weight: number, candidate_pool_size: number }} searchConfig
 * @param {{ upsert: function, get: function, list: function }} documentRepository
 * @param {import('./embeddingService.js').EmbeddingService} embeddingService
 * @param {Object} queryPreprocessor
 * @param {Object|null} [store=null]
 * @returns {{ indexDocument: function, search: function, getTerms: function }}
 */
export function createSearchBackend(searchConfig, documentRepository, embeddingService, queryPreprocessor, store = null) {
  const FTS_TABLE = 'vehicles_fts';
  const documentTermsMap = new Map();
  const termFreqMap = new Map();   // listing_id -> Map<term, count>
  const invertedIndex = new Map(); // term -> Set<listing_id>
  let totalTerms = 0;
  let averageDocumentLength = 1.0;
  const bucketIndex = new Map(); // field -> value -> Set<listing_id>
  const BUCKETED_FIELDS = ['county', 'municipality', 'vehicle_type', 'listing_status', 'fuel_type'];

  /**
   * Indexes a search document: computes embedding if absent, builds term/bucket/inverted indexes.
   * @param {import('./adapters.js').SearchDocument} doc
   * @returns {void}
   */
  function indexDocument(doc) {
    const text = documentText(doc);
    if (!doc.embedding || !doc.embedding.length) {
      doc.embedding = embeddingService.embedText(text);
    }
    documentRepository.upsert(doc);
    const terms = queryPreprocessor.tokenize(text);
    documentTermsMap.set(doc.listing_id, terms);
    totalTerms += terms.length;
    averageDocumentLength = Math.max(totalTerms / Math.max(documentTermsMap.size, 1), 1.0);
    const freq = new Map();
    for (const term of terms) freq.set(term, (freq.get(term) || 0) + 1);
    termFreqMap.set(doc.listing_id, freq);
    for (const term of freq.keys()) {
      let ids = invertedIndex.get(term);
      if (!ids) { ids = new Set(); invertedIndex.set(term, ids); }
      ids.add(doc.listing_id);
    }
    for (const field of BUCKETED_FIELDS) {
      const value = doc[field];
      if (value == null) continue;
      let fieldMap = bucketIndex.get(field);
      if (!fieldMap) { fieldMap = new Map(); bucketIndex.set(field, fieldMap); }
      let docs = fieldMap.get(value);
      if (!docs) { docs = new Set(); fieldMap.set(value, docs); }
      docs.add(doc);
    }
  }

  /**
   * Returns per-term document frequencies from the pre-built inverted index (O(queryTerms)).
   * @param {import('./queryPreprocessor.js').PreparedQuery} preparedQuery
   * @returns {Object.<string, number>}
   */
  function documentFrequency(preparedQuery) {
    const queryTerms = new Set([...preparedQuery.tokens, ...preparedQuery.expandedQueries.flatMap(e => queryPreprocessor.tokenize(e))]);
    const freq = {};
    for (const term of queryTerms) {
      const ids = invertedIndex.get(term);
      if (ids && ids.size > 0) freq[term] = ids.size;
    }
    return freq;
  }

  /**
   * Computes a BM25 lexical relevance score for a document given pre-expanded query terms.
   * @param {import('./adapters.js').SearchDocument} doc
   * @param {string[]} queryTerms
   * @param {number} corpusSize
   * @param {Object.<string, number>} docFreq
   * @returns {number}
   */
  function lexicalScore(doc, queryTerms, corpusSize, docFreq) {
    const terms = documentTermsMap.get(doc.listing_id) ?? [];
    const termCounts = termFreqMap.get(doc.listing_id) ?? new Map();
    if (!queryTerms.length) return 0.0;
    const docLen = terms.length || 1;
    const avgLen = averageDocumentLength;
    const k1 = 1.2, b = 0.75;
    let score = 0.0;
    for (const term of queryTerms) {
      const tf = termCounts.get(term) || 0;
      if (!tf) continue;
      const df = docFreq[term] || 0;
      const idf = Math.log(1 + (corpusSize - df + 0.5) / (df + 0.5));
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * (docLen / avgLen));
      score += idf * (numerator / denominator);
    }
    return score;
  }

  /**
   * Executes a hybrid lexical+vector search and returns scored, faceted candidates.
   * @param {import('./adapters.js').SearchRequest} request
   * @param {import('./queryPreprocessor.js').PreparedQuery} preparedQuery
   * @returns {{ hits: Object[], facets: Object }}
   */
  function search(request, preparedQuery) {
    let eqBucketDocs = null;
    const unbucketedFilters = [];
    for (const flt of request.filters) {
      if (flt.operator === 'eq' && bucketIndex.has(flt.field)) {
        const docs = bucketIndex.get(flt.field).get(flt.value) ?? new Set();
        eqBucketDocs = eqBucketDocs === null
          ? new Set(docs)
          : new Set([...eqBucketDocs].filter(d => docs.has(d)));
      } else if (flt.operator === 'in' && bucketIndex.has(flt.field)) {
        const values = Array.isArray(flt.value) ? flt.value : [flt.value];
        const unionDocs = new Set();
        for (const val of values) {
          for (const d of (bucketIndex.get(flt.field).get(val) ?? new Set())) unionDocs.add(d);
        }
        eqBucketDocs = eqBucketDocs === null
          ? unionDocs
          : new Set([...eqBucketDocs].filter(d => unionDocs.has(d)));
      } else {
        unbucketedFilters.push(flt);
      }
    }
    const pool = eqBucketDocs === null
      ? documentRepository.list()
      : [...eqBucketDocs];
    const candidates = unbucketedFilters.length
      ? pool.filter(doc => matchesFilters(doc, unbucketedFilters))
      : pool;
    const queryEmbedding = embeddingService.embedText(preparedQuery.normalizedText);
    const countyValues = request.filters
      .filter(f => f.field === 'county')
      .flatMap(f => f.operator === 'in' ? f.value : [f.value]);
    const fts5Scores = queryFTS5(store, preparedQuery.normalizedText, FTS_TABLE, countyValues.length ? countyValues : null);
    const corpusSize = Math.max(documentTermsMap.size, 1);
    const docFreq = fts5Scores ? null : documentFrequency(preparedQuery);
    const expandedQueryTerms = fts5Scores ? [] : (() => {
      const t = [...preparedQuery.tokens];
      for (const exp of preparedQuery.expandedQueries) t.push(...queryPreprocessor.tokenize(exp));
      return t;
    })();

    const facetCounty = {}, facetMunicipality = {}, facetVehicleType = {}, facetListingStatus = {};
    const scoredHits = [];
    for (const doc of candidates) {
      facetCounty[doc.county] = (facetCounty[doc.county] || 0) + 1;
      facetMunicipality[doc.municipality] = (facetMunicipality[doc.municipality] || 0) + 1;
      facetVehicleType[doc.vehicle_type] = (facetVehicleType[doc.vehicle_type] || 0) + 1;
      facetListingStatus[doc.listing_status] = (facetListingStatus[doc.listing_status] || 0) + 1;
      const lex = fts5Scores
        ? (fts5Scores.get(doc.listing_id) ?? 0)
        : lexicalScore(doc, expandedQueryTerms, corpusSize, docFreq);
      const vec = Math.max(0.0, embeddingService.cosineSimilarity(queryEmbedding, doc.embedding));
      const biz = Math.min(Math.max(doc.business_weight, 0.0), 1.0);
      const score = lex * searchConfig.lexical_weight + vec * searchConfig.vector_weight + biz * searchConfig.business_weight;
      if ((preparedQuery.normalizedText || request.filters.length) && score <= 0) continue;
      scoredHits.push({
        listing_id: doc.listing_id,
        title: doc.title,
        county: doc.county,
        municipality: doc.municipality,
        vehicle_type: doc.vehicle_type,
        make: doc.make,
        model: doc.model,
        fuel_type: doc.fuel_type,
        total_price: doc.total_price,
        mileage_km: doc.mileage_km,
        score: Math.round(score * 1e6) / 1e6,
        lexical_score: Math.round(lex * 1e6) / 1e6,
        vector_score: Math.round(vec * 1e6) / 1e6,
        rerank_score: 0.0,
        business_score: Math.round(biz * 1e6) / 1e6,
        filter_match_score: 0.0,
        geo_fit_score: 0.0,
        price_fit_score: 0.0,
        freshness_score: 0.0,
        popularity_score: Math.round(biz * 1e6) / 1e6,
        explanation: 'hybrid lexical/vector score',
      });
    }

    scoredHits.sort((a, b) => b.score - a.score);
    const limitedHits = scoredHits.slice(0, searchConfig.candidate_pool_size);
    const facets = { county: facetCounty, municipality: facetMunicipality, vehicle_type: facetVehicleType, listing_status: facetListingStatus };
    return { hits: limitedHits, facets };
  }

  return { indexDocument, search, getTerms: (id) => documentTermsMap.get(id) ?? [] };
}
