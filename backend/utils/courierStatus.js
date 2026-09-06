/**
 * Turning a courier's words into the four states this shop understands.
 *
 * WHY A MAP AND NOT A LOOKUP TABLE
 *   Couriers do not agree on wording and Shiprocket passes theirs through
 *   largely untouched: "DELIVERED", "Delivered", "Shipment Delivered",
 *   "OUT FOR DELIVERY", "Out For Delivery". An exact-match table would silently
 *   ignore a status it had never seen, and ignoring "delivered" is the one that
 *   costs money - see below. Patterns match the family, not the phrase.
 *
 * WHY 'delivered' MATTERS MORE THAN THE REST
 *   deliveredAt starts the return window; the return window closing is what
 *   makes a seller's line payable. Until this webhook existed the only way it
 *   was ever set was a seller remembering to press a button - so a seller who
 *   forgot was simply never paid, and had no way to know why.
 */

/** Ordered: the first pattern that matches wins, so put the specific ones first. */
const PATTERNS = [
  // RTO before "delivered", or "RTO DELIVERED" would read as a delivery.
  [/\brto\b|return to origin/i, 'returned'],
  [/undeliver|\bndr\b|delivery attempt fail|address issue|customer not avail/i, 'ndr'],
  [/cancel/i, 'cancelled'],
  [/deliver(ed)?\b(?!.*out for)/i, 'delivered'],
  [/out for delivery|ofd/i, 'out_for_delivery'],
  [/in transit|shipped|dispatch|picked ?up|manifest/i, 'shipped'],
];

/**
 * @param {string} raw whatever the courier called it
 * @returns {'shipped'|'out_for_delivery'|'delivered'|'ndr'|'returned'|'cancelled'|null}
 *          null when nothing matched, which is a status worth logging rather
 *          than guessing at.
 */
const normaliseCourierStatus = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return null;

  for (const [pattern, mapped] of PATTERNS) {
    if (pattern.test(text)) return mapped;
  }
  return null;
};

/**
 * What a fulfilment should become. NDR is deliberately NOT a fulfilment state:
 * a failed attempt does not move the parcel backwards, the courier will try
 * again, and overwriting 'shipped' with something else would lose that.
 */
const FULFILMENT_STATE = {
  shipped: 'shipped',
  out_for_delivery: 'shipped',
  delivered: 'delivered',
  returned: 'returned',
  cancelled: 'cancelled',
};

module.exports = { normaliseCourierStatus, FULFILMENT_STATE };
