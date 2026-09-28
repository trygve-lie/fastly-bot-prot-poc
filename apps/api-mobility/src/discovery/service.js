
/**
 * Creates the discovery service providing similar vehicles, recommendations, and intent-cluster browse.
 * @param {import('../config.js').Config} config
 * @param {{ get: function(string): Object, list: function(): Object[] }} documentRepository
 * @param {import('../search/embeddingService.js').EmbeddingService} embeddingService
 * @param {import('../search/adapters.js').BehaviorSignalMap} behaviorSignals
 * @returns {{ similarListings: function, recommendedForSearch: function, browseByIntentCluster: function }}
 */
export function createDiscoveryService(config, documentRepository, embeddingService, behaviorSignals) {
  // #8: lazy-built grouping for similarListings candidate pruning
  let byCounty = null;
  let byVehicleType = null;

  /**
   * Lazily builds county and vehicle_type lookup maps from the document repository.
   * @returns {void}
   */
  function ensureGrouped() {
    if (byCounty) return;
    byCounty = new Map();
    byVehicleType = new Map();
    for (const doc of documentRepository.list()) {
      if (!byCounty.has(doc.county)) byCounty.set(doc.county, []);
      byCounty.get(doc.county).push(doc);
      if (!byVehicleType.has(doc.vehicle_type)) byVehicleType.set(doc.vehicle_type, []);
      byVehicleType.get(doc.vehicle_type).push(doc);
    }
  }

  /**
   * Returns vehicles similar to the given listing, scored by vector, feature, price, mileage, make, and freshness.
   * @param {string} listingId
   * @param {number} [limit]
   * @returns {{ surface: string, hits: Object[], metadata: Object }}
   */
  function similarListings(listingId, limit) {
    ensureGrouped();
    const source = documentRepository.get(listingId);
    const resultLimit = limit || config.discovery.similar_results;
    const sourceTags = new Set(source.feature_tags);

    // Deduplicated primary candidates (same county or same vehicle_type)
    const primaryMap = new Map();
    for (const d of (byCounty.get(source.county) || [])) primaryMap.set(d.listing_id, d);
    for (const d of (byVehicleType.get(source.vehicle_type) || [])) primaryMap.set(d.listing_id, d);
    primaryMap.delete(listingId);

    /**
     * Scores a candidate document against the source vehicle.
     * @param {Object} doc
     * @returns {Object}
     */
    function scoreDoc(doc) {
      const vectorSim = Math.max(0.0, embeddingService.cosineSimilarity(source.embedding, doc.embedding));
      const docTagsSet = new Set(doc.feature_tags);
      const unionSize = new Set([...sourceTags, ...docTagsSet]).size;
      const featureOverlap = [...sourceTags].filter(t => docTagsSet.has(t)).length / Math.max(1, unionSize);
      const priceProximity = 1 - Math.abs(doc.total_price - source.total_price) / Math.max(source.total_price, doc.total_price);
      const mileageProximity = 1 - Math.abs(doc.mileage_km - source.mileage_km) / Math.max(source.mileage_km + 1, doc.mileage_km + 1, 1);
      const makeFit = doc.make === source.make ? 0.2 : 0.0;
      const fuelFit = doc.fuel_type === source.fuel_type ? 0.1 : 0.0;
      const freshness = Math.max(0.0, 1 - doc.days_on_market / 180);
      const score = 0.30 * vectorSim + 0.18 * featureOverlap + 0.14 * priceProximity + 0.12 * mileageProximity + 0.08 * makeFit + 0.08 * fuelFit + 0.10 * freshness;
      return { listing_id: doc.listing_id, title: doc.title, county: doc.county, municipality: doc.municipality, vehicle_type: doc.vehicle_type, make: doc.make, model: doc.model, total_price: doc.total_price, score: Math.round(score * 1e6) / 1e6, explanation: 'similar by vector, features, price, mileage, make, and freshness' };
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
    const municipalities = {};
    const vehicleTypes = {};
    const priceBands = {};

    for (const [score, doc] of scored.sort((a, b) => b[0] - a[0])) {
      const band = Math.floor(doc.total_price / 100_000) * 100_000;
      const penalty = config.discovery.diversity_lambda * (
        (municipalities[doc.municipality] || 0) +
        (vehicleTypes[doc.vehicle_type] || 0) +
        (priceBands[band] || 0)
      );
      const finalScore = Math.max(0.0, score - penalty);
      selected.push({
        listing_id: doc.listing_id,
        title: doc.title,
        county: doc.county,
        municipality: doc.municipality,
        vehicle_type: doc.vehicle_type,
        make: doc.make,
        model: doc.model,
        total_price: doc.total_price,
        score: Math.round(finalScore * 1e6) / 1e6,
        explanation: 'recommended from search candidates with diversity and behavior boosts',
      });
      municipalities[doc.municipality] = (municipalities[doc.municipality] || 0) + 1;
      vehicleTypes[doc.vehicle_type] = (vehicleTypes[doc.vehicle_type] || 0) + 1;
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
    const countyMedians = {};
    for (const county of new Set(allDocs.map(d => d.county))) {
      const prices = allDocs.filter(d => d.county === county).map(d => d.total_price).sort((a, b) => a - b);
      countyMedians[county] = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
    }
    return allDocs.map(doc => {
      const vehicle_fit = segment.preferred_vehicle_types.includes(doc.vehicle_type) ? 1.0 : 0.25;
      const feature_fit = segment.preferred_features.filter(f => doc.feature_tags.includes(f)).length / Math.max(1, segment.preferred_features.length);
      const region_fit = segment.preferred_regions.includes(doc.county) ? 1.0 : 0.2;
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
      const score = 0.30 * vehicle_fit + 0.22 * feature_fit + 0.20 * region_fit + 0.14 * budget_fit + 0.14 * freshness;
      return {
        listing_id: doc.listing_id,
        title: doc.title,
        county: doc.county,
        municipality: doc.municipality,
        vehicle_type: doc.vehicle_type,
        make: doc.make,
        model: doc.model,
        total_price: doc.total_price,
        score: Math.round(score * 1e6) / 1e6,
        explanation: `browse feed for ${cluster}`,
      };
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
