import { createRng } from '../rng.js';
import { createVehicle } from '../schema/vehicle.js';
import { buildTitle, buildDescription, MAKES_AND_MODELS } from './text.js';
import { buildPrivacyReport } from '../privacy/checks.js';

const MAKE_NAMES = Object.keys(MAKES_AND_MODELS);
const MAKE_WEIGHTS_MAP = {
  Toyota: 0.13, Volkswagen: 0.12, BMW: 0.09, Mercedes: 0.08,
  Volvo: 0.08, Tesla: 0.07, Audi: 0.07, Nissan: 0.07,
  Hyundai: 0.07, Kia: 0.06, Ford: 0.06, Skoda: 0.05,
  Peugeot: 0.03, Renault: 0.02,
};
const MAKE_WEIGHT_VALUES = MAKE_NAMES.map(m => MAKE_WEIGHTS_MAP[m] || 0.01);

const COLOR_NAMES = ['white', 'black', 'silver', 'grey', 'blue', 'red', 'green', 'other'];
const COLOR_WEIGHTS = [0.22, 0.18, 0.16, 0.14, 0.12, 0.08, 0.05, 0.05];

const LISTING_STATUS_VALUES = ['created', 'active', 'updated', 'relisted'];
const LISTING_STATUS_WEIGHTS = [0.08, 0.68, 0.19, 0.05];

const ALL_FEATURES = ['sunroof', 'tow_hitch', 'winter_wheels', 'leather_seats', 'heated_seats', 'navigation', 'cruise_control', 'apple_carplay', 'parking_sensors', 'blind_spot_warning', 'lane_assist', 'rear_camera'];

const MUNICIPALITY_BOUNDS = {
  Oslo:         [59.850, 59.970, 10.650, 10.850],
  Bergen:       [60.350, 60.450, 5.250,  5.400],
  Askoy:        [60.380, 60.480, 5.100,  5.250],
  Alver:        [60.500, 60.600, 5.300,  5.500],
  Trondheim:    [63.350, 63.450, 10.350, 10.550],
  Malvik:       [63.400, 63.500, 10.600, 10.800],
  Melhus:       [63.250, 63.350, 10.200, 10.400],
  Stavanger:    [58.950, 59.050, 5.650,  5.800],
  Sandnes:      [58.830, 58.930, 5.700,  5.850],
  Sola:         [58.850, 58.920, 5.600,  5.720],
  Kristiansand: [58.120, 58.200, 7.950,  8.100],
  Lillesand:    [58.230, 58.300, 8.350,  8.500],
  Arendal:      [58.430, 58.500, 8.720,  8.850],
  Bodo:         [67.260, 67.320, 14.350, 14.550],
  Narvik:       [68.410, 68.470, 17.380, 17.550],
  Sortland:     [68.680, 68.740, 15.400, 15.550],
};

/**
 * Returns a random [lat, lng] pair within a municipality's bounding box, or [null, null].
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
 * Selects a vehicle type profile by weighted sampling from calibration config.
 * @param {Object} config
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} Vehicle type profile.
 */
function chooseVehicleProfile(config, rng) {
  const profiles = config.calibration.vehicle_types;
  const names = profiles.map(p => p.name);
  const weights = profiles.map(p => p.weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.calibration.vehicleType(selected);
}

/**
 * Selects a condition record by weighted sampling from calibration config.
 * @param {Object} config
 * @param {import('../rng.js').Rng} rng
 * @returns {Object} Condition record with name and model_year range.
 */
function sampleCondition(config, rng) {
  const names = config.calibration.conditions.map(c => c.name);
  const weights = config.calibration.conditions.map(c => c.weight);
  const selected = rng.choices(names, weights, 1)[0];
  return config.calibration.conditions.find(c => c.name === selected);
}

/**
 * Samples a mileage value appropriate for the condition and profile's mileage cap.
 * @param {Object} condition
 * @param {Object} profile
 * @param {import('../rng.js').Rng} rng
 * @returns {number}
 */
function sampleMileage(condition, profile, rng) {
  const conditionMileage = {
    new:       [0,      500],
    excellent: [0,      80000],
    good:      [20000,  180000],
    fair:      [80000,  300000],
    poor:      [150000, 350000],
  };
  const [low, high] = conditionMileage[condition.name] || [0, 200000];
  const capped = Math.min(high, profile.mileage_max);
  return Math.round(rng.uniform(low, capped) / 100) * 100;
}

/**
 * Samples a fuel type based on make, vehicle type, model year, and probability thresholds.
 * @param {string} make
 * @param {string} vehicleType
 * @param {number} modelYear
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function sampleFuelType(make, vehicleType, modelYear, rng) {
  if (make === 'Tesla') return 'electric';
  const r = rng.random();
  if (modelYear >= 2020 && r < 0.35) return 'electric';
  const r2 = rng.random();
  if (modelYear >= 2015 && r2 < 0.20) return 'hybrid';
  const r3 = rng.random();
  const dieselChance = (vehicleType === 'estate' || vehicleType === 'van') ? 0.40 : vehicleType === 'suv' ? 0.25 : 0.15;
  if (r3 < dieselChance) return 'diesel';
  return 'petrol';
}

/**
 * Returns a battery range in km for EV/hybrid, or null for petrol/diesel.
 * @param {string} fuelType
 * @param {import('../rng.js').Rng} rng
 * @returns {number|null}
 */
function sampleBatteryRange(fuelType, rng) {
  if (fuelType === 'electric') return Math.round(rng.uniform(150, 600) / 10) * 10;
  if (fuelType === 'hybrid') return Math.round(rng.uniform(40, 80));
  return null;
}

/**
 * Samples the seat count based on vehicle type and the profile's typical seat count.
 * @param {string} vehicleType
 * @param {Object} profile
 * @param {import('../rng.js').Rng} rng
 * @returns {number}
 */
function sampleSeats(vehicleType, profile, rng) {
  if (vehicleType === 'coupe') return 4;
  if (vehicleType === 'van') return rng.choice([7, 8]);
  const base = profile.seats_typical;
  return Math.max(2, Math.min(9, base + rng.choice([-1, 0, 0, 1])));
}

/**
 * Samples the number of doors based on vehicle type conventions.
 * @param {string} vehicleType
 * @param {import('../rng.js').Rng} rng
 * @returns {number}
 */
function sampleDoors(vehicleType, rng) {
  if (vehicleType === 'coupe') return rng.choice([2, 4]);
  if (vehicleType === 'hatchback') return rng.choice([3, 5]);
  if (vehicleType === 'sedan') return 4;
  return 5;
}

/**
 * Returns 'automatic' for EVs; otherwise samples automatic/manual by probability.
 * @param {string} fuelType
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function sampleTransmission(fuelType, rng) {
  if (fuelType === 'electric') return 'automatic';
  return rng.random() < 0.65 ? 'automatic' : 'manual';
}

/**
 * Samples the drive type (fwd/rwd/awd) based on fuel type and vehicle type heuristics.
 * @param {string} fuelType
 * @param {string} vehicleType
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function sampleDriveType(fuelType, vehicleType, rng) {
  if (fuelType === 'electric' || vehicleType === 'suv' || vehicleType === 'van') {
    return rng.random() < 0.40 ? 'awd' : 'fwd';
  }
  if (vehicleType === 'coupe') {
    return rng.random() < 0.30 ? 'rwd' : (rng.random() < 0.5 ? 'awd' : 'fwd');
  }
  return rng.random() < 0.15 ? 'awd' : 'fwd';
}

/**
 * Generates a feature tag list based on vehicle type, fuel type, and probabilistic sampling.
 * @param {string} vehicleType
 * @param {string} fuelType
 * @param {string} condition
 * @param {import('../rng.js').Rng} rng
 * @returns {string[]}
 */
function sampleFeatureTags(vehicleType, fuelType, condition, rng) {
  const tags = [];
  if (['sedan', 'suv', 'estate', 'coupe'].includes(vehicleType) && rng.random() < 0.45) tags.push('sunroof');
  if (['estate', 'van', 'suv'].includes(vehicleType) && rng.random() < 0.52) tags.push('tow_hitch');
  if (rng.random() < 0.68) tags.push('winter_wheels');
  if (['sedan', 'suv', 'estate', 'coupe'].includes(vehicleType) && rng.random() < 0.38) tags.push('leather_seats');
  if (rng.random() < 0.72) tags.push('heated_seats');
  if (rng.random() < 0.75) tags.push('navigation');
  if (rng.random() < 0.62) tags.push('cruise_control');
  if (rng.random() < 0.58) tags.push('apple_carplay');
  if (rng.random() < 0.65) tags.push('parking_sensors');
  if (rng.random() < 0.35) tags.push('blind_spot_warning');
  if (rng.random() < 0.42) tags.push('lane_assist');
  if (rng.random() < 0.60) tags.push('rear_camera');
  return [...new Set(tags)];
}

const CONDITION_PRICE_MULTIPLIER = {
  new: 3.5,
  excellent: 1.5,
  good: 1.0,
  fair: 0.55,
  poor: 0.25,
};

/**
 * Computes asking and total price using county anchor, condition multiplier, mileage discount, and noise.
 * @param {Object} config
 * @param {Object} county
 * @param {Object} profile
 * @param {string} conditionName
 * @param {number} mileageKm
 * @param {string[]} featureTags
 * @param {import('../rng.js').Rng} rng
 * @returns {[number, number]} [asking_price, total_price]
 */
function samplePricing(config, county, profile, conditionName, mileageKm, featureTags, rng) {
  const condMult = CONDITION_PRICE_MULTIPLIER[conditionName] || 1.0;
  const featureBonus = 1.0 + config.calibration.feature_bonus_per_tag * featureTags.length;
  const mileageAbove50k = Math.max(0, mileageKm - 50000);
  const mileageBrackets = mileageAbove50k / 10000;
  const mileageDiscount = Math.pow(0.992, mileageBrackets);
  const noise = rng.uniform(config.calibration.price_noise_min, config.calibration.price_noise_max);
  let asking = Math.floor(county.price_anchor * profile.price_multiplier * condMult * mileageDiscount * featureBonus * noise);
  asking = Math.max(25000, asking);
  const total = asking + Math.floor(asking * rng.uniform(0.0, 0.02));
  return [asking, total];
}

const LOCATION_CLUSTERS = ['city_centre', 'ring_road', 'suburban_loop', 'harbour_side', 'valley_edge'];

/**
 * Generates a single vehicle listing from the RNG at the given sequence position.
 * @param {Object} config
 * @param {import('../rng.js').Rng} rng
 * @param {number} sequenceNumber
 * @param {string|null} [snapshotDate]
 * @param {string|null} [listingStatus]
 * @returns {import('../schema/vehicle.js').Vehicle}
 */
export function buildVehicle(config, rng, sequenceNumber, snapshotDate, listingStatus) {
  const county = chooseCounty(config, rng);
  const municipality = rng.choice(county.municipalities);
  const profile = chooseVehicleProfile(config, rng);
  const vehicleType = profile.name;
  const condition = sampleCondition(config, rng);
  const modelYear = rng.randint(condition.model_year_min, condition.model_year_max);
  const mileageKm = sampleMileage(condition, profile, rng);
  const make = rng.choices(MAKE_NAMES, MAKE_WEIGHT_VALUES, 1)[0];
  const model = rng.choice(MAKES_AND_MODELS[make]);
  const fuelType = sampleFuelType(make, vehicleType, modelYear, rng);
  const engineKw = rng.randint(profile.engine_kw_min, profile.engine_kw_max);
  const batteryRangeKm = sampleBatteryRange(fuelType, rng);
  const seats = sampleSeats(vehicleType, profile, rng);
  const doors = sampleDoors(vehicleType, rng);
  const transmission = sampleTransmission(fuelType, rng);
  const driveType = sampleDriveType(fuelType, vehicleType, rng);
  const color = rng.choices(COLOR_NAMES, COLOR_WEIGHTS, 1)[0];
  const featureTags = sampleFeatureTags(vehicleType, fuelType, condition.name, rng);
  const [asking_price, total_price] = samplePricing(config, county, profile, condition.name, mileageKm, featureTags, rng);

  const location_cluster = `${municipality.toLowerCase()}_${rng.choice(LOCATION_CLUSTERS)}`;
  const coarse_geo_cell = `${county.name.slice(0, 3).toUpperCase()}-${municipality.slice(0, 3).toUpperCase()}-${rng.randint(10, 99)}`;
  const listing_id = `veh-${config.seed}-${String(sequenceNumber).padStart(6, '0')}`;
  const resolved_snapshot_date = snapshotDate || config.snapshot_date;
  const resolved_status = listingStatus || rng.choices(LISTING_STATUS_VALUES, LISTING_STATUS_WEIGHTS, 1)[0];
  const days_on_market = rng.randint(0, 180);
  const sale_type = condition.name === 'new' && rng.random() < config.calibration.new_vehicle_probability ? 'new' : 'sale';
  const seller_type = rng.random() < config.calibration.dealer_share ? 'dealer' : 'private';

  const has_sunroof = featureTags.includes('sunroof');
  const has_tow_hitch = featureTags.includes('tow_hitch');
  const has_winter_wheels = featureTags.includes('winter_wheels');
  const has_leather_seats = featureTags.includes('leather_seats');
  const has_heated_seats = featureTags.includes('heated_seats');
  const has_navigation = featureTags.includes('navigation');

  const [latitude, longitude] = sampleGeoPosition(municipality, rng);

  const partialAttrs = {
    listing_id,
    county: county.name,
    municipality,
    location_cluster,
    coarse_geo_cell,
    vehicle_type: vehicleType,
    make,
    model,
    transmission,
    sale_type,
    seller_type,
    seats,
    doors,
    engine_kw: engineKw,
    mileage_km: mileageKm,
    model_year: modelYear,
    condition: condition.name,
    fuel_type: fuelType,
    drive_type: driveType,
    color,
    has_sunroof,
    has_tow_hitch,
    has_winter_wheels,
    has_leather_seats,
    has_heated_seats,
    has_navigation,
    asking_price,
    total_price,
    battery_range_km: batteryRangeKm,
    days_on_market,
    listing_status: resolved_status,
    feature_tags: featureTags,
    snapshot_date: resolved_snapshot_date,
  };

  const title_synthetic = buildTitle(partialAttrs, config.text_mode, rng);
  const description_synthetic = buildDescription(partialAttrs, config.text_mode, rng);
  const imageCount = rng.randint(1, config.max_images_per_listing);
  const image_stub_ids = Array.from({ length: imageCount }, (_, i) => `${listing_id}-img-${i + 1}`);

  return createVehicle({
    listing_id,
    snapshot_date: resolved_snapshot_date,
    county: county.name,
    municipality,
    location_cluster,
    coarse_geo_cell,
    vehicle_type: vehicleType,
    make,
    model,
    transmission,
    sale_type,
    seller_type,
    seats,
    doors,
    engine_kw: engineKw,
    mileage_km: mileageKm,
    model_year: modelYear,
    condition: condition.name,
    fuel_type: fuelType,
    drive_type: driveType,
    color,
    has_sunroof,
    has_tow_hitch,
    has_winter_wheels,
    has_leather_seats,
    has_heated_seats,
    has_navigation,
    asking_price,
    total_price,
    price_per_year: null,
    battery_range_km: batteryRangeKm,
    days_on_market,
    listing_status: resolved_status,
    title_synthetic,
    description_synthetic,
    feature_tags: featureTags,
    image_stub_ids,
    latitude,
    longitude,
  });
}

/**
 * Generates the full vehicle snapshot from config using a seeded RNG.
 * @param {Object} config
 * @returns {import('../schema/vehicle.js').Vehicle[]}
 */
export function generateVehicles(config) {
  const rng = createRng(config.seed);
  return Array.from({ length: config.listing_count }, (_, i) => buildVehicle(config, rng, i + 1));
}

/**
 * Computes aggregate statistics over a vehicle set.
 * @param {Object} config
 * @param {import('../schema/vehicle.js').Vehicle[]} vehicles
 * @returns {Object}
 */
export function buildSummary(config, vehicles) {
  const byCounty = {};
  const byVehicleType = {};
  let totalMileage = 0;
  for (const v of vehicles) {
    byCounty[v.county] = (byCounty[v.county] || 0) + 1;
    byVehicleType[v.vehicle_type] = (byVehicleType[v.vehicle_type] || 0) + 1;
    totalMileage += v.mileage_km;
  }
  const avg_total_price = Math.round((vehicles.reduce((s, v) => s + v.total_price, 0) / vehicles.length) * 100) / 100;
  const avg_mileage_km = Math.round((totalMileage / vehicles.length) * 100) / 100;
  return {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    config_hash: config.configHash(),
    snapshot_date: config.snapshot_date,
    listing_count: vehicles.length,
    average_total_price: avg_total_price,
    average_mileage_km: avg_mileage_km,
    by_county: Object.fromEntries(Object.entries(byCounty).sort()),
    by_vehicle_type: Object.fromEntries(Object.entries(byVehicleType).sort()),
  };
}
