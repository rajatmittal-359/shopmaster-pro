/**
 * Places, as points.
 *
 * WHY A FILE AND NOT A SERVICE (15 Oct 2026)
 *   Place in this app has always been a PIN code, and that has been enough:
 *   `utils/shipping.isLocalDelivery` compares the first three digits, which
 *   are the sorting district, so "same city" is answered for free and same-day
 *   has worked without a map. What a PIN cannot answer is "which shops are
 *   near me" - the question a marketplace gets once it has more than one shop
 *   in a city.
 *
 *   Three roads were walked before this one, and the dead ends are worth
 *   keeping so nobody walks them again:
 *
 *   Google. We pay them nothing today - there is not one geocoding call in
 *   this codebase - so "it saves API money" does not apply to us. And their
 *   own Service Specific Terms allow a latitude/longitude to be cached for
 *   "up to 30 consecutive calendar days", after which it must be deleted. A
 *   shop's address does not move; a licence that makes us forget it every
 *   month is the wrong foundation.
 *
 *   A free PIN-to-coordinate dataset. Tried, and it failed the only test that
 *   mattered: the house shop's own 302019 was not in it, Jaipur had 17 PINs,
 *   and every one of them carried the SAME coordinate - 26.1748, 74.8799,
 *   which is about 90 km from Jaipur. Distances between Jaipur PINs would all
 *   have come out zero. A gate built on that is worse than the prefix it
 *   replaces, because it is confidently wrong instead of roughly right.
 *
 *   The shop's Google Business link. Charming Jewels has one, but it is a
 *   share.google short link: it carries no coordinates and resolves through a
 *   browser redirect to a search page, so a server cannot read a point out of
 *   it. Hence `coordsFromMapsUrl` returning null for short links rather than
 *   pretending.
 *
 *   What is left is the party who always knows: the seller. They open their
 *   own shop on Maps and paste the long URL. One paste, accurate, free,
 *   permanent. This file reads that paste and speaks Mongo's dialect.
 *
 * NOTHING HERE QUERIES. The caller owns its own collection; `nearQuery` just
 * builds the filter, so this stays testable without a database.
 */

/** Mongo's own limits, and a cheap guard against a parse that went sideways. */
const sane = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/**
 * The point out of a Google Maps URL, or null.
 *
 * Maps puts two different things in one link: `@lat,lng` is where the CAMERA
 * is, and `!3d<lat>!4d<lng>` is where the PLACE is. On a shared place link
 * they can be a street apart, so the place wins when both are present.
 *
 * @param {string} url
 * @returns {{lat: number, lng: number}|null}
 */
const coordsFromMapsUrl = (url) => {
  const s = String(url || '');
  if (!s) return null;

  const pairs = [
    // The pin itself, in the data= blob of a place link.
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    // The viewport.
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    // What a phone's share sheet and old links produce.
    /[?&](?:q|ll|sll|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const re of pairs) {
    const m = re.exec(s);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (sane(lat, lng)) return { lat, lng };
  }
  // share.google and maps.app.goo.gl land here: they hold no coordinates at
  // all. Null means "open it and paste the long link", which is the truth.
  return null;
};

/**
 * GeoJSON, which is LONGITUDE FIRST.
 *
 * This is the single most common bug in geospatial code - every human says
 * "lat, long" and every GeoJSON document wants the opposite - so the swap
 * happens here, once, and nowhere else.
 */
const toPoint = ({ lat, lng }) => ({ type: 'Point', coordinates: [lng, lat] });

/**
 * A `$near` filter for a 2dsphere field.
 *
 * `$maxDistance` is in METRES against a GeoJSON point, not kilometres and not
 * radians - the other common bug. Callers think in km, so they pass km.
 *
 * `$near` also sorts by distance for free, which is the whole reason to use
 * it rather than `$geoWithin`.
 */
const nearQuery = (point, km) => ({
  $near: { $geometry: toPoint(point), $maxDistance: Math.round(km * 1000) },
});

const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

/**
 * Distance between two points, without asking the database.
 *
 * For the places that hold two points already - a courier quote, a test, a
 * log line - and must not open a connection to compare them.
 */
const haversineKm = (a, b) => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

module.exports = { coordsFromMapsUrl, toPoint, nearQuery, haversineKm };
