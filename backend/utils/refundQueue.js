const Order = require('../models/Order');
const refunds = require('./refund');
const notifier = require('./notify');

/**
 * Refunds that could not start (19 Sep 2026).
 *
 * WHAT HAPPENED
 *   The first live ₹1 test payment was cancelled by the customer an hour
 *   later and Razorpay refused the refund: "Your account does not have
 *   enough balance" - a payment is not in the merchant's balance until it
 *   settles (T+2/T+3), and refunds are paid out of that balance. Before this
 *   file the cancel was refused too: a customer with an unshipped order and
 *   an honest reason was told to "try again shortly" because the PLATFORM's
 *   balance was short. That is the customer losing for the operator's cash
 *   flow, and every new shop meets it on day one.
 *
 * WHAT HAPPENS NOW
 *   The order is cancelled as asked (stock back, seller told). The refund is
 *   marked `queued` with its amount; the customer reads "refund queued, on
 *   its way within two working days"; the admin gets one bell with
 *   Razorpay's words (add funds, or wait for settlement). Every two hours
 *   this job tries each queued refund again; the day it goes through the
 *   order moves to `processing` (the refund.processed webhook then completes
 *   it, as for any other refund) and the customer is mailed. Still queued
 *   after three days: the admin is reminded daily.
 *
 * Amazon's shape: a cancellation is never held hostage to the refund rail;
 * "refund initiated" is a separate, later message.
 */
const REMIND_AFTER_DAYS = 3;

/** True when Razorpay's answer means "not now", not "never". */
const isBalanceError = (err) => /enough balance|insufficient/i.test(err?.error?.description || err?.message || '');
const describe = (err) => err?.error?.description || err?.message || String(err);

/** Mark an order's refund as owed but not yet raised. Saves nothing - the caller's save() carries it. */
const queue = (order, amount, err) => {
  order.refundStatus = 'queued';
  order.refundAmount = amount;
  order.refundId = null;
  order.refundQueuedAt = order.refundQueuedAt || new Date();
  order.refundLastError = String(describe(err)).slice(0, 300);
};

const customerMail = (order) => ({
  subject: `Refund of ₹${order.refundAmount} started · ${order.orderNumber}`,
  text: `Your refund of ₹${order.refundAmount} for order ${order.orderNumber} has been raised with the payment gateway. It reaches the way you paid in 5-7 working days.`,
  html: `<p>Your refund of <strong>₹${order.refundAmount}</strong> for order <strong>${order.orderNumber}</strong> has been raised with the payment gateway.</p><p>It reaches the way you paid in 5-7 working days.</p>`,
});

/**
 * Try every queued refund once. Returns counts for the job log.
 * @returns {Promise<{queued:number, raised:number, waiting:number, failed:number}>}
 */
const retryQueued = async ({ now = new Date() } = {}) => {
  const orders = await Order.find({ refundStatus: 'queued', razorpayPaymentId: { $ne: null } });
  let raised = 0;
  let waiting = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      const r = await refunds.refundPayment(order.razorpayPaymentId, order.refundAmount);
      order.refundId = r.id;
      order.refundStatus = 'processing';
      order.refundedAt = now;
      order.refundLastError = null;
      if (order.status === 'cancelled') order.paymentStatus = 'refunded';
      await order.save();
      raised += 1;
      await notifier.notify({ userId: order.customerId, role: 'customer', category: 'orders', title: `Refund of ₹${order.refundAmount} started`, body: `Order ${order.orderNumber} - reaches the way you paid in 5-7 working days.`, url: `/orders/${order._id}`, tag: `refund-started-${order._id}`, mail: customerMail(order) }).catch(() => {});
    } catch (err) {
      if (isBalanceError(err)) {
        waiting += 1;
        const days = (now - new Date(order.refundQueuedAt || order.cancelledAt || now)) / 86400000;
        if (days >= REMIND_AFTER_DAYS) {
          await notifier.notifyAdmins({ category: 'orders', title: `Refund still waiting · ${order.orderNumber} · ₹${order.refundAmount}`, body: `${Math.floor(days)} days in the queue. Razorpay: ${describe(err)}`, url: `/admin/orders/${order._id}`, tag: `refund-waiting-${order._id}-${now.toISOString().slice(0, 10)}` }).catch(() => {});
        }
      } else {
        failed += 1;
        order.refundLastError = String(describe(err)).slice(0, 300);
        await order.save().catch(require('./quiet').quiet(`refundLastError save ${order.orderNumber}`));
        console.error('refund retry failed for', order.orderNumber, '-', describe(err));
        await notifier.notifyAdmins({ category: 'orders', title: `Refund failed · ${order.orderNumber}`, body: String(describe(err)).slice(0, 300), url: `/admin/orders/${order._id}`, tag: `refund-failed-${order._id}` }).catch(() => {});
      }
    }
  }
  return { queued: orders.length, raised, waiting, failed };
};

module.exports = { queue, retryQueued, isBalanceError, describe, REMIND_AFTER_DAYS };
