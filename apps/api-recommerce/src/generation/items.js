import { createRng } from '../rng.js';
import { derivedFields } from './derived.js';
import { createItem } from '../schema/item.js';
import { buildTitle, buildText, buildDescription, PRODUCT_CATALOG } from './text.js';

const LISTING_STATUS_VALUES = ['created', 'active', 'updated', 'relisted'];
const LISTING_STATUS_WEIGHTS = [0.10, 0.66, 0.19, 0.05];

const COLOR_NAMES = ['black', 'white', 'grey', 'beige', 'brown', 'blue', 'green', 'red', 'pink', 'silver', 'gold', 'multicolour'];
const COLOR_WEIGHTS = [0.22, 0.16, 0.16, 0.09, 0.08, 0.09, 0.05, 0.04, 0.03, 0.04, 0.02, 0.02];
const UNCOLOURED_CATEGORIES = new Set(['books_media', 'antiques_collectibles']);

const MATERIALS = {
  sofa: ['fabric', 'leather', 'velvet', 'wool boucle'],
  armchair: ['fabric', 'leather', 'velvet', 'wool boucle'],
  dining_table: ['oak', 'pine', 'walnut', 'teak', 'birch'],
  chair: ['oak', 'beech', 'plastic', 'metal', 'leather'],
  bookshelf: ['oak', 'pine', 'birch', 'white lacquer'],
  bed: ['oak', 'pine', 'fabric', 'white lacquer'],
  desk: ['oak', 'teak', 'birch', 'white lacquer'],
  wardrobe: ['pine', 'oak', 'white lacquer'],
  lamp: ['brass', 'metal', 'glass', 'opal glass'],
  rug: ['wool', 'cotton', 'jute'],
  vase: ['glass', 'ceramic', 'porcelain'],
  mirror: ['oak', 'brass', 'metal'],
  candle_holder: ['brass', 'pewter', 'glass', 'ceramic'],
  figurine: ['porcelain', 'wood', 'ceramic'],
  picture_frame: ['oak', 'gold-painted wood', 'aluminium'],
  jacket: ['gore-tex', 'recycled polyester', 'cotton blend'],
  coat: ['wool', 'down', 'cotton blend'],
  sweater: ['wool', 'merino wool', 'cotton', 'cashmere'],
  jeans: ['denim'],
  dress: ['cotton', 'silk', 'viscose', 'linen'],
  shirt: ['cotton', 'linen'],
  garden_furniture: ['teak', 'rattan', 'aluminium', 'pine'],
};

const SIZE_SCALES = {
  apparel: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  shoes: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  kids: ['86', '92', '98', '104', '110', '116', '122', '128'],
};

// Probability of each feature tag per category; tags are the vocabulary used
// by segments (preferred_features), filters and the search body.
const FEATURE_RULES = {
  electronics:           { original_box: 0.45, receipt: 0.40, warranty_remaining: 0.30, accessories_included: 0.45, minor_scratches: 0.25, barely_used: 0.25 },
  computers_gaming:      { original_box: 0.40, receipt: 0.35, warranty_remaining: 0.28, accessories_included: 0.45, complete_set: 0.20, minor_scratches: 0.22 },
  home_appliances:       { original_box: 0.25, receipt: 0.35, warranty_remaining: 0.25, recently_serviced: 0.15, barely_used: 0.25, smoke_free_home: 0.30 },
  furniture:             { smoke_free_home: 0.45, pet_free_home: 0.35, minor_scratches: 0.35, vintage: 0.15, handmade: 0.06, assembly_included: 0.20 },
  home_decor:            { smoke_free_home: 0.30, vintage: 0.30, handmade: 0.20, minor_scratches: 0.15, original_box: 0.12 },
  clothing:              { original_tags: 0.18, barely_used: 0.35, smoke_free_home: 0.40, pet_free_home: 0.25, vintage: 0.10 },
  shoes_accessories:     { original_box: 0.30, original_tags: 0.12, barely_used: 0.35, receipt: 0.20, vintage: 0.08 },
  kids_baby:             { smoke_free_home: 0.50, pet_free_home: 0.40, accessories_included: 0.35, barely_used: 0.30 },
  sports_outdoors:       { recently_serviced: 0.30, accessories_included: 0.35, barely_used: 0.30, receipt: 0.15 },
  hobbies_music:         { accessories_included: 0.40, complete_set: 0.35, original_box: 0.30, recently_serviced: 0.12, vintage: 0.10 },
  books_media:           { complete_set: 0.25, first_edition: 0.08, signed: 0.06, barely_used: 0.30, vintage: 0.15 },
  antiques_collectibles: { vintage: 0.80, signed: 0.25, handmade: 0.35, provenance_documented: 0.20, complete_set: 0.15 },
  garden_tools:          { recently_serviced: 0.30, accessories_included: 0.35, receipt: 0.25, original_box: 0.15 },
};

// Municipalities that drew two RNG values for a (now replaced) bounding-box position. The draws are
// kept so every other generated field, and therefore the image mapping, stays identical.
const LEGACY_GEO_MUNICIPALITIES = new Set([
  'Oslo', 'Bergen', 'Askoy', 'Alver', 'Trondheim', 'Malvik', 'Melhus', 'Stavanger', 'Sandnes', 'Sola',
  'Kristiansand', 'Lillesand', 'Arendal', 'Bodo', 'Narvik', 'Sortland',
]);

const LOCATION_CLUSTERS = ['city_centre', 'student_quarter', 'suburban_loop', 'harbour_side', 'valley_edge'];
const SHIPPING_COSTS_SMALL = [59, 79, 99];
const SHIPPING_COSTS_LARGE = [99, 149, 199, 249];

/**
 * Selects a county by weighted sampling from the config.
 * @param {Object} config
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} County definition.
 */
function chooseCounty(config, rng) {
  const names = config.counties.map(c => c.name);
  const weights = config.counties.map(c => c.weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.counties.find(c => c.name === selected);
}

/**
 * Selects a category and one of its subcategories by weighted sampling.
 * @param {Object} config
 * @param {import('../rng.js').Rng} rng
 * @returns {[Object, Object]} [category, subcategory]
 */
function chooseCategory(config, rng) {
  const categories = config.calibration.categories;
  const categoryName = rng.choices(categories.map(c => c.name), categories.map(c => c.weight), 1)[0];
  const category = config.calibration.category(categoryName);
  const subName = rng.choices(category.subcategories.map(s => s.name), category.subcategories.map(s => s.weight), 1)[0];
  return [category, category.subcategories.find(s => s.name === subName)];
}

/**
 * Selects a condition by weighted sampling; collectibles are never "new" and
 * categories with allow_for_parts=false are never "for_parts".
 * @param {Object} config
 * @param {Object} category
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} Condition record.
 */
function sampleCondition(config, category, rng) {
  const options = config.calibration.conditions.filter(c =>
    !(category.collectible && c.name === 'new') &&
    !(!category.allow_for_parts && c.name === 'for_parts'));
  const name = rng.choices(options.map(c => c.name), options.map(c => c.weight), 1)[0];
  return config.calibration.condition(name);
}

/**
 * Samples an age in whole years, skewed towards younger items and consistent with the condition.
 * @param {Object} subcategory
 * @param {Object} condition
 * @param {Object} category
 * @param {import('../rng.js').Rng} rng
 * @returns {number}
 */
function sampleAge(subcategory, condition, category, rng) {
  if (condition.name === 'new') return 0;
  const span = subcategory.age_max - subcategory.age_min;
  let age = Math.round(subcategory.age_min + span * Math.pow(rng.random(), 1.6));
  if (condition.name === 'like_new' && !category.collectible) age = Math.min(age, 2);
  return age;
}

/**
 * Picks a brand/model pair from the product catalogue and returns its price position in [0, 1].
 * @param {string} subcategory
 * @param {import('../rng.js').Rng} rng
 * @returns {{ brand: string|null, model: string, position: number }}
 */
function sampleProduct(subcategory, rng) {
  const entries = PRODUCT_CATALOG[subcategory];
  if (!entries) throw new Error(`no catalogue entries for subcategory ${subcategory}`);
  const entry = rng.choice(entries);
  const index = rng.randint(0, entry.models.length - 1);
  const entryIndex = entries.indexOf(entry);
  const brandPosition = entries.length > 1 ? entryIndex / (entries.length - 1) : 0.5;
  const modelPosition = entry.models.length > 1 ? index / (entry.models.length - 1) : 0.5;
  return { brand: entry.brand, model: entry.models[index], position: 0.5 * brandPosition + 0.5 * modelPosition };
}

/**
 * Generates feature tags for a category, keeping them consistent with condition and age.
 * @param {string} category
 * @param {Object} condition
 * @param {number} age
 * @param {import('../rng.js').Rng} rng
 * @returns {string[]}
 */
function sampleFeatureTags(category, condition, age, rng) {
  const tags = [];
  for (const [tag, probability] of Object.entries(FEATURE_RULES[category] || {})) {
    if (rng.random() >= probability) continue;
    if (tag === 'warranty_remaining' && age >= 3) continue;
    if (tag === 'original_tags' && !['new', 'like_new'].includes(condition.name)) continue;
    if (tag === 'barely_used' && !['new', 'like_new', 'good'].includes(condition.name)) continue;
    if (tag === 'minor_scratches' && condition.name === 'new') continue;
    tags.push(tag);
  }
  if (condition.name === 'new' && !tags.includes('unopened') && rng.random() < 0.5) tags.push('unopened');
  return [...new Set(tags)];
}

/**
 * Rounds a price to a natural-looking amount for its magnitude.
 * @param {number} value
 * @returns {number}
 */
function roundPrice(value) {
  if (value < 1000) return Math.max(20, Math.round(value / 10) * 10);
  if (value < 10000) return Math.round(value / 50) * 50;
  return Math.round(value / 100) * 100;
}

/**
 * Computes the asking price from subcategory range, product position, condition, age depreciation,
 * county price index, feature bonus and noise.
 * @param {Object} config
 * @param {Object} county
 * @param {Object} category
 * @param {Object} subcategory
 * @param {Object} condition
 * @param {number} age
 * @param {number} position
 * @param {string[]} featureTags
 * @param {import('../rng.js').Rng} rng
 * @returns {number}
 */
function sampleAskingPrice(config, county, category, subcategory, condition, age, position, featureTags, rng) {
  const spread = Math.min(1, Math.max(0, 0.6 * position + 0.4 * rng.random()));
  const base = subcategory.price_min + (subcategory.price_max - subcategory.price_min) * spread;
  const condMult = category.collectible ? condition.collectible_price_multiplier : condition.price_multiplier;
  const depreciation = Math.max(0.25, Math.pow(1 - category.depreciation_per_year, age));
  const featureBonus = 1.0 + config.calibration.feature_bonus_per_tag * featureTags.length;
  const noise = rng.uniform(config.calibration.price_noise_min, config.calibration.price_noise_max);
  return roundPrice(base * condMult * depreciation * county.price_index * featureBonus * noise);
}

/**
 * Generates a single second-hand item listing from the RNG at the given sequence position.
 * @param {Object} config
 * @param {import('../rng.js').Rng} rng
 * @param {number} sequenceNumber
 * @param {string|null} [snapshotDate]
 * @param {string|null} [listingStatus]
 * @returns {import('../schema/item.js').Item}
 */
export function buildItem(config, rng, sequenceNumber, snapshotDate, listingStatus) {
  const county = chooseCounty(config, rng);
  const municipality = rng.choice(county.municipalities);
  const [category, subcategory] = chooseCategory(config, rng);
  const condition = sampleCondition(config, category, rng);
  const age_years = sampleAge(subcategory, condition, category, rng);
  const { brand, model, position } = sampleProduct(subcategory.name, rng);
  const color = UNCOLOURED_CATEGORIES.has(category.name) ? null : rng.choices(COLOR_NAMES, COLOR_WEIGHTS, 1)[0];
  const material = MATERIALS[subcategory.name] ? rng.choice(MATERIALS[subcategory.name]) : null;
  const size = subcategory.size_scale ? rng.choice(SIZE_SCALES[subcategory.size_scale]) : null;
  const featureTags = sampleFeatureTags(category.name, condition, age_years, rng);
  const asking_price = sampleAskingPrice(config, county, category, subcategory, condition, age_years, position, featureTags, rng);

  const shipping_available = !subcategory.bulky && rng.random() < config.calibration.shipping_share;
  const shipping_cost = shipping_available
    ? rng.choice(subcategory.price_max <= 3000 ? SHIPPING_COSTS_SMALL : SHIPPING_COSTS_LARGE)
    : 0;
  const total_price = asking_price + shipping_cost;

  const location_cluster = `${municipality.toLowerCase()}_${rng.choice(LOCATION_CLUSTERS)}`;
  const coarse_geo_cell = `${county.name.slice(0, 3).toUpperCase()}-${municipality.slice(0, 3).toUpperCase()}-${rng.randint(10, 99)}`;
  const listing_id = `itm-${config.seed}-${String(sequenceNumber).padStart(6, '0')}`;
  const resolved_snapshot_date = snapshotDate || config.snapshot_date;
  const resolved_status = listingStatus || rng.choices(LISTING_STATUS_VALUES, LISTING_STATUS_WEIGHTS, 1)[0];
  const days_on_market = rng.randint(0, 90);
  const sale_type = rng.random() < config.calibration.bidding_share ? 'bidding' : 'fixed_price';
  const seller_type = rng.random() < config.calibration.shop_share ? 'shop' : 'private';
  if (LEGACY_GEO_MUNICIPALITIES.has(municipality)) { rng.random(); rng.random(); }

  const attrs = {
    listing_id,
    snapshot_date: resolved_snapshot_date,
    county: county.name,
    municipality,
    location_cluster,
    coarse_geo_cell,
    category: category.name,
    category_label: category.label,
    subcategory: subcategory.name,
    subcategory_label: subcategory.label,
    brand,
    model,
    condition: condition.name,
    condition_label: condition.label,
    sale_type,
    seller_type,
    age_years,
    color,
    material,
    size,
    shipping_available,
    shipping_cost,
    has_original_box: featureTags.includes('original_box'),
    has_receipt: featureTags.includes('receipt'),
    has_warranty: featureTags.includes('warranty_remaining'),
    asking_price,
    total_price,
    days_on_market,
    listing_status: resolved_status,
    feature_tags: featureTags,
  };

  const templateAttrs = { ...attrs, collectible: category.collectible };
  const title = buildTitle(templateAttrs);
  const text = buildText(templateAttrs, config.text_mode, rng);
  const description_synthetic = buildDescription(templateAttrs, config.text_mode, rng);
  const imageCount = rng.randint(1, config.max_images_per_listing);
  const image_stub_ids = Array.from({ length: imageCount }, (_, i) => `${listing_id}-img-${i + 1}`);

  return createItem({
    ...attrs,
    title,
    text,
    description_synthetic,
    image_stub_ids,
    ...derivedFields(listing_id, municipality),
  });
}

/**
 * Generates the full item snapshot from config using a seeded RNG.
 * @param {Object} config
 * @returns {import('../schema/item.js').Item[]}
 */
export function generateItems(config) {
  const rng = createRng(config.seed);
  return Array.from({ length: config.listing_count }, (_, i) => buildItem(config, rng, i + 1));
}

/**
 * Computes aggregate statistics over an item set.
 * @param {Object} config
 * @param {import('../schema/item.js').Item[]} items
 * @returns {Object}
 */
export function buildSummary(config, items) {
  const byCounty = {};
  const byCategory = {};
  const byCondition = {};
  let shippable = 0;
  for (const it of items) {
    byCounty[it.county] = (byCounty[it.county] || 0) + 1;
    byCategory[it.category] = (byCategory[it.category] || 0) + 1;
    byCondition[it.condition] = (byCondition[it.condition] || 0) + 1;
    if (it.shipping_available) shippable++;
  }
  const avg_total_price = Math.round((items.reduce((s, it) => s + it.total_price, 0) / items.length) * 100) / 100;
  return {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    config_hash: config.configHash(),
    snapshot_date: config.snapshot_date,
    listing_count: items.length,
    average_total_price: avg_total_price,
    shipping_share: Math.round((shippable / items.length) * 10000) / 10000,
    by_county: Object.fromEntries(Object.entries(byCounty).sort()),
    by_category: Object.fromEntries(Object.entries(byCategory).sort()),
    by_condition: Object.fromEntries(Object.entries(byCondition).sort()),
  };
}
