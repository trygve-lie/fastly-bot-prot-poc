const ACTIVE_STATUSES = new Set(['created', 'active', 'updated', 'relisted']);

/**
 * @typedef {Object} SearchDocument
 * @property {string} listing_id
 * @property {string} title
 * @property {string} body
 * @property {string} county
 * @property {string} municipality
 * @property {string} neighborhood_cluster
 * @property {string} property_type
 * @property {number} bedrooms
 * @property {number} size_m2
 * @property {number} asking_price
 * @property {number} total_price
 * @property {string} energy_rating
 * @property {number} days_on_market
 * @property {string} listing_status
 * @property {string[]} amenity_tags
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
 * Maps listing_id to an aggregated relevance signal score.
 */

/**
 * Converts a raw listing into a search document with derived body text and business weight.
 * @param {import('../schema/listing.js').Listing} listing
 * @returns {SearchDocument}
 */
export function listingToSearchDocument(listing) {
  const popularity_prior = Math.min(
    1.0,
    0.2
    + (['new', 'updated'].includes(listing.condition) ? 0.18 : 0.0)
    + (listing.has_balcony ? 0.08 : 0.0)
    + (listing.has_parking ? 0.08 : 0.0)
    + 0.02 * listing.amenity_tags.length
    + Math.max(0.0, (180 - listing.days_on_market) / 180) * 0.2
  );
  const body = [
    listing.description_synthetic,
    listing.property_type.replace(/_/g, ' '),
    listing.county,
    listing.municipality,
    listing.neighborhood_cluster.replace(/_/g, ' '),
  ].join(' ');
  return {
    listing_id: listing.listing_id,
    title: listing.title_synthetic,
    body,
    county: listing.county,
    municipality: listing.municipality,
    neighborhood_cluster: listing.neighborhood_cluster,
    property_type: listing.property_type,
    bedrooms: listing.bedrooms,
    size_m2: listing.size_m2,
    asking_price: listing.asking_price,
    total_price: listing.total_price,
    energy_rating: listing.energy_rating,
    days_on_market: listing.days_on_market,
    listing_status: listing.listing_status,
    amenity_tags: [...listing.amenity_tags],
    business_weight: Math.round(popularity_prior * 10000) / 10000,
    language: 'no',
    embedding: [],
  };
}

/**
 * Filters listings to active statuses and converts each to a SearchDocument.
 * @param {import('../schema/listing.js').Listing[]} listings
 * @returns {SearchDocument[]}
 */
export function activeSearchDocuments(listings) {
  return listings.filter(l => ACTIVE_STATUSES.has(l.listing_status)).map(listingToSearchDocument);
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
    else if (field === 'min_bedrooms') filters.push({ field: 'bedrooms', operator: 'gte', value: parseInt(rawValue) });
    else if (field === 'amenity') filters.push({ field: 'amenity_tags', operator: 'in', value: [rawValue] });
    else if (field === 'county') filters.push({ field: 'county', operator: 'eq', value: rawValue });
    else if (field === 'property_type') filters.push({ field: 'property_type', operator: 'eq', value: rawValue });
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
