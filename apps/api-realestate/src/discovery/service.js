
/**
 * @typedef {Object} DiscoveryHit
 * @property {string} listing_id
 * @property {string} title
 * @property {string} county
 * @property {string} municipality
 * @property {string} property_type
 * @property {number} total_price
 * @property {number} score
 * @property {string} explanation
 */

/**
 * @typedef {Object} SimilarListingsResult
 * @property {string} surface
 * @property {DiscoveryHit[]} hits
 * @property {{ source_listing_id: string }} metadata
 */

/**
 * @typedef {Object} RecommendationsResult
 * @property {string} surface
 * @property {DiscoveryHit[]} hits
 * @property {{ seen_listing_ids: string[] }} metadata
 */

/**
 * @typedef {Object} BrowseResult
 * @property {string} surface
 * @property {DiscoveryHit[]} hits
 * @property {{ cluster: string }} metadata
 */

/**
 * Creates the discovery service providing similar listings, recommendations, and intent-cluster browse.
 * @param {import('../config.js').Config} config
 * @param {{ get: function(string): Object, list: function(): Object[] }} documentRepository
 * @param {import('../search/embeddingService.js').EmbeddingService} embeddingService
 * @param {import('../search/adapters.js').BehaviorSignalMap} behaviorSignals
 * @returns {{ similarListings: function, recommendedForSearch: function, browseByIntentCluster: function }}
 */
export function createDiscoveryService(config, documentRepository, embeddingService, behaviorSignals) {
  // #8: lazy-built grouping for similarListings candidate pruning
  let byCounty = null;
  let byPropertyType = null;

  /**
   * Builds county and property_type grouping maps from the current document set (called once on first use).
   * @returns {void}
   */
  function ensureGrouped() {
    if (byCounty) return;
    byCounty = new Map();
    byPropertyType = new Map();
    for (const doc of documentRepository.list()) {
      if (!byCounty.has(doc.county)) byCounty.set(doc.county, []);
      byCounty.get(doc.county).push(doc);
      if (!byPropertyType.has(doc.property_type)) byPropertyType.set(doc.property_type, []);
      byPropertyType.get(doc.property_type).push(doc);
    }
  }

  /**
   * Returns listings similar to the given listing, scored by vector, amenity, price, size, and freshness.
   * @param {string} listingId
   * @param {number} [limit]
   * @returns {SimilarListingsResult}
   */
  function similarListings(listingId, limit) {
    ensureGrouped();
    const source = documentRepository.get(listingId);
    const resultLimit = limit || config.discovery.similar_results;
    const sourceTags = new Set(source.amenity_tags);

    // Deduplicated primary candidates (same county or same property_type)
    const primaryMap = new Map();
    for (const d of (byCounty.get(source.county) || [])) primaryMap.set(d.listing_id, d);
    for (const d of (byPropertyType.get(source.property_type) || [])) primaryMap.set(d.listing_id, d);
    primaryMap.delete(listingId);

    /**
     * Scores a candidate document against the source listing.
     * @param {Object} doc
     * @returns {DiscoveryHit}
     */
    function scoreDoc(doc) {
      const vectorSim = Math.max(0.0, embeddingService.cosineSimilarity(source.embedding, doc.embedding));
      const docTagsSet = new Set(doc.amenity_tags);
      const unionSize = new Set([...sourceTags, ...docTagsSet]).size;
      const amenityOverlap = [...sourceTags].filter(t => docTagsSet.has(t)).length / Math.max(1, unionSize);
      const priceProximity = 1 - Math.abs(doc.total_price - source.total_price) / Math.max(source.total_price, doc.total_price);
      const sizeProximity = 1 - Math.abs(doc.size_m2 - source.size_m2) / Math.max(source.size_m2, doc.size_m2);
      const freshness = Math.max(0.0, 1 - doc.days_on_market / 180);
      const score = 0.38 * vectorSim + 0.2 * amenityOverlap + 0.16 * priceProximity + 0.16 * sizeProximity + 0.1 * freshness;
      return { listing_id: doc.listing_id, title: doc.title, county: doc.county, municipality: doc.municipality, property_type: doc.property_type, total_price: doc.total_price, score: Math.round(score * 1e6) / 1e6, explanation: 'similar by vector, amenities, price, size, and freshness' };
    }

    const scored = [];
    for (const doc of primaryMap.values()) scored.push(scoreDoc(doc));
    for (const doc of documentRepository.list()) {
      if (doc.listing_id === listingId || primaryMap.has(doc.listing_id)) continue;
      if (embeddingService.cosineSimilarity(source.embedding, doc.embedding) < 0.55) continue;
      scored.push(scoreDoc(doc));
    }

    const hits = scored.sort((a, b) => b.score - a.score).slice(0, resultLimit);
    return { surface: 'similar_listings', hits, metadata: { source_listing_id: listingId } };
  }

  /**
   * Returns diversity-penalised recommendations derived from current search hits.
   * @param {import('../search/adapters.js').SearchRequest} request
   * @param {Object[]} searchHits - Reranked hits from the main search.
   * @param {number} [limit]
   * @returns {RecommendationsResult}
   */
  function recommendedForSearch(request, searchHits, limit) {
    const resultLimit = limit || config.discovery.recommendation_results;
    const seenIds = new Set(request.profile_context?.seen_listing_ids || []);
    const scored = [];

    for (const hit of searchHits) {
      const doc = documentRepository.get(hit.listing_id);
      const behaviorBoost = (behaviorSignals[hit.listing_id] || 0.0) * config.discovery.behavior_boost_weight;
      const novelty = seenIds.has(hit.listing_id) ? 0.0 : 0.12;
      scored.push([hit.score + behaviorBoost + novelty, doc]);
    }

    const selected = [];
    const municipalities = {};
    const propertyTypes = {};
    const priceBands = {};

    for (const [score, doc] of scored.sort((a, b) => b[0] - a[0])) {
      const band = Math.floor(doc.total_price / 1_000_000) * 1_000_000;
      const penalty = config.discovery.diversity_lambda * (
        (municipalities[doc.municipality] || 0) +
        (propertyTypes[doc.property_type] || 0) +
        (priceBands[band] || 0)
      );
      const finalScore = Math.max(0.0, score - penalty);
      selected.push({
        listing_id: doc.listing_id,
        title: doc.title,
        county: doc.county,
        municipality: doc.municipality,
        property_type: doc.property_type,
        total_price: doc.total_price,
        score: Math.round(finalScore * 1e6) / 1e6,
        explanation: 'recommended from search candidates with diversity and behavior boosts',
      });
      municipalities[doc.municipality] = (municipalities[doc.municipality] || 0) + 1;
      propertyTypes[doc.property_type] = (propertyTypes[doc.property_type] || 0) + 1;
      priceBands[band] = (priceBands[band] || 0) + 1;
      if (selected.length >= resultLimit) break;
    }

    return { surface: 'recommended_for_search', hits: selected, metadata: { seen_listing_ids: [...seenIds] } };
  }

  // #7: lazy browse cache — computed on first request per cluster, served from cache thereafter
  const browseScoresCache = new Map();

  /**
   * Scores all documents for a given user segment cluster (full sorted list, no slice).
   * @param {string} cluster - Segment name.
   * @returns {DiscoveryHit[]}
   */
  function computeBrowseScores(cluster) {
    const segment = config.behavior.segment(cluster);
    const allDocs = documentRepository.list();
    const countyMedians = {};
    for (const county of new Set(allDocs.map(d => d.county))) {
      const prices = allDocs.filter(d => d.county === county).map(d => d.total_price).sort((a, b) => a - b);
      countyMedians[county] = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    }
    return allDocs.map(doc => {
      const property_fit = segment.preferred_property_types.includes(doc.property_type) ? 1.0 : 0.25;
      const amenity_fit = segment.preferred_amenities.filter(a => doc.amenity_tags.includes(a)).length / Math.max(1, segment.preferred_amenities.length);
      const county_fit = segment.preferred_counties.includes(doc.county) ? 1.0 : 0.2;
      const bedroom_fit = Math.max(0.0, 1 - Math.abs(doc.bedrooms - segment.bedroom_target) / Math.max(segment.bedroom_target, 1));
      const countyAnchor = countyMedians[doc.county] || doc.total_price;
      const lower = countyAnchor * segment.budget_min_ratio;
      const upper = countyAnchor * segment.budget_max_ratio;
      let budget_fit;
      if (doc.total_price >= lower && doc.total_price <= upper) {
        budget_fit = 1.0;
      } else {
        const diff = Math.min(Math.abs(doc.total_price - lower), Math.abs(doc.total_price - upper));
        budget_fit = Math.max(0.0, 1 - diff / Math.max(doc.total_price, countyAnchor, 1));
      }
      const freshness = Math.max(0.0, 1 - doc.days_on_market / 180);
      const score = 0.28 * property_fit + 0.2 * amenity_fit + 0.18 * county_fit + 0.14 * bedroom_fit + 0.12 * budget_fit + 0.08 * freshness;
      return {
        listing_id: doc.listing_id,
        title: doc.title,
        county: doc.county,
        municipality: doc.municipality,
        property_type: doc.property_type,
        total_price: doc.total_price,
        score: Math.round(score * 1e6) / 1e6,
        explanation: `browse feed for ${cluster}`,
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Returns the top browse results for a named intent cluster, served from cache after the first call.
   * @param {string} cluster - Segment name.
   * @param {number} [limit]
   * @returns {BrowseResult}
   */
  function browseByIntentCluster(cluster, limit) {
    const resultLimit = limit || config.discovery.browse_results;
    if (!browseScoresCache.has(cluster)) browseScoresCache.set(cluster, computeBrowseScores(cluster));
    return { surface: 'browse_by_intent_cluster', hits: browseScoresCache.get(cluster).slice(0, resultLimit), metadata: { cluster } };
  }

  return { similarListings, recommendedForSearch, browseByIntentCluster };
}
