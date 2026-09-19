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
// A reason typed by a seller or a customer and a product name typed by a seller
// go into HTML mail: text, never markup.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The words each side reads after a cancellation - see cancelOrderFor. */
const tellEveryone = async (order, { by, sellerId, affected, refundAmount, refundQueued, reason }) => {
  const notifier = require('./notify');
  const ref = esc(order.orderNumber || String(order._id).slice(-6));
  const names = affected.map((i) => i.name).filter(Boolean).map(esc);
  const what = names.length > 1 ? `${names[0]} +${names.length - 1} more` : names[0] || 'your order';
  const paidOnline = order.paymentMethod === 'razorpay' && ['paid', 'refunded'].includes(order.paymentStatus);
  const money = `₹${Number(refundAmount || 0).toLocaleString('en-IN')}`;
  const refundLine = !paidOnline
    ? 'Nothing was charged.'
    : refundQueued
      ? `Your refund of ${money} is queued and goes out within two working days; we mail you the moment it is raised.`
      : `Your refund of ${money} has been raised and reaches the way you paid in 5-7 working days.`;
  const who = { seller: 'the seller', admin: 'ShopMaster Pro', platform: 'ShopMaster Pro' }[by] || 'the seller';
  const why = reason ? ` Reason: ${esc(String(reason).replace(/^"|"$/g, ''))}` : '';
  const customerId = order.customerId?._id || order.customerId;

  if (by === 'customer') {
    // Their own action: a confirmation, and the seller(s) told the stock is back.
    await notifier.notify({ userId: customerId, role: 'customer', category: 'orders', title: `Cancelled · ${ref}`, body: `${what}. ${refundLine}`, url: `/orders/${order._id}`, tag: `cancelled-${order._id}`, mail: { subject: `Cancelled · ${ref} · ShopMaster Pro`, text: `Your order ${ref} (${what}) is cancelled as you asked. ${refundLine}`, html: `<p>Your order <strong>${ref}</strong> (${what}) is cancelled as you asked.</p><p>${refundLine}</p>` } });
    const sellers = [...new Set(affected.map((i) => String(i.sellerId)))];
    for (const sid of sellers) {
      await notifier.notify({ userId: sid, role: 'seller', category: 'orders', title: `Customer cancelled · ${ref}`, body: `${what}.${why} Stock is counted back in; nothing to pack.`, url: `/seller/orders/${order._id}`, tag: `cancelled-seller-${order._id}-${sid}`, mail: { subject: `Customer cancelled · ${ref}`, text: `The customer cancelled ${ref} (${what}).${why} Stock is counted back in; nothing to pack.`, html: `<p>The customer cancelled <strong>${ref}</strong> (${what}).${why}</p><p>Stock is counted back in; nothing to pack.</p>` } });
    }
    return;
  }
  // Cancelled ON the customer: they read who, why and where the money is.
  await notifier.notify({ userId: customerId, role: 'customer', category: 'orders', title: `Cancelled by ${who} · ${ref}`, body: `${what}.${why} ${refundLine}`, url: `/orders/${order._id}`, tag: `cancelled-${order._id}`, mail: { subject: `Your order ${ref} was cancelled · ShopMaster Pro`, text: `${what} on order ${ref} was cancelled by ${who}.${why}

${refundLine}

We are sorry about this. If you need anything, reply to this mail.`, html: `<p><strong>${what}</strong> on order <strong>${ref}</strong> was cancelled by ${who}.${why}</p><p>${refundLine}</p><p>We are sorry about this. If you need anything, reply to this mail.</p>` } });
  if (by === 'admin' && sellerId) {
    await notifier.notify({ userId: sellerId, role: 'seller', category: 'orders', title: `Cancelled by ShopMaster Pro · ${ref}`, body: `${what}.${why} Stock is counted back in.`, url: `/seller/orders/${order._id}`, tag: `cancelled-seller-${order._id}-${sellerId}` });
  }
};

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
  let refundQueued = false;

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
      /*
       * The gateway would not raise the refund. Until 19 Sep 2026 this refused
       * the cancellation too - and the first live test showed why that was
       * wrong: Razorpay answers "not enough balance" for every refund until the
       * first settlements land, so on day one no customer could cancel an
       * unshipped order. The cancel now goes through and the refund is owed:
       * marked `queued`, retried every two hours (utils/refundQueue), the admin
       * told in Razorpay's own words. Only a partial (seller-side) cancel keeps
       * the old refusal - a queued partial refund on a live basket is a ledger
       * nobody can read.
       *
       * (The SDK rejects with { error: { description } } and no .message -
       * logging .message alone printed "undefined".)
       */
      const rq = require('./refundQueue');
      const why = rq.describe(refundErr);
      console.error('Refund could not start for order', order.orderNumber, '-', why);
      if (isPartial) {
        return { ok: false, status: 500, message: 'The refund could not be started, so the order has been left alone. Your payment is safe - please try again shortly.' };
      }
      rq.queue(order, refundAmount, refundErr);
      refundQueued = true;
      setImmediate(() => require('./notify').notifyAdmins({ category: 'orders', title: `Refund queued · ${order.orderNumber} · ₹${refundAmount}`, body: `Cancelled; the refund could not be raised yet. Razorpay: ${String(why).slice(0, 220)}`, url: `/admin/orders/${order._id}`, tag: `refund-queued-${order._id}` }).catch(() => {}));
    }
  }

  // ---- now it is safe to cancel -------------------------------------------
  await releaseCouponUse(order);

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

  // The rulebook's one charge: a seller cancelling an order they had accepted,
  // beyond the monthly allowance. Customer- and platform-caused cancellations
  // never reach it. After the save, so the count includes this one.
  if (by === 'seller' && sellerId) {
    const { chargeForSellerCancel } = require('./sellerCharges');
    const { charged } = await chargeForSellerCancel(order, sellerId, { by });
    if (charged) await order.save();
  }

  /*
   * Everyone who did NOT press the button hears about it (20 Sep 2026 - the
   * first live seller-cancel showed the dialog promising "the customer is
   * told why" while nothing told them). Amazon mails a cancellation from
   * whichever side it came; Flipkart tells the seller the customer cancelled.
   * Bell + mail through utils/notify, never in the way of the response.
   */
  setImmediate(() => tellEveryone(order, { by, sellerId, affected, refundAmount, refundQueued, reason }).catch((e) => console.error('cancel notifications failed:', e.message)));

  return {
    ok: true,
    refundQueued,
    message: refundQueued
      ? `Order cancelled. Your refund of ₹${refundAmount} is queued and goes out within two working days - we will mail you the moment it is raised.`
      : isPartial
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

/**
 * Give a coupon use back when the order it was spent on is called off.
 *
 * This is the half that makes counting a use early fair. A COD order spends the
 * use the moment it is placed, so that one customer cannot place five orders on
 * a one-per-person code - which is only reasonable if cancelling hands it back.
 *
 * Floored at zero: a count that goes negative would let a finished campaign
 * quietly reopen.
 */
const releaseCouponUse = async (order) => {
  if (!order?.couponCode) return;

  try {
    const Coupon = require('../models/Coupon');
    const code = String(order.couponCode).trim().toUpperCase();

    await Coupon.updateOne(
      { code, usedCount: { $gt: 0 } },
      { $inc: { usedCount: -1 } }
    );
    await Coupon.updateOne(
      { code, usedBy: { $elemMatch: { customerId: order.customerId, count: { $gt: 0 } } } },
      { $inc: { 'usedBy.$.count': -1 } }
    );
  } catch (err) {
    // Never fail a cancellation over this. The refund has already been raised;
    // a coupon count that is one too high is a far smaller problem than an
    // order stuck half-cancelled.
    console.error('Could not release coupon use for', order.orderNumber, '-', err.message);
  }
};


/**
 * Which lines the customer may still cancel one at a time.
 *
 * Same rule as the whole order - pending or processing, nothing shipped - and
 * a line already cancelled cannot be cancelled again. Sent with the order so
 * the page draws a Cancel on exactly the lines the endpoint will accept; the
 * page used to decide for itself and offered it on shipped parcels.
 *
 * @returns {string[]} item ids
 */
const cancellableItemIds = (order) =>
  CANCELLABLE.includes(order.status)
    ? (order.items || [])
        .filter((item) => item.status !== 'cancelled')
        .map((item) => String(item._id))
    : [];

module.exports = { cancellableItemIds, cancelOrderFor, CANCELLABLE, canCancelOrder, releaseCouponUse };
