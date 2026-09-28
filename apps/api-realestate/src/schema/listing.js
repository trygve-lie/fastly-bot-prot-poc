const PROPERTY_TYPES = new Set(['apartment', 'detached', 'townhouse', 'semi_detached', 'cabin']);
const OWNERSHIP_FORMS = new Set(['freehold', 'cooperative', 'condominium']);
const SALE_TYPES = new Set(['sale', 'new_home']);
const SELLER_TYPES = new Set(['broker', 'owner']);
const CONDITIONS = new Set(['new', 'updated', 'standard', 'renovation_needed']);
const ENERGY_RATINGS = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
const LISTING_STATUSES = new Set(['created', 'active', 'updated', 'sold', 'removed', 'relisted']);

const PHONE_RE = /\b(?:\+47\s?)?\d{8}\b/;
const EMAIL_RE = /\b\S+@\S+\.\S+\b/;
const ADDRESS_RE = /\b\d{1,4}\s+[A-Za-zÆØÅæøå]+(?:\s+[A-Za-zÆØÅæøå]+){0,3}\s+(?:gate|gata|vei|veien|road|street)\b/i;

/**
 * @typedef {Object} Listing
 * @property {string} listing_id
 * @property {string} snapshot_date
 * @property {string} county
 * @property {string} municipality
 * @property {string} neighborhood_cluster
 * @property {string} coarse_geo_cell
 * @property {string} property_type
 * @property {string} ownership_form
 * @property {string} sale_type
 * @property {string} seller_type
 * @property {number} bedrooms
 * @property {number} bathrooms
 * @property {number|null} floor
 * @property {number|null} total_floors
 * @property {number} size_m2
 * @property {number|null} plot_m2
 * @property {number} build_year
 * @property {string} condition
 * @property {string} energy_rating
 * @property {boolean} has_balcony
 * @property {boolean} has_terrace
 * @property {boolean} has_parking
 * @property {boolean} has_elevator
 * @property {boolean} has_garden
 * @property {boolean} has_view
 * @property {number} asking_price
 * @property {number} total_price
 * @property {number} common_costs_monthly
 * @property {number} price_per_m2
 * @property {number} days_on_market
 * @property {string} listing_status
 * @property {string} title
 * @property {string} text
 * @property {string} description_synthetic
 * @property {string[]} amenity_tags
 * @property {string[]} image_stub_ids
 * @property {number|null} latitude
 * @property {number|null} longitude
 */

/**
 * Validates attrs, derives missing fields, and returns a Listing.
 * @param {Object} attrs - Raw attribute object (all Listing fields required except price_per_m2).
 * @returns {Listing}
 */
export function createListing(attrs) {
  // Deduplicate amenity_tags preserving order
  const amenity_tags = [...new Set(attrs.amenity_tags)];

  // Derive price_per_m2 if not provided
  const price_per_m2 = attrs.price_per_m2 != null
    ? attrs.price_per_m2
    : Math.max(1, Math.round(attrs.total_price / attrs.size_m2));

  const listing = {
    ...attrs,
    amenity_tags,
    price_per_m2,
    latitude: attrs.latitude ?? null,
    longitude: attrs.longitude ?? null,
  };
  validateListing(listing);
  return listing;
}

/**
 * Throws if the listing violates any schema invariant.
 * @param {Listing} l
 * @returns {void}
 */
function validateListing(l) {
  if (!l.listing_id) throw new Error('listing_id must not be empty');
  if (!PROPERTY_TYPES.has(l.property_type)) throw new Error(`unsupported property_type: ${l.property_type}`);
  if (!OWNERSHIP_FORMS.has(l.ownership_form)) throw new Error(`unsupported ownership_form: ${l.ownership_form}`);
  if (!SALE_TYPES.has(l.sale_type)) throw new Error(`unsupported sale_type: ${l.sale_type}`);
  if (!SELLER_TYPES.has(l.seller_type)) throw new Error(`unsupported seller_type: ${l.seller_type}`);
  if (!CONDITIONS.has(l.condition)) throw new Error(`unsupported condition: ${l.condition}`);
  if (!ENERGY_RATINGS.has(l.energy_rating)) throw new Error(`unsupported energy_rating: ${l.energy_rating}`);
  if (!LISTING_STATUSES.has(l.listing_status)) throw new Error(`unsupported listing_status: ${l.listing_status}`);
  if (l.bedrooms < 0 || l.bathrooms <= 0) throw new Error('bedrooms must be >= 0 and bathrooms must be > 0');
  if (l.size_m2 < 12) throw new Error('size_m2 must be at least 12');
  const snapshotYear = parseInt(l.snapshot_date.slice(0, 4));
  if (l.build_year < 1900 || l.build_year > snapshotYear + 1) throw new Error('build_year is outside allowed range');
  if (l.asking_price <= 0 || l.total_price <= 0) throw new Error('asking_price and total_price must be positive');
  if (l.total_price < l.asking_price) throw new Error('total_price must be >= asking_price');
  if (l.common_costs_monthly < 0) throw new Error('common_costs_monthly must be >= 0');
  if (l.days_on_market < 0) throw new Error('days_on_market must be >= 0');
  if (!l.price_per_m2 || l.price_per_m2 <= 0) throw new Error('price_per_m2 must be > 0');
  if (l.bedrooms > Math.max(1, Math.floor(l.size_m2 / 12))) throw new Error('bedrooms too high for property size');
  if (l.floor != null && l.total_floors != null && l.floor > l.total_floors) throw new Error('floor cannot exceed total_floors');
  if (['detached', 'semi_detached', 'cabin'].includes(l.property_type) && l.floor != null) throw new Error('floor should be null for house-style properties');
  if (['detached', 'semi_detached', 'cabin'].includes(l.property_type) && l.common_costs_monthly > 0) throw new Error('common_costs_monthly should be zero for house-style properties');
  if (l.property_type === 'apartment' && l.plot_m2 != null && l.plot_m2 > 50) throw new Error('apartment plot_m2 must be null or minimal');
  if (l.property_type === 'cabin' && l.has_elevator) throw new Error('cabins cannot have elevators');
  for (const field of ['title', 'text', 'description_synthetic']) {
    const value = l[field];
    if (!value || !value.trim()) throw new Error(`${field} must not be empty`);
    if (PHONE_RE.test(value) || EMAIL_RE.test(value) || ADDRESS_RE.test(value)) {
      throw new Error(`${field} contains forbidden contact or address-like content`);
    }
  }
}
