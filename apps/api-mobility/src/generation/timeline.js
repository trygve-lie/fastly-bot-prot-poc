import { createRng } from '../rng.js';
import { buildVehicle } from './vehicles.js';

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
 * Applies a random fractional price change to a vehicle's asking and total prices.
 * @param {import('../schema/vehicle.js').Vehicle} vehicle
 * @param {import('../rng.js').Rng} rng
 * @param {number} maxFraction
 * @returns {[number, number]} [asking_price, total_price]
 */
function adjustPrice(vehicle, rng, maxFraction) {
  const fraction = rng.uniform(-maxFraction, maxFraction);
  const asking_price = Math.max(25000, Math.floor(vehicle.asking_price * (1 + fraction)));
  const total_price = Math.max(asking_price, Math.floor(vehicle.total_price * (1 + fraction)));
  return [asking_price, total_price];
}

/**
 * Returns a shallow-merged copy of a vehicle with patch fields applied; recomputes price_per_year when nulled.
 * @param {import('../schema/vehicle.js').Vehicle} vehicle
 * @param {Partial<import('../schema/vehicle.js').Vehicle>} patch
 * @returns {import('../schema/vehicle.js').Vehicle}
 */
function patchVehicle(vehicle, patch) {
  const updated = { ...vehicle, ...patch };
  if ('price_per_year' in patch && patch.price_per_year == null) {
    const snapshotYear = parseInt(updated.snapshot_date.slice(0, 4));
    updated.price_per_year = Math.round(updated.asking_price / Math.max(1, snapshotYear - updated.model_year + 1));
  }
  return updated;
}

/**
 * Generates a multi-day vehicle inventory timeline with daily churn.
 * @param {Object} config
 * @returns {import('../schema/vehicle.js').Vehicle[]}
 */
export function generateVehicleTimeline(config) {
  const rng = createRng(config.seed + 10_000);
  let currentDate = config.snapshot_date;
  const activeInventory = new Map();
  const removedPool = new Map();
  const output = [];
  let nextSequence = 1;

  const initialRng = createRng(config.seed);
  for (let i = 0; i < config.listing_count; i++) {
    const vehicle = buildVehicle(config, initialRng, nextSequence, currentDate);
    nextSequence++;
    activeInventory.set(vehicle.listing_id, vehicle);
    output.push(vehicle);
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

    for (const vehicleId of activeIds) {
      const vehicle = activeInventory.get(vehicleId);
      let base = patchVehicle(vehicle, { snapshot_date: currentDate, days_on_market: vehicle.days_on_market + 1 });

      if (soldIds.has(vehicleId)) {
        output.push(patchVehicle(base, { listing_status: 'sold' }));
        continue;
      }
      if (removedIds.has(vehicleId)) {
        const removed = patchVehicle(base, { listing_status: 'removed' });
        removedPool.set(vehicleId, removed);
        output.push(removed);
        continue;
      }
      if (updatedIds.has(vehicleId)) {
        if (rng.random() < config.churn.price_change_probability) {
          const [asking_price, total_price] = adjustPrice(base, rng, config.churn.price_change_max_fraction);
          base = patchVehicle(base, { asking_price, total_price, price_per_year: null });
        }
        base = patchVehicle(base, { listing_status: 'updated' });
      } else {
        base = patchVehicle(base, { listing_status: 'active' });
      }
      nextActiveInventory.set(vehicleId, base);
      output.push(base);
    }

    const relistIds = sampleIds(rng, [...removedPool.keys()], config.churn.daily_relist_rate);
    for (const vehicleId of relistIds) {
      const removed = removedPool.get(vehicleId);
      removedPool.delete(vehicleId);
      const askingPrice = Math.max(25000, Math.floor(removed.asking_price * rng.uniform(0.97, 1.03)));
      const totalPrice = Math.max(askingPrice, Math.floor(removed.total_price * rng.uniform(0.97, 1.03)));
      const relisted = patchVehicle(removed, {
        snapshot_date: currentDate,
        listing_status: 'relisted',
        days_on_market: 0,
        asking_price: askingPrice,
        total_price: totalPrice,
        price_per_year: null,
      });
      nextActiveInventory.set(vehicleId, relisted);
      output.push(relisted);
    }

    const baselineNewCount = Math.max(1, Math.round(config.listing_count * config.churn.daily_new_rate));
    const replenishCount = Math.max(0, config.listing_count - nextActiveInventory.size);
    const newCount = Math.max(baselineNewCount, replenishCount);
    for (let i = 0; i < newCount; i++) {
      const vehicle = buildVehicle(config, rng, nextSequence, currentDate, 'created');
      nextSequence++;
      nextActiveInventory.set(vehicle.listing_id, vehicle);
      output.push(vehicle);
    }

    activeInventory.clear();
    for (const [k, v] of nextActiveInventory) activeInventory.set(k, v);
  }

  return output;
}

/**
 * Computes aggregate statistics over a timeline vehicle array.
 * @param {Object} config
 * @param {import('../schema/vehicle.js').Vehicle[]} vehicles
 * @returns {Object}
 */
export function buildTimelineSummary(config, vehicles) {
  const byStatus = {};
  const byDate = {};
  const activeByDate = {};
  for (const v of vehicles) {
    byStatus[v.listing_status] = (byStatus[v.listing_status] || 0) + 1;
    byDate[v.snapshot_date] = (byDate[v.snapshot_date] || 0) + 1;
    if (['created', 'active', 'updated', 'relisted'].includes(v.listing_status)) {
      activeByDate[v.snapshot_date] = (activeByDate[v.snapshot_date] || 0) + 1;
    }
  }
  return {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    config_hash: config.configHash(),
    start_date: config.snapshot_date,
    timeline_days: config.churn.timeline_days,
    row_count: vehicles.length,
    by_status: Object.fromEntries(Object.entries(byStatus).sort()),
    rows_by_date: Object.fromEntries(Object.entries(byDate).sort()),
    active_rows_by_date: Object.fromEntries(Object.entries(activeByDate).sort()),
  };
}
