import { createRng } from '../rng.js';
import { generateItems } from './items.js';
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
  const itemTerm = intent.target_subcategory_label.toLowerCase();
  const categoryTerm = intent.target_category_label.toLowerCase();
  const featureTerm = intent.target_feature.replace(/_/g, ' ');
  const brandTerm = intent.target_brand || 'used';
  const municipalityTerm = intent.target_municipality;
  let templates;
  if (intent.exploratory) {
    templates = [
      `${categoryTerm} in ${municipalityTerm}`,
      `used ${itemTerm}`,
      `${itemTerm} in ${municipalityTerm}`,
      `${featureTerm} ${itemTerm}`,
    ];
  } else {
    templates = [
      `${brandTerm} ${itemTerm} ${municipalityTerm}`,
      `${brandTerm} ${itemTerm} ${featureTerm}`,
      `${itemTerm} max ${intent.max_price} kr`,
      `${municipalityTerm} ${featureTerm} ${itemTerm}`,
    ];
  }
  const raw = templates[queryIndex % templates.length];
  const tokens = raw.split(' ');
  if (rng.random() < 0.12) tokens[tokens.length - 1] = variantWord(tokens[tokens.length - 1], rng);
  return tokens.join(' ');
}

/**
 * Sorts [score, item] pairs according to the chosen sort strategy.
 * @param {Array<[number, Object]>} results
 * @param {string} sortChoice
 * @returns {Array<[number, Object]>}
 */
function sortResults(results, sortChoice) {
  if (sortChoice === 'price_asc') return [...results].sort((a, b) => a[1].total_price - b[1].total_price || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  if (sortChoice === 'price_desc') return [...results].sort((a, b) => b[1].total_price - a[1].total_price || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  if (sortChoice === 'newest') return [...results].sort((a, b) => a[1].days_on_market - b[1].days_on_market || b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
  return [...results].sort((a, b) => b[0] - a[0] || a[1].listing_id.localeCompare(b[1].listing_id));
}

/**
 * Extracts a searchable token set from an item's key fields.
 * @param {import('../schema/item.js').Item} item
 * @returns {Set<string>}
 */
function listingTokens(item) {
  const tokens = new Set([
    item.county.toLowerCase(),
    item.municipality.toLowerCase(),
    item.location_cluster.replace(/_/g, ' ').toLowerCase(),
  ]);
  const phrases = [item.category_label, item.subcategory_label, item.brand || '', item.model, item.condition_label];
  for (const phrase of phrases) for (const word of phrase.toLowerCase().split(/\s+/)) if (word) tokens.add(word);
  for (const tag of item.feature_tags) for (const word of tag.split('_')) tokens.add(word);
  for (const word of item.text.toLowerCase().split(' ')) tokens.add(word);
  return tokens;
}

/**
 * Builds a session intent (target subcategory, brand, county, price cap, shipping need, sort) for one query.
 * @param {Object} config
 * @param {import('../schema/item.js').Item[]} items
 * @param {Object} segment
 * @param {import('../rng.js').Rng} rng
 * @param {string} sessionId
 * @param {Map<string, import('../schema/item.js').Item[]>} segmentInventory
 * @param {Map<string, number>} categoryAnchors
 * @returns {Object}
 */
function buildIntent(config, items, segment, rng, sessionId, segmentInventory, categoryAnchors) {
  const preferred = segmentInventory.get(segment.name) ?? [];
  const targetItem = rng.choice(preferred.length ? preferred : items);
  const categoryAnchor = categoryAnchors.get(targetItem.category) ?? categoryAnchors.get('__global__');
  const budget = Math.floor(categoryAnchor * rng.uniform(segment.budget_min_ratio, segment.budget_max_ratio));
  const sortChoices = ['relevance', 'price_asc', 'newest', 'price_desc'];
  const sortWeights = [0.58, 0.20, 0.15, 0.07];
  return {
    session_id: sessionId,
    user_segment: segment.name,
    target_category: targetItem.category,
    target_category_label: targetItem.category_label,
    target_subcategory: targetItem.subcategory,
    target_subcategory_label: targetItem.subcategory_label,
    target_brand: targetItem.brand,
    target_county: targetItem.county,
    target_municipality: targetItem.municipality,
    target_feature: rng.choice(segment.preferred_features),
    max_price: Math.max(50, budget),
    shipping_required: rng.random() < 0.25,
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
  const filters = [
    `county:${intent.target_county}`,
    `category:${intent.target_category}`,
    `max_price:${intent.max_price}`,
    `feature:${intent.target_feature}`,
  ];
  if (intent.shipping_required) filters.push('shipping:true');
  return filters;
}

/**
 * Computes a [0, 1] utility score for an item given a session intent and query context.
 * @param {import('../schema/item.js').Item} item
 * @param {Object} intent
 * @param {Set<string>} queryTerms
 * @param {Object} segment
 * @param {Set<string>} seenListingIds
 * @param {import('../rng.js').Rng} rng
 * @param {Map<string, Set<string>>} tokenCache
 * @returns {number}
 */
function computeUtility(item, intent, queryTerms, segment, seenListingIds, rng, tokenCache) {
  const itemTerms = tokenCache.get(item.listing_id) ?? listingTokens(item);
  const query_match = queryTerms.size > 0
    ? [...queryTerms].filter(t => itemTerms.has(t)).length / queryTerms.size
    : 0;

  const fc0 = item.county === intent.target_county || item.shipping_available ? 1.0 : 0.0;
  const fc1 = item.category === intent.target_category ? 1.0 : 0.0;
  const fc2 = item.subcategory === intent.target_subcategory ? 1.0 : 0.0;
  const fc3 = item.total_price <= intent.max_price
    ? 1.0
    : Math.max(0.0, 1 - (item.total_price - intent.max_price) / intent.max_price);
  const fc4 = item.feature_tags.includes(intent.target_feature) ? 1.0 : 0.0;
  const fc5 = !intent.shipping_required || item.shipping_available ? 1.0 : 0.0;
  const filter_match = (fc0 + fc1 + fc2 + fc3 + fc4 + fc5) / 6;
  const affordability = fc3;
  const geo_preference = item.municipality === intent.target_municipality ? 1.0
    : item.county === intent.target_county ? 0.6
    : item.shipping_available ? 0.5
    : 0.1;
  const featureTargets = new Set([...segment.preferred_features, intent.target_feature]);
  const feature_fit = [...featureTargets].filter(f => item.feature_tags.includes(f)).length / Math.max(1, featureTargets.size);
  const novelty = seenListingIds.has(item.listing_id) ? 0.4 : 1.0;
  const brand_bonus = intent.target_brand && item.brand === intent.target_brand ? 0.05 : 0.0;
  const popularity_prior = Math.min(1.0, 0.22 + 0.12 * item.feature_tags.length + (['new', 'like_new'].includes(item.condition) ? 0.12 : 0));
  const freshness = Math.max(0.0, 1 - item.days_on_market / 90);
  const noise = rng.uniform(-0.05, 0.05);
  const utility = 0.24 * query_match + 0.2 * filter_match + 0.14 * affordability + 0.1 * geo_preference + 0.1 * feature_fit + 0.06 * novelty + 0.08 * popularity_prior + 0.06 * freshness + brand_bonus + noise;
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
 * Generates synthetic sessions, queries, ranking labels, and events from the item inventory.
 * @param {Object} config
 * @param {import('../schema/item.js').Item[]|null} [items]
 * @returns {{ sessions: import('../schema/interaction.js').Session[], queries: import('../schema/interaction.js').Query[], ranking_labels: import('../schema/interaction.js').RankingLabel[], events: import('../schema/interaction.js').Event[], summary: Object }}
 */
export function generateSessions(config, items) {
  const rng = createRng(config.seed + 20_000);
  const inventory = (items || generateItems(config)).filter(it => ACTIVE_STATUSES.has(it.listing_status));
  const baseDateTime = `${config.snapshot_date}T09:00:00.000Z`;
  const sessions = [];
  const queries = [];
  const ranking_labels = [];
  const events = [];

  const tokenCache = new Map(inventory.map(v => [v.listing_id, listingTokens(v)]));

  const segmentInventory = new Map(
    config.behavior.user_segments.map(seg => [
      seg.name,
      inventory.filter(it =>
        seg.preferred_categories.includes(it.category) &&
        seg.preferred_regions.includes(it.county)
      ),
    ])
  );

  const allPrices = inventory.map(it => it.total_price);
  const globalAnchor = percentile(allPrices, 0.45);
  const categoryAnchors = new Map([['__global__', globalAnchor]]);
  for (const category of new Set(inventory.map(it => it.category))) {
    const prices = inventory.filter(it => it.category === category).map(it => it.total_price);
    categoryAnchors.set(category, prices.length ? percentile(prices, 0.45) : globalAnchor);
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
      const intent = buildIntent(config, inventory, segment, rng, session_id, segmentInventory, categoryAnchors);
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
      const scored = inventory.map(item => [computeUtility(item, intent, queryTerms, segment, seenListingIds, rng, tokenCache), item]);
      const ordered = sortResults(scored, intent.sort_choice).slice(0, config.behavior.candidate_pool_size);
      const topResults = ordered.slice(0, config.behavior.max_results_per_query);

      let clickedAny = false;
      for (let rank = 1; rank <= topResults.length; rank++) {
        const [utility_score, item] = topResults[rank - 1];
        ranking_labels.push(createRankingLabel({ query_id, listing_id: item.listing_id, rank, utility_score, relevance_label: relevanceLabel(utility_score) }));
        if (utility_score < config.behavior.click_threshold) continue;
        const click_probability = Math.min(0.92, 0.24 + utility_score * 0.78 - rank * 0.04);
        if (rng.random() > click_probability) continue;
        clickedAny = true;
        abandonSession = false;
        seenListingIds.add(item.listing_id);
        const event_time = addSeconds(query.created_at, rank * 11);
        const dwell_seconds = Math.floor(18 + utility_score * 165 + rng.randint(0, 25));
        events.push(createEvent({ event_id: `${query_id}-click-${rank}`, session_id, listing_id: item.listing_id, event_type: 'click', occurred_at: event_time, dwell_seconds, rank_position: rank, utility_score }));
        if (utility_score >= config.behavior.save_threshold && rng.random() < 0.55) {
          events.push(createEvent({ event_id: `${query_id}-save-${rank}`, session_id, listing_id: item.listing_id, event_type: 'save', occurred_at: addSeconds(event_time, 5), dwell_seconds: null, rank_position: rank, utility_score }));
        }
        if (utility_score >= config.behavior.contact_threshold && rng.random() < 0.35) {
          events.push(createEvent({ event_id: `${query_id}-contact-${rank}`, session_id, listing_id: item.listing_id, event_type: 'contact', occurred_at: addSeconds(event_time, 9), dwell_seconds: null, rank_position: rank, utility_score }));
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
function buildBehaviorSummary(config, sessions, queries, ranking_labels, events) {
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
