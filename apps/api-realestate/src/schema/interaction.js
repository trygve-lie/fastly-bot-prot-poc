const SORT_CHOICES = new Set(['relevance', 'price_asc', 'price_desc', 'newest']);
const EVENT_TYPES = new Set(['click', 'save', 'contact', 'abandon']);

/**
 * @typedef {Object} Query
 * @property {string} query_id
 * @property {string} session_id
 * @property {string} user_segment
 * @property {string} raw_query
 * @property {string[]} filters
 * @property {string} sort_choice
 * @property {string} created_at
 */

/**
 * @typedef {Object} Session
 * @property {string} session_id
 * @property {string} user_segment
 * @property {string} started_at
 * @property {string[]} query_ids
 */

/**
 * @typedef {Object} RankingLabel
 * @property {string} query_id
 * @property {string} listing_id
 * @property {number} rank
 * @property {number} utility_score
 * @property {number} relevance_label
 */

/**
 * @typedef {Object} Event
 * @property {string} event_id
 * @property {string} session_id
 * @property {string|null} listing_id
 * @property {string} event_type
 * @property {string} occurred_at
 * @property {number|null} dwell_seconds
 * @property {number|null} rank_position
 * @property {number|null} utility_score
 */

/**
 * Validates and creates a Query record.
 * @param {{query_id: string, session_id: string, user_segment: string, raw_query: string, filters: string[], sort_choice: string, created_at: string}} params
 * @returns {Query}
 */
export function createQuery({ query_id, session_id, user_segment, raw_query, filters, sort_choice, created_at }) {
  if (!query_id || !session_id) throw new Error('query_id and session_id must not be empty');
  if (!raw_query || !raw_query.trim()) throw new Error('raw_query must not be empty');
  if (!SORT_CHOICES.has(sort_choice)) throw new Error(`unsupported sort_choice: ${sort_choice}`);
  return { query_id, session_id, user_segment, raw_query, filters: Array.from(filters), sort_choice, created_at };
}

/**
 * Validates and creates a Session record.
 * @param {{session_id: string, user_segment: string, started_at: string, query_ids: string[]}} params
 * @returns {Session}
 */
export function createSession({ session_id, user_segment, started_at, query_ids }) {
  if (!session_id) throw new Error('session_id must not be empty');
  if (!query_ids || query_ids.length === 0) throw new Error('query_ids must not be empty');
  return { session_id, user_segment, started_at, query_ids: Array.from(query_ids) };
}

/**
 * Validates and creates a RankingLabel record.
 * @param {{query_id: string, listing_id: string, rank: number, utility_score: number, relevance_label: number}} params
 * @returns {RankingLabel}
 */
export function createRankingLabel({ query_id, listing_id, rank, utility_score, relevance_label }) {
  if (!query_id || !listing_id) throw new Error('query_id and listing_id must not be empty');
  if (rank <= 0) throw new Error('rank must be > 0');
  if (utility_score < 0 || utility_score > 1) throw new Error('utility_score must be between 0 and 1');
  if (relevance_label < 0 || relevance_label > 3) throw new Error('relevance_label must be between 0 and 3');
  return { query_id, listing_id, rank, utility_score, relevance_label };
}

/**
 * Validates and creates an Event record.
 * @param {{event_id: string, session_id: string, listing_id?: string|null, event_type: string, occurred_at: string, dwell_seconds?: number|null, rank_position?: number|null, utility_score?: number|null}} params
 * @returns {Event}
 */
export function createEvent({ event_id, session_id, listing_id, event_type, occurred_at, dwell_seconds, rank_position, utility_score }) {
  if (!event_id || !session_id) throw new Error('event identifiers must not be empty');
  if (!EVENT_TYPES.has(event_type)) throw new Error(`unsupported event_type: ${event_type}`);
  if (event_type !== 'abandon' && !listing_id) throw new Error('listing_id is required for listing-level events');
  if (dwell_seconds != null && dwell_seconds < 0) throw new Error('dwell_seconds must be >= 0');
  if (rank_position != null && rank_position <= 0) throw new Error('rank_position must be > 0');
  if (utility_score != null && (utility_score < 0 || utility_score > 1)) throw new Error('utility_score must be between 0 and 1');
  return { event_id, session_id, listing_id: listing_id ?? null, event_type, occurred_at, dwell_seconds: dwell_seconds ?? null, rank_position: rank_position ?? null, utility_score: utility_score ?? null };
}
