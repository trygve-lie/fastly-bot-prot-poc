import { createRng } from '../rng.js';
import { seedFromString } from './seed.js';

// Populated areas per municipality: [name, latitude, longitude, radius_km, weight].
// Centres are public place centres (districts, town centres), never addresses, and radii are kept
// small so sampled points stay on land in built-up areas rather than in fjords, sea or forest.
const AREAS = {
  Oslo: [
    ['Sentrum', 59.9150, 10.7450, 0.6, 3],
    ['Grünerløkka', 59.9225, 10.7590, 0.8, 3],
    ['Majorstuen', 59.9295, 10.7155, 0.8, 2],
    ['Frogner', 59.9185, 10.7060, 0.6, 2],
    ['Gamle Oslo', 59.9120, 10.7740, 0.6, 2],
    ['Sagene', 59.9370, 10.7560, 0.7, 2],
    ['Ullevål', 59.9470, 10.7330, 0.7, 1.5],
    ['Skøyen', 59.9235, 10.6820, 0.6, 1],
    ['Røa', 59.9450, 10.6430, 0.8, 1],
    ['Bjerke', 59.9310, 10.8040, 0.8, 1.5],
    ['Grorud', 59.9610, 10.8810, 0.8, 1],
    ['Stovner', 59.9615, 10.9240, 0.7, 1],
    ['Furuset', 59.9400, 10.8950, 0.8, 1],
    ['Manglerud', 59.8960, 10.8120, 0.7, 1],
    ['Lambertseter', 59.8750, 10.8100, 0.8, 1.5],
    ['Holmlia', 59.8355, 10.7930, 0.7, 1],
  ],
  Bergen: [
    ['Sentrum', 60.3895, 5.3215, 0.5, 3],
    ['Møhlenpris', 60.3830, 5.3170, 0.4, 1.5],
    ['Sandviken', 60.4060, 5.3270, 0.5, 1.5],
    ['Landås', 60.3750, 5.3500, 0.6, 1.5],
    ['Laksevåg', 60.3860, 5.2890, 0.5, 1],
    ['Fyllingsdalen', 60.3490, 5.2930, 0.9, 1.5],
    ['Paradis', 60.3390, 5.3410, 0.6, 1],
    ['Nesttun', 60.3190, 5.3540, 0.8, 1.5],
    ['Loddefjord', 60.3600, 5.2350, 0.6, 1],
    ['Åsane', 60.4660, 5.3260, 0.9, 1.5],
  ],
  Askoy: [
    ['Kleppestø', 60.4100, 5.2150, 0.7, 3],
    ['Ask', 60.4400, 5.1900, 0.8, 2],
    ['Follese', 60.4700, 5.1300, 0.7, 1],
  ],
  Alver: [
    ['Knarvik', 60.5470, 5.2850, 0.8, 3],
    ['Alversund', 60.5700, 5.2300, 0.6, 1],
    ['Frekhaug', 60.5160, 5.2380, 0.6, 1],
    ['Manger', 60.6420, 5.0370, 0.6, 1],
  ],
  Trondheim: [
    ['Midtbyen', 63.4310, 10.3950, 0.5, 3],
    ['Bakklandet', 63.4290, 10.4120, 0.5, 2],
    ['Lade', 63.4410, 10.4430, 0.6, 1.5],
    ['Moholt', 63.4110, 10.4300, 0.6, 1.5],
    ['Byåsen', 63.4150, 10.3400, 0.8, 1.5],
    ['Ranheim', 63.4260, 10.5230, 0.5, 1],
    ['Saupstad', 63.3700, 10.3500, 0.7, 1],
    ['Tiller', 63.3600, 10.3800, 0.9, 1],
    ['Heimdal', 63.3500, 10.3580, 0.8, 1],
  ],
  Malvik: [
    ['Hommelvik', 63.4070, 10.7950, 0.6, 2],
    ['Vikhammer', 63.4320, 10.6400, 0.6, 2],
    ['Sveberg', 63.4127, 10.6346, 0.6, 1],
  ],
  Melhus: [
    ['Melhus sentrum', 63.2850, 10.2780, 0.8, 3],
    ['Gimse', 63.2980, 10.2900, 0.6, 1],
    ['Ler', 63.2050, 10.2950, 0.5, 1],
  ],
  Stavanger: [
    ['Sentrum', 58.9670, 5.7350, 0.5, 3],
    ['Storhaug', 58.9670, 5.7500, 0.6, 2],
    ['Eiganes', 58.9620, 5.7200, 0.6, 2],
    ['Tasta', 58.9810, 5.7000, 0.6, 1],
    ['Madla', 58.9500, 5.6800, 0.7, 1.5],
    ['Hillevåg', 58.9500, 5.7400, 0.7, 1.5],
    ['Hinna', 58.9150, 5.7350, 0.8, 1.5],
  ],
  Sandnes: [
    ['Sentrum', 58.8480, 5.7320, 0.6, 3],
    ['Lura', 58.8650, 5.7250, 0.6, 2],
    ['Hana', 58.8350, 5.7600, 0.6, 1],
    ['Ganddal', 58.8150, 5.7150, 0.7, 1],
  ],
  Sola: [
    ['Sola sentrum', 58.8880, 5.6500, 0.6, 2],
    ['Tananger', 58.9330, 5.5850, 0.6, 2],
  ],
  Kristiansand: [
    ['Kvadraturen', 58.1470, 7.9950, 0.5, 3],
    ['Lund', 58.1530, 8.0200, 0.6, 2],
    ['Grim', 58.1560, 7.9750, 0.6, 1.5],
    ['Vågsbygd', 58.1260, 7.9520, 0.7, 1.5],
    ['Hånes', 58.1720, 8.0600, 0.6, 1],
  ],
  Lillesand: [
    ['Lillesand sentrum', 58.2520, 8.3760, 0.7, 1],
  ],
  Arendal: [
    ['Sentrum', 58.4630, 8.7620, 0.5, 3],
    ['Stuenes', 58.4700, 8.7450, 0.6, 1.5],
    ['Nedenes', 58.4250, 8.7150, 0.5, 1],
  ],
  Bodo: [
    ['Sentrum', 67.2810, 14.3900, 0.5, 3],
    ['Rønvik', 67.2930, 14.4180, 0.6, 1.5],
    ['Hunstad', 67.2760, 14.4650, 0.6, 1.5],
    ['Mørkved', 67.2750, 14.5500, 0.6, 1],
  ],
  Narvik: [
    ['Sentrum', 68.4390, 17.4300, 0.5, 3],
    ['Taraldsvik', 68.4430, 17.4380, 0.5, 1],
  ],
  Sortland: [
    ['Sortland sentrum', 68.6990, 15.4200, 0.5, 1],
  ],
};

const KM_PER_DEGREE_LAT = 111.32;
const PRECISION_DECIMALS = 3; // ~110 m north-south, ~40-60 m east-west at these latitudes

/**
 * Returns an approximate position for a listing inside a populated area of its municipality.
 * Uses its own RNG stream seeded from the listing ID, so it never shifts other generated fields.
 * Coordinates are rounded to ~100 m so a synthetic point never pins an actual building.
 * @param {string} listingId
 * @param {string} municipality
 * @returns {{ latitude: number|null, longitude: number|null, location_area: string|null }}
 */
export function samplePosition(listingId, municipality) {
  const areas = AREAS[municipality];
  if (!areas) return { latitude: null, longitude: null, location_area: null };
  const rng = createRng(seedFromString(`${listingId}:geo`));
  const [name, lat, lng, radiusKm] = rng.choices(areas, areas.map(a => a[4]), 1)[0];
  // Linear radius (not sqrt) makes points denser towards the area centre.
  const distanceKm = radiusKm * rng.random();
  const bearing = 2 * Math.PI * rng.random();
  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEGREE_LAT;
  const dLng = (distanceKm * Math.sin(bearing)) / (KM_PER_DEGREE_LAT * Math.cos(lat * Math.PI / 180));
  return { latitude: round(lat + dLat), longitude: round(lng + dLng), location_area: name };
}

/**
 * Returns true if the position lies within one of the municipality's populated areas
 * (with a margin for coordinate rounding). Used by the privacy checks.
 * @param {string} municipality
 * @param {number} latitude
 * @param {number} longitude
 * @returns {boolean}
 */
export function isWithinMunicipalityAreas(municipality, latitude, longitude) {
  return (AREAS[municipality] ?? []).some(([, lat, lng, radiusKm]) => {
    const dy = (latitude - lat) * KM_PER_DEGREE_LAT;
    const dx = (longitude - lng) * KM_PER_DEGREE_LAT * Math.cos(lat * Math.PI / 180);
    return Math.hypot(dx, dy) <= radiusKm + 0.1;
  });
}

function round(value) {
  const factor = 10 ** PRECISION_DECIMALS;
  return Math.round(value * factor) / factor;
}
