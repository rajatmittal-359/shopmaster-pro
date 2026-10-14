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


/* ------------------------------------------------------------------ *
 * GEOCODING: AN ADDRESS BECOMES A POINT
 * ------------------------------------------------------------------ */

const mongoose = require('mongoose');

/**
 * WHY NOT GOOGLE
 *   Their Geocoding API needs billing enabled, and Google Cloud has refused
 *   Rajat's card - the same wall the image models hit. The choice was never
 *   "Google or free", it was "free or nothing". Their terms would also have
 *   made us delete the answer every 30 days, for an address that never moves.
 *
 * WHY NOMINATIM
 *   No key, no card. Tried against the real addresses before any code was
 *   written: the full line with the house number found NOTHING, "Devi Nagar,
 *   Jaipur, 302019" found 26.8843/75.7619, and the bare PIN found 302019 at
 *   26.8784/75.7580 - the same PIN a free dataset had placed 90 km away.
 *
 *   So the question is asked narrow and then widened, and the answer carries
 *   HOW precise it is, because a point good enough to rank shops by distance
 *   is not good enough to send a rider to a door.
 *
 * THEIR RULES, WHICH ARE THE PRICE
 *   One request a second, a User-Agent that says who we are and how to reach
 *   us, and no asking a question already answered. The cache below is not a
 *   speed trick, it is a condition of use.
 */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'ShopMasterPro/1.0 (+https://www.shopmasterpro.in; rajatmittal359@gmail.com)';
const MIN_GAP_MS = 1000;

const cacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
const GeocodeCache = mongoose.models.GeocodeCache || mongoose.model('GeocodeCache', cacheSchema);

/* No TTL on purpose. A shop does not move, and OpenStreetMap - unlike Google -
 * puts no expiry on what we keep. Re-asking would only spend their goodwill. */
const defaultLookup = async (key) => {
  try {
    const row = await GeocodeCache.findOne({ key }).lean();
    return row ? row.value : null;
  } catch {
    return null;
  }
};
const defaultSave = async (key, value) => {
  try {
    await GeocodeCache.updateOne({ key }, { $set: { key, value } }, { upsert: true });
  } catch {
    /* a cache that will not write must never fail the lookup it was helping */
  }
};

/** Narrow to broad. The first that answers wins, and names its own precision. */
const candidates = (a = {}) => {
  const tail = [a.city, a.state, a.pincode].filter(Boolean);
  const rows = [
    { precision: 'address', parts: [a.address1, a.address2, ...tail] },
    { precision: 'locality', parts: [a.address2, ...tail] },
    { precision: 'city', parts: tail },
    { precision: 'pincode', parts: [a.pincode] },
  ];
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const q = r.parts.filter(Boolean).join(', ').trim();
    if (!q || seen.has(q)) continue;
    seen.add(q);
    out.push({ ...r, q });
  }
  return out;
};

let lastCall = 0;
const pace = async () => {
  // Their policy is one request a second. Tests never reach the network, so
  // they never pay the wait.
  if (process.env.NODE_ENV === 'test') return;
  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
};

/**
 * The point for an address, or null.
 *
 * Null is a real answer: it means nobody knows yet, and the caller carries on
 * exactly as it did before there was a map. Never a guess.
 *
 * @param {{address1?:string,address2?:string,city?:string,state?:string,pincode?:string}} address
 * @returns {Promise<{lat:number,lng:number,precision:string,source:string,cached?:boolean}|null>}
 */
const geocodeAddress = async (address, opts = {}) => {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const lookup = opts.lookup || defaultLookup;
  const save = opts.save || defaultSave;

  const tries = candidates(address);
  if (!tries.length) return null;

  const key = tries[0].q.toLowerCase();
  const hit = await lookup(key);
  if (hit) return { ...hit, cached: true };

  for (const t of tries) {
    let rows;
    try {
      await pace();
      const url = `${NOMINATIM}?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(t.q)}`;
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
      if (!res?.ok) continue;
      rows = await res.json();
    } catch {
      // Down, blocked, offline. An address simply has no point yet.
      return null;
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) continue;
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!sane(lat, lng)) continue;
    const value = { lat, lng, precision: t.precision, source: 'nominatim' };
    await save(key, value);
    return value;
  }
  return null;
};

module.exports = { coordsFromMapsUrl, toPoint, nearQuery, haversineKm, geocodeAddress };
