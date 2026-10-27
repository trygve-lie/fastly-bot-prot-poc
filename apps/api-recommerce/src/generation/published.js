import { createRng } from '../rng.js';
import { seedFromString } from './seed.js';

const TIME_ZONE = 'Europe/Oslo';

// Relative share of ads published per hour of the day (local time): quiet nights,
// a lunchtime bump and an evening peak.
const HOUR_WEIGHTS = [
  0.4, 0.2, 0.1, 0.1, 0.1, 0.2, 0.6, 1.2, 1.8, 2.2, 2.5, 2.8,
  3.4, 3.2, 2.8, 2.8, 3.0, 3.6, 4.2, 5.0, 5.4, 4.8, 3.4, 1.6,
];
const HOURS = HOUR_WEIGHTS.map((_, hour) => hour);

/**
 * Returns the local minute of the day (0-1439) a listing was published.
 * Uses its own RNG stream seeded from the listing ID, so it never shifts other generated fields.
 * @param {string} listingId
 * @returns {number}
 */
export function samplePublishMinute(listingId) {
  const rng = createRng(seedFromString(`${listingId}:published`));
  const hour = rng.choices(HOURS, HOUR_WEIGHTS, 1)[0];
  return hour * 60 + rng.randint(0, 59);
}

/**
 * Builds the publish timestamp relative to today: an ad keeps a fixed age (days_on_market days
 * ago at its publish minute) and the date rolls forward every day. Ads published "today" are
 * never placed in the future.
 * @param {number} daysOnMarket
 * @param {number} publishMinute
 * @param {Date} [now]
 * @returns {string} ISO 8601 local time with offset, e.g. 2026-10-24T20:14:00+02:00
 */
export function publishedAt(daysOnMarket, publishMinute, now = new Date()) {
  const today = localParts(now);
  const nowMinute = today.hour * 60 + today.minute;
  const minute = daysOnMarket === 0 ? Math.min(publishMinute, nowMinute) : publishMinute;
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day - daysOnMarket));
  const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
  const hh = Math.floor(minute / 60);
  const mm = minute % 60;
  // Find the UTC offset in effect at that local time (handles summer/winter time).
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const offset = offsetMinutes(new Date(asUtc - offsetMinutes(new Date(asUtc)) * 60_000));
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${formatOffset(offset)}`;
}

function localParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, Number(p.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute };
}

function offsetMinutes(date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(date).find(p => p.type === 'timeZoneName').value; // e.g. "GMT+02:00"
  const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}
