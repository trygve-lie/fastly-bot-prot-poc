const CATEGORIES = new Set([
  'electronics', 'computers_gaming', 'home_appliances', 'furniture', 'home_decor',
  'clothing', 'shoes_accessories', 'kids_baby', 'sports_outdoors', 'hobbies_music',
  'books_media', 'antiques_collectibles', 'garden_tools',
]);
const SIZED_CATEGORIES = new Set(['clothing', 'shoes_accessories', 'kids_baby', 'sports_outdoors']);
const CONDITIONS = new Set(['new', 'like_new', 'good', 'fair', 'for_parts']);
const SALE_TYPES = new Set(['fixed_price', 'bidding']);
const SELLER_TYPES = new Set(['private', 'shop']);
const LISTING_STATUSES = new Set(['created', 'active', 'updated', 'sold', 'removed', 'relisted']);

const PHONE_RE = /\b(?:\+47\s?)?\d{8}\b/;
const EMAIL_RE = /\b\S+@\S+\.\S+\b/;
const ADDRESS_RE = /\b\d{1,4}\s+[A-Za-zÆØÅæøå]+(?:\s+[A-Za-zÆØÅæøå]+){0,3}\s+(?:gate|gata|vei|veien|road|street)\b/i;

/**
 * @typedef {Object} Item
 * @property {string} listing_id
 * @property {string} snapshot_date
 * @property {string} county
 * @property {string} municipality
 * @property {string} location_cluster
 * @property {string} coarse_geo_cell
 * @property {string} category
 * @property {string} category_label
 * @property {string} subcategory
 * @property {string} subcategory_label
 * @property {string|null} brand
 * @property {string} model
 * @property {string} condition
 * @property {string} condition_label
 * @property {string} sale_type
 * @property {string} seller_type
 * @property {number} age_years
 * @property {string|null} color
 * @property {string|null} material
 * @property {string|null} size
 * @property {boolean} shipping_available
 * @property {number} shipping_cost
 * @property {boolean} has_original_box
 * @property {boolean} has_receipt
 * @property {boolean} has_warranty
 * @property {number} asking_price
 * @property {number} total_price
 * @property {number} days_on_market
 * @property {string} listing_status
 * @property {string} title
 * @property {string} text
 * @property {string} description_synthetic
 * @property {string[]} feature_tags
 * @property {string[]} image_stub_ids
 * @property {number|null} latitude - Approximate (~100 m), inside a populated area of the municipality
 * @property {number|null} longitude
 * @property {string|null} location_area - Name of that populated area (district or town centre)
 * @property {number} publish_minute - Local minute of the day (0-1439) the ad was published
 */

/**
 * Deduplicates feature_tags, validates, and returns an Item.
 * @param {Object} attrs
 * @returns {Item}
 */
export function createItem(attrs) {
  const feature_tags = [...new Set(attrs.feature_tags)];
  const item = { ...attrs, feature_tags };
  validateItem(item);
  return item;
}

/**
 * Throws if any item invariant is violated.
 * @param {Item} it
 * @returns {void}
 */
function validateItem(it) {
  if (!it.listing_id) throw new Error('listing_id must not be empty');
  if (!CATEGORIES.has(it.category)) throw new Error(`unsupported category: ${it.category}`);
  if (!it.subcategory) throw new Error('subcategory must not be empty');
  if (!it.model) throw new Error('model must not be empty');
  if (!CONDITIONS.has(it.condition)) throw new Error(`unsupported condition: ${it.condition}`);
  if (!SALE_TYPES.has(it.sale_type)) throw new Error(`unsupported sale_type: ${it.sale_type}`);
  if (!SELLER_TYPES.has(it.seller_type)) throw new Error(`unsupported seller_type: ${it.seller_type}`);
  if (!LISTING_STATUSES.has(it.listing_status)) throw new Error(`unsupported listing_status: ${it.listing_status}`);
  if (!Number.isInteger(it.age_years) || it.age_years < 0 || it.age_years > 250) throw new Error('age_years must be an integer between 0 and 250');
  if (it.condition === 'new' && it.age_years !== 0) throw new Error('new items must have age_years 0');
  if (it.category === 'antiques_collectibles') {
    if (it.age_years < 30) throw new Error('antiques must be at least 30 years old');
    if (it.condition === 'new') throw new Error('antiques cannot be in new condition');
  }
  if (it.size != null && !SIZED_CATEGORIES.has(it.category)) throw new Error(`size is not allowed for category ${it.category}`);
  if (it.has_warranty && it.age_years >= 3) throw new Error('warranty is only allowed for items younger than 3 years');
  if (it.asking_price <= 0 || it.total_price <= 0) throw new Error('asking_price and total_price must be positive');
  if (it.shipping_available) {
    if (!(it.shipping_cost > 0)) throw new Error('shipping_cost must be > 0 when shipping is available');
  } else if (it.shipping_cost !== 0) {
    throw new Error('shipping_cost must be 0 when shipping is not available');
  }
  if (it.total_price !== it.asking_price + it.shipping_cost) throw new Error('total_price must equal asking_price + shipping_cost');
  for (const field of ['title', 'text', 'description_synthetic']) {
    const value = it[field];
    if (!value || !value.trim()) throw new Error(`${field} must not be empty`);
    if (PHONE_RE.test(value) || EMAIL_RE.test(value) || ADDRESS_RE.test(value)) {
      throw new Error(`${field} contains forbidden contact or address-like content`);
    }
  }
}
