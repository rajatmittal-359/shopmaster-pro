/**
 * Indian PIN code lookup, via India Post's public API.
 *
 * WHY NOT GOOGLE
 *   Google Maps Platform requires a billing account on the project before any
 *   Places request works - the free tier itself has to be claimed with a card.
 *   What it adds over this is street-level suggestion, and a street address is
 *   the one part only the customer knows anyway.
 *
 *   The errors that actually break a courier booking are a PIN code that does
 *   not match its city, a wrong state, and a misspelt locality. All three are
 *   fixed by this, for nothing: no key, no billing, no quota.
 *
 * WHY IT IS PROXIED RATHER THAN CALLED FROM THE BROWSER
 *   It works from the browser - CORS is open - but then every customer pays the
 *   round trip and India Post's uptime becomes the checkout's uptime. Here it
 *   is cached, so the second person from a PIN code gets an instant answer, and
 *   there is one place to change if the upstream ever moves.
 */
const CACHE = new Map();

/**
 * PIN codes do not change, so a hit is kept for the life of the process. The
 * cap is only there so a flood of junk lookups cannot grow it without limit.
 */
const MAX_CACHE = 2000;

const UPSTREAM = 'https://api.postalpincode.in/pincode/';

/** Six digits, and India has no PIN code starting with 0. */
const isValidPin = (code) => /^[1-9][0-9]{5}$/.test(String(code || ''));

/**
 * @returns {{pincode, city, state, areas: string[]}|null} null when the PIN
 *          code does not exist. Throws only when the upstream is unreachable,
 *          so a caller can tell "no such PIN code" from "we could not check".
 */
const lookup = async (code) => {
  const pin = String(code);
  if (!isValidPin(pin)) return null;
  if (CACHE.has(pin)) return CACHE.get(pin);

  const res = await fetch(UPSTREAM + pin, {
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`India Post returned ${res.status}`);

  const body = await res.json();
  const first = Array.isArray(body) ? body[0] : null;

  if (!first || first.Status !== 'Success' || !first.PostOffice?.length) {
    // A real answer meaning "no such PIN code". Cached too - repeatedly asking
    // about a typo should not repeatedly leave the building.
    CACHE.set(pin, null);
    return null;
  }

  const offices = first.PostOffice;
  const result = {
    pincode: pin,
    city: offices[0].District,
    state: offices[0].State,
    // Deduplicated and sorted, because this becomes a dropdown a person reads.
    areas: [...new Set(offices.map((o) => o.Name).filter(Boolean))].sort(),
  };

  if (CACHE.size >= MAX_CACHE) CACHE.clear();
  CACHE.set(pin, result);
  return result;
};

module.exports = { lookup, isValidPin };
