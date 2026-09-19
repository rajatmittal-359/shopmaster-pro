const notifier = require('./notify');

/**
 * What a courier fact means for the three people in an order (20 Sep 2026).
 *
 * WHY
 *   Reading Shiprocket's whole status list against ours showed four things
 *   the parcel record noted and nobody heard: a pickup that failed (the
 *   seller waits for a van that is not coming), a delivery attempt that
 *   failed (the customer does not know to keep the phone on), an RTO (a
 *   prepaid customer has paid for a parcel now travelling AWAY from them,
 *   and nothing refunded it - ever), a parcel the courier declared lost.
 *   Amazon mails "we attempted delivery" the same hour; Flipkart refunds an
 *   RTO when it reaches the seller. Ours now does the same, from the same
 *   events, whether the fact came by webhook or by the reconcile job.
 *
 * WHO PAYS FOR AN RTO
 *   The customer is refunded in full for that seller's lines - they never
 *   received anything and, unless they refused the parcel at the door, did
 *   nothing wrong. Whether the seller is charged the courier's RTO fee is the
 *   rulebook's business (utils/performance counts it; the admin sees the
 *   count); this file only makes sure the customer is whole and the stock is
 *   back on the shelf.
 */
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const mine = (order, sellerId) => (order.items || []).filter((i) => String(i.sellerId) === String(sellerId) && i.status !== 'cancelled');
const linesTotal = (lines) => lines.reduce((n, i) => n + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0);
const customerId = (order) => order.customerId?._id || order.customerId;
const prepaid = (order) => order.paymentMethod === 'razorpay' && ['paid', 'refunded'].includes(order.paymentStatus);

const tellCustomer = (order, note) => notifier.notify({ userId: customerId(order), role: 'customer', url: `/orders/${order._id}`, ...note }).catch(() => {});
const tellSeller = (sellerId, order, note) => notifier.notify({ userId: sellerId, role: 'seller', url: `/seller/orders/${order._id}`, ...note }).catch(() => {});
const tellAdmins = (order, note) => notifier.notifyAdmins({ url: `/admin/orders/${order._id}`, ...note }).catch(() => {});

/** The RTO parcel is back with the seller: stock returns, the customer's money returns. */
const settleRtoBack = async (order, fulfilment) => {
  const lines = mine(order, fulfilment.sellerId);
  if (!lines.length) return { refunded: 0 };
  const inventory = require('../controllers/inventoryController');
  for (const item of lines) {
    await inventory.applyInventoryChange({ productId: item.productId?._id || item.productId, quantity: item.quantity, type: 'return', orderId: order._id, performedBy: null }).catch((e) => console.error('rto stock restore failed:', e.message));
    item.status = 'cancelled';
  }
  let refunded = 0;
  if (prepaid(order) && order.razorpayPaymentId && order.paymentStatus === 'paid') {
    const liveLines = (order.items || []).filter((i) => i.status !== 'cancelled');
    const amount = liveLines.length ? linesTotal(lines) : Number(order.totalAmount) || linesTotal(lines);
    const rq = require('./refundQueue');
    try {
      const r = await require('./refund').refundPayment(order.razorpayPaymentId, amount);
      order.refundId = r.id;
      order.refundStatus = 'processing';
      order.refundAmount = amount;
      order.refundedAt = new Date();
      if (!liveLines.length) order.paymentStatus = 'refunded';
    } catch (err) {
      rq.queue(order, amount, err);
    }
    refunded = amount;
  }
  order.cancelledBy = order.cancelledBy || 'platform';
  order.cancellationReason = order.cancellationReason || 'Returned to origin by the courier (undelivered)';
  await order.save();
  return { refunded };
};

/**
 * @param {object} order
 * @param {object} fulfilment
 * @param {string[]} events  from applyCourierUpdate
 */
const notifyCourierEvents = async (order, fulfilment, events = []) => {
  const sellerId = fulfilment.sellerId;
  const ref = order.orderNumber || String(order._id).slice(-6);
  for (const ev of events) {
    try {
      if (ev === 'pickup_failed') {
        await tellSeller(sellerId, order, { category: 'orders', title: `Pickup did not happen · ${ref}`, body: `${fulfilment.pickupIssue || 'Pickup exception'}. The courier retries the next working day - keep the parcel packed and the phone on; if it says "error", press Retry in Shiprocket.`, tag: `pickup-failed-${order._id}-${sellerId}` });
      } else if (ev === 'ndr') {
        await tellCustomer(order, { category: 'orders', title: `The courier tried to deliver · ${ref}`, body: `${fulfilment.ndrReason || 'Could not deliver'}. They will try again - please keep your phone reachable.`, tag: `ndr-${order._id}` });
        await tellSeller(sellerId, order, { category: 'orders', title: `Delivery attempt failed · ${ref}`, body: `${fulfilment.ndrReason || 'Undelivered'}. The courier retries; nothing to do unless it repeats.`, tag: `ndr-seller-${order._id}-${sellerId}` });
      } else if (ev === 'rto_started') {
        await tellCustomer(order, { category: 'orders', title: `Your parcel is coming back to the seller · ${ref}`, body: prepaid(order) ? 'The courier could not deliver it after their attempts and is returning it. Your refund is raised the day it reaches the seller.' : 'The courier could not deliver it after their attempts and is returning it. Nothing was charged.', tag: `rto-${order._id}` });
        await tellSeller(sellerId, order, { category: 'orders', title: `RTO started · ${ref}`, body: `${fulfilment.rtoReason || 'Return to origin'}. It comes back to your pickup address; the customer is refunded when it arrives.`, tag: `rto-seller-${order._id}-${sellerId}` });
        await tellAdmins(order, { category: 'orders', title: `RTO · ${ref}`, body: `${fulfilment.rtoReason || 'Return to origin'} - refund goes out automatically when it reaches the seller.`, tag: `rto-admin-${order._id}` });
      } else if (ev === 'rto_back') {
        const { refunded } = await settleRtoBack(order, fulfilment);
        await tellCustomer(order, { category: 'orders', title: refunded ? `Refund of ${money(refunded)} raised · ${ref}` : `Order closed · ${ref}`, body: refunded ? (order.refundStatus === 'queued' ? 'The undelivered parcel is back with the seller. Your refund is queued and goes out within two working days.' : 'The undelivered parcel is back with the seller. Your refund reaches the way you paid in 5-7 working days.') : 'The undelivered parcel is back with the seller. Nothing was charged.', tag: `rto-back-${order._id}` });
        await tellSeller(sellerId, order, { category: 'orders', title: `RTO parcel is back · ${ref}`, body: 'Stock is counted back in. Check the parcel; the customer has been refunded.', tag: `rto-back-seller-${order._id}-${sellerId}` });
      } else if (ev === 'lost') {
        await tellAdmins(order, { category: 'orders', title: `Courier reports the parcel LOST/DAMAGED · ${ref}`, body: `${fulfilment.lostReason || 'Lost'}. Raise the claim in Shiprocket (Orders → the shipment → Raise claim; insured up to ₹5,000) and settle the customer from the order page.`, tag: `lost-${order._id}` });
        await tellCustomer(order, { category: 'orders', title: `A problem with your parcel · ${ref}`, body: 'The courier reports it lost or damaged in transit. We are settling this - you will hear from us within two working days with a refund or a replacement.', tag: `lost-customer-${order._id}` });
        await tellSeller(sellerId, order, { category: 'orders', title: `Parcel lost in transit · ${ref}`, body: `${fulfilment.lostReason || 'Lost'}. The platform is raising the courier claim; nothing to do yet.`, tag: `lost-seller-${order._id}-${sellerId}` });
      }
    } catch (err) {
      console.error(`courier event ${ev} for ${ref} failed:`, err.message);
    }
  }
};

module.exports = { notifyCourierEvents, settleRtoBack };
