const Coupon = require('../models/Coupon');
const { getRatesBySeller } = require('./commission');
const { splitDiscountedLine, round2, effectivePrice } = require('./discount');
const { evaluateCoupon } = require('./applyCoupon');
const { modesForProducts } = require('./returnPolicy');

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
/** Legal name, business address and GST standing per seller, as they stand now - stamped on the line. */
const sellersOfRecord = async (sellerIds, session) => {
  const Seller = require('../models/Seller');
  const unique = [...new Set(sellerIds.map(String))];
  let q = Seller.find({ userId: { $in: unique } }).select('userId businessName application.legalName application.gstin application.gstMode application.enrolmentNumber gstNumber pickupAddress');
  if (session) q = q.session(session);
  let docs = [];
  try {
    docs = await q.lean();
  } catch (err) {
    console.error('sellersOfRecord failed - lines will read the seller live:', err.message);
    return new Map();
  }
  return new Map(docs.map((sd) => {
    const a = sd.application || {};
    const gstin = a.gstin || sd.gstNumber || '';
    const pa = sd.pickupAddress || {};
    return [String(sd.userId), { legalName: a.legalName || sd.businessName || '', address: [pa.address1, pa.address2, [pa.city, pa.state, pa.pincode].filter(Boolean).join(' ')].filter(Boolean), gstin, enrolled: !gstin && a.gstMode === 'enrolment' ? a.enrolmentNumber || '' : '' }];
  }));
};

const priceOrder = async ({ items, couponCode, customerId, session }) => {
  const lines = items.map((item) => ({
    productId: item.productId._id,
    name: item.productId.name,
    quantity: item.quantity,

    /*
     * The price in force RIGHT NOW, not the one stamped on the cart line when
     * the item was added. A sale that started or ended in between has to be
     * honoured either way: charging a price the shop is no longer offering is
     * wrong in one direction, and charging above the listed price is wrong in
     * the more serious one.
     */
    price: effectivePrice(item.productId).price || item.price,
    sellerId: item.productId.sellerId,
    // For the tax invoice (utils/invoice): empty unless a registered seller set them.
    hsn: item.productId.hsn || '',
    // The ready-to-ship promise as it stood (utils/dispatch); null = the rulebook's number then.
    processingDays: Number.isInteger(item.productId.processingDays) ? item.productId.processingDays : null,
    gstRate: typeof item.productId.gstRate === 'number' ? item.productId.gstRate : null,
  }));

  const rates = await getRatesBySeller(
    lines.map((l) => l.sellerId),
    session
  );

  // The return promise per line, read once for the basket (utils/returnPolicy).
  const modes = await modesForProducts(items.map((item) => item.productId), { session });
  // The seller of record per line, frozen for the invoice (models/Order soldBy).
  const soldBy = await sellersOfRecord(lines.map((l) => l.sellerId), session);

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
      returnMode: modes.get(String(line.productId)) ?? null,
      soldBy: soldBy.get(String(line.sellerId)) || undefined,
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
