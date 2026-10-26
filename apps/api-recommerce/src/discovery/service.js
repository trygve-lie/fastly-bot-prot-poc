
/**
 * Creates the discovery service providing similar items, recommendations, and intent-cluster browse.
 * @param {import('../config.js').Config} config
 * @param {{ get: function(string): Object, list: function(): Object[] }} documentRepository
 * @param {import('../search/embeddingService.js').EmbeddingService} embeddingService
 * @param {import('../search/adapters.js').BehaviorSignalMap} behaviorSignals
 * @returns {{ similarListings: function, recommendedForSearch: function, browseByIntentCluster: function }}
 */
export function createDiscoveryService(config, documentRepository, embeddingService, behaviorSignals) {
  // #8: lazy-built grouping for similarListings candidate pruning
  let byCategory = null;

  const CONDITION_RANK = { new: 4, like_new: 3, good: 2, fair: 1, for_parts: 0 };

  /**
   * Lazily builds the category lookup map from the document repository.
   * @returns {void}
   */
  function ensureGrouped() {
    if (byCategory) return;
    byCategory = new Map();
    for (const doc of documentRepository.list()) {
      if (!byCategory.has(doc.category)) byCategory.set(doc.category, []);
      byCategory.get(doc.category).push(doc);
    }
  }

  /**
   * Returns the median total price per category, used as the budget anchor for browse feeds.
   * @param {Object[]} docs
   * @returns {Object.<string, number>}
   */
  function categoryMedians(docs) {
    const medians = {};
    for (const category of new Set(docs.map(d => d.category))) {
      const prices = docs.filter(d => d.category === category).map(d => d.total_price).sort((a, b) => a - b);
      medians[category] = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    }
    return medians;
  }

  /**
   * Projects a search document onto the compact hit shape returned by discovery surfaces.
   * @param {Object} doc
   * @param {number} score
   * @param {string} explanation
   * @returns {Object}
   */
  function toHit(doc, score, explanation) {
    return {
      listing_id: doc.listing_id,
      title: doc.title,
      county: doc.county,
      municipality: doc.municipality,
      category: doc.category,
      category_label: doc.category_label,
      subcategory: doc.subcategory,
      subcategory_label: doc.subcategory_label,
      brand: doc.brand,
      model: doc.model,
      condition: doc.condition,
      condition_label: doc.condition_label,
      shipping_available: doc.shipping_available,
      total_price: doc.total_price,
      score: Math.round(score * 1e6) / 1e6,
      explanation,
    };
  }

  /**
   * Returns items similar to the given listing, scored by vector, subcategory, brand, features, price, condition, and freshness.
   * @param {string} listingId
   * @param {number} [limit]
   * @returns {{ surface: string, hits: Object[], metadata: Object }}
   */
  function similarListings(listingId, limit) {
    ensureGrouped();
    const source = documentRepository.get(listingId);
    const resultLimit = limit || config.discovery.similar_results;
    const sourceTags = new Set(source.feature_tags);

    // Primary candidates: everything in the same category
    const primaryMap = new Map();
    for (const d of (byCategory.get(source.category) || [])) primaryMap.set(d.listing_id, d);
    primaryMap.delete(listingId);

    /**
     * Scores a candidate document against the source item.
     * @param {Object} doc
     * @returns {Object}
     */
    function scoreDoc(doc) {
      const vectorSim = Math.max(0.0, embeddingService.cosineSimilarity(source.embedding, doc.embedding));
      const docTagsSet = new Set(doc.feature_tags);
      const unionSize = new Set([...sourceTags, ...docTagsSet]).size;
      const featureOverlap = [...sourceTags].filter(t => docTagsSet.has(t)).length / Math.max(1, unionSize);
      const priceProximity = 1 - Math.abs(doc.total_price - source.total_price) / Math.max(source.total_price, doc.total_price);
      const subcategoryFit = doc.subcategory === source.subcategory ? 1.0 : 0.0;
      const brandFit = source.brand && doc.brand === source.brand ? 1.0 : 0.0;
      const conditionProximity = 1 - Math.abs(CONDITION_RANK[doc.condition] - CONDITION_RANK[source.condition]) / 4;
      const freshness = Math.max(0.0, 1 - doc.days_on_market / 90);
      const score = 0.24 * vectorSim + 0.22 * subcategoryFit + 0.10 * brandFit + 0.12 * featureOverlap + 0.14 * priceProximity + 0.08 * conditionProximity + 0.10 * freshness;
      return toHit(doc, score, 'similar by subcategory, brand, vector, features, price, condition, and freshness');
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
   * Selects diverse recommendations from search hits, boosted by behavior signals.
   * @param {import('../search/adapters.js').SearchRequest} request
   * @param {Object[]} searchHits
   * @param {number} [limit]
   * @returns {{ surface: string, hits: Object[], metadata: Object }}
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
    const subcategories = {};
    const brands = {};
    const priceBands = {};

    for (const [score, doc] of scored.sort((a, b) => b[0] - a[0])) {
      const band = Math.floor(Math.log10(Math.max(doc.total_price, 1)) * 2);
      const penalty = config.discovery.diversity_lambda * (
        (subcategories[doc.subcategory] || 0) +
        (doc.brand ? (brands[doc.brand] || 0) : 0) +
        (priceBands[band] || 0)
      );
      const finalScore = Math.max(0.0, score - penalty);
      selected.push(toHit(doc, finalScore, 'recommended from search candidates with diversity and behavior boosts'));
      subcategories[doc.subcategory] = (subcategories[doc.subcategory] || 0) + 1;
      if (doc.brand) brands[doc.brand] = (brands[doc.brand] || 0) + 1;
      priceBands[band] = (priceBands[band] || 0) + 1;
      if (selected.length >= resultLimit) break;
    }

    return { surface: 'recommended_for_search', hits: selected, metadata: { seen_listing_ids: [...seenIds] } };
  }

  // #7: lazy browse cache — computed on first request per cluster, served from cache thereafter
  const browseScoresCache = new Map();

  /**
   * Scores all documents against the given segment and returns them sorted (no slice).
   * @param {string} cluster
   * @returns {Object[]}
   */
  function computeBrowseScores(cluster) {
    const segment = config.behavior.segment(cluster);
    const allDocs = documentRepository.list();
    const medians = categoryMedians(allDocs);
    return allDocs.map(doc => {
      const category_fit = segment.preferred_categories.includes(doc.category) ? 1.0 : 0.15;
      const feature_fit = segment.preferred_features.filter(f => doc.feature_tags.includes(f)).length / Math.max(1, segment.preferred_features.length);
      const region_fit = segment.preferred_regions.includes(doc.county) ? 1.0 : (doc.shipping_available ? 0.6 : 0.2);
      const categoryAnchor = medians[doc.category] || doc.total_price;
      const lower = categoryAnchor * segment.budget_min_ratio;
      const upper = categoryAnchor * segment.budget_max_ratio;
      let budget_fit;
      if (doc.total_price >= lower && doc.total_price <= upper) {
        budget_fit = 1.0;
      } else {
        const diff = Math.min(Math.abs(doc.total_price - lower), Math.abs(doc.total_price - upper));
        budget_fit = Math.max(0.0, 1 - diff / Math.max(doc.total_price, categoryAnchor, 1));
      }
      const freshness = Math.max(0.0, 1 - doc.days_on_market / 90);
      const score = 0.32 * category_fit + 0.18 * feature_fit + 0.16 * region_fit + 0.18 * budget_fit + 0.16 * freshness;
      return toHit(doc, score, `browse feed for ${cluster}`);
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Returns a browse feed for a segment cluster, serving from cache after the first call.
   * @param {string} cluster
   * @param {number} [limit]
   * @returns {{ surface: string, hits: Object[], metadata: Object }}
   */
  function browseByIntentCluster(cluster, limit) {
    const resultLimit = limit || config.discovery.browse_results;
    if (!browseScoresCache.has(cluster)) browseScoresCache.set(cluster, computeBrowseScores(cluster));
    return { surface: 'browse_by_intent_cluster', hits: browseScoresCache.get(cluster).slice(0, resultLimit), metadata: { cluster } };
  }

  return { similarListings, recommendedForSearch, browseByIntentCluster };
}
