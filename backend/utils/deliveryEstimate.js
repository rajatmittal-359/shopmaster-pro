/**
 * "Get it by Friday" - answered from the courier, not from a guess.
 *
 * WHY IT IS ITS OWN THING
 *   The single largest, cheapest conversion difference on an Indian product
 *   page is a DATE. Amazon, Flipkart and Myntra all put one above the button.
 *   A range of days ("3-7 working days") asks the shopper to do arithmetic in
 *   their head, and most of them just leave.
 *
 * THE HONESTY RULE THAT SHAPES ALL OF THIS
 *   We book the CHEAPEST courier at dispatch, not the fastest. So the estimate
 *   must come from the cheapest one too. Quoting the fastest courier's ETA and
 *   then booking a slower one is a promise the shop breaks on every order, and
 *   a broken delivery promise is the thing customers remember.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN
 *   Courier names and rates. They are our cost base, this endpoint is public
 *   and unauthenticated, and the page does not need them. It also does not
 *   claim anything about cash on delivery: a serviceability check made for a
 *   prepaid parcel cannot answer that question truthfully, and a wrong COD
 *   promise is discovered at the door.
 */
/*
 * The MODULE, not its functions pulled off it. A destructured `getShippingRate`
 * binds to whatever the function was at require time, so a test can never
 * replace it - the same trap already documented in cancelOrder.js and
 * settleReturn.js. Held this way, tests swap the property and this file calls
 * the replacement.
 */
const shiprocket = require('./shiprocketService');

/**
 * A typical jewellery parcel. The estimate is asked for before there is a cart,
 * so there is no real weight to use - and at this size weight does not change
 * the transit time, only the price, which this endpoint does not return.
 */
const SAMPLE_WEIGHT_KG = 0.3;

/**
 * Working days between the order and the courier collecting it. Must match
 * `handlingDays` in the frontend policy config and what the shipping policy
 * page tells customers - a date built from a different number than the page
 * promises is the same lie told twice.
 */
const DISPATCH_DAYS = 2;

/**
 * PIN codes do not change, and neither does a courier's network from hour to
 * hour. Six hours of cache turns a page-load-time third-party call into one
 * call per pincode per morning - and Shiprocket rate-limits, so an
 * unauthenticated endpoint without this is a way to lose the whole account.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map();

/** Six digits, and no Indian PIN code starts with a zero. */
const isValidPincode = (code) => /^[1-9][0-9]{5}$/.test(String(code || '').trim());

/**
 * Indian couriers work Saturdays. Only Sunday is skipped - treating Saturday as
 * a non-working day would push every estimate a day late, which is the safe
 * direction to be wrong in but still wrong.
 */
const addWorkingDays = (from, days) => {
  const date = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0) left -= 1;
  }
  return date;
};

/** Shiprocket sends the number of days as a string about as often as a number. */
const transitDaysOf = (courier) => {
  const raw = courier?.estimated_delivery_days ?? courier?.etd_days;
  const days = Number(raw);
  return Number.isFinite(days) && days > 0 ? Math.ceil(days) : null;
};

/** YYYY-MM-DD, so the browser is handed a date and not a formatted string. */
const isoDate = (date) => date.toISOString().slice(0, 10);

/**
 * @returns {Promise<{pincode, serviceable, transitDays?, dispatchDays?, deliveryBy?}>}
 * @throws if the courier API cannot be reached - the caller must answer 503.
 *         An estimate we could not check is not an estimate.
 */
async function estimateDelivery(pincode, { now = new Date() } = {}) {
  const code = String(pincode).trim();

  const hit = cache.get(code);
  if (hit && hit.expires > Date.now()) {
    // The DATE is recomputed even on a cache hit: the transit time is what was
    // cached, and a date cached at 11pm would be a day stale by morning.
    return withDate(hit.value, now);
  }

  const data = await shiprocket.getShippingRate(code, SAMPLE_WEIGHT_KG, false);
  const courier = shiprocket.pickBestCourier(data);
  const transitDays = courier ? transitDaysOf(courier) : null;

  const value =
    courier && transitDays
      ? { pincode: code, serviceable: true, transitDays }
      : // A pincode nobody delivers to is a real, useful answer - not an error.
        // Saying so on the product page is better than letting them reach
        // checkout and find out there.
        { pincode: code, serviceable: false };

  cache.set(code, { value, expires: Date.now() + CACHE_TTL_MS });
  return withDate(value, now);
}

const withDate = (value, now) => {
  if (!value.serviceable) return { ...value };
  return {
    ...value,
    dispatchDays: DISPATCH_DAYS,
    deliveryBy: isoDate(addWorkingDays(now, DISPATCH_DAYS + value.transitDays)),
  };
};

/** Tests own the clock and the cache; nothing else should touch this. */
const _clearCache = () => cache.clear();

module.exports = {
  estimateDelivery,
  isValidPincode,
  addWorkingDays,
  _clearCache,
  SAMPLE_WEIGHT_KG,
  DISPATCH_DAYS,
};
