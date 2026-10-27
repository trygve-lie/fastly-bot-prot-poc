import { createRng } from '../rng.js';
import { buildItem } from './items.js';

/**
 * Advances a YYYY-MM-DD date string by a given number of days.
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Samples a random subset of IDs from values at the given daily rate, capped at the array length.
 * @param {import('../rng.js').Rng} rng
 * @param {string[]} values
 * @param {number} rate
 * @returns {Set<string>}
 */
function sampleIds(rng, values, rate) {
  if (!values.length || rate <= 0) return new Set();
  const count = Math.min(values.length, Math.round(values.length * rate));
  if (count <= 0) return new Set();
  return new Set(rng.sample(values, count));
}

/**
 * Applies a random fractional price change to an item's asking price; total follows asking + shipping.
 * @param {import('../schema/item.js').Item} item
 * @param {import('../rng.js').Rng} rng
 * @param {number} maxFraction
 * @returns {[number, number]} [asking_price, total_price]
 */
function adjustPrice(item, rng, maxFraction) {
  const fraction = rng.uniform(-maxFraction, maxFraction);
  const asking_price = Math.max(20, Math.floor(item.asking_price * (1 + fraction)));
  return [asking_price, asking_price + item.shipping_cost];
}

/**
 * Returns a shallow-merged copy of an item with patch fields applied.
 * @param {import('../schema/item.js').Item} item
 * @param {Partial<import('../schema/item.js').Item>} patch
 * @returns {import('../schema/item.js').Item}
 */
function patchItem(item, patch) {
  return { ...item, ...patch };
}

/**
 * Generates a multi-day item inventory timeline with daily churn.
 * @param {Object} config
 * @returns {import('../schema/item.js').Item[]}
 */
export function generateItemTimeline(config) {
  const rng = createRng(config.seed + 10_000);
  let currentDate = config.snapshot_date;
  const activeInventory = new Map();
  const removedPool = new Map();
  const output = [];
  let nextSequence = 1;

  const initialRng = createRng(config.seed);
  for (let i = 0; i < config.listing_count; i++) {
    const item = buildItem(config, initialRng, nextSequence, currentDate);
    nextSequence++;
    activeInventory.set(item.listing_id, item);
    output.push(item);
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

    for (const itemId of activeIds) {
      const item = activeInventory.get(itemId);
      let base = patchItem(item, { snapshot_date: currentDate, days_on_market: item.days_on_market + 1 });

      if (soldIds.has(itemId)) {
        output.push(patchItem(base, { listing_status: 'sold' }));
        continue;
      }
      if (removedIds.has(itemId)) {
        const removed = patchItem(base, { listing_status: 'removed' });
        removedPool.set(itemId, removed);
        output.push(removed);
        continue;
      }
      if (updatedIds.has(itemId)) {
        if (rng.random() < config.churn.price_change_probability) {
          const [asking_price, total_price] = adjustPrice(base, rng, config.churn.price_change_max_fraction);
          base = patchItem(base, { asking_price, total_price });
        }
        base = patchItem(base, { listing_status: 'updated' });
      } else {
        base = patchItem(base, { listing_status: 'active' });
      }
      nextActiveInventory.set(itemId, base);
      output.push(base);
    }

    const relistIds = sampleIds(rng, [...removedPool.keys()], config.churn.daily_relist_rate);
    for (const itemId of relistIds) {
      const removed = removedPool.get(itemId);
      removedPool.delete(itemId);
      const askingPrice = Math.max(20, Math.floor(removed.asking_price * rng.uniform(0.92, 1.03)));
      const totalPrice = askingPrice + removed.shipping_cost;
      const relisted = patchItem(removed, {
        snapshot_date: currentDate,
        listing_status: 'relisted',
        days_on_market: 0,
        asking_price: askingPrice,
        total_price: totalPrice,
      });
      nextActiveInventory.set(itemId, relisted);
      output.push(relisted);
    }

    const baselineNewCount = Math.max(1, Math.round(config.listing_count * config.churn.daily_new_rate));
    const replenishCount = Math.max(0, config.listing_count - nextActiveInventory.size);
    const newCount = Math.max(baselineNewCount, replenishCount);
    for (let i = 0; i < newCount; i++) {
      const item = buildItem(config, rng, nextSequence, currentDate, 'created');
      nextSequence++;
      nextActiveInventory.set(item.listing_id, item);
      output.push(item);
    }

    activeInventory.clear();
    for (const [k, v] of nextActiveInventory) activeInventory.set(k, v);
  }

  return output;
}
