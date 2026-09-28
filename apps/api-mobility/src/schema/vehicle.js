const VEHICLE_TYPES = new Set(['sedan', 'suv', 'hatchback', 'estate', 'coupe', 'van']);
const TRANSMISSIONS = new Set(['automatic', 'manual']);
const SALE_TYPES = new Set(['sale', 'new']);
const SELLER_TYPES = new Set(['dealer', 'private']);
const CONDITIONS = new Set(['new', 'excellent', 'good', 'fair', 'poor']);
const FUEL_TYPES = new Set(['electric', 'hybrid', 'petrol', 'diesel']);
const LISTING_STATUSES = new Set(['created', 'active', 'updated', 'sold', 'removed', 'relisted']);
const DRIVE_TYPES = new Set(['fwd', 'rwd', 'awd']);
const VALID_DOORS = new Set([2, 3, 4, 5]);

const PHONE_RE = /\b(?:\+47\s?)?\d{8}\b/;
const EMAIL_RE = /\b\S+@\S+\.\S+\b/;
const ADDRESS_RE = /\b\d{1,4}\s+[A-Za-zÆØÅæøå]+(?:\s+[A-Za-zÆØÅæøå]+){0,3}\s+(?:gate|gata|vei|veien|road|street)\b/i;

/**
 * @typedef {Object} Vehicle
 * @property {string} listing_id
 * @property {string} snapshot_date
 * @property {string} county
 * @property {string} municipality
 * @property {string} vehicle_type
 * @property {string} make
 * @property {string} model
 * @property {string} transmission
 * @property {string} fuel_type
 * @property {string} drive_type
 * @property {number} seats
 * @property {number} doors
 * @property {number} engine_kw
 * @property {number} mileage_km
 * @property {number} model_year
 * @property {string} condition
 * @property {string} color
 * @property {number} asking_price
 * @property {number} total_price
 * @property {number} price_per_year
 * @property {number|null} battery_range_km
 * @property {number} days_on_market
 * @property {string} listing_status
 * @property {string} title_synthetic
 * @property {string} description_synthetic
 * @property {string[]} feature_tags
 * @property {string[]} image_stub_ids
 * @property {number|null} latitude
 * @property {number|null} longitude
 */

/**
 * Deduplicates feature_tags, derives price_per_year if absent, validates, and returns a Vehicle.
 * @param {Object} attrs
 * @returns {Vehicle}
 */
export function createVehicle(attrs) {
  const feature_tags = [...new Set(attrs.feature_tags)];
  const snapshotYear = parseInt(attrs.snapshot_date.slice(0, 4));
  const price_per_year = attrs.price_per_year != null
    ? attrs.price_per_year
    : Math.round(attrs.asking_price / Math.max(1, snapshotYear - attrs.model_year + 1));

  const vehicle = { ...attrs, feature_tags, price_per_year };
  validateVehicle(vehicle);
  return vehicle;
}

/**
 * Throws if any vehicle invariant is violated.
 * @param {Vehicle} v
 * @returns {void}
 */
function validateVehicle(v) {
  if (!v.listing_id) throw new Error('listing_id must not be empty');
  if (!VEHICLE_TYPES.has(v.vehicle_type)) throw new Error(`unsupported vehicle_type: ${v.vehicle_type}`);
  if (!TRANSMISSIONS.has(v.transmission)) throw new Error(`unsupported transmission: ${v.transmission}`);
  if (!SALE_TYPES.has(v.sale_type)) throw new Error(`unsupported sale_type: ${v.sale_type}`);
  if (!SELLER_TYPES.has(v.seller_type)) throw new Error(`unsupported seller_type: ${v.seller_type}`);
  if (!CONDITIONS.has(v.condition)) throw new Error(`unsupported condition: ${v.condition}`);
  if (!FUEL_TYPES.has(v.fuel_type)) throw new Error(`unsupported fuel_type: ${v.fuel_type}`);
  if (!LISTING_STATUSES.has(v.listing_status)) throw new Error(`unsupported listing_status: ${v.listing_status}`);
  if (!DRIVE_TYPES.has(v.drive_type)) throw new Error(`unsupported drive_type: ${v.drive_type}`);
  if (v.seats < 2 || v.seats > 9) throw new Error('seats must be between 2 and 9');
  if (!VALID_DOORS.has(v.doors)) throw new Error(`doors must be 2, 3, 4, or 5`);
  if (v.engine_kw < 20) throw new Error('engine_kw must be >= 20');
  if (v.mileage_km < 0) throw new Error('mileage_km must be >= 0');
  const snapshotYear = parseInt(v.snapshot_date.slice(0, 4));
  if (v.model_year < 1980 || v.model_year > snapshotYear + 1) throw new Error('model_year is outside allowed range');
  if (v.asking_price <= 0 || v.total_price <= 0) throw new Error('asking_price and total_price must be positive');
  if (v.total_price < v.asking_price) throw new Error('total_price must be >= asking_price');
  if (!v.price_per_year || v.price_per_year <= 0) throw new Error('price_per_year must be > 0');
  if (v.fuel_type === 'electric') {
    if (v.battery_range_km == null || v.battery_range_km < 50 || v.battery_range_km > 800) {
      throw new Error('electric vehicles must have battery_range_km between 50 and 800');
    }
  }
  if ((v.fuel_type === 'petrol' || v.fuel_type === 'diesel') && v.battery_range_km != null) {
    throw new Error('petrol/diesel vehicles must have battery_range_km null');
  }
  for (const field of ['title_synthetic', 'description_synthetic']) {
    const value = v[field];
    if (!value || !value.trim()) throw new Error(`${field} must not be empty`);
    if (PHONE_RE.test(value) || EMAIL_RE.test(value) || ADDRESS_RE.test(value)) {
      throw new Error(`${field} contains forbidden contact or address-like content`);
    }
  }
}
