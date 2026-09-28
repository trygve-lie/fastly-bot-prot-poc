import { createRng } from '../rng.js';
import { createListing } from '../schema/listing.js';
import { buildTitle, buildText, buildDescription } from './text.js';

const URBAN_CLUSTERS = ['central_arc', 'transit_ring', 'waterfront_band', 'park_side'];
const SUBURBAN_CLUSTERS = ['family_grove', 'ridge_lane', 'harbor_edge', 'forest_loop'];
const LISTING_STATUS_VALUES = ['created', 'active', 'updated', 'relisted'];
const LISTING_STATUS_WEIGHTS = [0.08, 0.68, 0.19, 0.05];

// Approximate bounding boxes [lat_min, lat_max, lng_min, lng_max] per municipality
const MUNICIPALITY_BOUNDS = {
  Oslo:          [59.850, 59.970, 10.650, 10.850],
  Bergen:        [60.350, 60.450, 5.250,  5.400],
  Askoy:         [60.380, 60.480, 5.100,  5.250],
  Alver:         [60.500, 60.600, 5.300,  5.500],
  Trondheim:     [63.350, 63.450, 10.350, 10.550],
  Malvik:        [63.400, 63.500, 10.600, 10.800],
  Melhus:        [63.250, 63.350, 10.200, 10.400],
  Stavanger:     [58.950, 59.050, 5.650,  5.800],
  Sandnes:       [58.830, 58.930, 5.700,  5.850],
  Sola:          [58.850, 58.920, 5.600,  5.720],
  Kristiansand:  [58.120, 58.200, 7.950,  8.100],
  Lillesand:     [58.230, 58.300, 8.350,  8.500],
  Arendal:       [58.430, 58.500, 8.720,  8.850],
  Bodo:          [67.260, 67.320, 14.350, 14.550],
  Narvik:        [68.410, 68.470, 17.380, 17.550],
  Sortland:      [68.680, 68.740, 15.400, 15.550],
};

/**
 * Returns a [latitude, longitude] pair sampled within the bounding box for a municipality.
 * @param {string} municipality
 * @param {import('../rng.js').Rng} rng
 * @returns {[number|null, number|null]}
 */
function sampleGeoPosition(municipality, rng) {
  const bounds = MUNICIPALITY_BOUNDS[municipality];
  if (!bounds) return [null, null];
  const [latMin, latMax, lngMin, lngMax] = bounds;
  const lat = Math.round((latMin + rng.random() * (latMax - latMin)) * 1e6) / 1e6;
  const lng = Math.round((lngMin + rng.random() * (lngMax - lngMin)) * 1e6) / 1e6;
  return [lat, lng];
}

/**
 * Samples a county from the config weighted distribution.
 * @param {import('../config.js').Config} config
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} County config object.
 */
function chooseCounty(config, rng) {
  const names = config.counties.map(c => c.name);
  const weights = config.counties.map(c => c.weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.counties.find(c => c.name === selected);
}

/**
 * Samples a property type profile based on urban/suburban context.
 * @param {import('../config.js').Config} config
 * @param {boolean} urban
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} Property type profile.
 */
function choosePropertyProfile(config, urban, rng) {
  const profiles = config.calibration.property_types;
  const names = profiles.map(p => p.name);
  const weights = profiles.map(p => urban ? p.urban_weight : p.suburban_weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.calibration.propertyType(selected);
}

/**
 * Derives an ownership form from a property type.
 * @param {string} propertyType
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function ownershipForm(propertyType, rng) {
  if (propertyType === 'apartment') return rng.choices(['cooperative', 'condominium'], [0.42, 0.58], 1)[0];
  if (['detached', 'semi_detached', 'cabin'].includes(propertyType)) return 'freehold';
  return rng.choices(['freehold', 'condominium'], [0.7, 0.3], 1)[0];
}

/**
 * Samples a condition profile from the config weighted distribution.
 * @param {import('../config.js').Config} config
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} Condition config object.
 */
function sampleCondition(config, rng) {
  const names = config.calibration.conditions.map(c => c.name);
  const weights = config.calibration.conditions.map(c => c.weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.calibration.conditions.find(c => c.name === selected);
}

/**
 * Samples a floor area in m² from the profile's size range.
 * @param {Object} profile - Property type profile.
 * @param {import('../rng.js').Rng} rng
 * @param {boolean} urban
 * @returns {number}
 */
function sampleSizeM2(profile, rng, urban) {
  const lower = urban ? profile.size_min_urban : profile.size_min_suburban;
  const upper = urban ? profile.size_max_urban : profile.size_max_suburban;
  return Math.round(rng.uniform(lower, upper) * 10) / 10;
}

/**
 * Derives a bedroom count from floor area and property profile.
 * @param {number} sizeM2
 * @param {Object} profile
 * @param {import('../rng.js').Rng} rng
 * @returns {number}
 */
function sampleBedrooms(sizeM2, profile, rng) {
  const base = Math.max(0, Math.floor(sizeM2 / profile.bedroom_divisor) + profile.bedroom_offset);
  if (profile.name === 'apartment') return Math.min(base, 4);
  if (profile.name === 'cabin') return Math.min(Math.max(base, 1), 5);
  return Math.min(Math.max(base + rng.choice([0, 1]), 1), 6);
}

/**
 * Derives bathroom count from size and property type.
 * @param {number} sizeM2
 * @param {string} propertyType
 * @returns {number}
 */
function sampleBathrooms(sizeM2, propertyType) {
  if (['detached', 'semi_detached'].includes(propertyType) && sizeM2 > 140) return 2;
  if (propertyType === 'apartment' && sizeM2 < 40) return 1;
  return sizeM2 > 175 ? 2 : 1;
}

/**
 * Samples floor and total_floors values for apartment/townhouse types.
 * @param {string} propertyType
 * @param {import('../rng.js').Rng} rng
 * @returns {[number|null, number|null]}
 */
function sampleFloors(propertyType, rng) {
  if (propertyType === 'apartment') {
    const total = rng.randint(3, 8);
    return [rng.randint(1, total), total];
  }
  if (propertyType === 'townhouse') {
    const total = rng.randint(2, 4);
    return [rng.randint(1, total), total];
  }
  return [null, null];
}

/**
 * Samples a plot area in m² based on property type.
 * @param {string} propertyType
 * @param {number} sizeM2
 * @param {import('../rng.js').Rng} rng
 * @returns {number|null}
 */
function samplePlotM2(propertyType, sizeM2, rng) {
  if (propertyType === 'apartment') return rng.random() < 0.85 ? null : Math.round(rng.uniform(6, 24) * 10) / 10;
  if (propertyType === 'townhouse') return Math.round(sizeM2 * rng.uniform(0.3, 0.8) * 10) / 10;
  if (propertyType === 'semi_detached') return Math.round(sizeM2 * rng.uniform(0.6, 1.8) * 10) / 10;
  if (propertyType === 'detached') return Math.round(sizeM2 * rng.uniform(1.2, 4.2) * 10) / 10;
  return Math.round(sizeM2 * rng.uniform(3.0, 10.0) * 10) / 10;
}

/**
 * Derives an energy rating letter from build year.
 * @param {number} buildYear
 * @returns {string}
 */
function energyRating(buildYear) {
  if (buildYear >= 2020) return 'A';
  if (buildYear >= 2012) return 'B';
  if (buildYear >= 2000) return 'C';
  if (buildYear >= 1985) return 'D';
  if (buildYear >= 1970) return 'E';
  if (buildYear >= 1950) return 'F';
  return 'G';
}

/**
 * Derives monthly common costs based on ownership form and size.
 * @param {string} propertyType
 * @param {string} ownershipFrm
 * @param {number} sizeM2
 * @param {import('../rng.js').Rng} rng
 * @returns {number}
 */
function commonCosts(propertyType, ownershipFrm, sizeM2, rng) {
  if (propertyType !== 'apartment' && ownershipFrm === 'freehold') return 0;
  if (['detached', 'semi_detached', 'cabin'].includes(propertyType)) return 0;
  const base = ownershipFrm === 'condominium' ? 1400 : 2200;
  return Math.floor(base + sizeM2 * rng.uniform(14, 22));
}

/**
 * Derives amenity tags from property type, urban flag, floor, and common costs.
 * @param {string} propertyType
 * @param {boolean} urban
 * @param {number|null} floor
 * @param {number} commonCostsMonthly
 * @param {import('../rng.js').Rng} rng
 * @returns {string[]}
 */
function amenities(propertyType, urban, floor, commonCostsMonthly, rng) {
  const tags = [];
  if (['apartment', 'townhouse'].includes(propertyType)) tags.push('balcony');
  if (['detached', 'semi_detached', 'townhouse', 'cabin'].includes(propertyType)) tags.push('garden_access');
  if (propertyType === 'apartment' && floor && floor >= 4) tags.push('city_view');
  tags.push(urban ? 'transit_access' : 'storage_space');
  if (commonCostsMonthly > 0) tags.push('shared_maintenance');
  if (rng.random() < 0.35) tags.push('parking');
  return [...new Set(tags)];
}

/**
 * Samples asking and total price from county anchor, profile multiplier, and noise.
 * @param {import('../config.js').Config} config
 * @param {Object} county
 * @param {Object} profile
 * @param {number} sizeM2
 * @param {number} buildYear
 * @param {string[]} amenityTags
 * @param {import('../rng.js').Rng} rng
 * @returns {[number, number]} [asking_price, total_price]
 */
function pricing(config, county, profile, sizeM2, buildYear, amenityTags, rng) {
  const year_multiplier = 1.0 + Math.max(0, buildYear - 1995) * 0.003;
  const amenity_bonus = 1.0 + config.calibration.amenity_bonus_per_tag * amenityTags.length;
  const noise = rng.uniform(config.calibration.price_noise_min, config.calibration.price_noise_max);
  let asking = Math.floor(sizeM2 * county.price_per_m2 * profile.price_multiplier * year_multiplier * amenity_bonus * noise);
  asking = Math.max(900_000, asking);
  const total = asking + Math.floor(asking * rng.uniform(0.018, 0.058));
  return [asking, total];
}

/**
 * Generates a single listing from the RNG at the given sequence position.
 * @param {import('../config.js').Config} config
 * @param {import('../rng.js').Rng} rng
 * @param {number} sequenceNumber
 * @param {string|null} [snapshotDate]
 * @param {string|null} [listingStatus]
 * @returns {import('../schema/listing.js').Listing}
 */
export function buildListing(config, rng, sequenceNumber, snapshotDate, listingStatus) {
  const county = chooseCounty(config, rng);
  const municipality = rng.choice(county.municipalities);
  const urban = rng.random() <= county.urban_share;
  const profile = choosePropertyProfile(config, urban, rng);
  const propertyType = profile.name;
  const ownershipFrm = ownershipForm(propertyType, rng);
  const condition = sampleCondition(config, rng);
  const sizeM2 = sampleSizeM2(profile, rng, urban);
  const bedrooms = sampleBedrooms(sizeM2, profile, rng);
  const bathrooms = sampleBathrooms(sizeM2, propertyType);
  const [floor, totalFloors] = sampleFloors(propertyType, rng);
  const plotM2 = samplePlotM2(propertyType, sizeM2, rng);
  const buildYear = rng.randint(condition.build_year_min, condition.build_year_max);
  const energy_rating = energyRating(buildYear);
  const common_costs_monthly = commonCosts(propertyType, ownershipFrm, sizeM2, rng);
  const amenity_tags = amenities(propertyType, urban, floor, common_costs_monthly, rng);
  const [asking_price, total_price] = pricing(config, county, profile, sizeM2, buildYear, amenity_tags, rng);

  const clusterPool = urban ? URBAN_CLUSTERS : SUBURBAN_CLUSTERS;
  const neighborhood_cluster = `${municipality.toLowerCase()}_${rng.choice(clusterPool)}`;
  const coarse_geo_cell = `${county.name.slice(0, 3).toUpperCase()}-${municipality.slice(0, 3).toUpperCase()}-${rng.randint(10, 99)}`;
  const listing_id = `lst-${config.seed}-${String(sequenceNumber).padStart(6, '0')}`;
  const resolved_snapshot_date = snapshotDate || config.snapshot_date;
  const resolved_status = listingStatus || rng.choices(LISTING_STATUS_VALUES, LISTING_STATUS_WEIGHTS, 1)[0];
  const days_on_market = rng.randint(0, 180);
  const has_balcony = amenity_tags.includes('balcony');
  const has_terrace = ['townhouse', 'detached', 'semi_detached', 'cabin'].includes(propertyType) && rng.random() < 0.52;
  const has_parking = amenity_tags.includes('parking') || ['detached', 'semi_detached', 'cabin'].includes(propertyType);
  const has_elevator = propertyType === 'apartment' && (floor || 0) >= 3;
  const has_garden = amenity_tags.includes('garden_access');
  const has_view = amenity_tags.includes('city_view') || rng.random() < 0.18;

  const partialAttrs = {
    listing_id,
    county: county.name,
    municipality,
    neighborhood_cluster,
    coarse_geo_cell,
    property_type: propertyType,
    ownership_form: ownershipFrm,
    plot_m2: plotM2,
    size_m2: sizeM2,
    bedrooms,
    bathrooms,
    condition: condition.name,
    build_year: buildYear,
    energy_rating,
    asking_price,
    total_price,
    common_costs_monthly,
    days_on_market,
    listing_status: resolved_status,
    floor,
    total_floors: totalFloors,
    has_balcony,
    has_terrace,
    has_parking,
    has_elevator,
    has_garden,
    has_view,
    amenity_tags,
    snapshot_date: resolved_snapshot_date,
  };

  const [latitude, longitude] = sampleGeoPosition(municipality, rng);
  const title_label = buildTitle(partialAttrs);
  const text_synthetic = buildText(partialAttrs, config.text_mode, rng);
  const description_synthetic = buildDescription(partialAttrs, config.text_mode, rng);
  const imageCount = rng.randint(1, config.max_images_per_listing);
  const image_stub_ids = Array.from({ length: imageCount }, (_, i) => `${listing_id}-img-${i + 1}`);
  const sale_type = condition.name === 'new' && rng.random() < config.calibration.new_home_probability ? 'new_home' : 'sale';
  const seller_type = rng.random() < config.calibration.broker_share ? 'broker' : 'owner';

  return createListing({
    listing_id,
    snapshot_date: resolved_snapshot_date,
    county: county.name,
    municipality,
    neighborhood_cluster,
    coarse_geo_cell,
    property_type: propertyType,
    ownership_form: ownershipFrm,
    sale_type,
    seller_type,
    bedrooms,
    bathrooms,
    floor,
    total_floors: totalFloors,
    size_m2: sizeM2,
    plot_m2: plotM2,
    build_year: buildYear,
    condition: condition.name,
    energy_rating,
    has_balcony,
    has_terrace,
    has_parking,
    has_elevator,
    has_garden,
    has_view,
    asking_price,
    total_price,
    common_costs_monthly,
    price_per_m2: null,
    days_on_market,
    listing_status: resolved_status,
    title: title_label,
    text: text_synthetic,
    description_synthetic,
    amenity_tags,
    image_stub_ids,
    latitude,
    longitude,
  });
}

/**
 * Generates the full listing snapshot from config using a seeded RNG.
 * @param {import('../config.js').Config} config
 * @returns {import('../schema/listing.js').Listing[]}
 */
export function generateListings(config) {
  const rng = createRng(config.seed);
  return Array.from({ length: config.listing_count }, (_, i) => buildListing(config, rng, i + 1));
}

/**
 * Computes aggregate statistics over a listing set.
 * @param {import('../config.js').Config} config
 * @param {import('../schema/listing.js').Listing[]} listings
 * @returns {Object} Summary with counts by county and property type, average price and size.
 */
export function buildSummary(config, listings) {
  const byCounty = {};
  const byPropertyType = {};
  for (const l of listings) {
    byCounty[l.county] = (byCounty[l.county] || 0) + 1;
    byPropertyType[l.property_type] = (byPropertyType[l.property_type] || 0) + 1;
  }
  const avg_total_price = Math.round((listings.reduce((s, l) => s + l.total_price, 0) / listings.length) * 100) / 100;
  const avg_size_m2 = Math.round((listings.reduce((s, l) => s + l.size_m2, 0) / listings.length) * 100) / 100;
  return {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    config_hash: config.configHash(),
    snapshot_date: config.snapshot_date,
    listing_count: listings.length,
    average_total_price: avg_total_price,
    average_size_m2: avg_size_m2,
    by_county: Object.fromEntries(Object.entries(byCounty).sort()),
    by_property_type: Object.fromEntries(Object.entries(byPropertyType).sort()),
  };
}
