const Coupon = require('../models/Coupon');
const { getRatesBySeller } = require('./commission');
const { splitDiscountedLine, round2 } = require('./discount');
const { evaluateCoupon } = require('./applyCoupon');

/**
 * What an order costs, and who ends up with what.
 *
 * WHY THERE IS ONE OF THESE
 *   Two checkouts write orders - COD in customerController and prepaid in
 *   razorpayController - and each used to stamp commission itself. That was
 *   already one duplication too many; adding coupons to both would have been
 *   two copies of the question "who funded this discount", which is exactly the
 *   sort of thing that agrees on the day it is written and disagrees six months
 *   later, in a payout, in somebody's favour.
 *
 * WHAT IT REFUSES TO DO
 *   It never discounts delivery. A coupon takes money off GOODS; delivery is
 *   money owed to a courier. Mixing them is how a shop ends up paying a courier
 *   out of a discount it thought it was giving on jewellery.
 *
 *   It never spends a coupon use either - see markCouponUsed. A code is spent
 *   when an order is paid for, not when a basket is priced.
 */

/**
 * @param {object} args
 * @param {Array}  args.items       cart lines with a populated productId
 * @param {string} [args.couponCode]
 * @param {string} args.customerId
 * @param {object} [args.session]
 * @returns {Promise<{
 *   orderItems: Array, itemsTotal: number, discountTotal: number,
 *   coupon: {code, fundedBy, description}|null, couponError: string|null
 * }>}
 */
const priceOrder = async ({ items, couponCode, customerId, session }) => {
  const lines = items.map((item) => ({
    productId: item.productId._id,
    name: item.productId.name,
    quantity: item.quantity,
    price: item.price,
    sellerId: item.productId.sellerId,
  }));

  const rates = await getRatesBySeller(
    lines.map((l) => l.sellerId),
    session
  );

  let perLine = lines.map(() => 0);
  let coupon = null;
  let couponError = null;

  if (couponCode) {
    const found = await Coupon.findOne({
      code: String(couponCode).trim().toUpperCase(),
    }).session(session || null);

    const verdict = evaluateCoupon(found, { lines, customerId });

    if (verdict.ok) {
      perLine = verdict.perLine;
      coupon = {
        code: verdict.code,
        fundedBy: verdict.fundedBy,
        description: verdict.description,
      };
    } else {
      /*
       * A bad code does not fail the checkout.
       *
       * Someone who mistypes a code, or whose code expired while they were
       * deciding, still wants the jewellery. Refusing the whole order would
       * lose a sale over a discount they never had. The reason is handed back
       * so the caller can decide whether to say so or to stop - and the
       * checkout endpoints DO stop, because a customer expecting a discount
       * must not be silently charged full price.
       */
      couponError = verdict.reason;
    }
  }

  const orderItems = lines.map((line, i) => {
    const split = splitDiscountedLine({
      price: line.price,
      quantity: line.quantity,
      rate: rates.get(String(line.sellerId)),
      discount: perLine[i],
      fundedBy: coupon?.fundedBy || null,
    });

    return {
      ...line,
      commissionRate: split.commissionRate,
      commissionAmount: split.commissionAmount,
      sellerEarning: split.sellerEarning,

      /*
       * Snapshotted for the same reason the commission rate is: a payout run
       * over this order next month has to reach the same answer it reaches
       * today, whatever the coupon has since become.
       */
      discountAmount: split.discountAmount,
      discountFundedBy: split.discountFundedBy,
    };
  });

  const itemsTotal = round2(
    lines.reduce((sum, l) => sum + l.price * l.quantity, 0)
  );
  const discountTotal = round2(
    orderItems.reduce((sum, i) => sum + (i.discountAmount || 0), 0)
  );

  return { orderItems, itemsTotal, discountTotal, coupon, couponError };
};

/**
 * Spend one use of a coupon, once the order is actually paid for.
 *
 * WHY NOT AT CHECKOUT
 *   A basket that is priced and abandoned would otherwise burn a use - the
 *   campaign runs out because people looked at it, and a real customer loses a
 *   discount to somebody who never bought anything.
 *
 * Written as one atomic update so two orders paid at the same moment cannot
 * both read a count of 9 and both write 10.
 */
const markCouponUsed = async (code, customerId, session) => {
  if (!code) return;

  const upper = String(code).trim().toUpperCase();

  // Bump this customer's own tally, or start one.
  const bumped = await Coupon.updateOne(
    { code: upper, 'usedBy.customerId': customerId },
    { $inc: { usedCount: 1, 'usedBy.$.count': 1 } },
    { session: session || undefined }
  );

  if (!bumped.matchedCount) {
    await Coupon.updateOne(
      { code: upper },
      {
        $inc: { usedCount: 1 },
        $push: { usedBy: { customerId, count: 1 } },
      },
      { session: session || undefined }
    );
  }
};

module.exports = { priceOrder, markCouponUsed };
