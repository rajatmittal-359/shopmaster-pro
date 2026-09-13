const { notify } = require('./notify');

/**
 * What a customer is told about their order (plan 2.30).
 *
 * WHY
 *   Flipkart's and Amazon's order pages carry a timeline and the phone
 *   carries the same lines as they happen: confirmed → shipped → delivered,
 *   and the money moments - refund credited, dispute decided. Each call
 *   here is one such line: the bell row always, push and mail as the
 *   customer's own preferences allow. The mail templates are the ones the
 *   controllers already built; they are passed in, not rebuilt.
 *
 *   Never throws - the order, scan or refund has already happened.
 */
const money = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const orderUrl = (order) => `/orders/${order._id}`;
const line = (order) => {
  const names = (order.items || []).map((i) => i.name).filter(Boolean);
  const first = names[0] || 'your order';
  return names.length > 1 ? `${first} +${names.length - 1} more` : first;
};

const tell = async (customerId, note) => {
  try {
    return await notify({ userId: customerId, role: 'customer', ...note });
  } catch (err) {
    console.error(`Customer notification (${note.title}) failed:`, err.message);
    return null;
  }
};

/** Order placed and paid (or COD accepted). `mail` = orderConfirmedEmail(...) */
const orderConfirmed = (order, mail) =>
  tell(order.customerId?._id || order.customerId, {
    category: 'orders',
    title: `Order confirmed · ${order.orderNumber}`,
    body: `${line(order)} · ${order.paymentMethod === 'cod' ? 'Cash on delivery' : 'Paid'} · ${money(order.totalAmount)}`,
    url: orderUrl(order),
    tag: `confirmed-${order._id}`,
    mail,
  });

/** A parcel left the seller. `mail` = shippingNotificationEmail(...) */
const shipped = (order, { courierName, trackingNumber } = {}, mail) =>
  tell(order.customerId?._id || order.customerId, {
    category: 'orders',
    title: `Shipped · ${order.orderNumber}`,
    body: `${line(order)}${courierName ? ` · ${courierName}` : ''}${trackingNumber ? ` · ${trackingNumber}` : ''}`,
    url: orderUrl(order),
    tag: `shipped-${order._id}`,
    mail,
  });

/** Courier scan the customer cares about. status: delivered | returned. `mail` = orderStatusEmail(...) */
const courierStatus = (order, status, mail) =>
  tell(order.customerId?._id || order.customerId, {
    category: status === 'returned' ? 'returns' : 'orders',
    title: status === 'delivered' ? `Delivered · ${order.orderNumber}` : `Returned to seller · ${order.orderNumber}`,
    body: status === 'delivered' ? `${line(order)} · Not right? You have 7 days to return.` : `${line(order)} · the refund follows once the seller checks it in.`,
    url: orderUrl(order),
    tag: `${status}-${order._id}`,
    mail,
  });

/** Admin approved or refused a held return (Fair Returns). */
const returnDecided = (order, approved, note) =>
  tell(order.customerId?._id || order.customerId, {
    category: 'returns',
    title: approved ? `Return approved · ${order.orderNumber}` : `Return not approved · ${order.orderNumber}`,
    body: approved ? 'The pickup is being booked. Keep the tag on and the item packed.' : String(note || 'See the order for the reason.').slice(0, 300),
    url: orderUrl(order),
    tag: `return-decided-${order._id}`,
  });

/** Razorpay said the refund is done (or failed). */
const refund = (order, amount, ok) =>
  tell(order.customerId?._id || order.customerId, {
    category: 'returns',
    title: ok ? `Refund of ${money(amount)} sent · ${order.orderNumber}` : `Refund needs a look · ${order.orderNumber}`,
    body: ok ? 'It reaches your bank or card in 5-7 working days.' : 'The bank did not accept it. Help is on it; nothing to do from your side.',
    url: orderUrl(order),
    tag: `refund-${order._id}-${ok ? 'ok' : 'failed'}`,
  });

/** An admin decided a dispute. */
const disputeDecided = (order, inFavourOf) =>
  tell(order.customerId?._id || order.customerId, {
    category: 'disputes',
    title: inFavourOf === 'customer' ? `Dispute decided in your favour · ${order.orderNumber}` : `Dispute decided · ${order.orderNumber}`,
    body: inFavourOf === 'customer' ? 'Your refund is on its way. Details on the order.' : 'The evidence supported the seller this time. The reasoning is on the order.',
    url: orderUrl(order),
    tag: `dispute-decided-${order._id}`,
  });

module.exports = { orderConfirmed, shipped, courierStatus, returnDecided, refund, disputeDecided };
