import { createHash } from 'node:crypto';

/**
 * Derives a stable 32-bit RNG seed from a string (e.g. "<listing_id>:geo"), so per-listing
 * attributes can have their own RNG stream independent of the main generation sequence.
 * @param {string} value
 * @returns {number}
 */
export function seedFromString(value) {
  return parseInt(createHash('sha256').update(value).digest('hex').slice(0, 8), 16);
}
