const ACTIVE_STATUSES = new Set(['created', 'active', 'updated', 'relisted']);

/**
 * @typedef {Object} SearchDocument
 * @property {string} listing_id
 * @property {string} title
 * @property {string} body
 * @property {string} county
 * @property {string} municipality
 * @property {string} location_cluster
 * @property {string} vehicle_type
 * @property {string} make
 * @property {string} model
 * @property {string} fuel_type
 * @property {number} seats
 * @property {number} mileage_km
 * @property {number} asking_price
 * @property {number} total_price
 * @property {number} days_on_market
 * @property {string} listing_status
 * @property {string[]} feature_tags
 * @property {number} business_weight
 * @property {string} language
 * @property {number[]} embedding
 */

/**
 * @typedef {Object} StructuredFilter
 * @property {string} field
 * @property {string} operator - One of 'eq', 'lte', 'gte', 'in'.
 * @property {*} value
 */

/**
 * @typedef {Object} SearchRequest
 * @property {string} query_text
 * @property {StructuredFilter[]} filters
 * @property {number} page
 * @property {number} page_size
 * @property {Object} profile_context
 * @property {string|null} language_hint
 */

/**
 * @typedef {Object.<string, number>} BehaviorSignalMap
 */

/**
 * Converts a raw vehicle listing into a search document with derived body text and business weight.
 * @param {import('../schema/vehicle.js').Vehicle} vehicle
 * @returns {SearchDocument}
 */
export function listingToSearchDocument(vehicle) {
  const popularity_prior = Math.min(
    1.0,
    0.2
    + (['new', 'excellent'].includes(vehicle.condition) ? 0.18 : 0.0)
    + (vehicle.has_sunroof ? 0.04 : 0.0)
    + (vehicle.has_navigation ? 0.04 : 0.0)
    + 0.02 * vehicle.feature_tags.length
    + Math.max(0.0, (180 - vehicle.days_on_market) / 180) * 0.2
  );
  const body = [
    vehicle.description_synthetic,
    vehicle.vehicle_type.replace(/_/g, ' '),
    vehicle.make,
    vehicle.model,
    vehicle.fuel_type,
    vehicle.county,
    vehicle.municipality,
    vehicle.location_cluster.replace(/_/g, ' '),
  ].join(' ');
  return {
    listing_id: vehicle.listing_id,
    title: vehicle.title_synthetic,
    body,
    county: vehicle.county,
    municipality: vehicle.municipality,
    location_cluster: vehicle.location_cluster,
    vehicle_type: vehicle.vehicle_type,
    make: vehicle.make,
    model: vehicle.model,
    fuel_type: vehicle.fuel_type,
    seats: vehicle.seats,
    mileage_km: vehicle.mileage_km,
    asking_price: vehicle.asking_price,
    total_price: vehicle.total_price,
    days_on_market: vehicle.days_on_market,
    listing_status: vehicle.listing_status,
    feature_tags: [...vehicle.feature_tags],
    business_weight: Math.round(popularity_prior * 10000) / 10000,
    language: 'no',
    embedding: [],
  };
}

/**
 * Filters vehicles to active statuses and converts each to a SearchDocument.
 * @param {import('../schema/vehicle.js').Vehicle[]} vehicles
 * @returns {SearchDocument[]}
 */
export function activeSearchDocuments(vehicles) {
  return vehicles.filter(v => ACTIVE_STATUSES.has(v.listing_status)).map(listingToSearchDocument);
}

/**
 * Converts a synthetic Query record to a SearchRequest payload.
 * @param {import('../schema/interaction.js').Query} query
 * @param {number} [defaultPageSize=10]
 * @returns {SearchRequest}
 */
export function syntheticQueryToSearchRequest(query, defaultPageSize = 10) {
  const filters = [];
  for (const item of query.filters) {
    const [field, rawValue] = item.split(':', 2);
    if (field === 'max_price') filters.push({ field: 'total_price', operator: 'lte', value: parseInt(rawValue) });
    else if (field === 'max_mileage') filters.push({ field: 'mileage_km', operator: 'lte', value: parseInt(rawValue) });
    else if (field === 'fuel_type') filters.push({ field: 'fuel_type', operator: 'eq', value: rawValue });
    else if (field === 'vehicle_type') filters.push({ field: 'vehicle_type', operator: 'eq', value: rawValue });
    else if (field === 'feature') filters.push({ field: 'feature_tags', operator: 'in', value: [rawValue] });
    else if (field === 'county') filters.push({ field: 'county', operator: 'eq', value: rawValue });
  }
  return {
    query_text: query.raw_query,
    filters,
    page: 1,
    page_size: defaultPageSize,
    profile_context: { user_segment: query.user_segment },
    language_hint: 'no',
  };
}

/**
 * Aggregates ranking labels and interaction events into a per-listing signal score.
 * @param {{ ranking_labels: import('../schema/interaction.js').RankingLabel[], events: import('../schema/interaction.js').Event[] }} behaviorArtifacts
 * @returns {BehaviorSignalMap}
 */
export function buildBehaviorSignalMap(behaviorArtifacts) {
  const EVENT_BONUS = { click: 0.12, save: 0.22, contact: 0.35 };
  const signals = new Map();
  for (const label of behaviorArtifacts.ranking_labels) {
    let s = signals.get(label.listing_id);
    if (!s) { s = { total: 0, count: 0 }; signals.set(label.listing_id, s); }
    s.total += label.utility_score + label.relevance_label * 0.08;
    s.count++;
  }
  for (const event of behaviorArtifacts.events) {
    if (!event.listing_id) continue;
    const bonus = EVENT_BONUS[event.event_type] || 0.0;
    if (!bonus) continue;
    let s = signals.get(event.listing_id);
    if (!s) { s = { total: 0, count: 0 }; signals.set(event.listing_id, s); }
    s.total += bonus;
    s.count++;
  }
  const result = {};
  for (const [id, { total, count }] of signals) result[id] = Math.round((total / count) * 10000) / 10000;
  return result;
}
