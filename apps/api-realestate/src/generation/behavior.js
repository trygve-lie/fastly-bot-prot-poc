import { createRng } from '../rng.js';
import { generateListings } from './listings.js';
import { createQuery, createSession, createRankingLabel, createEvent } from '../schema/interaction.js';

const ACTIVE_STATUSES = new Set(['created', 'active', 'updated', 'relisted']);

/**
 * Returns the value at the given fractional percentile of a numeric array.
 * @param {number[]} values
 * @param {number} fraction - Value in [0, 1].
 * @returns {number}
 */
function percentile(values, fraction) {
  const ordered = [...values].sort((a, b) => a - b);
  if (!ordered.length) throw new Error('cannot compute percentile of empty array');
  const index = Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * fraction)));
  return ordered[index];
}

/**
 * Samples a user segment from the config weighted distribution.
 * @param {import('../config.js').Config} config
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} Segment config object.
 */
function chooseSegment(config, rng) {
  const names = config.behavior.user_segments.map(s => s.name);
  const weights = config.behavior.user_segments.map(s => s.weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.behavior.segment(selected);
}

/**
 * Optionally drops one character from a word to simulate a typo.
 * @param {string} word
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function variantWord(word, rng) {
  if (word.length <= 4 || rng.random() > 0.15) return word;
  const index = rng.randint(1, word.length - 2);
  return word.slice(0, index) + word.slice(index + 1);
}

/**
 * Builds a synthetic raw query string from an intent object.
 * @param {Object} intent
 * @param {number} queryIndex - Index within the session.
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function buildQueryText(intent, queryIndex, rng) {
  const propertyTerm = intent.preferred_property_type.replace(/_/g, ' ');
  const amenityTerm = intent.target_amenity.replace(/_/g, ' ');
  const municipalityTerm = intent.target_municipality;
  let templates;
  if (intent.exploratory) {
    templates = [
      `homes in ${municipalityTerm}`,
      `${amenityTerm} ${propertyTerm}`,
      `${intent.min_bedrooms}+ bedroom ${propertyTerm}`,
      `move ready ${propertyTerm} in ${municipalityTerm}`,
    ];
  } else {
    templates = [
      `${municipalityTerm} ${propertyTerm} ${amenityTerm}`,
      `${intent.min_bedrooms} bedroom ${propertyTerm} in ${municipalityTerm}`,
      `${propertyTerm} max ${Math.floor(intent.max_price / 1_000_000)}m ${amenityTerm}`,
      `${municipalityTerm} ${amenityTerm} homes`,
    ];
  }
  let raw = templates[queryIndex % templates.length];
  const tokens = raw.split(' ');
  if (rng.random() < 0.12) tokens[tokens.length - 1] = variantWord(tokens[tokens.length - 1], rng);
  return tokens.join(' ');
}

/**
 * Sorts [score, listing] pairs according to the chosen sort strategy.
 * @param {[number, Object][]} results
 * @param {string} sortChoice
 * @returns {[number, Object][]}
 */
function sortResults(results, sortChoice) {
  if (sortChoice === 'price_asc') return [...results].sort((a, b) => a[1].total_price - b[1].total_price || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  if (sortChoice === 'price_desc') return [...results].sort((a, b) => b[1].total_price - a[1].total_price || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  if (sortChoice === 'newest') return [...results].sort((a, b) => a[1].days_on_market - b[1].days_on_market || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  return [...results].sort((a, b) => b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
}

/**
 * Extracts a token set from a listing's key textual and categorical fields.
 * @param {import('../schema/listing.js').Listing} listing
 * @returns {Set<string>}
 */
function listingTokens(listing) {
  const tokens = new Set([
    listing.county.toLowerCase(),
    listing.municipality.toLowerCase(),
    listing.property_type.replace(/_/g, ' ').toLowerCase(),
    listing.neighborhood_cluster.replace(/_/g, ' ').toLowerCase(),
  ]);
  for (const tag of listing.amenity_tags) tokens.add(tag.replace(/_/g, ' ').toLowerCase());
  for (const word of listing.text.toLowerCase().split(' ')) tokens.add(word);
  return tokens;
}

/**
 * Builds a session intent (target property type, location, budget, amenity) for one segment.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/listing.js').Listing[]} listings
 * @param {Object} segment
 * @param {import('../rng.js').Rng} rng
 * @param {string} sessionId
 * @param {Map<string, import('../schema/listing.js').Listing[]>} segmentInventory
 * @param {Map<string, number>} countyAnchors
 * @returns {Object} Intent object.
 */
function buildIntent(config, listings, segment, rng, sessionId, segmentInventory, countyAnchors) {
  const preferred = segmentInventory.get(segment.name) ?? [];
  const targetListing = rng.choice(preferred.length ? preferred : listings);
  const countyAnchor = countyAnchors.get(targetListing.county) ?? countyAnchors.get('__global__');
  const budget = Math.floor(countyAnchor * rng.uniform(segment.budget_min_ratio, segment.budget_max_ratio));
  const sortChoices = ['relevance', 'price_asc', 'newest', 'price_desc'];
  return {
    session_id: sessionId,
    user_segment: segment.name,
    preferred_property_type: rng.choice(segment.preferred_property_types),
    target_county: targetListing.county,
    target_municipality: targetListing.municipality,
    target_amenity: rng.choice(segment.preferred_amenities),
    min_bedrooms: Math.max(0, segment.bedroom_target + rng.choice([-1, 0, 0, 1])),
    max_price: Math.max(900_000, budget),
    sort_choice: rng.choices(sortChoices, [0.64, 0.14, 0.14, 0.08], 1)[0],
    exploratory: rng.random() < segment.exploratory_share,
  };
}

/**
 * Encodes an intent into filter strings compatible with the query schema.
 * @param {Object} intent
 * @returns {string[]}
 */
function buildFilters(intent) {
  return [
    `county:${intent.target_county}`,
    `property_type:${intent.preferred_property_type}`,
    `min_bedrooms:${intent.min_bedrooms}`,
    `max_price:${intent.max_price}`,
    `amenity:${intent.target_amenity}`,
  ];
}

/**
 * Computes a [0, 1] utility score for a listing given the session intent and query context.
 * @param {import('../schema/listing.js').Listing} listing
 * @param {Object} intent
 * @param {Set<string>} queryTerms
 * @param {Object} segment
 * @param {Set<string>} seenListingIds
 * @param {import('../rng.js').Rng} rng
 * @param {Map<string, Set<string>>} tokenCache
 * @returns {number}
 */
function computeUtility(listing, intent, queryTerms, segment, seenListingIds, rng, tokenCache) {
  const listingTerms = tokenCache.get(listing.listing_id) ?? listingTokens(listing);
  const query_match = queryTerms.size > 0
    ? [...queryTerms].filter(t => listingTerms.has(t)).length / queryTerms.size
    : 0;

  const fc0 = listing.county === intent.target_county ? 1.0 : 0.0;
  const fc1 = listing.property_type === intent.preferred_property_type ? 1.0 : 0.0;
  const fc2 = listing.bedrooms >= intent.min_bedrooms ? 1.0 : 0.0;
  const fc3 = listing.total_price <= intent.max_price
    ? 1.0
    : Math.max(0.0, 1 - (listing.total_price - intent.max_price) / intent.max_price);
  const fc4 = listing.amenity_tags.includes(intent.target_amenity) ? 1.0 : 0.0;
  const filter_match = (fc0 + fc1 + fc2 + fc3 + fc4) / 5;
  const affordability = fc3;
  const geo_preference = listing.municipality === intent.target_municipality ? 1.0
    : listing.county === intent.target_county ? 0.6
    : 0.1;
  const amenityTargets = new Set([...segment.preferred_amenities, intent.target_amenity]);
  const amenity_fit = [...amenityTargets].filter(a => listing.amenity_tags.includes(a)).length / Math.max(1, amenityTargets.size);
  const novelty = seenListingIds.has(listing.listing_id) ? 0.4 : 1.0;
  const popularity_prior = Math.min(1.0, 0.22 + 0.18 * listing.amenity_tags.length + (['new', 'updated'].includes(listing.condition) ? 0.12 : 0));
  const freshness = Math.max(0.0, 1 - listing.days_on_market / 180);
  const noise = rng.uniform(-0.05, 0.05);
  const utility = 0.24 * query_match + 0.2 * filter_match + 0.14 * affordability + 0.12 * geo_preference + 0.1 * amenity_fit + 0.06 * novelty + 0.08 * popularity_prior + 0.06 * freshness + noise;
  return Math.round(Math.max(0.0, Math.min(1.0, utility)) * 10000) / 10000;
}

/**
 * Converts a utility score in [0, 1] to a 0–3 relevance label.
 * @param {number} utilityScore
 * @returns {number}
 */
function relevanceLabel(utilityScore) {
  if (utilityScore >= 0.84) return 3;
  if (utilityScore >= 0.68) return 2;
  if (utilityScore >= 0.5) return 1;
  return 0;
}

/**
 * Adds seconds to an ISO datetime string.
 * @param {string} isoStr
 * @param {number} seconds
 * @returns {string}
 */
function addSeconds(isoStr, seconds) {
  return new Date(new Date(isoStr).getTime() + seconds * 1000).toISOString();
}

/**
 * Adds minutes to an ISO datetime string.
 * @param {string} isoStr
 * @param {number} minutes
 * @returns {string}
 */
function addMinutes(isoStr, minutes) {
  return addSeconds(isoStr, minutes * 60);
}

/**
 * Generates synthetic sessions, queries, ranking labels, and events from the listing inventory.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/listing.js').Listing[]|null} [listings]
 * @returns {{ sessions: import('../schema/interaction.js').Session[], queries: import('../schema/interaction.js').Query[], ranking_labels: import('../schema/interaction.js').RankingLabel[], events: import('../schema/interaction.js').Event[], summary: Object }}
 */
export function generateSessions(config, listings) {
  const rng = createRng(config.seed + 20_000);
  const inventory = (listings || generateListings(config)).filter(l => ACTIVE_STATUSES.has(l.listing_status));
  const baseDateTime = `${config.snapshot_date}T09:00:00.000Z`;
  const sessions = [];
  const queries = [];
  const ranking_labels = [];
  const events = [];

  const tokenCache = new Map(inventory.map(l => [l.listing_id, listingTokens(l)]));

  const segmentInventory = new Map(
    config.behavior.user_segments.map(seg => [
      seg.name,
      inventory.filter(l =>
        seg.preferred_property_types.includes(l.property_type) &&
        seg.preferred_counties.includes(l.county)
      ),
    ])
  );

  const allPrices = inventory.map(l => l.total_price);
  const globalAnchor = percentile(allPrices, 0.45);
  const countyAnchors = new Map([['__global__', globalAnchor]]);
  for (const county of new Set(inventory.map(l => l.county))) {
    const prices = inventory.filter(l => l.county === county).map(l => l.total_price);
    countyAnchors.set(county, prices.length ? percentile(prices, 0.45) : globalAnchor);
  }

  for (let sessionIndex = 0; sessionIndex < config.behavior.session_count; sessionIndex++) {
    const session_id = `ses-${config.seed}-${String(sessionIndex + 1).padStart(5, '0')}`;
    const segment = chooseSegment(config, rng);
    const query_count = rng.randint(config.behavior.min_queries_per_session, config.behavior.max_queries_per_session);
    const started_at = addMinutes(baseDateTime, sessionIndex * 4);
    const session_query_ids = [];
    const seenListingIds = new Set();
    let abandonSession = true;

    for (let queryIndex = 0; queryIndex < query_count; queryIndex++) {
      const intent = buildIntent(config, inventory, segment, rng, session_id, segmentInventory, countyAnchors);
      const raw_query = buildQueryText(intent, queryIndex, rng);
      const query_id = `${session_id}-q${queryIndex + 1}`;
      const query = createQuery({
        query_id,
        session_id,
        user_segment: segment.name,
        raw_query,
        filters: buildFilters(intent),
        sort_choice: intent.sort_choice,
        created_at: addSeconds(started_at, queryIndex * 45),
      });
      queries.push(query);
      session_query_ids.push(query_id);

      const queryTerms = new Set(raw_query.toLowerCase().split(' '));
      const scored = inventory.map(listing => [computeUtility(listing, intent, queryTerms, segment, seenListingIds, rng, tokenCache), listing]);
      const ordered = sortResults(scored, intent.sort_choice).slice(0, config.behavior.candidate_pool_size);
      const topResults = ordered.slice(0, config.behavior.max_results_per_query);

      let clickedAny = false;
      for (let rank = 1; rank <= topResults.length; rank++) {
        const [utility_score, listing] = topResults[rank - 1];
        ranking_labels.push(createRankingLabel({ query_id, listing_id: listing.listing_id, rank, utility_score, relevance_label: relevanceLabel(utility_score) }));
        if (utility_score < config.behavior.click_threshold) continue;
        const click_probability = Math.min(0.92, 0.24 + utility_score * 0.78 - rank * 0.04);
        if (rng.random() > click_probability) continue;
        clickedAny = true;
        abandonSession = false;
        seenListingIds.add(listing.listing_id);
        const event_time = addSeconds(query.created_at, rank * 11);
        const dwell_seconds = Math.floor(18 + utility_score * 165 + rng.randint(0, 25));
        events.push(createEvent({ event_id: `${query_id}-click-${rank}`, session_id, listing_id: listing.listing_id, event_type: 'click', occurred_at: event_time, dwell_seconds, rank_position: rank, utility_score }));
        if (utility_score >= config.behavior.save_threshold && rng.random() < 0.55) {
          events.push(createEvent({ event_id: `${query_id}-save-${rank}`, session_id, listing_id: listing.listing_id, event_type: 'save', occurred_at: addSeconds(event_time, 5), dwell_seconds: null, rank_position: rank, utility_score }));
        }
        if (utility_score >= config.behavior.contact_threshold && rng.random() < 0.35) {
          events.push(createEvent({ event_id: `${query_id}-contact-${rank}`, session_id, listing_id: listing.listing_id, event_type: 'contact', occurred_at: addSeconds(event_time, 9), dwell_seconds: null, rank_position: rank, utility_score }));
        }
      }

      const topUtility = topResults.length > 0 ? topResults[0][0] : 0.0;
      if (!clickedAny && topUtility < config.behavior.abandonment_threshold) {
        events.push(createEvent({ event_id: `${query_id}-abandon`, session_id, listing_id: null, event_type: 'abandon', occurred_at: addSeconds(query.created_at, 20), dwell_seconds: 12, rank_position: null, utility_score: topUtility }));
      }
    }

    if (abandonSession) {
      const finalQueryId = session_query_ids[session_query_ids.length - 1];
      events.push(createEvent({ event_id: `${finalQueryId}-session-abandon`, session_id, listing_id: null, event_type: 'abandon', occurred_at: addMinutes(started_at, 3), dwell_seconds: 15, rank_position: null, utility_score: 0.0 }));
    }

    sessions.push(createSession({ session_id, user_segment: segment.name, started_at, query_ids: session_query_ids }));
  }

  const summary = buildBehaviorSummary(config, sessions, queries, ranking_labels, events);
  return { sessions, queries, ranking_labels, events, summary };
}

/**
 * Computes aggregate statistics over the generated behavior data.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/interaction.js').Session[]} sessions
 * @param {import('../schema/interaction.js').Query[]} queries
 * @param {import('../schema/interaction.js').RankingLabel[]} ranking_labels
 * @param {import('../schema/interaction.js').Event[]} events
 * @returns {Object} Behavior summary object.
 */
export function buildBehaviorSummary(config, sessions, queries, ranking_labels, events) {
  const bySegment = {};
  for (const s of sessions) bySegment[s.user_segment] = (bySegment[s.user_segment] || 0) + 1;
  const byEventType = {};
  for (const e of events) byEventType[e.event_type] = (byEventType[e.event_type] || 0) + 1;
  return {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    config_hash: config.configHash(),
    session_count: sessions.length,
    query_count: queries.length,
    ranking_label_count: ranking_labels.length,
    event_count: events.length,
    average_queries_per_session: Math.round((queries.length / Math.max(1, sessions.length)) * 100) / 100,
    average_labels_per_query: Math.round((ranking_labels.length / Math.max(1, queries.length)) * 100) / 100,
    average_events_per_session: Math.round((events.length / Math.max(1, sessions.length)) * 100) / 100,
    by_segment: Object.fromEntries(Object.entries(bySegment).sort()),
    by_event_type: Object.fromEntries(Object.entries(byEventType).sort()),
  };
}
