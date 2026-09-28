import { createRng } from '../rng.js';
import { buildListing } from './listings.js';

/**
 * Advances a date string by a number of days.
 * @param {string} dateStr - ISO date string (YYYY-MM-DD).
 * @param {number} days
 * @returns {string}
 */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Randomly samples a subset of IDs at a given daily rate.
 * @param {import('../rng.js').Rng} rng
 * @param {string[]} values
 * @param {number} rate - Fraction of values to sample.
 * @returns {Set<string>}
 */
function sampleIds(rng, values, rate) {
  if (!values.length || rate <= 0) return new Set();
  const count = Math.min(values.length, Math.round(values.length * rate));
  if (count <= 0) return new Set();
  return new Set(rng.sample(values, count));
}

/**
 * Applies a random price change to a listing within the allowed fraction.
 * @param {import('../schema/listing.js').Listing} listing
 * @param {import('../rng.js').Rng} rng
 * @param {number} maxFraction
 * @returns {[number, number]} [asking_price, total_price]
 */
function adjustPrice(listing, rng, maxFraction) {
  const fraction = rng.uniform(-maxFraction, maxFraction);
  const asking_price = Math.max(900_000, Math.floor(listing.asking_price * (1 + fraction)));
  const total_price = Math.max(asking_price, Math.floor(listing.total_price * (1 + fraction)));
  return [asking_price, total_price];
}

/**
 * Returns a new listing with patched fields, recomputing price_per_m2 when price changes.
 * @param {import('../schema/listing.js').Listing} listing
 * @param {Object} patch
 * @returns {import('../schema/listing.js').Listing}
 */
function patchListing(listing, patch) {
  const updated = { ...listing, ...patch };
  if ('price_per_m2' in patch && patch.price_per_m2 == null) {
    updated.price_per_m2 = Math.max(1, Math.round(updated.total_price / updated.size_m2));
  }
  return updated;
}

/**
 * Generates a multi-day inventory timeline with daily churn (new, updated, sold, removed, relisted).
 * @param {import('../config.js').Config} config
 * @returns {import('../schema/listing.js').Listing[]} All listing snapshots across all timeline days.
 */
export function generateListingTimeline(config) {
  const rng = createRng(config.seed + 10_000);
  let currentDate = config.snapshot_date;
  const activeInventory = new Map();
  const removedPool = new Map();
  const output = [];
  let nextSequence = 1;

  const initialRng = createRng(config.seed);
  for (let i = 0; i < config.listing_count; i++) {
    const listing = buildListing(config, initialRng, nextSequence, currentDate);
    nextSequence++;
    activeInventory.set(listing.listing_id, listing);
    output.push(listing);
  }

  for (let dayOffset = 1; dayOffset < config.churn.timeline_days; dayOffset++) {
    currentDate = addDays(config.snapshot_date, dayOffset);
    const activeIds = [...activeInventory.keys()];
    const soldIds = sampleIds(rng, activeIds, config.churn.daily_sold_rate);
    const remainingAfterSold = activeIds.filter(id => !soldIds.has(id));
    const removedIds = sampleIds(rng, remainingAfterSold, config.churn.daily_removed_rate);
    const remainingAfterExits = activeIds.filter(id => !soldIds.has(id) && !removedIds.has(id));
    const updatedIds = sampleIds(rng, remainingAfterExits, config.churn.daily_update_rate);

    const nextActiveInventory = new Map();

    for (const listingId of activeIds) {
      const listing = activeInventory.get(listingId);
      let base = patchListing(listing, { snapshot_date: currentDate, days_on_market: listing.days_on_market + 1 });

      if (soldIds.has(listingId)) {
        output.push(patchListing(base, { listing_status: 'sold' }));
        continue;
      }
      if (removedIds.has(listingId)) {
        const removed = patchListing(base, { listing_status: 'removed' });
        removedPool.set(listingId, removed);
        output.push(removed);
        continue;
      }
      if (updatedIds.has(listingId)) {
        if (rng.random() < config.churn.price_change_probability) {
          const [asking_price, total_price] = adjustPrice(base, rng, config.churn.price_change_max_fraction);
          base = patchListing(base, { asking_price, total_price, price_per_m2: null });
        }
        base = patchListing(base, { listing_status: 'updated' });
      } else {
        base = patchListing(base, { listing_status: 'active' });
      }
      nextActiveInventory.set(listingId, base);
      output.push(base);
    }

    const relistIds = sampleIds(rng, [...removedPool.keys()], config.churn.daily_relist_rate);
    for (const listingId of relistIds) {
      const removed = removedPool.get(listingId);
      removedPool.delete(listingId);
      const askingPrice = Math.max(900_000, Math.floor(removed.asking_price * rng.uniform(0.97, 1.03)));
      const totalPrice = Math.max(askingPrice, Math.floor(removed.total_price * rng.uniform(0.97, 1.03)));
      const relisted = patchListing(removed, {
        snapshot_date: currentDate,
        listing_status: 'relisted',
        days_on_market: 0,
        asking_price: askingPrice,
        total_price: totalPrice,
        price_per_m2: null,
      });
      nextActiveInventory.set(listingId, relisted);
      output.push(relisted);
    }

    const baselineNewCount = Math.max(1, Math.round(config.listing_count * config.churn.daily_new_rate));
    const replenishCount = Math.max(0, config.listing_count - nextActiveInventory.size);
    const newCount = Math.max(baselineNewCount, replenishCount);
    for (let i = 0; i < newCount; i++) {
      const listing = buildListing(config, rng, nextSequence, currentDate, 'created');
      nextSequence++;
      nextActiveInventory.set(listing.listing_id, listing);
      output.push(listing);
    }

    activeInventory.clear();
    for (const [k, v] of nextActiveInventory) activeInventory.set(k, v);
  }

  return output;
}

/**
 * Computes summary statistics over a timeline listing set.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/listing.js').Listing[]} listings
 * @returns {Object} Timeline summary with row counts by status and date.
 */
export function buildTimelineSummary(config, listings) {
  const byStatus = {};
  const byDate = {};
  const activeByDate = {};
  for (const l of listings) {
    byStatus[l.listing_status] = (byStatus[l.listing_status] || 0) + 1;
    byDate[l.snapshot_date] = (byDate[l.snapshot_date] || 0) + 1;
    if (['created', 'active', 'updated', 'relisted'].includes(l.listing_status)) {
      activeByDate[l.snapshot_date] = (activeByDate[l.snapshot_date] || 0) + 1;
    }
  }
  return {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    config_hash: config.configHash(),
    start_date: config.snapshot_date,
    timeline_days: config.churn.timeline_days,
    row_count: listings.length,
    by_status: Object.fromEntries(Object.entries(byStatus).sort()),
    rows_by_date: Object.fromEntries(Object.entries(byDate).sort()),
    active_rows_by_date: Object.fromEntries(Object.entries(activeByDate).sort()),
  };
}
