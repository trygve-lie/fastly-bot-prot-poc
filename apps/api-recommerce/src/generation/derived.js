import { samplePosition } from './geo.js';
import { samplePublishMinute } from './published.js';

// Bump when the geo areas or the publish time distribution change: on the next start, stored items
// are recomputed in place (no regeneration, so listing content and image mapping stay the same).
export const DERIVED_FIELDS_VERSION = 1;

/**
 * Per-listing fields derived only from the listing ID and municipality, each with its own RNG stream.
 * @param {string} listingId
 * @param {string} municipality
 * @returns {{ latitude: number|null, longitude: number|null, location_area: string|null, publish_minute: number }}
 */
export function derivedFields(listingId, municipality) {
  return { ...samplePosition(listingId, municipality), publish_minute: samplePublishMinute(listingId) };
}
