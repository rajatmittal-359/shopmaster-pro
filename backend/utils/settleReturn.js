const refunds = require('./refund');
// Held as a module object rather than destructured so tests can replace it -
// a destructured copy binds the real function forever. Same reason as
// utils/cancelOrder.js.
const inventory = require('../controllers/inventoryController');

/**
 * Closing out a return: the goods are back, or the return is refused.
 *
 * WHY THE MONEY MOVES HERE AND NOWHERE ELSE
 *   A return used to refund the customer the moment they asked, and count the
 *   goods back in as sellable stock at the same moment. Nothing was collected,
 *   nobody looked at the item, and a customer could keep both it and the money
 *   while the shop's stock figure claimed the item was on the shelf.
 *
 *   Flipkart's own policy is the model: "the refund will be processed once the
 *   returned product has been received by the seller." Asking is a claim.
 *   Receiving it back is the fact, and facts are what move money.
 *
 * WHY A SELLER MAY REFUSE, BUT NOT SILENTLY
 *   A seller who gets back an empty box, or a different item, has to be able to
 *   say so - otherwise the honest direction of this fix just moves the fraud to
 *   the other side. But a refusal needs a reason, kept on the order, because a
 *   seller who refuses everything is a problem the platform has to be able to
 *   see. The customer can then dispute it, and an admin decides.
 */

/** Return stages that are still open and can still be settled. */
const OPEN_STAGES = ['requested', 'picked'];

/**
 * The parcels this actor is allowed to settle. A seller owns exactly one
 * fulfilment in an order and may never touch another seller's.
 */
const settleable = (order, sellerId) =>
  (order.fulfilments || []).filter(
    (f) =>
      OPEN_STAGES.includes(f.returnStage) &&
      (!sellerId || String(f.sellerId) === String(sellerId))
  );

/**
 * Mark returned goods as back, and refund for them.
 *
 * @param {object} order   a Mongoose order document
 * @param {object} opts
 * @param {'seller'|'admin'} opts.by
 * @param {string} opts.actorId          for the inventory audit trail
 * @param {string} [opts.sellerId]       when a SELLER settles: only their parcel
 * @param {Array}  [opts.parcels]        settle THESE, rather than the open returns
 * @param {boolean} [opts.restock=true]  whether the goods are genuinely back
 * @returns {Promise<{ok: boolean, status?: number, message: string}>}
 */
const receiveReturn = async (order, { by, actorId, sellerId, parcels: given, restock = true }) => {
  /*
   * `given` is how an ADMIN settling a dispute gets in.
   *
   * A dispute decided for the customer is a refund, but the parcel it is about
   * is rarely sitting at 'requested' or 'picked' - a delivery dispute has no
   * return on it at all, and a refused-return dispute reads 'rejected'. Left
   * to settleable() the admin's call found nothing to settle and refunded
   * nobody, silently, because only a 500 was surfaced. That was the bug.
   *
   * `restock` is separate because the two shapes of dispute want opposite
   * answers, and neither is guessable from the record:
   *   "the parcel never arrived" - the goods are gone, stock must NOT go back
   *   "the seller refused my return" - the goods are with the seller, it must
   * Only the person deciding the dispute knows which, so they are asked.
   */
  const parcels = given && given.length ? given : settleable(order, sellerId);
  if (!parcels.length) {
    return { ok: false, status: 400, message: 'There is no open return here' };
  }

  /*
   * A return settles one of two ways, and the CUSTOMER chose which when they
   * opened it - see Order.returnResolution.
   *
   *   refund       money goes back, the goods count back in as stock, the sale
   *                is reversed.
   *   replacement  no money moves at all. The seller owes a working item, and
   *                the exchange is not finished until that item arrives.
   *
   * A return opened before exchanges existed has no resolution recorded. Those
   * customers were promised a refund, so a missing value means refund - the one
   * case where guessing is safe, because it is what they were told.
   */
  const wantsReplacement = (f) => f.returnResolution === 'replacement';
  const replacementParcels = parcels.filter(wantsReplacement);
  const refundParcels = parcels.filter((f) => !wantsReplacement(f));

  const linesOf = (ps) => {
    const owners = ps.map((f) => String(f.sellerId));
    return order.items.filter(
      (i) => i.status !== 'cancelled' && owners.includes(String(i.sellerId))
    );
  };

  const lines = linesOf(refundParcels);
  const replacementLines = linesOf(replacementParcels);

  if (
    (refundParcels.length && !lines.length) ||
    (replacementParcels.length && !replacementLines.length)
  ) {
    return { ok: false, status: 400, message: 'That return has no items on it' };
  }

  /*
   * A seller settling their own parcel in a shared basket refunds only their
   * lines. Refunding order.totalAmount there would hand back another seller's
   * money for goods still sitting with the customer.
   *
   * Lines being exchanged are NOT part of this sum. The customer is keeping
   * that purchase - they asked for the item, not the money - so refunding it
   * would pay them out and still owe them a parcel.
   */
  const liveLines = order.items.filter((i) => i.status !== 'cancelled');
  const isPartial = lines.length < liveLines.length;

  const refundAmount = isPartial
    ? lines.reduce((sum, i) => sum + i.price * i.quantity, 0)
    : order.totalAmount;

  /*
   * Whether money actually moved.
   *
   * Only a card or UPI payment can be sent back down the wire it came up. On a
   * COD order the customer handed cash to a rider, there is nothing to reverse,
   * and the refund is a bank transfer somebody has to make by hand - which is
   * exactly what the returns page promises: "we collect your bank details and
   * transfer the refund there".
   *
   * This used to answer "the refund has been raised" either way, which told a
   * seller settling a COD return that the matter was closed when the customer
   * was still owed every rupee, with nobody assigned to send it.
   */
  let refundRaised = false;

  // ---- refund first, and abort if it fails --------------------------------
  // Same order as a cancellation: goods marked back with no refund raised is
  // the one state with nothing left to retry from.
  if (
    refundParcels.length &&
    order.paymentStatus === 'paid' &&
    order.paymentMethod === 'razorpay'
  ) {
    if (!order.razorpayPaymentId) {
      return {
        ok: false,
        status: 500,
        message:
          'This order is marked paid but carries no payment reference, so a refund cannot be raised. Please check it by hand.',
      };
    }

    try {
      const refund = await refunds.refundPayment(order.razorpayPaymentId, refundAmount);

      order.refundId = refund.id;
      order.refundStatus = 'processing';
      order.refundAmount = refundAmount;
      order.refundedAt = new Date();
      if (!isPartial) order.paymentStatus = 'refunded';
      refundRaised = true;
    } catch (refundErr) {
      console.error('Return refund failed for', order.orderNumber, '-', refundErr.message);
      return {
        ok: false,
        status: 500,
        message:
          'The refund could not be started, so nothing has been changed. Please try again shortly.',
      };
    }
  }

  /* ---- the goods are genuinely back, so now the stock is real -------------
   *
   * REFUNDED lines only. An item coming back to be EXCHANGED is coming back
   * because something is wrong with it, so counting it in as sellable would put
   * a broken piece on the shelf - and the replacement going out takes a good
   * one off it, so the two would cancel out and the shop's stock figure would
   * never notice it had lost an item.
   *
   * A seller who inspects it and finds it perfectly sellable can put it back
   * with an ordinary stock adjustment, which is a decision made by somebody who
   * has the thing in their hand rather than by this function.
   */
  if (restock) {
    for (const item of lines) {
      await inventory.applyInventoryChange({
        productId: item.productId,
        quantity: item.quantity,
        type: 'return',
        orderId: order._id,
        performedBy: actorId,
      });
    }
  }

  const now = new Date();

  for (const f of refundParcels) {
    f.returnStage = 'received';
    f.status = 'returned';
    f.returnedAt = now;
  }

  /*
   * An exchange is only HALF done here. The faulty item is back; the customer
   * still has neither their goods nor their money, so the parcel is not
   * 'returned' - the sale stands and a replacement is owed.
   *
   * 'processing' is the honest word for that: the seller has something to pack.
   * It also means deriveStatus pulls the whole order back to processing, so the
   * customer's order page stops saying "delivered" about an item they posted
   * back last week.
   */
  for (const f of replacementParcels) {
    f.returnStage = 'received';
    f.replacementStage = 'due';
    f.replacementDueAt = now;
    f.status = 'processing';
  }

  await order.save();

  if (!refundParcels.length) {
    return {
      ok: true,
      message:
        'Item received. Send the replacement when it is packed - no refund is due on this one.',
    };
  }

  if (!refundRaised) {
    /*
     * Nothing was sent back automatically. Say so plainly and say who has to
     * act, rather than reporting a success that leaves the customer unpaid.
     */
    const owed = isPartial ? refundAmount : order.totalAmount;
    return {
      ok: true,
      refundRaised: false,
      message:
        order.paymentMethod === 'cod'
          ? `Recorded. This was a cash-on-delivery order, so nothing could be sent back automatically - RS ${owed} has to be transferred to the customer's bank account by hand.`
          : `Recorded. No online payment was found on this order, so RS ${owed} has to be returned to the customer by hand.`,
    };
  }

  return {
    ok: true,
    refundRaised: true,
    message:
      by === 'admin'
        ? 'Return accepted and the refund has been raised'
        : 'Return received. The refund is on its way to the customer.',
  };
};

/**
 * Refuse a return: what came back was not what went out, or nothing came back.
 *
 * No money moves and no stock moves - the sale stands. The reason is kept so a
 * customer can dispute it and an admin has something to read.
 */
const rejectReturn = async (order, { actorId, sellerId, reason }) => {
  const text = String(reason || '').trim();
  if (text.length < 3) {
    return {
      ok: false,
      status: 400,
      message:
        'Please say why you are refusing it. The customer is shown this, and can dispute it.',
    };
  }

  const parcels = settleable(order, sellerId);
  if (!parcels.length) {
    return { ok: false, status: 400, message: 'There is no open return here' };
  }

  for (const f of parcels) {
    f.returnStage = 'rejected';
    f.returnNote = text;
    // status stays 'delivered': the sale stands and the goods are the
    // customer's. Nothing about the delivery has changed.
  }

  await order.save();

  return {
    ok: true,
    message: 'Return refused. The customer has been told why and can dispute it.',
    actorId,
  };
};

module.exports = { receiveReturn, rejectReturn, OPEN_STAGES, settleable };
