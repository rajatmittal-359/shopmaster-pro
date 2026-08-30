/**
 * Inventory reservation for prepaid checkout.
 *
 * THE PROBLEM THIS SOLVES
 *   Creating a Razorpay order used to only READ stock to check it was
 *   sufficient. Nothing was held. Two customers could both pass that check on
 *   the last unit, both be charged, and only one could be fulfilled - leaving
 *   the other paid-but-cancelled and needing a manual refund. Safe, but a bad
 *   outcome. A hold prevents it instead of surviving it.
 *
 * THE INVARIANT
 *
 *     stock     = physical units on hand
 *     reserved  = units held for unpaid prepaid checkouts
 *     available = stock - reserved   <- all a new checkout may draw from
 *
 *   reserve  : reserved += qty                 (stock untouched)
 *   consume  : stock -= qty, reserved -= qty   (the hold becomes a sale)
 *   release  : reserved -= qty                 (stock untouched)
 *
 *   `stock` therefore falls exactly once per unit sold. Reserving and
 *   releasing never move it, so a double-decrement is not expressible.
 *
 * WHY NO INVENTORY LOG FOR A HOLD
 *   InventoryLog answers "what permanently changed sellable stock?". A hold
 *   changes nothing permanently - it is a promise that either becomes a sale
 *   or evaporates. Logging holds would fill the audit trail with events that
 *   net to zero and make a genuine sale harder to find. Only the sale is
 *   logged, exactly as before this phase.
 *
 * WHY NO SCHEDULER
 *   An expired hold only matters when somebody else wants those units. So the
 *   sweep runs at that exact moment, scoped to the one product being reserved.
 *   It is bounded work on a hot path that already writes to that document, and
 *   it needs no cron, no queue and no external service.
 */
const mongoose = require('mongoose');

const Product = require('../models/Product');
const Order = require('../models/Order');

/**
 * How long a hold survives without payment.
 *
 * Razorpay's own checkout window is around twelve minutes; fifteen leaves room
 * for a slow bank page without stranding stock for meaningfully longer.
 */
const RESERVATION_WINDOW_MS = 15 * 60 * 1000;

/** Units a fresh checkout may draw on: physical stock minus existing holds. */
const AVAILABLE = { $subtract: ['$stock', { $ifNull: ['$reserved', 0] }] };

const idOf = (value) => (value && value._id ? value._id : value);

/**
 * Releases holds that have run out of time on ONE product.
 *
 * Called immediately before a reservation attempt on that product, so a
 * customer is never told "unavailable" because of a hold that has already
 * expired. Returns how many orders were released.
 *
 * @param {ObjectId} productId
 * @param {object} [session]
 */
const releaseExpiredForProduct = async (productId, session) => {
  const query = Order.find({
    reservationStatus: 'held',
    reservationExpiresAt: { $lt: new Date() },
    'items.productId': productId,
  });
  if (session) query.session(session);

  const stale = await query;

  let released = 0;
  for (const order of stale) {
    if (await releaseReservation(order, session)) released++;
  }
  return released;
};

/**
 * Takes an all-or-nothing hold on every line in the basket.
 *
 * Each line is claimed with a single conditional update, so two callers racing
 * for the last unit cannot both succeed: the condition is evaluated by the
 * database at write time, not read beforehand by the caller.
 *
 * If any line cannot be held, every line already held by THIS call is handed
 * back before returning. A basket is never partially reserved.
 *
 * @param {Array} items    order lines, each with productId and quantity
 * @param {object} [session]
 * @returns {{ok: true, expiresAt: Date} | {ok: false, shortfall: {name, requested, available}}}
 */
const reserveForItems = async (items, session) => {
  const taken = [];

  for (const item of items) {
    const productId = idOf(item.productId);
    const quantity = item.quantity;

    // Hand back anything that has quietly expired before deciding this is a
    // genuine shortage.
    await releaseExpiredForProduct(productId, session);

    const claimed = await Product.findOneAndUpdate(
      {
        _id: productId,
        isActive: true,
        $expr: { $gte: [AVAILABLE, quantity] },
      },
      { $inc: { reserved: quantity } },
      { session, new: true }
    );

    if (!claimed) {
      // Undo this call's own holds. Inside a transaction the abort would also
      // do it; unwinding explicitly keeps the function correct on its own.
      for (const done of taken) {
        await Product.updateOne(
          { _id: done.productId, reserved: { $gte: done.quantity } },
          { $inc: { reserved: -done.quantity } },
          { session }
        );
      }

      const current = await Product.findById(productId).session(session || null);
      return {
        ok: false,
        shortfall: {
          name: item.name || (current && current.name) || 'item',
          requested: quantity,
          available: current ? Math.max(0, current.stock - (current.reserved || 0)) : 0,
        },
      };
    }

    taken.push({ productId, quantity });
  }

  return { ok: true, expiresAt: new Date(Date.now() + RESERVATION_WINDOW_MS) };
};

/**
 * Hands a hold back, making the units purchasable again.
 *
 * The order's status is moved FIRST with a compare-and-set. Only the caller
 * that wins that move touches `reserved`, so a payment-failed webhook racing an
 * expiry sweep cannot release the same units twice.
 *
 * @returns {boolean} true if this caller performed the release
 */
const releaseReservation = async (order, session) => {
  if (!order || order.reservationStatus !== 'held') return false;

  const claim = await Order.updateOne(
    { _id: order._id, reservationStatus: 'held' },
    { $set: { reservationStatus: 'released', reservationExpiresAt: null } },
    { session }
  );

  if (claim.modifiedCount === 0) return false; // another caller got there first

  for (const item of order.items) {
    if (item.status === 'cancelled') continue;
    await Product.updateOne(
      { _id: idOf(item.productId), reserved: { $gte: item.quantity } },
      { $inc: { reserved: -item.quantity } },
      { session }
    );
  }

  // Keep the in-memory document honest for any caller still holding it.
  order.reservationStatus = 'released';
  order.reservationExpiresAt = null;
  return true;
};

/** True when this order is still holding units it can convert into a sale. */
const holdsInventory = (order) => !!order && order.reservationStatus === 'held';

module.exports = {
  RESERVATION_WINDOW_MS,
  reserveForItems,
  releaseReservation,
  releaseExpiredForProduct,
  holdsInventory,
};
