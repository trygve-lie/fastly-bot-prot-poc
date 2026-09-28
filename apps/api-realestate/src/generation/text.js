import { createHash } from 'node:crypto';

const TITLE_TEMPLATES = [
  '{title_prefix} {bedroom_label} {property_type} in {locality} with {primary_highlight}, {size_label} and {price_band}',
  '{property_type_cap} in {locality} with {feature_pair}, {bath_label} and {year_label}',
  '{title_prefix} {property_type} in {municipality} {cluster_label} with {floor_label}, {energy_label} and {price_band}',
  '{bedroom_label} home in {locality} with {primary_highlight}, {secondary_highlight} and {size_label}',
  '{property_type_cap} for {buyer_fit} in {locality} with {primary_highlight}, {bedrooms} bedrooms and {year_label}',
  '{title_prefix} {property_type} in {locality} with {primary_highlight}, {bath_label}, {size_label} and {price_band}',
  '{energy_rating}-rated {property_type} in {locality} with {secondary_highlight}, {year_label} and {size_label}',
  '{property_type_cap} in {locality} with {floor_label}, {feature_pair}, {size_label} and {price_band}',
  '{title_prefix} {property_type} in {county} / {municipality} with {primary_highlight}, {secondary_highlight} and {bath_label}',
  '{property_type_cap} in {locality} with {energy_label}, {year_label}, {size_label} and {price_band}',
];

const INTRO_TEMPLATES = [
  'This privacy-safe synthetic listing presents a {condition} {property_type} in {municipality}, positioned within the {cluster} cluster.',
  'Designed as a synthetic search document, this {property_type} represents a {condition} home in {municipality}.',
  'Synthetic home profile: a {condition} {property_type} located in {municipality} and mapped to the {cluster} cluster.',
  'For offline relevance work, this listing models a {condition} {property_type} in {municipality}.',
  'This synthetic residence captures a {condition} {property_type} scenario in {municipality}.',
];

const LAYOUT_TEMPLATES = [
  'The layout provides {size_m2} m2, {bedrooms} bedrooms, {bathrooms} bathrooms, and {floor_sentence}.',
  'Inside, the home combines {size_m2} m2 with {bedrooms} bedrooms, {bathrooms} bathrooms, and {floor_sentence}.',
  'The floorplan models {size_m2} m2 of interior space, {bedrooms} bedrooms, {bathrooms} bathrooms, and {floor_sentence}.',
  'Searchable layout facts include {size_m2} m2, {bedrooms} bedrooms, {bathrooms} bathrooms, and {floor_sentence}.',
];

const PRICE_TEMPLATES = [
  'The synthetic pricing profile uses an asking price of {asking_price_text}, a total price of {total_price_text}, and {common_costs_sentence}.',
  'For ranking and filter evaluation, the home is priced at {asking_price_text} asking, {total_price_text} total, with {common_costs_sentence}.',
  'Pricing signals include {asking_price_text} asking, {total_price_text} total, and {common_costs_sentence}.',
  'The listing carries {asking_price_text} asking and {total_price_text} total, alongside {common_costs_sentence}.',
];

const FEATURE_TEMPLATES = [
  'Feature coverage includes {amenity_sentence}, plus {feature_sentence}.',
  'Amenities are expressed through {amenity_sentence}, while the broader feature mix includes {feature_sentence}.',
  'The synthetic feature set highlights {amenity_sentence} and also notes {feature_sentence}.',
  'For browse and recommendation experiments, the home signals {amenity_sentence} together with {feature_sentence}.',
];

const LOCATION_TEMPLATES = [
  'Geography remains privacy-safe: county {county}, municipality {municipality}, coarse cell {coarse_geo_cell}.',
  'Location is intentionally coarse and synthetic, using {county}, {municipality}, and geo cell {coarse_geo_cell}.',
  'No exact address is stored; the listing uses county {county}, municipality {municipality}, and coarse geo cell {coarse_geo_cell}.',
  'The geographic representation is limited to {county}, {municipality}, and coarse cell {coarse_geo_cell}.',
];

const FINISH_TEMPLATES = [
  'The home is associated with energy rating {energy_rating}, build year {build_year}, and a {condition} presentation suitable for synthetic search evaluation.',
  'Energy rating {energy_rating}, build year {build_year}, and the {condition} condition profile complete the synthetic record.',
  'Search-oriented metadata further includes energy rating {energy_rating}, build year {build_year}, and the {condition} condition band.',
  'The structured finish state combines energy rating {energy_rating}, build year {build_year}, and a {condition} condition category.',
];

const SUPPORT_TEMPLATES = [
  'Room allocation supports {room_use_sentence}, which makes the record useful for household-fit experiments.',
  'The bedroom and bathroom balance is tuned for {room_use_sentence} in the synthetic relevance environment.',
  'For ranking work that depends on layout intent, the home is positioned around {room_use_sentence}.',
  'The synthetic room profile suggests {room_use_sentence}, while still remaining fully fictional and privacy-safe.',
];

const OUTDOOR_TEMPLATES = [
  'Outdoor signals include {outdoor_sentence}, and the synthetic plot profile is {plot_sentence}.',
  'External-space metadata describes {outdoor_sentence}, with {plot_sentence} attached to the record.',
  'Outside, the listing expresses {outdoor_sentence} and a land component of {plot_sentence}.',
  'For browse and recommendation tests, the outdoor mix covers {outdoor_sentence} together with {plot_sentence}.',
];

const MARKET_TEMPLATES = [
  'In the timeline model, the listing is marked as {listing_status} after {days_on_market} synthetic days on market.',
  'Freshness-sensitive experiments can use the {listing_status} state and {days_on_market}-day market age attached to this home.',
  'The search record also carries {days_on_market} days on market and a {listing_status} lifecycle label.',
  'For churn and reranking evaluation, the home currently sits in {listing_status} status with {days_on_market} days on market.',
];

const TITLE_PREFIXES = [
  'airy', 'well-positioned', 'energy-smart', 'family-ready', 'well-planned',
  'modernized', 'practical', 'flexible', 'light-filled', 'carefully-updated',
  'space-efficient', 'quietly-situated',
];

const TITLE_BUYER_FITS = [
  'city living', 'family routines', 'flexible hosting', 'compact ownership',
  'weekend stays', 'daily commuting', 'storage-heavy living', 'step-free access',
];

const TITLE_FALLBACK_HIGHLIGHTS = [
  'good daylight', 'practical circulation', 'balanced room flow',
  'storage-friendly planning', 'clean interior zoning', 'comfortable everyday use',
];

/**
 * Returns a deterministic array index derived from a SHA-256 hash of the key.
 * @param {string} key
 * @param {number} size
 * @returns {number}
 */
function stableIndex(key, size) {
  const digest = createHash('sha256').update(key, 'utf-8').digest('hex');
  return parseInt(digest.slice(0, 8), 16) % size;
}

/**
 * Picks one option deterministically (by key hash) or stochastically (by rng).
 * @param {string[]} options
 * @param {string} mode - 'deterministic' or 'stochastic'.
 * @param {string} key
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
function pick(options, mode, key, rng) {
  if (mode === 'deterministic') return options[stableIndex(key, options.length)];
  return rng.choice(options);
}

/**
 * Picks count options without replacement, deterministically or stochastically.
 * @param {string[]} options
 * @param {string} mode
 * @param {string} key
 * @param {import('../rng.js').Rng} rng
 * @param {number} count
 * @returns {string[]}
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
 * @param {string} template
 * @param {Object.<string, *>} vars
 * @returns {string}
 */
function formatTemplate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => (key in vars ? String(vars[key]) : `{${key}}`));
}

/**
 * Returns the cluster label with the municipality prefix stripped.
 * @param {Object} attrs - Partial listing attributes.
 * @returns {string}
 */
function clusterLabel(attrs) {
  const cluster = String(attrs.neighborhood_cluster).replace(/_/g, ' ');
  const prefix = `${String(attrs.municipality).toLowerCase()} `;
  if (cluster.toLowerCase().startsWith(prefix)) return cluster.slice(prefix.length);
  return cluster;
}

/**
 * Formats a total price as a short NOK millions label.
 * @param {number} totalPrice
 * @returns {string}
 */
function priceBand(totalPrice) {
  return `NOK ${(totalPrice / 1_000_000).toFixed(1)}m total`;
}

/**
 * Derives a deduplicated list of human-readable feature labels from listing attributes.
 * @param {Object} attrs
 * @returns {string[]}
 */
function featureLabels(attrs) {
  const labels = [];
  for (const tag of attrs.amenity_tags) {
    const t = String(tag).replace(/_/g, ' ');
    if (t === 'garden access') labels.push('garden access');
    else if (t === 'city view') labels.push('open outlook');
    else if (t === 'transit access') labels.push('transit connection');
    else if (t === 'shared maintenance') labels.push('managed common areas');
    else labels.push(t);
  }
  if (attrs.has_balcony) labels.push('balcony');
  if (attrs.has_terrace) labels.push('terrace');
  if (attrs.has_parking) labels.push('parking');
  if (attrs.has_elevator) labels.push('lift access');
  if (attrs.has_garden) labels.push('garden access');
  if (attrs.has_view) labels.push('view exposure');
  const unique = [...new Map(labels.map(l => [l, l])).values()];
  return unique.length ? unique : [...TITLE_FALLBACK_HIGHLIGHTS];
}

/**
 * Selects two highlight labels from a listing's feature set.
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
 * Returns a short floor/level description for use in listing titles.
 * @param {Object} attrs
 * @returns {string}
 */
function titleFloorLabel(attrs) {
  if (attrs.floor == null || attrs.total_floors == null) {
    if (['townhouse', 'semi_detached', 'detached', 'cabin'].includes(attrs.property_type)) return 'multi-level planning';
    return 'ground-oriented access';
  }
  return `floor ${attrs.floor}/${attrs.total_floors}`;
}

/**
 * Generates a short display title for a listing: "{n}-bed {type} in {municipality}".
 * @param {Object} attrs - Must include bedrooms, property_type, municipality.
 * @returns {string}
 */
export function buildTitle(attrs) {
  const bedrooms = parseInt(attrs.bedrooms);
  const propertyType = String(attrs.property_type).replace(/_/g, ' ');
  const propertyTypeCap = propertyType.charAt(0).toUpperCase() + propertyType.slice(1);
  if (!bedrooms) return `${propertyTypeCap} in ${attrs.municipality}`;
  return `${bedrooms}-bed ${propertyType} in ${attrs.municipality}`;
}

/**
 * Generates a long descriptive listing text by filling a template with derived fields.
 * @param {Object} attrs - Partial listing attributes (must include listing_id, property_type, bedrooms, etc.).
 * @param {string} mode - 'deterministic' or 'stochastic'.
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
export function buildText(attrs, mode, rng) {
  const template = pick(TITLE_TEMPLATES, mode, `${attrs.listing_id}:title`, rng);
  const title_prefix = pick(TITLE_PREFIXES, mode, `${attrs.listing_id}:title-prefix`, rng);
  const buyer_fit = pick(TITLE_BUYER_FITS, mode, `${attrs.listing_id}:buyer-fit`, rng);
  const property_type = String(attrs.property_type).replace(/_/g, ' ');
  const property_type_cap = property_type.charAt(0).toUpperCase() + property_type.slice(1);
  const bedrooms = parseInt(attrs.bedrooms);
  const bedroom_label = bedrooms === 0 ? 'Studio' : `${bedrooms}-bedroom`;
  const [primary_highlight, secondary_highlight] = highlights(attrs, mode, rng);
  const locality = `${attrs.municipality} ${clusterLabel(attrs)}`;
  const bath_label = parseInt(attrs.bathrooms) === 1 ? `${attrs.bathrooms} bath` : `${attrs.bathrooms} baths`;

  const title = formatTemplate(template, {
    title_prefix,
    buyer_fit,
    bedroom_label,
    property_type,
    property_type_cap,
    primary_highlight,
    secondary_highlight,
    feature_pair: `${primary_highlight} and ${secondary_highlight}`,
    bedrooms,
    bath_label,
    year_label: `build year ${attrs.build_year}`,
    energy_rating: attrs.energy_rating,
    energy_label: `energy ${attrs.energy_rating}`,
    floor_label: titleFloorLabel(attrs),
    price_band: priceBand(parseInt(attrs.total_price)),
    county: attrs.county,
    municipality: attrs.municipality,
    locality,
    cluster_label: clusterLabel(attrs),
    size_label: `${Math.floor(attrs.size_m2)} m2`,
  });
  return title.replace(/\s+/g, ' ').trim();
}

/**
 * Formats a NOK integer value with space thousands separator.
 * @param {number} value
 * @returns {string}
 */
function formatMoney(value) {
  return `NOK ${String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

/**
 * Returns a prose floor-placement sentence for description paragraphs.
 * @param {Object} attrs
 * @returns {string}
 */
function floorSentence(attrs) {
  if (attrs.floor == null || attrs.total_floors == null) return 'a layout without apartment-style floor indexing';
  return `placement on floor ${attrs.floor} of ${attrs.total_floors}`;
}

/**
 * Returns a prose common-costs sentence for description paragraphs.
 * @param {Object} attrs
 * @returns {string}
 */
function commonCostsSentence(attrs) {
  const costs = parseInt(attrs.common_costs_monthly);
  if (costs <= 0) return 'no monthly common costs in the synthetic model';
  return `monthly common costs of ${formatMoney(costs)}`;
}

/**
 * Returns a comma-joined prose list of boolean feature attributes.
 * @param {Object} attrs
 * @returns {string}
 */
function featureSentence(attrs) {
  const features = [];
  if (attrs.has_balcony) features.push('a balcony edge');
  if (attrs.has_terrace) features.push('a terrace zone');
  if (attrs.has_parking) features.push('parking availability');
  if (attrs.has_elevator) features.push('lift access');
  if (attrs.has_garden) features.push('garden access');
  if (attrs.has_view) features.push('a view-oriented setting');
  return features.length ? features.slice(0, 4).join(', ') : 'a practical everyday specification';
}

/**
 * Returns a prose plot-area sentence for description paragraphs.
 * @param {Object} attrs
 * @returns {string}
 */
function plotSentence(attrs) {
  if (attrs.plot_m2 == null) return 'no separate plot allocation';
  return `approximately ${Math.floor(parseFloat(attrs.plot_m2))} m2 of synthetic plot area`;
}

/**
 * Returns a prose outdoor-features sentence for description paragraphs.
 * @param {Object} attrs
 * @returns {string}
 */
function outdoorSentence(attrs) {
  const items = [];
  if (attrs.has_balcony) items.push('balcony access');
  if (attrs.has_terrace) items.push('terrace use');
  if (attrs.has_garden) items.push('garden-oriented space');
  if (attrs.has_view) items.push('view potential');
  return items.length ? items.slice(0, 3).join(', ') : 'limited dedicated outdoor space';
}

/**
 * Returns a prose household-fit sentence describing bedroom and bathroom count relative to size.
 * @param {Object} attrs
 * @returns {string}
 */
function roomUseSentence(attrs) {
  const bedrooms = parseInt(attrs.bedrooms);
  const bathrooms = parseInt(attrs.bathrooms);
  const size_m2 = Math.floor(attrs.size_m2);
  if (bedrooms <= 1) return `compact living across ${size_m2} m2 with a ${bathrooms}-bath setup`;
  if (bedrooms >= 4) return `larger households needing ${bedrooms} bedrooms and ${bathrooms} baths`;
  return `everyday living with ${bedrooms} bedrooms, ${bathrooms} baths, and flexible shared space`;
}

/**
 * Generates a multi-paragraph synthetic listing description by assembling template paragraphs.
 * @param {Object} attrs - Full partial listing attributes.
 * @param {string} mode - 'deterministic' or 'stochastic'.
 * @param {import('../rng.js').Rng} rng
 * @returns {string}
 */
export function buildDescription(attrs, mode, rng) {
  const intro = pick(INTRO_TEMPLATES, mode, `${attrs.listing_id}:intro`, rng);
  const layout = pick(LAYOUT_TEMPLATES, mode, `${attrs.listing_id}:layout`, rng);
  const pricing = pick(PRICE_TEMPLATES, mode, `${attrs.listing_id}:pricing`, rng);
  const features = pick(FEATURE_TEMPLATES, mode, `${attrs.listing_id}:features`, rng);
  const location = pick(LOCATION_TEMPLATES, mode, `${attrs.listing_id}:location`, rng);
  const finish = pick(FINISH_TEMPLATES, mode, `${attrs.listing_id}:finish`, rng);
  const support = pick(SUPPORT_TEMPLATES, mode, `${attrs.listing_id}:support`, rng);
  const outdoor = pick(OUTDOOR_TEMPLATES, mode, `${attrs.listing_id}:outdoor`, rng);
  const market = pick(MARKET_TEMPLATES, mode, `${attrs.listing_id}:market`, rng);

  const amenities = Array.from(attrs.amenity_tags);
  const amenity_sentence = amenities.length
    ? amenities.slice(0, 4).map(t => t.replace(/_/g, ' ')).join(', ')
    : 'balanced storage and daylight';
  const property_type = String(attrs.property_type).replace(/_/g, ' ');

  const combined = [intro, layout, pricing, features, support, outdoor, finish, market, location].join(' ');
  const description = formatTemplate(combined, {
    condition: String(attrs.condition).replace(/_/g, ' '),
    property_type,
    build_year: attrs.build_year,
    size_m2: Math.floor(attrs.size_m2),
    bedrooms: attrs.bedrooms,
    bathrooms: attrs.bathrooms,
    energy_rating: attrs.energy_rating,
    amenity_sentence,
    feature_sentence: featureSentence(attrs),
    room_use_sentence: roomUseSentence(attrs),
    outdoor_sentence: outdoorSentence(attrs),
    plot_sentence: plotSentence(attrs),
    cluster: String(attrs.neighborhood_cluster).replace(/_/g, ' '),
    county: attrs.county,
    municipality: attrs.municipality,
    coarse_geo_cell: attrs.coarse_geo_cell,
    floor_sentence: floorSentence(attrs),
    asking_price_text: formatMoney(attrs.asking_price),
    total_price_text: formatMoney(attrs.total_price),
    common_costs_sentence: commonCostsSentence(attrs),
    listing_status: String(attrs.listing_status).replace(/_/g, ' '),
    days_on_market: attrs.days_on_market,
  });
  return description.replace(/\s+/g, ' ').trim();
}
