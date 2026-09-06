// Module object, not destructured: a destructured import captures the function
// at load time, which makes it impossible to stand in front of - the same
// late-binding note that already sits on the Shiprocket import.
const inventory = require('../controllers/inventoryController');
const refunds = require('./refund');

/**
 * Cancelling an order, whoever is doing it.
 *
 * WHY THIS IS SHARED
 *   Only the CUSTOMER could cancel. A seller who found an item out of stock had
 *   no way to say so - their only button cancelled the courier booking, which
 *   leaves a paid order sitting there forever. An admin had nothing at all, and
 *   no orders screen to do it from.
 *
 *   Every marketplace lets all three cancel, and for good reasons that are not
 *   interchangeable: a customer changed their mind, a seller cannot supply, the
 *   platform stepped in because the seller never dispatched. Writing that three
 *   times would give three subtly different refunds, which is how money goes
 *   missing.
 *
 * THE ORDER OF OPERATIONS MATTERS
 *   The refund is attempted BEFORE anything is marked cancelled, and a failed
 *   refund aborts the whole thing. The alternative - cancel first, refund after
 *   - produces an order that says "cancelled" while the customer's money is
 *   still gone, and nothing left in the system to retry from.
 */

/** Only these can still be stopped; a shipped parcel is a return, not a cancel. */
const CANCELLABLE = ['pending', 'processing'];

/**
 * @param {object} order    a Mongoose order document (not lean)
 * @param {object} opts
 * @param {'customer'|'seller'|'admin'} opts.by  who is cancelling
 * @param {string} opts.actorId    the user id, for the inventory audit trail
 * @param {string} [opts.reason]   free text, kept on the order
 * @param {string} [opts.sellerId] when a SELLER cancels: only their own lines
 * @returns {Promise<{ok: boolean, status?: number, message: string}>}
 */
const cancelOrderFor = async (order, { by, actorId, reason, sellerId }) => {
  if (!CANCELLABLE.includes(order.status)) {
    return {
      ok: false,
      status: 400,
      message:
        order.status === 'cancelled'
          ? 'This order is already cancelled'
          : `An order that is ${order.status} cannot be cancelled`,
    };
  }

  // COD that has been collected is money already taken at the door. There is
  // nothing to refund through us, so it has to be a return.
  if (order.paymentMethod === 'cod' && order.paymentStatus === 'paid') {
    return {
      ok: false,
      status: 400,
      message:
        'This COD order has been delivered and the cash collected, so it cannot be cancelled. Use a return instead.',
    };
  }

  /** The lines this actor is allowed to cancel. */
  const mine = (item) =>
    !sellerId || String(item.sellerId) === String(sellerId);

  const affected = order.items.filter((i) => i.status === 'active' && mine(i));
  if (!affected.length) {
    return { ok: false, status: 400, message: 'Nothing left to cancel here' };
  }

  // A seller cancelling their part of a shared basket must not refund the whole
  // basket - the rest of it is still being delivered by someone else.
  const isPartial =
    Boolean(sellerId) && affected.length < order.items.filter((i) => i.status === 'active').length;

  const refundAmount = isPartial
    ? affected.reduce((sum, i) => sum + i.price * i.quantity, 0)
    : order.totalAmount;

  // ---- refund first, and abort if it fails --------------------------------
  if (order.paymentStatus === 'paid' && order.paymentMethod === 'razorpay') {
    if (!order.razorpayPaymentId) {
      return {
        ok: false,
        status: 500,
        message:
          'This order is marked paid but carries no payment reference, so a refund cannot be raised. Please check it by hand before cancelling.',
      };
    }

    try {
      // Called through the module object, not a destructured reference, so the
      // gateway stays a replaceable boundary - see utils/refund.js.
      const refund = await refunds.refundPayment(
        order.razorpayPaymentId,
        refundAmount
      );

      order.refundId = refund.id;
      order.refundStatus = 'processing';
      order.refundAmount = refundAmount;
      order.refundedAt = new Date();
      // Only a whole-order refund settles the payment. A partial one leaves the
      // rest of the basket still paid for.
      if (!isPartial) order.paymentStatus = 'refunded';
    } catch (refundErr) {
      console.error('Refund failed for order', order.orderNumber, '-', refundErr.message);
      return {
        // 500 rather than 502: the existing contract, and the frontend only
        // shows the message. Not worth churning for a more precise code.
        ok: false,
        status: 500,
        message:
          'The refund could not be started, so the order has been left alone. Your payment is safe - please try again shortly.',
      };
    }
  }

  // ---- now it is safe to cancel -------------------------------------------
  for (const item of affected) {
    await inventory.applyInventoryChange({
      productId: item.productId,
      quantity: item.quantity,
      type: 'return',
      orderId: order._id,
      performedBy: actorId,
    });
    item.status = 'cancelled';
  }

  // order.status is DERIVED from the fulfilments on save, so these are what to
  // set - writing order.status directly would simply be overwritten.
  order.fulfilments.forEach((f) => {
    if (sellerId && String(f.sellerId) !== String(sellerId)) return;
    if (!['delivered', 'returned'].includes(f.status)) f.status = 'cancelled';
  });

  order.cancelledBy = by;
  order.cancelledAt = new Date();
  if (reason) order.cancellationReason = String(reason).slice(0, 500);

  // totalAmount is deliberately preserved: cancelled orders stay out of revenue
  // through paymentStatus, not by erasing their financial history.
  await order.save();

  return {
    ok: true,
    message: isPartial
      ? 'Your items on this order have been cancelled and refunded'
      : 'Order cancelled',
  };
};


/**
 * Whether a customer may still stop this order - the SAME question cancelOrderFor
 * answers, asked before the button is drawn.
 *
 * It exists because two screens were re-deriving it and getting it wrong. The
 * orders list offered "Cancel" on anything not yet delivered, including a
 * shipped parcel: the customer pressed it, the API refused with a 400, and all
 * they saw was a red error. A button that cannot work is worse than no button,
 * because it also tells them cancelling was possible and they missed it.
 *
 * One rule, read by the page and enforced by the endpoint, so the two can no
 * longer disagree.
 */
const canCancelOrder = (order) =>
  Boolean(order) &&
  CANCELLABLE.includes(order.status) &&
  !(order.paymentMethod === 'cod' && order.paymentStatus === 'paid');

module.exports = { cancelOrderFor, CANCELLABLE, canCancelOrder };
