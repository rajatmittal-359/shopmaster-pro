/**
 * What each seller is owed, and settling it.
 *
 * Commission is already snapshotted onto every order line at order time
 * (utils/commission.js), so this module never recalculates money - it only
 * sums what was recorded and records what has been paid.
 *
 * WHEN A SALE BECOMES PAYABLE
 *   Not at payment. A customer can still return a delivered order, and paying
 *   a seller for goods that come back means clawing it off the next payout.
 *   So a line is payable only once:
 *
 *     the order was paid for            paymentStatus === 'paid'
 *     the line was not cancelled        item.status !== 'cancelled'
 *     THIS SELLER'S parcel arrived      their fulfilment is 'delivered'
 *     the return window has closed      that fulfilment's deliveredAt is older
 *                                       than RETURN_WINDOW_DAYS
 *     it has not been paid already      item.payoutId === null
 *
 *   Delivery is read PER SELLER, from the order's fulfilments - never from the
 *   order's own status. In a two-seller order one seller delivering says
 *   nothing about the other, and paying on the order-level flag meant a seller
 *   could be settled for a parcel they had not sent.
 *
 *   RETURN_WINDOW_DAYS matches the 7 days promised to customers in the
 *   product structured data. If that promise changes, this changes with it.
 *
 * HOW DOUBLE-PAYMENT IS PREVENTED
 *   A payout claims lines by stamping its id into `items.$[].payoutId`, and
 *   only where that field is still null. Totals are then computed from the
 *   lines that were ACTUALLY claimed, not from the ones the query expected.
 *   Two concurrent runs therefore split the lines between them rather than
 *   both paying the same sale.
 */
const mongoose = require('mongoose');

const Order = require('../models/Order');
const Seller = require('../models/Seller');
const Payout = require('../models/Payout');

/** Days a customer has to start a return; matches the published policy. */
const RETURN_WINDOW_DAYS = 7;

const round2 = (n) => Math.round(n * 100) / 100;

/** The moment before which a delivery is settled enough to pay out. */
const settledBefore = () =>
  new Date(Date.now() - RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);

/**
 * Matches orders that may contain payable lines.
 * The per-LINE conditions still have to be applied afterwards, because an
 * order matches if ANY of its lines does.
 */
const payableOrderFilter = () => ({
  paymentStatus: 'paid',
  // At least one seller's parcel is delivered and out of its return window.
  // Which seller that is gets settled per line by isPayableLine below.
  fulfilments: {
    $elemMatch: { status: 'delivered', deliveredAt: { $ne: null, $lte: settledBefore() } },
  },
  'items.payoutId': null,
});

/** This seller's parcel in an order, if they have one. */
const fulfilmentOf = (fulfilments, sellerId) =>
  (fulfilments || []).find((f) => String(f.sellerId) === String(sellerId));

/** When this seller's parcel cleared its return window, or null. */
const settledDeliveryAt = (fulfilments, sellerId) => {
  const f = fulfilmentOf(fulfilments, sellerId);
  if (!f || f.status !== 'delivered' || !f.deliveredAt) return null;
  return new Date(f.deliveredAt) <= settledBefore() ? new Date(f.deliveredAt) : null;
};

/**
 * True when this specific line is owed to its seller.
 *
 * `fulfilments` is the parent order's fulfilment list: the line is only payable
 * once ITS OWN seller has delivered and that delivery has cleared the return
 * window. Passing no fulfilments means nothing is payable, which is the safe
 * default - it under-pays rather than over-pays.
 */
const isPayableLine = (item, sellerId, fulfilments = []) =>
  item.status !== 'cancelled' &&
  item.payoutId == null &&
  (!sellerId || String(item.sellerId) === String(sellerId)) &&
  settledDeliveryAt(fulfilments, item.sellerId) !== null;

/**
 * What every seller is currently owed.
 *
 * The platform's own shop is excluded: its takings are already in the
 * platform's account, so there is nobody to transfer them to.
 *
 * @param {ObjectId} [sellerId] restrict to one seller
 * @returns {Array<{sellerId, businessName, itemCount, grossSales, commission, netPayable, periodFrom, periodTo}>}
 */
const getPayableSummary = async (sellerId) => {
  const filter = payableOrderFilter();
  if (sellerId) filter['items.sellerId'] = sellerId;

  const orders = await Order.find(filter)
    .select('items fulfilments')
    .lean();

  const bySeller = new Map();

  for (const order of orders) {
    for (const item of order.items) {
      if (!isPayableLine(item, sellerId, order.fulfilments)) continue;

      // The period is this seller's own delivery date, not the order's: in a
      // split order the two sellers deliver on different days.
      const deliveredAt = settledDeliveryAt(order.fulfilments, item.sellerId);

      const key = String(item.sellerId);
      if (!bySeller.has(key)) {
        bySeller.set(key, {
          sellerId: item.sellerId,
          itemCount: 0,
          grossSales: 0,
          commission: 0,
          netPayable: 0,
          periodFrom: deliveredAt,
          periodTo: deliveredAt,
        });
      }

      const row = bySeller.get(key);
      row.itemCount += 1;
      row.grossSales += item.price * item.quantity;
      row.commission += item.commissionAmount || 0;
      row.netPayable += item.sellerEarning || 0;
      if (deliveredAt < row.periodFrom) row.periodFrom = deliveredAt;
      if (deliveredAt > row.periodTo) row.periodTo = deliveredAt;
    }
  }

  if (bySeller.size === 0) return [];

  // Attach business names and drop the platform's own shop.
  const profiles = await Seller.find({
    userId: { $in: [...bySeller.keys()].map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select('userId businessName isPlatformOwned bankDetails')
    .lean();

  const profileByUser = new Map(profiles.map((p) => [String(p.userId), p]));

  return [...bySeller.values()]
    .filter((row) => {
      const profile = profileByUser.get(String(row.sellerId));
      return profile && !profile.isPlatformOwned;
    })
    .map((row) => ({
      ...row,
      businessName: profileByUser.get(String(row.sellerId)).businessName,
      grossSales: round2(row.grossSales),
      commission: round2(row.commission),
      netPayable: round2(row.netPayable),
    }))
    .sort((a, b) => b.netPayable - a.netPayable);
};

/**
 * Settles everything currently owed to one seller.
 *
 * Order of operations matters:
 *   1. create the payout, so there is an id to stamp
 *   2. CLAIM the lines with a conditional write (payoutId still null)
 *   3. total up the lines that were actually claimed
 *   4. write those totals onto the payout
 *
 * Doing it this way means a concurrent run cannot claim the same line, and the
 * recorded totals can never describe money that was not actually claimed.
 *
 * @returns {{ok: true, payout}|{ok: false, reason: string}}
 */
const createPayoutForSeller = async (sellerId, adminId, session) => {
  const profile = await Seller.findOne({ userId: sellerId })
    .select('userId businessName isPlatformOwned bankDetails')
    .lean();

  if (!profile) return { ok: false, reason: 'No seller profile for that account' };
  if (profile.isPlatformOwned) {
    return {
      ok: false,
      reason: 'This is the platform\'s own shop - its takings are already in the platform account',
    };
  }

  // There is no point claiming sales for a transfer that cannot be made. Fail
  // here rather than creating a payout nobody can settle.
  const bank = profile.bankDetails || {};
  if (!bank.accountNumber || !bank.ifscCode || !bank.accountHolderName) {
    return {
      ok: false,
      reason: `${profile.businessName} has not provided bank details yet, so they cannot be paid`,
    };
  }

  const filter = { ...payableOrderFilter(), 'items.sellerId': sellerId };
  const candidates = await Order.find(filter).select('_id items fulfilments').lean();
  const orderIds = candidates
    .filter((o) => o.items.some((i) => isPayableLine(i, sellerId, o.fulfilments)))
    .map((o) => o._id);

  if (orderIds.length === 0) return { ok: false, reason: 'Nothing is payable for this seller' };

  // 1. The payout exists first, so its id can be stamped onto the lines.
  const created = await Payout.create(
    [
      {
        sellerId,
        businessName: profile.businessName,
        itemCount: 0,
        grossSales: 0,
        commission: 0,
        netPayable: 0,
        status: 'pending',
        createdBy: adminId,
      },
    ],
    session ? { session } : {}
  );
  const payout = created[0];

  // 2. Claim the lines. `payoutId: null` in the array filter is what makes a
  //    line claimable exactly once.
  await Order.updateMany(
    { _id: { $in: orderIds } },
    { $set: { 'items.$[line].payoutId': payout._id } },
    {
      arrayFilters: [
        {
          'line.sellerId': sellerId,
          'line.payoutId': null,
          'line.status': { $ne: 'cancelled' },
        },
      ],
      ...(session ? { session } : {}),
    }
  );

  // 3. Total up what was actually claimed, not what was expected.
  const claimedQuery = Order.find({ 'items.payoutId': payout._id })
    .select('items fulfilments')
    .lean();
  if (session) claimedQuery.session(session);
  const claimed = await claimedQuery;

  const totals = { itemCount: 0, grossSales: 0, commission: 0, netPayable: 0 };
  let periodFrom = null;
  let periodTo = null;

  for (const order of claimed) {
    for (const item of order.items) {
      if (String(item.payoutId) !== String(payout._id)) continue;
      totals.itemCount += 1;
      totals.grossSales += item.price * item.quantity;
      totals.commission += item.commissionAmount || 0;
      totals.netPayable += item.sellerEarning || 0;
      const deliveredAt =
        settledDeliveryAt(order.fulfilments, item.sellerId) || order.deliveredAt;
      if (!periodFrom || deliveredAt < periodFrom) periodFrom = deliveredAt;
      if (!periodTo || deliveredAt > periodTo) periodTo = deliveredAt;
    }
  }

  if (totals.itemCount === 0) {
    // A concurrent run took everything. Remove the empty payout rather than
    // leaving a zero-value record in the ledger.
    await Payout.deleteOne({ _id: payout._id }, session ? { session } : {});
    return { ok: false, reason: 'Nothing is payable for this seller' };
  }

  // 4. Record the money.
  payout.itemCount = totals.itemCount;
  payout.grossSales = round2(totals.grossSales);
  payout.commission = round2(totals.commission);
  payout.netPayable = round2(totals.netPayable);
  payout.periodFrom = periodFrom;
  payout.periodTo = periodTo;
  await payout.save(session ? { session } : {});

  return { ok: true, payout };
};

/**
 * Records that the transfer actually happened.
 *
 * A compare-and-set on `status: 'pending'` so a payout cannot be marked paid
 * twice, and so two admins clicking at once produce one settlement.
 */
const markPayoutPaid = async (payoutId, { reference, adminId, notes }) => {
  const claim = await Payout.updateOne(
    { _id: payoutId, status: 'pending' },
    {
      $set: {
        status: 'paid',
        reference: reference || null,
        notes: notes || null,
        settledBy: adminId,
        paidAt: new Date(),
      },
    }
  );

  if (claim.modifiedCount === 0) return { ok: false, reason: 'Payout is not pending' };
  return { ok: true, payout: await Payout.findById(payoutId).lean() };
};

/**
 * Marks a transfer as failed and RELEASES its lines, so the next payout run
 * picks them up again. Without the release the money would be stranded:
 * claimed by a payout that never paid.
 */
const markPayoutFailed = async (payoutId, { reason, adminId }) => {
  const claim = await Payout.updateOne(
    { _id: payoutId, status: 'pending' },
    {
      $set: {
        status: 'failed',
        failureReason: reason || 'Transfer failed',
        settledBy: adminId,
      },
    }
  );

  if (claim.modifiedCount === 0) return { ok: false, reason: 'Payout is not pending' };

  await Order.updateMany(
    { 'items.payoutId': payoutId },
    { $set: { 'items.$[line].payoutId': null } },
    { arrayFilters: [{ 'line.payoutId': payoutId }] }
  );

  return { ok: true, payout: await Payout.findById(payoutId).lean() };
};

module.exports = {
  RETURN_WINDOW_DAYS,
  getPayableSummary,
  createPayoutForSeller,
  markPayoutPaid,
  markPayoutFailed,
  settledBefore,
  payableOrderFilter,
  isPayableLine,
};
