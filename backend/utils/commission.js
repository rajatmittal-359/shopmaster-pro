/**
 * Platform commission.
 *
 * The business rule: the platform takes a percentage of the ITEM value of every
 * sale. Shipping is never commissioned - it is money owed to the courier, not
 * revenue. The platform's own store is simply a seller whose rate is 0.
 *
 * The one rule that matters for correctness: a commission rate is COPIED onto
 * the order item when the order is placed, and every later calculation reads
 * that copy. Rates change over time, so recomputing an old order against the
 * current rate would silently rewrite history and make past payouts wrong.
 */

/**
 * Applied to any seller who has no explicit rate of their own.
 *
 * Why 8%: the large marketplaces charge well into double digits, so a new
 * platform has to undercut them to be worth joining at all. 8% still leaves a
 * real margin once the payment gateway fee (roughly 2% of the whole order) and
 * GST on the commission are paid out of it.
 *
 * It is deliberately a starting point, not a fixed policy - `commissionRate` on
 * a seller profile overrides it, so a rate can be negotiated per seller without
 * a code change. If rates ever need to differ by product category as well, the
 * place to add that is getRatesBySeller below.
 */
const DEFAULT_COMMISSION_RATE = 8;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Splits one order line into the platform's cut and the seller's earning.
 *
 * @param {number} price     unit price charged to the customer
 * @param {number} quantity  units in this line
 * @param {number} rate      commission percentage in force for this seller
 * @returns {{commissionRate: number, commissionAmount: number, sellerEarning: number}}
 */
const splitLine = (price, quantity, rate) => {
  const safeRate = Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 100) : DEFAULT_COMMISSION_RATE;
  const lineTotal = round2(price * quantity);
  const commissionAmount = round2((lineTotal * safeRate) / 100);

  return {
    commissionRate: safeRate,
    commissionAmount,
    // Subtract rather than recompute, so the two halves always add back up to
    // the line total no matter how the rounding fell.
    sellerEarning: round2(lineTotal - commissionAmount),
  };
};

/**
 * Looks up the live commission rate for each seller in one query and returns a
 * map keyed by seller user id. Sellers with no profile fall back to the default
 * rather than to zero, so a missing profile can never cost the platform money.
 *
 * @param {Array} sellerIds  seller user ids appearing in the order
 * @param {object} [session] mongoose session, when called inside a transaction
 */
const getRatesBySeller = async (sellerIds, session) => {
  const Seller = require('../models/Seller');

  const unique = [...new Set(sellerIds.map(String))];
  let query = Seller.find({ userId: { $in: unique } }).select('userId commissionRate');
  if (session) query = query.session(session);

  const profiles = await query.lean();
  const rates = new Map(
    profiles.map((p) => [
      String(p.userId),
      Number.isFinite(p.commissionRate) ? p.commissionRate : DEFAULT_COMMISSION_RATE,
    ])
  );

  unique.forEach((id) => {
    if (!rates.has(id)) rates.set(id, DEFAULT_COMMISSION_RATE);
  });
  return rates;
};

/**
 * Stamps commission onto order items just before they are written.
 * Returns a NEW array; the input is not mutated.
 *
 * @param {Array} items    order items, each with sellerId, price and quantity
 * @param {object} [session]
 */
const applyCommission = async (items, session) => {
  const rates = await getRatesBySeller(items.map((i) => i.sellerId), session);

  return items.map((item) => ({
    ...item,
    ...splitLine(item.price, item.quantity, rates.get(String(item.sellerId))),
  }));
};

module.exports = {
  DEFAULT_COMMISSION_RATE,
  splitLine,
  getRatesBySeller,
  applyCommission,
};
