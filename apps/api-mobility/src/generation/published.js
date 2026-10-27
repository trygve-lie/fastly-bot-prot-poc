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
 * ago at its publish minute) and the date rolls forward every day. For ads published "today" the
 * publish minute is scaled into the part of the day that has passed, so they are never in the
 * future, keep their relative order and don't all collapse onto the current time.
 * @param {number} daysOnMarket
 * @param {number} publishMinute
 * @param {Date} [now]
 * @returns {string} ISO 8601 local time with offset, e.g. 2026-10-24T20:14:00+02:00
 */
export function publishedAt(daysOnMarket, publishMinute, now = new Date()) {
  const today = todayAt(now);
  const minute = daysOnMarket === 0 ? Math.floor(publishMinute * today.nowMinute / 1440) : publishMinute;
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day - daysOnMarket));
  const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
  const hh = Math.floor(minute / 60);
  const mm = minute % 60;
  return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${localOffset(y, m, d, hh)}`;
}

// Intl formatters are expensive to create (~35 µs each), so they are built once. "Today" is memoized
// per minute and UTC offsets per local hour, which keeps publishedAt() to a few µs per call.
const LOCAL_PARTS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
});
const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, timeZoneName: 'longOffset' });
let todayCache = { minuteKey: null, value: null };
const offsetCache = new Map(); // "y-m-d-h" -> "+01:00"

function todayAt(now) {
  const minuteKey = Math.floor(now.getTime() / 60_000);
  if (todayCache.minuteKey !== minuteKey) {
    const parts = Object.fromEntries(LOCAL_PARTS_FORMAT.formatToParts(now).map(p => [p.type, Number(p.value)]));
    todayCache = { minuteKey, value: { year: parts.year, month: parts.month, day: parts.day, nowMinute: parts.hour * 60 + parts.minute } };
  }
  return todayCache.value;
}

// UTC offset in effect at a local date and hour (handles summer/winter time).
function localOffset(y, m, d, hh) {
  const key = `${y}-${m}-${d}-${hh}`;
  let offset = offsetCache.get(key);
  if (offset === undefined) {
    const asUtc = Date.UTC(y, m - 1, d, hh);
    offset = formatOffset(offsetMinutes(new Date(asUtc - offsetMinutes(new Date(asUtc)) * 60_000)));
    if (offsetCache.size > 10_000) offsetCache.clear();
    offsetCache.set(key, offset);
  }
  return offset;
}

function offsetMinutes(date) {
  const name = OFFSET_FORMAT.formatToParts(date).find(p => p.type === 'timeZoneName').value; // e.g. "GMT+02:00"
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
