import { createHash } from 'node:crypto';

const MAKES_AND_MODELS = {
  Toyota:     ['Corolla', 'Yaris', 'RAV4', 'C-HR', 'Land Cruiser', 'Camry', 'Hilux'],
  Volkswagen: ['Golf', 'Polo', 'Tiguan', 'Passat', 'T-Roc', 'ID.4', 'Caddy'],
  BMW:        ['1 Series', '3 Series', '5 Series', 'X3', 'X5', 'M3', '2 Series'],
  Mercedes:   ['A-Class', 'C-Class', 'E-Class', 'GLC', 'GLE', 'Sprinter', 'CLA'],
  Volvo:      ['V60', 'V90', 'XC40', 'XC60', 'XC90', 'S60', 'S90'],
  Tesla:      ['Model 3', 'Model Y', 'Model S', 'Model X'],
  Audi:       ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7', 'TT'],
  Nissan:     ['Leaf', 'Qashqai', 'X-Trail', 'Micra', 'Ariya'],
  Hyundai:    ['i20', 'i30', 'Tucson', 'Kona', 'Ioniq 5', 'Santa Fe'],
  Kia:        ['Rio', 'Ceed', 'Sportage', 'EV6', 'Sorento', 'Niro'],
  Ford:       ['Fiesta', 'Focus', 'Kuga', 'Puma', 'Mustang Mach-E'],
  Skoda:      ['Fabia', 'Octavia', 'Superb', 'Karoq', 'Kodiaq'],
  Peugeot:    ['208', '308', '2008', '3008', '508'],
  Renault:    ['Clio', 'Megane', 'Captur', 'Austral', 'Zoe'],
};

export { MAKES_AND_MODELS };

const TITLE_TEMPLATES = [
  '{model_year} {make} {model} - {vehicle_type} with {feature_pair}, {mileage_label} and {price_band}',
  '{title_prefix} {make} {model} {vehicle_type} in {region} with {transmission} and {mileage_label}',
  '{fuel_type} {vehicle_type} - {make} {model} ({model_year}) with {feature_pair} and {engine_label}',
  '{make} {model} {vehicle_type} for {buyer_fit} in {region}, {model_year}, {mileage_label}',
  '{model_year} {make} {model} - {condition} {vehicle_type}, {engine_label} and {price_band}',
  '{title_prefix} {fuel_type} {vehicle_type} - {make} {model} with {feature_pair} and {transmission}',
  '{make} {model} ({model_year}) in {region} with {feature_pair}, {mileage_label} and {transmission}',
  '{model_year} {vehicle_type} - {make} {model}, {fuel_type}, {engine_label} and {price_band}',
  '{make} {model} for {buyer_fit} - {condition} {vehicle_type}, {model_year} with {feature_pair}',
  '{title_prefix} {make} {model} {vehicle_type} with {feature_pair}, {mileage_label} and {engine_label}',
];

const INTRO_TEMPLATES = [
  'This privacy-safe synthetic listing presents a {condition} {make} {model} in {municipality}, positioned in the {location_cluster} cluster.',
  'Designed as a synthetic search document, this {vehicle_type} represents a {condition} {make} {model} in {municipality}.',
  'Synthetic vehicle profile: a {condition} {make} {model} {vehicle_type} located in {municipality} and mapped to the {location_cluster} cluster.',
  'For offline relevance work, this listing models a {condition} {make} {model} in {municipality}.',
  'This synthetic vehicle record captures a {condition} {vehicle_type} scenario in {municipality}.',
];

const SPECS_TEMPLATES = [
  'The vehicle provides {engine_kw} kW of output, seats {seats} passengers, has {doors} doors, and carries {mileage_km} km on the odometer.',
  'Key specifications include {engine_kw} kW engine output, {seats} seats, {doors} doors, and {mileage_km} km mileage.',
  'Searchable specs: {engine_kw} kW, {seats} seats, {doors} doors, and {mileage_km} km recorded mileage.',
  'The powertrain profile lists {engine_kw} kW, alongside {seats} passenger capacity, {doors} doors, and {mileage_km} km odometer reading.',
];

const PRICE_TEMPLATES = [
  'The synthetic pricing profile uses an asking price of {asking_price_text} and a total price of {total_price_text}.',
  'For ranking and filter evaluation, the vehicle is priced at {asking_price_text} asking and {total_price_text} total.',
  'Pricing signals include {asking_price_text} asking and {total_price_text} total.',
  'The listing carries {asking_price_text} asking and {total_price_text} total.',
];

const FEATURE_TEMPLATES = [
  'Feature coverage includes {feature_sentence}.',
  'The synthetic feature set highlights {feature_sentence}.',
  'For browse and recommendation experiments, the vehicle signals {feature_sentence}.',
  'Equipped features in this synthetic record include {feature_sentence}.',
];

const FUEL_TEMPLATES = [
  'The fuel type is {fuel_type}, and the drivetrain is {drive_type}.',
  'Powertrain configuration: {fuel_type} fuel with {drive_type} drive.',
  'This record models a {fuel_type} vehicle with {drive_type} drivetrain.',
  'For filter experiments, the fuel profile is {fuel_type} with {drive_type} drive.',
];

const BATTERY_TEMPLATES = [
  'Range information: {battery_sentence}.',
  'The battery and range profile states {battery_sentence}.',
  'For electric and hybrid experiments, {battery_sentence}.',
  'Range in the synthetic model: {battery_sentence}.',
];

const MARKET_TEMPLATES = [
  'In the timeline model, the listing is marked as {listing_status} after {days_on_market} synthetic days on market.',
  'Freshness-sensitive experiments can use the {listing_status} state and {days_on_market}-day market age.',
  'The search record also carries {days_on_market} days on market and a {listing_status} lifecycle label.',
  'For churn and reranking evaluation, the vehicle sits in {listing_status} status with {days_on_market} days on market.',
];

const LOCATION_TEMPLATES = [
  'Geography is intentionally coarse and synthetic: county {county}, municipality {municipality}, coarse cell {coarse_geo_cell}.',
  'No exact address is stored; the listing uses county {county}, municipality {municipality}, and coarse geo cell {coarse_geo_cell}.',
  'The geographic representation is limited to {county}, {municipality}, and coarse cell {coarse_geo_cell}.',
  'Location remains privacy-safe: county {county}, municipality {municipality}, geo cell {coarse_geo_cell}.',
];

const TITLE_PREFIXES = [
  'well-maintained', 'low-mileage', 'one-owner', 'recently-serviced', 'clean',
  'practical', 'reliable', 'fuel-efficient', 'fully-equipped', 'carefully-driven',
  'versatile', 'spacious',
];

const TITLE_BUYER_FITS = [
  'daily commuting', 'family use', 'long-distance travel', 'city driving',
  'weekend touring', 'eco-conscious driving', 'towing needs', 'sport driving',
];

const TITLE_FALLBACK_FEATURES = [
  'good fuel economy', 'comfortable cabin', 'reliable powertrain',
  'practical storage', 'modern safety systems', 'efficient daily use',
];

/**
 * Returns a deterministic array index derived from a SHA-256 hash of the key.
 * @param {string} key @param {number} size @returns {number}
 */
function stableIndex(key, size) {
  const digest = createHash('sha256').update(key, 'utf-8').digest('hex');
  return parseInt(digest.slice(0, 8), 16) % size;
}

/**
 * Picks one option deterministically or stochastically.
 * @param {string[]} options @param {string} mode @param {string} key @param {import('../rng.js').Rng} rng @returns {string}
 */
function pick(options, mode, key, rng) {
  if (mode === 'deterministic') return options[stableIndex(key, options.length)];
  return rng.choice(options);
}

/**
 * Picks count options without replacement, deterministically or stochastically.
 * @param {string[]} options @param {string} mode @param {string} key @param {import('../rng.js').Rng} rng @param {number} count @returns {string[]}
 */
function pickMany(options, mode, key, rng, count) {
  if (count <= 0) return [];
  if (mode === 'deterministic') {
    const ranked = [...options].sort((a, b) => {
      const ha = createHash('sha256').update(`${key}:${a}`, 'utf-8').digest('hex');
      const hb = createHash('sha256').update(`${key}:${b}`, 'utf-8').digest('hex');
      return ha < hb ? -1 : ha > hb ? 1 : 0;
    });
    return ranked.slice(0, count);
  }
  return rng.sample([...options], Math.min(count, options.length));
}

/**
 * Interpolates {placeholder} variables in a template string.
 * @param {string} template @param {Object.<string, *>} vars @returns {string}
 */
/**
 * Replaces `{key}` placeholders in a template string with values from the vars object.
 * @param {string} template
 * @param {Object.<string, *>} vars
 * @returns {string}
 */
function formatTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

/**
 * Returns a short NOK price label in thousands (e.g. "NOK 350k total").
 * @param {number} totalPrice
 * @returns {string}
 */
function priceBand(totalPrice) {
  return `NOK ${(totalPrice / 1000).toFixed(0)}k total`;
}

/**
 * Classifies mileage into a human-readable label (low / moderate / high).
 * @param {number} km
 * @returns {string}
 */
function mileageLabel(km) {
  if (km <= 50000) return `low mileage (${km.toLocaleString()} km)`;
  if (km <= 150000) return `moderate mileage (${km.toLocaleString()} km)`;
  return `high mileage (${km.toLocaleString()} km)`;
}

/**
 * Returns a formatted engine power label in kW.
 * @param {number} kw
 * @returns {string}
 */
function engineLabel(kw) {
  return `${kw} kW`;
}

/**
 * Derives a deduplicated list of readable feature label strings from vehicle attributes.
 * @param {Object} attrs
 * @returns {string[]}
 */
function featureLabels(attrs) {
  const labels = [];
  for (const tag of attrs.feature_tags) {
    labels.push(tag.replace(/_/g, ' '));
  }
  if (attrs.has_sunroof) labels.push('sunroof');
  if (attrs.has_tow_hitch) labels.push('tow hitch');
  if (attrs.has_winter_wheels) labels.push('winter wheels');
  if (attrs.has_leather_seats) labels.push('leather seats');
  if (attrs.has_heated_seats) labels.push('heated seats');
  if (attrs.has_navigation) labels.push('navigation');
  const unique = [...new Map(labels.map(l => [l, l])).values()];
  return unique.length ? unique : [...TITLE_FALLBACK_FEATURES];
}

/**
 * Picks up to two feature highlights for use in title templates.
 * @param {Object} attrs
 * @param {string} mode
 * @param {import('../rng.js').Rng} rng
 * @returns {[string, string]}
 */
function highlights(attrs, mode, rng) {
  const labels = featureLabels(attrs);
  const selected = pickMany(labels, mode, `${attrs.listing_id}:title-highlights`, rng, 2);
  if (selected.length === 1) return [selected[0], selected[0]];
  return [selected[0], selected[1]];
}

/**
 * Returns a comma-separated feature sentence for use in description templates.
 * @param {Object} attrs
 * @returns {string}
 */
function featureSentence(attrs) {
  const features = featureLabels(attrs);
  return features.length ? features.slice(0, 5).join(', ') : 'standard everyday specification';
}

/**
 * Returns a synthetic sentence describing battery range for EVs and hybrids.
 * @param {Object} attrs
 * @returns {string}
 */
function batterySentence(attrs) {
  if (attrs.fuel_type === 'electric') {
    return `approximately ${attrs.battery_range_km} km synthetic electric range`;
  }
  if (attrs.fuel_type === 'hybrid' && attrs.battery_range_km != null) {
    return `hybrid assist range of approximately ${attrs.battery_range_km} km electric`;
  }
  return 'no battery range applicable for this fuel type';
}

/**
 * Formats a NOK value with space-separated thousands (e.g. 'NOK 250 000').
 * @param {number} value
 * @returns {string}
 */
function formatMoney(value) {
  return `NOK ${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

/**
 * Generates a synthetic vehicle listing title by filling a template with derived fields.
 * @param {Object} attrs
 * @param {string} mode
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
export function buildTitle(attrs, mode, rng) {
  const template = pick(TITLE_TEMPLATES, mode, `${attrs.listing_id}:title`, rng);
  const title_prefix = pick(TITLE_PREFIXES, mode, `${attrs.listing_id}:title-prefix`, rng);
  const buyer_fit = pick(TITLE_BUYER_FITS, mode, `${attrs.listing_id}:buyer-fit`, rng);
  const [primary_highlight, secondary_highlight] = highlights(attrs, mode, rng);
  const region = attrs.county;

  const title = formatTemplate(template, {
    title_prefix,
    buyer_fit,
    make: attrs.make,
    model: attrs.model,
    model_year: attrs.model_year,
    vehicle_type: attrs.vehicle_type,
    fuel_type: attrs.fuel_type,
    transmission: attrs.transmission,
    condition: attrs.condition,
    region,
    mileage_label: mileageLabel(attrs.mileage_km),
    engine_label: engineLabel(attrs.engine_kw),
    price_band: priceBand(parseInt(attrs.total_price)),
    feature_pair: `${primary_highlight} and ${secondary_highlight}`,
    county: attrs.county,
    municipality: attrs.municipality,
    location_cluster: String(attrs.location_cluster).replace(/_/g, ' '),
  });
  return title.replace(/\s+/g, ' ').trim();
}

/**
 * Generates a multi-paragraph synthetic vehicle listing description.
 * @param {Object} attrs
 * @param {string} mode
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
export function buildDescription(attrs, mode, rng) {
  const intro = pick(INTRO_TEMPLATES, mode, `${attrs.listing_id}:intro`, rng);
  const specs = pick(SPECS_TEMPLATES, mode, `${attrs.listing_id}:specs`, rng);
  const pricing = pick(PRICE_TEMPLATES, mode, `${attrs.listing_id}:pricing`, rng);
  const features = pick(FEATURE_TEMPLATES, mode, `${attrs.listing_id}:features`, rng);
  const fuel = pick(FUEL_TEMPLATES, mode, `${attrs.listing_id}:fuel`, rng);
  const battery = pick(BATTERY_TEMPLATES, mode, `${attrs.listing_id}:battery`, rng);
  const market = pick(MARKET_TEMPLATES, mode, `${attrs.listing_id}:market`, rng);
  const location = pick(LOCATION_TEMPLATES, mode, `${attrs.listing_id}:location`, rng);

  const combined = [intro, specs, pricing, features, fuel, battery, market, location].join(' ');
  const description = formatTemplate(combined, {
    condition: String(attrs.condition).replace(/_/g, ' '),
    vehicle_type: attrs.vehicle_type,
    make: attrs.make,
    model: attrs.model,
    model_year: attrs.model_year,
    fuel_type: attrs.fuel_type,
    drive_type: attrs.drive_type,
    transmission: attrs.transmission,
    engine_kw: attrs.engine_kw,
    seats: attrs.seats,
    doors: attrs.doors,
    mileage_km: attrs.mileage_km.toLocaleString(),
    feature_sentence: featureSentence(attrs),
    battery_sentence: batterySentence(attrs),
    location_cluster: String(attrs.location_cluster).replace(/_/g, ' '),
    county: attrs.county,
    municipality: attrs.municipality,
    coarse_geo_cell: attrs.coarse_geo_cell,
    asking_price_text: formatMoney(attrs.asking_price),
    total_price_text: formatMoney(attrs.total_price),
    listing_status: String(attrs.listing_status).replace(/_/g, ' '),
    days_on_market: attrs.days_on_market,
  });
  return description.replace(/\s+/g, ' ').trim();
}
