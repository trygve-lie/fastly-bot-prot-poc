const ACTIVE_STATUSES = new Set(['created', 'active', 'updated', 'relisted']);

/**
 * @typedef {Object} SearchDocument
 * @property {string} listing_id
 * @property {string} title
 * @property {string} text
 * @property {string} body
 * @property {string} county
 * @property {string} municipality
 * @property {string} location_cluster
 * @property {string} category
 * @property {string} category_label
 * @property {string} subcategory
 * @property {string} subcategory_label
 * @property {string|null} brand
 * @property {string} model
 * @property {string} condition
 * @property {string} condition_label
 * @property {string} seller_type
 * @property {string} sale_type
 * @property {number} age_years
 * @property {string|null} color
 * @property {string|null} material
 * @property {string|null} size
 * @property {boolean} shipping_available
 * @property {number} shipping_cost
 * @property {number} asking_price
 * @property {number} total_price
 * @property {number} days_on_market
 * @property {string} listing_status
 * @property {string[]} feature_tags
 * @property {number} business_weight
 * @property {string} language
 * @property {number[]} embedding
 * @property {number|null} latitude - Approximate position, used by the geo radius filter
 * @property {number|null} longitude
 * @property {number|null} publish_minute - Local publish minute, tie-breaker for newest-first sorting
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
 * @property {{ lat: number, lng: number, radius_km: number }|null} geo - Only items within radius_km of lat/lng
 * @property {'relevance'|'newest'} sort
 */

/**
 * @typedef {Object.<string, number>} BehaviorSignalMap
 */

/**
 * Converts a raw item listing into a search document with derived body text and business weight.
 * @param {import('../schema/item.js').Item} item
 * @returns {SearchDocument}
 */
export function listingToSearchDocument(item) {
  const popularity_prior = Math.min(
    1.0,
    0.2
    + (['new', 'like_new'].includes(item.condition) ? 0.18 : 0.0)
    + (item.has_original_box ? 0.04 : 0.0)
    + (item.has_receipt ? 0.03 : 0.0)
    + (item.shipping_available ? 0.04 : 0.0)
    + 0.02 * item.feature_tags.length
    + Math.max(0.0, (90 - item.days_on_market) / 90) * 0.2
  );
  const body = [
    item.text,
    item.description_synthetic,
    item.category_label,
    item.subcategory_label,
    item.brand || '',
    item.model,
    item.condition_label,
    item.color || '',
    item.material || '',
    item.county,
    item.municipality,
    item.location_cluster.replace(/_/g, ' '),
  ].join(' ');
  return {
    listing_id: item.listing_id,
    title: item.title,
    text: item.text,
    body,
    county: item.county,
    municipality: item.municipality,
    location_cluster: item.location_cluster,
    category: item.category,
    category_label: item.category_label,
    subcategory: item.subcategory,
    subcategory_label: item.subcategory_label,
    brand: item.brand,
    model: item.model,
    condition: item.condition,
    condition_label: item.condition_label,
    seller_type: item.seller_type,
    sale_type: item.sale_type,
    age_years: item.age_years,
    color: item.color,
    material: item.material,
    size: item.size,
    shipping_available: item.shipping_available,
    shipping_cost: item.shipping_cost,
    asking_price: item.asking_price,
    total_price: item.total_price,
    days_on_market: item.days_on_market,
    listing_status: item.listing_status,
    feature_tags: [...item.feature_tags],
    business_weight: Math.round(popularity_prior * 10000) / 10000,
    language: 'no',
    embedding: [],
    // Not part of the search text or embedding; used by the geo filter and newest-first sorting.
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    publish_minute: item.publish_minute ?? null,
  };
}

/**
 * Filters items to active statuses and converts each to a SearchDocument.
 * @param {import('../schema/item.js').Item[]} items
 * @returns {SearchDocument[]}
 */
export function activeSearchDocuments(items) {
  return items.filter(it => ACTIVE_STATUSES.has(it.listing_status)).map(listingToSearchDocument);
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
    else if (field === 'category') filters.push({ field: 'category', operator: 'eq', value: rawValue });
    else if (field === 'subcategory') filters.push({ field: 'subcategory', operator: 'eq', value: rawValue });
    else if (field === 'shipping') filters.push({ field: 'shipping_available', operator: 'eq', value: rawValue === 'true' });
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
