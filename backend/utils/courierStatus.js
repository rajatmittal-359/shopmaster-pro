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
/*
 * Shiprocket's own vocabulary (support article "Important terms", read
 * 20 Sep 2026), worst-first so a compound word lands on the right rule:
 *   forward   Pickup Scheduled/Error/Exception/Rescheduled · Out for Pickup ·
 *             Picked Up · Shipped · In-Transit · Reached at Destination Hub ·
 *             Out for Delivery · Delivered · Delayed · Misrouted · Lost/Damaged ·
 *             Destroyed
 *   NDR       Undelivered (three more attempts follow)
 *   RTO       RTO Initiated · RTO In-Transit · RTO-OFD · RTO-NDR · RTO Delivered ·
 *             RTO Acknowledged · RTO Rejected · Disposed Of
 *   returns   Return Pending/Initiated/Pickup Generated/Picked Up/In-Transit/
 *             Delivered/Canceled (the customer's return leg - its own AWB)
 *
 * Only "delivered"/"returned"/"cancelled"/"shipped" move the parcel's state.
 * The rest are FACTS that applyCourierUpdate records and courierEvents
 * turns into the right bell: an RTO that has started is not yet "returned"
 * (the seller does not have it), a lost parcel is not "shipped", a failed
 * pickup is a seller's problem to hear about today.
 */
const PATTERNS = [
  // The customer's return leg: never a forward transition ("Return Delivered" is not "Delivered").
  [/\breturn (pending|initiated|pickup|picked|in.?transit|delivered|cancel)/i, 'return_leg'],
  // Back with the seller - the only RTO words that mean the parcel has physically arrived.
  [/rto[ -]?(delivered|acknowledged)/i, 'returned'],
  // RTO under way: initiated, in transit, out for delivery back, NDR on the way back, rejected by the seller.
  [/\brto\b|return to origin/i, 'rto'],
  [/lost|damaged|destroyed|disposed/i, 'lost'],
  [/pickup (exception|error|rescheduled)|pickup not done|pickup failed/i, 'pickup_failed'],
  [/undeliver|\bndr\b|delivery attempt fail|address issue|customer not avail|misrouted/i, 'ndr'],
  [/cancel/i, 'cancelled'],
  [/deliver(ed)?\b(?!.*out for)/i, 'delivered'],
  [/out for delivery|ofd/i, 'out_for_delivery'],
  [/in transit|shipped|dispatch|picked ?up|manifest|reached/i, 'shipped'],
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
