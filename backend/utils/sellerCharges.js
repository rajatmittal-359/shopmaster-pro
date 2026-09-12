const Order = require('../models/Order');
const SellerCharge = require('../models/SellerCharge');
const rules = require('../config/sellerRules');

const DAY = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * The one rule with money attached: a seller who cancels an order they had
 * accepted pays for it - after a monthly allowance, and never when the
 * customer or the platform asked for the cancellation.
 *
 * Called from cancelOrderFor after the order is saved. Counts this seller's
 * seller-caused cancellations in the last 30 days (this one included); the
 * first `cancelFreePer30Days` cost nothing, every one after costs
 * `cancelPenalty`, written to the SellerCharge ledger with `payoutId: null`
 * so the next payout can claim it exactly once. The amount is also stamped on
 * the parcel so the seller sees it on the order card, next to the reason.
 *
 * @returns {{ charged: number, countThisMonth: number }}
 */
const chargeForSellerCancel = async (order, sellerId, { by }) => {
  if (by !== 'seller') return { charged: 0, countThisMonth: 0 };

  const since = new Date(Date.now() - 30 * DAY);
  const countThisMonth = await Order.countDocuments({
    'items.sellerId': sellerId,
    cancelledBy: 'seller',
    cancelledAt: { $gte: since },
  });

  if (countThisMonth <= rules.cancelFreePer30Days) return { charged: 0, countThisMonth };

  const amount = rules.cancelPenalty;
  await SellerCharge.create({
    sellerId,
    orderId: order._id,
    orderNumber: order.orderNumber || null,
    kind: 'seller_cancel',
    amount,
    note: `Cancellation ${countThisMonth} in 30 days; ${rules.cancelFreePer30Days} are free`,
    payoutId: null,
  });

  const parcel = (order.fulfilments || []).find((f) => String(f.sellerId) === String(sellerId));
  if (parcel) parcel.cancelPenalty = amount;

  return { charged: amount, countThisMonth };
};

/**
 * Nets this seller's unclaimed charges off a payout that has just been
 * totalled, and claims them so no later payout can take them again.
 *
 * A payout never goes below zero: at INR 50 a charge, a remainder larger
 * than a whole payout means a shop that sells almost nothing and cancels a
 * lot - a conversation for the admin, not a debt to chase. The written-off
 * part is visible in `deductions` versus the charges' own amounts.
 */
const applyChargesToPayout = async (payout, deps = {}) => {
  const findUnclaimed =
    deps.findUnclaimed ||
    (async () => SellerCharge.find({ sellerId: payout.sellerId, payoutId: null }).lean());
  const claim =
    deps.claim ||
    (async (ids, payoutId) =>
      SellerCharge.updateMany({ _id: { $in: ids } }, { $set: { payoutId, claimedAt: new Date() } }));

  const charges = await findUnclaimed();
  if (!charges.length) return payout;

  const owed = round2(charges.reduce((sum, c) => sum + (c.amount || 0), 0));
  const taken = Math.min(owed, payout.netPayable);
  payout.deductions = round2(taken);
  payout.netPayable = round2(payout.netPayable - taken);
  await claim(charges.map((c) => c._id), payout._id);
  return payout;
};

module.exports = { chargeForSellerCancel, applyChargesToPayout };
