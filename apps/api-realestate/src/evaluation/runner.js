import { generateListings } from '../generation/listings.js';
import { generateSessions } from '../generation/behavior.js';
import { generateListingTimeline } from '../generation/timeline.js';
import { buildPrivacyReport } from '../privacy/checks.js';
import { createSearchApplication } from '../search/application.js';
import { syntheticQueryToSearchRequest } from '../search/adapters.js';
import { ndcgAtK, recallAtK, reciprocalRank } from './metrics.js';
import { overrideConfig } from '../config.js';

/**
 * Extracts the query_id from an event_id by stripping the event-type suffix.
 * @param {import('../schema/interaction.js').Event} event
 * @returns {string|null}
 */
function queryIdFromEvent(event) {
  for (const marker of ['-click-', '-save-', '-contact-', '-abandon', '-session-abandon']) {
    if (event.event_id.includes(marker)) return event.event_id.split(marker)[0];
  }
  return null;
}

/**
 * Returns the fraction of hits satisfying the query's county, property_type, and price filters.
 * @param {import('../schema/interaction.js').Query} query
 * @param {Object[]} hits
 * @returns {number}
 */
function filtersSatisfied(query, hits) {
  if (!hits.length) return 0.0;
  const required = {};
  for (const item of query.filters) {
    const [field, value] = item.split(':', 2);
    required[field] = value;
  }
  let matched = 0;
  for (const hit of hits) {
    let ok = true;
    if (required.county && hit.county !== required.county) ok = false;
    if (required.property_type && hit.property_type !== required.property_type) ok = false;
    if (required.max_price && parseInt(hit.total_price) > parseInt(required.max_price)) ok = false;
    if (ok) matched++;
  }
  return matched / hits.length;
}

/**
 * Returns the fraction of hits within the query's max_price constraint.
 * @param {import('../schema/interaction.js').Query} query
 * @param {Object[]} hits
 * @returns {number}
 */
function priceFitRate(query, hits) {
  if (!hits.length) return 0.0;
  let maxPrice = null;
  for (const item of query.filters) {
    const [field, value] = item.split(':', 2);
    if (field === 'max_price') { maxPrice = parseInt(value); break; }
  }
  if (maxPrice == null) return 1.0;
  return hits.filter(h => parseInt(h.total_price) <= maxPrice).length / hits.length;
}

/**
 * Computes diversity as the mean of county and property_type spread across hits.
 * @param {Object[]} hits
 * @returns {number}
 */
function diversityScore(hits) {
  if (!hits.length) return 0.0;
  const counties = new Set(hits.map(h => h.county)).size / hits.length;
  const types = new Set(hits.map(h => h.property_type)).size / hits.length;
  return (counties + types) / 2;
}

/**
 * Computes average freshness (1 - days_on_market/180) for the hit documents.
 * @param {Object} app - Search application with documentRepository.
 * @param {string[]} hitIds
 * @returns {number}
 */
function freshnessScore(app, hitIds) {
  if (!hitIds.length) return 0.0;
  const docs = hitIds.map(id => app.documentRepository.get(id)).filter(Boolean);
  return docs.reduce((s, d) => s + Math.max(0.0, 1 - d.days_on_market / 180), 0) / docs.length;
}

/**
 * Builds ground-truth relevance judgments and click sets from behavior data.
 * @param {Object} behavior
 * @returns {[Object.<string, Object.<string, number>>, Object.<string, Set<string>>]} [judgments, clicked]
 */
function buildGroundTruth(behavior) {
  const judgments = {};
  for (const label of behavior.ranking_labels) {
    if (!judgments[label.query_id]) judgments[label.query_id] = {};
    judgments[label.query_id][label.listing_id] = Math.max(judgments[label.query_id][label.listing_id] || 0, label.relevance_label);
  }
  const clicked = {};
  for (const event of behavior.events) {
    const qid = queryIdFromEvent(event);
    if (qid && event.listing_id && ['click', 'save', 'contact'].includes(event.event_type)) {
      if (!clicked[qid]) clicked[qid] = new Set();
      clicked[qid].add(event.listing_id);
    }
  }
  return [judgments, clicked];
}

/**
 * @typedef {Object} BaselineResult
 * @property {string} baseline
 * @property {number} ndcg_at_10
 * @property {number} recall_at_10
 * @property {number} mrr
 * @property {number} filter_satisfaction_rate
 * @property {number} price_fit_rate
 * @property {number} diversity
 * @property {number} catalog_coverage
 * @property {number} freshness_sensitivity
 * @property {number} conversion_proxy
 * @property {number} privacy_warning_count
 * @property {Object.<string, number>} by_segment_ndcg
 */

/**
 * @typedef {Object} EvaluationSummary
 * @property {string} generated_at
 * @property {number} seed
 * @property {string} config_hash
 * @property {Object.<string, BaselineResult>} baselines
 * @property {Object.<string, BaselineResult>} snapshot_comparison
 */

/**
 * Evaluates a single retrieval baseline over all behavior queries and returns per-metric averages.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/listing.js').Listing[]} listings
 * @param {Object} behavior
 * @param {string} baselineName - 'lexical', 'vector', or 'hybrid'.
 * @param {number} privacyWarningCount
 * @returns {BaselineResult}
 */
function evaluateSnapshot(config, listings, behavior, baselineName, privacyWarningCount) {
  let searchConfig = config.search;
  if (baselineName === 'lexical') searchConfig = { ...config.search, lexical_weight: 1.0, vector_weight: 0.0, business_weight: 0.0 };
  else if (baselineName === 'vector') searchConfig = { ...config.search, lexical_weight: 0.0, vector_weight: 1.0, business_weight: 0.0 };

  const evalConfig = overrideConfig(config, { search: searchConfig });
  const app = createSearchApplication(evalConfig, listings, behavior);
  const [judgments, clicked] = buildGroundTruth(behavior);

  const ndcgValues = [], recallValues = [], mrrValues = [], filterValues = [], priceValues = [], diversityValues = [], freshnessValues = [], conversionValues = [];
  const coverageIds = new Set();
  const bySegment = {};

  for (const query of behavior.queries) {
    const request = syntheticQueryToSearchRequest(query);
    const payload = {
      query_text: request.query_text,
      filters: request.filters,
      page: 1,
      page_size: 10,
      profile_context: request.profile_context,
      language_hint: request.language_hint,
    };
    const response = app.search(payload);
    const hits = response.hits.slice(0, 10);
    const hitIds = hits.map(h => h.listing_id);
    const relevanceById = judgments[query.query_id] || {};

    ndcgValues.push(ndcgAtK(relevanceById, hitIds, 10));
    recallValues.push(recallAtK(relevanceById, hitIds, 10));
    mrrValues.push(reciprocalRank(relevanceById, hitIds));
    filterValues.push(filtersSatisfied(query, hits));
    priceValues.push(priceFitRate(query, hits));
    diversityValues.push(diversityScore(hits));
    freshnessValues.push(freshnessScore(app, hitIds));
    const clickSet = clicked[query.query_id] || new Set();
    conversionValues.push(hitIds.some(id => clickSet.has(id)) ? 1.0 : 0.0);
    hitIds.forEach(id => coverageIds.add(id));
    if (!bySegment[query.user_segment]) bySegment[query.user_segment] = [];
    bySegment[query.user_segment].push(ndcgValues[ndcgValues.length - 1]);
  }

  const avg = arr => arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10000) / 10000 : 0;
  const totalDocs = app.documentRepository.list().length;
  return {
    baseline: baselineName,
    ndcg_at_10: avg(ndcgValues),
    recall_at_10: avg(recallValues),
    mrr: avg(mrrValues),
    filter_satisfaction_rate: avg(filterValues),
    price_fit_rate: avg(priceValues),
    diversity: avg(diversityValues),
    catalog_coverage: Math.round((coverageIds.size / Math.max(totalDocs, 1)) * 10000) / 10000,
    freshness_sensitivity: avg(freshnessValues),
    conversion_proxy: avg(conversionValues),
    privacy_warning_count: privacyWarningCount,
    by_segment_ndcg: Object.fromEntries(Object.entries(bySegment).sort().map(([seg, vals]) => [seg, avg(vals)])),
  };
}

/**
 * Extracts the first and last date snapshots from a timeline listing set.
 * @param {import('../schema/listing.js').Listing[]} listings
 * @returns {[string, import('../schema/listing.js').Listing[]][]}
 */
function timelineSnapshots(listings) {
  const dates = [...new Set(listings.map(l => l.snapshot_date))].sort();
  if (!dates.length) return [];
  const activeStatuses = new Set(['created', 'active', 'updated', 'relisted']);
  return [dates[0], dates[dates.length - 1]].map(label => [
    label,
    listings.filter(l => l.snapshot_date === label && activeStatuses.has(l.listing_status)),
  ]);
}

/**
 * Runs the full evaluation: three retrieval baselines plus first-vs-last timeline snapshot comparison.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/listing.js').Listing[]|null} [prebuiltListings=null]
 * @param {Object|null} [prebuiltBehavior=null]
 * @param {number|null} [knownPrivacyWarningCount=null] - Skips buildPrivacyReport if provided.
 * @returns {{ summary: EvaluationSummary, markdown: string }}
 */
export function runEvaluation(config, prebuiltListings = null, prebuiltBehavior = null, knownPrivacyWarningCount = null) {
  const listings = prebuiltListings ?? generateListings(config);
  const behavior = prebuiltBehavior ?? generateSessions(config, listings);

  const baselinePrivacyCount = knownPrivacyWarningCount ?? buildPrivacyReport(listings, config.configHash(), config.seed).warnings.length;
  const baselines = {};
  for (const name of ['lexical', 'vector', 'hybrid']) {
    baselines[name] = evaluateSnapshot(config, listings, behavior, name, baselinePrivacyCount);
  }

  const timeline = generateListingTimeline(config);
  const snapshotComparison = {};
  for (const [date, snapshot] of timelineSnapshots(timeline)) {
    const snapshotPrivacyCount = buildPrivacyReport(snapshot, config.configHash(), config.seed).warnings.length;
    snapshotComparison[date] = evaluateSnapshot(config, snapshot, behavior, 'hybrid', snapshotPrivacyCount);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    config_hash: config.configHash(),
    baselines,
    snapshot_comparison: snapshotComparison,
  };

  const markdownLines = ['# Evaluation Summary', '', `- generated_at: ${summary.generated_at}`, `- seed: ${config.seed}`, '', '## Baselines'];
  for (const [name, values] of Object.entries(baselines)) {
    markdownLines.push(`- ${name}: NDCG@10=${values.ndcg_at_10}, Recall@10=${values.recall_at_10}, MRR=${values.mrr}, Coverage=${values.catalog_coverage}, Conversion proxy=${values.conversion_proxy}`);
  }
  markdownLines.push('', '## Snapshot Comparison');
  for (const [date, values] of Object.entries(snapshotComparison)) {
    markdownLines.push(`- ${date}: hybrid NDCG@10=${values.ndcg_at_10}, Recall@10=${values.recall_at_10}, MRR=${values.mrr}`);
  }

  return { summary, markdown: markdownLines.join('\n') + '\n' };
}
