
/**
 * Computes the fraction of request filters satisfied by a document.
 * @param {Object} doc - Search document.
 * @param {{ filters: import('./application.js').StructuredFilter[] }} request
 * @returns {number} Score in [0, 1].
 */
function filterMatchScore(doc, request) {
  if (!request.filters.length) return 0.5;
  let matched = 0;
  for (const flt of request.filters) {
    const value = doc[flt.field];
    if (flt.operator === 'eq' && value === flt.value) matched++;
    else if (flt.operator === 'lte' && value <= flt.value) matched++;
    else if (flt.operator === 'gte' && value >= flt.value) matched++;
    else if (flt.operator === 'in') {
      const candidates = Array.isArray(value) ? value : [value];
      const expected = Array.isArray(flt.value) ? flt.value : [flt.value];
      if (candidates.some(c => expected.includes(c))) matched++;
    }
  }
  return matched / request.filters.length;
}

/**
 * Scores geographic fit of a document relative to query terms and profile context.
 * @param {Object} doc - Search document.
 * @param {Set<string>} queryTerms
 * @param {Object} request
 * @returns {number} Score in [0, 1].
 */
function geoFitScore(doc, queryTerms, request) {
  const ctx = request.profile_context || {};
  if (ctx.target_municipality === doc.municipality) return 1.0;
  if (ctx.target_county === doc.county) return 0.85;
  if (queryTerms.has(doc.municipality.toLowerCase())) return 1.0;
  if (queryTerms.has(doc.county.toLowerCase())) return 0.8;
  return 0.35;
}

/**
 * Scores how well the document price fits the max-price filter.
 * @param {Object} doc - Search document.
 * @param {Object} request
 * @returns {number} Score in [0, 1].
 */
function priceFitScore(doc, request) {
  let maxPrice = null;
  for (const flt of request.filters) {
    if (flt.field === 'total_price' && flt.operator === 'lte') { maxPrice = parseInt(flt.value); break; }
  }
  if (maxPrice == null) return 0.6;
  if (doc.total_price <= maxPrice) return 1.0;
  return Math.max(0.0, 1 - (doc.total_price - maxPrice) / maxPrice);
}

/**
 * Creates a heuristic structured reranker that augments hit scores with filter, geo, price, and freshness signals.
 * @param {{ rerank_depth: number }} searchConfig
 * @param {{ get: function(string): Object }} documentRepository
 * @param {Object} queryPreprocessor
 * @param {function(string): string[]} getTerms - Returns pre-tokenised terms for a listing_id.
 * @returns {{ rerank: function(Object[], Object, Object): Object[] }}
 */
export function createReranker(searchConfig, documentRepository, queryPreprocessor, getTerms) {
  /**
   * Reranks the top-N hits using structured heuristic signals and returns the full list re-sorted.
   * @param {Object[]} hits
   * @param {import('./queryPreprocessor.js').PreparedQuery} preparedQuery
   * @param {Object} request
   * @returns {Object[]}
   */
  function rerank(hits, preparedQuery, request) {
    const topHits = hits.slice(0, searchConfig.rerank_depth);
    const queryTerms = new Set(preparedQuery.tokens);

    for (const hit of topHits) {
      const doc = documentRepository.get(hit.listing_id);
      const docTerms = new Set(getTerms(hit.listing_id));
      const overlap = queryTerms.size > 0
        ? [...docTerms].filter(t => queryTerms.has(t)).length / queryTerms.size
        : 0.0;
      const phraseBonus = preparedQuery.normalizedText && (doc.title + ' ' + doc.body).toLowerCase().includes(preparedQuery.normalizedText) ? 0.15 : 0.0;
      const filter_match = filterMatchScore(doc, request);
      const geo_fit = geoFitScore(doc, queryTerms, request);
      const price_fit = priceFitScore(doc, request);
      const freshness = Math.max(0.0, 1 - doc.days_on_market / 180);
      const popularity = Math.min(Math.max(doc.business_weight, 0.0), 1.0);
      const rerank_score = 0.28 * overlap + 0.12 * phraseBonus + 0.18 * filter_match + 0.14 * geo_fit + 0.12 * price_fit + 0.08 * freshness + 0.08 * popularity;

      hit.filter_match_score = Math.round(filter_match * 1e6) / 1e6;
      hit.geo_fit_score = Math.round(geo_fit * 1e6) / 1e6;
      hit.price_fit_score = Math.round(price_fit * 1e6) / 1e6;
      hit.freshness_score = Math.round(freshness * 1e6) / 1e6;
      hit.popularity_score = Math.round(popularity * 1e6) / 1e6;
      hit.rerank_score = Math.round(rerank_score * 1e6) / 1e6;
      hit.score = Math.round((hit.score + rerank_score) * 1e6) / 1e6;
      hit.explanation = 'hybrid retrieval + heuristic rerank with structured features';
    }

    return [...hits].sort((a, b) => b.score - a.score);
  }

  return { rerank };
}
