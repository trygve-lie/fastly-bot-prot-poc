import { createHash } from 'node:crypto';

// Which item attributes make two ads "look the same" (share one image).
//   A: subcategory + brand + model                (one image per product)
//   B: A + colour
//   C: B + material
//   D: one image per ad
export const GRANULARITIES = {
  A: item => [item.subcategory, item.brand ?? '-', item.model],
  B: item => [item.subcategory, item.brand ?? '-', item.model, item.color ?? '-'],
  C: item => [item.subcategory, item.brand ?? '-', item.model, item.color ?? '-', item.material ?? '-'],
  D: item => [item.listing_id],
};

// Scene per category, with optional per-subcategory overrides.
const SCENES = {
  electronics: { default: 'on a clean light wooden desk at home', tv: 'on a TV bench in a bright Scandinavian living room' },
  computers_gaming: { default: 'on a tidy desk in a home office', video_game: 'game case lying on a wooden table' },
  home_appliances: {
    default: 'on a kitchen counter in a bright Scandinavian kitchen',
    vacuum_cleaner: 'standing on the floor in a bright living room',
    washing_machine: 'standing in a clean laundry room',
    dishwasher: 'standing in a clean modern kitchen',
  },
  furniture: {
    default: 'in a bright Scandinavian living room',
    dining_table: 'in a bright Scandinavian dining room',
    bed: 'in a calm Scandinavian bedroom',
    wardrobe: 'in a calm Scandinavian bedroom',
    desk: 'in a bright home office',
    bookshelf: 'against a white wall in a Scandinavian living room',
  },
  home_decor: { default: 'styled on a sideboard in a Scandinavian home', rug: 'lying on a wooden floor in a Scandinavian living room', mirror: 'hanging on a white wall' },
  clothing: { default: 'laid flat on a light wooden floor' },
  shoes_accessories: { default: 'on a plain light background', watch: 'on a plain light background, close-up', jewellery: 'on a plain light background, close-up' },
  kids_baby: { default: 'in a bright nursery', stroller: 'parked in a bright hallway', car_seat: 'on a plain light floor' },
  sports_outdoors: {
    default: 'outdoors in Norwegian nature',
    bicycle: 'leaning against a wooden wall outdoors',
    skis: 'leaning against a cabin wall in the snow',
    snowboard: 'standing in the snow',
    running_shoes: 'on a plain light background',
    gym_equipment: 'on the floor of a home gym',
    golf_clubs: 'in a golf bag on a lawn',
  },
  hobbies_music: { default: 'in a cosy home studio', board_game: 'box on a wooden table', lego_set: 'assembled set on a wooden table', sewing_machine: 'on a wooden table' },
  books_media: { default: 'on a wooden table' },
  antiques_collectibles: { default: 'on an old wooden surface in warm light', painting: 'leaning against a wall in warm light', wall_clock: 'hanging on a wall in warm light' },
  garden_tools: { default: 'on a workbench in a garage', lawn_mower: 'on a green lawn in a Norwegian garden', garden_furniture: 'on a patio in a Norwegian garden', grill: 'on a patio in a Norwegian garden' },
};

const CONDITION_PHRASES = {
  new: 'brand new and unused',
  like_new: 'in like-new condition',
  good: 'lightly used and in good condition',
  fair: 'used, with visible signs of wear',
  for_parts: 'damaged and worn, sold for parts or repair',
};

// Generic subjects for the brand-free fallback prompt, where the plain subcategory label invites
// copyrighted artwork (covers, characters). Others fall back to "unbranded <label>".
const GENERIC_SUBJECTS = {
  video_game: 'video game case with a plain abstract cover',
  comic: 'comic album with a plain abstract cover',
  book: 'hardcover book with a plain cover',
  textbook: 'textbook with a plain cover',
  film: 'DVD case with a plain abstract cover',
  vinyl_record: 'vinyl record in a plain abstract sleeve',
  board_game: 'board game box with a plain abstract cover',
  lego_set: 'set of assembled plastic toy bricks',
};

const STYLE = 'Realistic photo for a second-hand marketplace ad, taken with a smartphone. Natural daylight, sharp focus, the item fills most of the frame.';
const NEGATIVE = 'No people, no hands, no text, no watermarks, no logos, no licence plates.';

/**
 * Returns the visual key for an item at the given granularity.
 * @param {Object} item
 * @param {string} granularity
 * @returns {string}
 */
export function visualKey(item, granularity) {
  return GRANULARITIES[granularity](item).join('|');
}

/**
 * Deterministic seed for a key, so regenerating an image reproduces it unless a new seed is requested.
 * @param {string} key
 * @returns {number}
 */
export function seedFor(key) {
  return parseInt(createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % 2_147_483_647;
}

/**
 * Builds the image prompt and alt text for a representative item of a visual key.
 * Attributes that are not part of the key (e.g. colour at granularity A) are left out,
 * so the image does not contradict any of the ads that share it.
 * The generic variant drops brand and model; it is the fallback when the safety filter
 * flags images of strongly branded products (logos, cover art, characters).
 * @param {Object} item
 * @param {string} granularity
 * @param {{ generic?: boolean }} [options]
 * @returns {{ prompt: string, alt: string, attributes: Object }}
 */
export function describe(item, granularity, { generic = false } = {}) {
  const withColor = granularity !== 'A' && item.color;
  const withMaterial = (granularity === 'C' || granularity === 'D') && item.material;
  const withCondition = granularity === 'D';

  const product = item.brand ? `${item.brand} ${item.model}` : item.model;
  const kind = item.subcategory_label.toLowerCase();
  const scenes = SCENES[item.category] ?? {};
  const scene = scenes[item.subcategory] ?? scenes.default ?? 'on a plain light background';
  const condition = withCondition ? CONDITION_PHRASES[item.condition] : 'used and in good condition';

  const subject = [
    withColor ? item.color : null,
    generic ? (GENERIC_SUBJECTS[item.subcategory] ?? `unbranded ${kind}`)
      : product.toLowerCase().includes(kind) ? product : `${product} ${kind}`,
    withMaterial ? `made of ${item.material}` : null,
  ].filter(Boolean).join(' ');

  const prompt = `${STYLE} Subject: a ${subject}, ${condition}, ${scene}. ${NEGATIVE}`;
  const alt = `${withColor ? capitalize(item.color) + ' ' : ''}${product}`;

  const attributes = {
    category: item.category,
    subcategory: item.subcategory,
    brand: item.brand ?? null,
    model: item.model,
    ...(withColor ? { color: item.color } : {}),
    ...(withMaterial ? { material: item.material } : {}),
    ...(withCondition ? { condition: item.condition } : {}),
  };

  return { prompt, alt, attributes };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
