import { createRng } from '../rng.js';
import { generateVehicles } from './vehicles.js';
import { createQuery, createSession, createRankingLabel, createEvent } from '../schema/interaction.js';

const ACTIVE_STATUSES = new Set(['created', 'active', 'updated', 'relisted']);

/**
 * Returns the value at the given fractional percentile of an array.
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
 * Selects a random user segment from config using weighted sampling.
 * @param {Object} config
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} Segment definition.
 */
function chooseSegment(config, rng) {
  const names = config.behavior.user_segments.map(s => s.name);
  const weights = config.behavior.user_segments.map(s => s.weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.behavior.segment(selected);
}

/**
 * Optionally drops a single character from a word to simulate a typo.
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
 * Builds a synthetic raw query string from a session intent.
 * @param {Object} intent
 * @param {number} queryIndex
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function buildQueryText(intent, queryIndex, rng) {
  const vehicleTerm = intent.preferred_vehicle_type.replace(/_/g, ' ');
  const featureTerm = intent.target_feature.replace(/_/g, ' ');
  const municipalityTerm = intent.target_municipality;
  const maxPriceK = Math.floor(intent.max_price / 1000);
  let templates;
  if (intent.exploratory) {
    templates = [
      `cars in ${municipalityTerm}`,
      `${intent.preferred_fuel_type} ${vehicleTerm}`,
      `${vehicleTerm} in ${municipalityTerm}`,
      `${featureTerm} ${vehicleTerm}`,
    ];
  } else {
    templates = [
      `${municipalityTerm} ${vehicleTerm} ${featureTerm}`,
      `${intent.preferred_fuel_type} ${vehicleTerm} in ${municipalityTerm}`,
      `${vehicleTerm} max ${maxPriceK}k ${featureTerm}`,
      `${municipalityTerm} ${featureTerm} ${vehicleTerm}`,
    ];
  }
  let raw = templates[queryIndex % templates.length];
  const tokens = raw.split(' ');
  if (rng.random() < 0.12) tokens[tokens.length - 1] = variantWord(tokens[tokens.length - 1], rng);
  return tokens.join(' ');
}

/**
 * Sorts [score, vehicle] pairs according to the chosen sort strategy.
 * @param {Array<[number, Object]>} results
 * @param {string} sortChoice
 * @returns {Array<[number, Object]>}
 */
function sortResults(results, sortChoice) {
  if (sortChoice === 'price_asc') return [...results].sort((a, b) => a[1].total_price - b[1].total_price || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  if (sortChoice === 'price_desc') return [...results].sort((a, b) => b[1].total_price - a[1].total_price || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  if (sortChoice === 'newest') return [...results].sort((a, b) => a[1].days_on_market - b[1].days_on_market || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  if (sortChoice === 'mileage_asc') return [...results].sort((a, b) => a[1].mileage_km - b[1].mileage_km || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  return [...results].sort((a, b) => b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
}

/**
 * Extracts a searchable token set from a vehicle's key fields.
 * @param {import('../schema/vehicle.js').Vehicle} vehicle
 * @returns {Set<string>}
 */
function listingTokens(vehicle) {
  const tokens = new Set([
    vehicle.county.toLowerCase(),
    vehicle.municipality.toLowerCase(),
    vehicle.vehicle_type.replace(/_/g, ' ').toLowerCase(),
    vehicle.make.toLowerCase(),
    vehicle.model.toLowerCase(),
    vehicle.fuel_type.toLowerCase(),
    vehicle.location_cluster.replace(/_/g, ' ').toLowerCase(),
  ]);
  for (const tag of vehicle.feature_tags) tokens.add(tag.replace(/_/g, ' ').toLowerCase());
  for (const word of vehicle.text.toLowerCase().split(' ')) tokens.add(word);
  return tokens;
}

/**
 * Builds a session intent (target vehicle type, county, price cap, mileage cap, sort) for one query.
 * @param {Object} config
 * @param {import('../schema/vehicle.js').Vehicle[]} vehicles
 * @param {Object} segment
 * @param {import('../rng.js').Rng} rng
 * @param {string} sessionId
 * @param {Map<string, import('../schema/vehicle.js').Vehicle[]>} segmentInventory
 * @param {Map<string, number>} countyAnchors
 * @returns {Object}
 */
function buildIntent(config, vehicles, segment, rng, sessionId, segmentInventory, countyAnchors) {
  const preferred = segmentInventory.get(segment.name) ?? [];
  const targetVehicle = rng.choice(preferred.length ? preferred : vehicles);
  const countyAnchor = countyAnchors.get(targetVehicle.county) ?? countyAnchors.get('__global__');
  const budget = Math.floor(countyAnchor * rng.uniform(segment.budget_min_ratio, segment.budget_max_ratio));
  const sortChoices = ['relevance', 'price_asc', 'newest', 'price_desc', 'mileage_asc'];
  const sortWeights = [0.60, 0.14, 0.12, 0.09, 0.05];
  const maxMileageOptions = [50000, 100000, 150000, 200000, 300000];
  return {
    session_id: sessionId,
    user_segment: segment.name,
    preferred_vehicle_type: rng.choice(segment.preferred_vehicle_types),
    preferred_fuel_type: rng.choice(['electric', 'hybrid', 'petrol', 'diesel']),
    target_county: targetVehicle.county,
    target_municipality: targetVehicle.municipality,
    target_feature: rng.choice(segment.preferred_features),
    max_price: Math.max(25000, budget),
    max_mileage: rng.choice(maxMileageOptions),
    sort_choice: rng.choices(sortChoices, sortWeights, 1)[0],
    exploratory: rng.random() < segment.exploratory_share,
  };
}

/**
 * Encodes intent constraints as a filter string array for storage in a Query record.
 * @param {Object} intent
 * @returns {string[]}
 */
function buildFilters(intent) {
  return [
    `county:${intent.target_county}`,
    `vehicle_type:${intent.preferred_vehicle_type}`,
    `max_mileage:${intent.max_mileage}`,
    `max_price:${intent.max_price}`,
    `feature:${intent.target_feature}`,
  ];
}

/**
 * Computes a [0, 1] utility score for a vehicle given a session intent and query context.
 * @param {import('../schema/vehicle.js').Vehicle} vehicle
 * @param {Object} intent
 * @param {Set<string>} queryTerms
 * @param {Object} segment
 * @param {Set<string>} seenListingIds
 * @param {import('../rng.js').Rng} rng
 * @param {Map<string, Set<string>>} tokenCache
 * @returns {number}
 */
function computeUtility(vehicle, intent, queryTerms, segment, seenListingIds, rng, tokenCache) {
  const vehicleTerms = tokenCache.get(vehicle.listing_id) ?? listingTokens(vehicle);
  const query_match = queryTerms.size > 0
    ? [...queryTerms].filter(t => vehicleTerms.has(t)).length / queryTerms.size
    : 0;

  const fc0 = vehicle.county === intent.target_county ? 1.0 : 0.0;
  const fc1 = vehicle.vehicle_type === intent.preferred_vehicle_type ? 1.0 : 0.0;
  const fc2 = vehicle.mileage_km <= intent.max_mileage ? 1.0 : Math.max(0.0, 1 - (vehicle.mileage_km - intent.max_mileage) / intent.max_mileage);
  const fc3 = vehicle.total_price <= intent.max_price
    ? 1.0
    : Math.max(0.0, 1 - (vehicle.total_price - intent.max_price) / intent.max_price);
  const fc4 = vehicle.feature_tags.includes(intent.target_feature) ? 1.0 : 0.0;
  const filter_match = (fc0 + fc1 + fc2 + fc3 + fc4) / 5;
  const affordability = fc3;
  const geo_preference = vehicle.municipality === intent.target_municipality ? 1.0
    : vehicle.county === intent.target_county ? 0.6
    : 0.1;
  const featureTargets = new Set([...segment.preferred_features, intent.target_feature]);
  const feature_fit = [...featureTargets].filter(f => vehicle.feature_tags.includes(f)).length / Math.max(1, featureTargets.size);
  const novelty = seenListingIds.has(vehicle.listing_id) ? 0.4 : 1.0;
  const popularity_prior = Math.min(1.0, 0.22 + 0.18 * vehicle.feature_tags.length + (['new', 'excellent'].includes(vehicle.condition) ? 0.12 : 0));
  const freshness = Math.max(0.0, 1 - vehicle.days_on_market / 180);
  const noise = rng.uniform(-0.05, 0.05);
  const utility = 0.24 * query_match + 0.2 * filter_match + 0.14 * affordability + 0.12 * geo_preference + 0.1 * feature_fit + 0.06 * novelty + 0.08 * popularity_prior + 0.06 * freshness + noise;
  return Math.round(Math.max(0.0, Math.min(1.0, utility)) * 10000) / 10000;
}

/**
 * Maps a continuous utility score to a discrete 0–3 relevance label.
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
 * Adds a number of seconds to an ISO timestamp and returns the new ISO string.
 * @param {string} isoStr
 * @param {number} seconds
 * @returns {string}
 */
function addSeconds(isoStr, seconds) {
  return new Date(new Date(isoStr).getTime() + seconds * 1000).toISOString();
}

/**
 * Adds a number of minutes to an ISO timestamp and returns the new ISO string.
 * @param {string} isoStr
 * @param {number} minutes
 * @returns {string}
 */
function addMinutes(isoStr, minutes) {
  return addSeconds(isoStr, minutes * 60);
}

/**
 * Generates synthetic sessions, queries, ranking labels, and events from the vehicle inventory.
 * @param {Object} config
 * @param {import('../schema/vehicle.js').Vehicle[]|null} [vehicles]
 * @returns {{ sessions: import('../schema/interaction.js').Session[], queries: import('../schema/interaction.js').Query[], ranking_labels: import('../schema/interaction.js').RankingLabel[], events: import('../schema/interaction.js').Event[], summary: Object }}
 */
export function generateSessions(config, vehicles) {
  const rng = createRng(config.seed + 20_000);
  const inventory = (vehicles || generateVehicles(config)).filter(v => ACTIVE_STATUSES.has(v.listing_status));
  const baseDateTime = `${config.snapshot_date}T09:00:00.000Z`;
  const sessions = [];
  const queries = [];
  const ranking_labels = [];
  const events = [];

  const tokenCache = new Map(inventory.map(v => [v.listing_id, listingTokens(v)]));

  const segmentInventory = new Map(
    config.behavior.user_segments.map(seg => [
      seg.name,
      inventory.filter(v =>
        seg.preferred_vehicle_types.includes(v.vehicle_type) &&
        seg.preferred_regions.includes(v.county)
      ),
    ])
  );

  const allPrices = inventory.map(v => v.total_price);
  const globalAnchor = percentile(allPrices, 0.45);
  const countyAnchors = new Map([['__global__', globalAnchor]]);
  for (const county of new Set(inventory.map(v => v.county))) {
    const prices = inventory.filter(v => v.county === county).map(v => v.total_price);
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
      const scored = inventory.map(vehicle => [computeUtility(vehicle, intent, queryTerms, segment, seenListingIds, rng, tokenCache), vehicle]);
      const ordered = sortResults(scored, intent.sort_choice).slice(0, config.behavior.candidate_pool_size);
      const topResults = ordered.slice(0, config.behavior.max_results_per_query);

      let clickedAny = false;
      for (let rank = 1; rank <= topResults.length; rank++) {
        const [utility_score, vehicle] = topResults[rank - 1];
        ranking_labels.push(createRankingLabel({ query_id, listing_id: vehicle.listing_id, rank, utility_score, relevance_label: relevanceLabel(utility_score) }));
        if (utility_score < config.behavior.click_threshold) continue;
        const click_probability = Math.min(0.92, 0.24 + utility_score * 0.78 - rank * 0.04);
        if (rng.random() > click_probability) continue;
        clickedAny = true;
        abandonSession = false;
        seenListingIds.add(vehicle.listing_id);
        const event_time = addSeconds(query.created_at, rank * 11);
        const dwell_seconds = Math.floor(18 + utility_score * 165 + rng.randint(0, 25));
        events.push(createEvent({ event_id: `${query_id}-click-${rank}`, session_id, listing_id: vehicle.listing_id, event_type: 'click', occurred_at: event_time, dwell_seconds, rank_position: rank, utility_score }));
        if (utility_score >= config.behavior.save_threshold && rng.random() < 0.55) {
          events.push(createEvent({ event_id: `${query_id}-save-${rank}`, session_id, listing_id: vehicle.listing_id, event_type: 'save', occurred_at: addSeconds(event_time, 5), dwell_seconds: null, rank_position: rank, utility_score }));
        }
        if (utility_score >= config.behavior.contact_threshold && rng.random() < 0.35) {
          events.push(createEvent({ event_id: `${query_id}-contact-${rank}`, session_id, listing_id: vehicle.listing_id, event_type: 'contact', occurred_at: addSeconds(event_time, 9), dwell_seconds: null, rank_position: rank, utility_score }));
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
 * @param {Object} config
 * @param {import('../schema/interaction.js').Session[]} sessions
 * @param {import('../schema/interaction.js').Query[]} queries
 * @param {import('../schema/interaction.js').RankingLabel[]} ranking_labels
 * @param {import('../schema/interaction.js').Event[]} events
 * @returns {Object}
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
