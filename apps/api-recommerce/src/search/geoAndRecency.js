const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance in km between a geo filter centre and a document position.
 * @param {{ lat: number, lng: number }} centre
 * @param {{ latitude: number, longitude: number }} doc
 * @returns {number}
 */
export function distanceKm(centre, doc) {
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(doc.latitude - centre.lat);
  const dLng = toRad(doc.longitude - centre.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(centre.lat)) * Math.cos(toRad(doc.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

/**
 * True if the document has a position within the geo filter's radius.
 * @param {{ lat: number, lng: number, radius_km: number }} geo
 * @param {{ latitude: number|null, longitude: number|null }} doc
 * @returns {boolean}
 */
export function withinRadius(geo, doc) {
  return doc.latitude != null && distanceKm(geo, doc) <= geo.radius_km;
}

/**
 * Orders documents newest first: fewer days on market first, then later publish minute, then ID.
 * @param {{ days_on_market: number, publish_minute: number|null, listing_id: string }} a
 * @param {{ days_on_market: number, publish_minute: number|null, listing_id: string }} b
 * @returns {number}
 */
export function compareRecency(a, b) {
  return (a.days_on_market - b.days_on_market)
    || ((b.publish_minute ?? 0) - (a.publish_minute ?? 0))
    || a.listing_id.localeCompare(b.listing_id);
}
