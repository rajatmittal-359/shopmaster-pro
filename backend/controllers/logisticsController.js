const crypto = require('crypto');

const Order = require('../models/Order');
const User = require('../models/User');
const { normaliseCourierStatus, FULFILMENT_STATE } = require('../utils/courierStatus');
const { orderStatusEmail } = require('../utils/emailTemplates');
const sendSafeEmail = require('../utils/sendSafeEmail');

/**
 * Where the courier tells US what happened.
 *
 * WHY THIS EXISTS
 *   The Shiprocket integration was one-way. We could create a shipment, pick a
 *   courier, book a pickup and cancel - and then hear nothing ever again. The
 *   only way an order became 'delivered' was a seller remembering to press a
 *   button.
 *
 *   That is not a cosmetic gap. deliveredAt starts the return window, and the
 *   return window closing is what makes a seller's line PAYABLE. A seller who
 *   forgot - or who never knew the parcel had arrived, because nothing told
 *   them - was simply never paid, with nothing on any screen to explain it.
 *
 *   The customer had the same silence: they were told a parcel had shipped and
 *   then heard from us again only if they went looking.
 *
 * WHY IT ALWAYS RETURNS 200
 *   Shiprocket requires a 200 and will stop sending updates to an endpoint that
 *   does not give one. A payload we cannot parse is our problem to look at in
 *   the log, not a reason to have the whole feed switched off - by which time
 *   every later delivery would be missed too.
 */

/** Constant-time compare, so the token cannot be guessed by timing the reply. */
const tokenMatches = (given, expected) => {
  if (!given || !expected) return false;
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * Shiprocket does not promise one shape, and different events carry different
 * keys. Read generously rather than insisting on one spelling.
 */
const readPayload = (body = {}) => {
  const pick = (...keys) => {
    for (const k of keys) {
      const v = k.split('.').reduce((o, part) => (o == null ? o : o[part]), body);
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
  };

  const scans = Array.isArray(body.scans) ? body.scans : [];

  return {
    // A NUMBER in the real payload (59629792084), not a string - pick()
    // stringifies, which is what the stored AWB is.
    awb: pick('awb', 'awb_code', 'AWB'),

    /*
     * `order_id` is SHIPROCKET's id. Ours is `channel_order_id`, so that comes
     * first - matching on theirs would find nothing.
     */
    orderRef: pick('channel_order_id', 'orderId', 'order_id'),

    status: pick('current_status', 'shipment_status', 'status'),

    /*
     * The numeric code, which does not vary with wording. Only 7 = Delivered is
     * confirmed by their sample payload, so only that one is trusted - guessing
     * the rest of the table would be worse than reading the text.
     */
    statusId: Number(pick('current_status_id', 'shipment_status_id')) || null,

    // Nothing in the sample carries a reason, so the last scan's activity is
    // the nearest thing to why a delivery failed.
    reason:
      pick('ndr_reason', 'reason', 'remark', 'comment') ||
      (scans[0] && scans[0].activity) ||
      null,

    // "2021-07-02 16:41:59" - not ISO. Date.parse reads it as local time, which
    // is right: these are Indian courier timestamps.
    at: pick('current_timestamp', 'status_update_time', 'timestamp', 'date'),

    /** When the courier expects to deliver. The one thing a waiting customer wants. */
    etd: pick('etd', 'expected_delivery_date', 'edd'),

    /** Every stop the parcel has made, newest first in their payload. */
    scans: scans
      .map((sc) => ({
        at: sc.date && !Number.isNaN(Date.parse(sc.date)) ? new Date(sc.date) : null,
        activity: sc.activity ? String(sc.activity) : null,
        location: sc.location ? String(sc.location) : null,
      }))
      .filter((sc) => sc.activity),
  };
};

exports.courierUpdate = async (req, res) => {
  // Answer first, work after: a courier feed should never be waiting on our
  // database, and a slow reply is how these get disabled.
  const acknowledge = () => res.status(200).json({ received: true });

  try {
    const expected = process.env.SHIPROCKET_WEBHOOK_TOKEN;

    // An unset token would otherwise mean "accept anything", which is how a
    // stranger marks an order delivered and releases a payout.
    if (!expected) {
      console.error('Courier webhook rejected: SHIPROCKET_WEBHOOK_TOKEN is not set');
      return acknowledge();
    }
    if (!tokenMatches(req.get('x-api-key'), expected)) {
      console.warn('Courier webhook rejected: bad or missing x-api-key');
      return acknowledge();
    }

    const { awb, orderRef, status, statusId, reason, at, etd, scans } = readPayload(req.body);

    // Their own code wins for the one status that releases money; the wording
    // is the fallback for everything else.
    const mapped = statusId === 7 ? 'delivered' : normaliseCourierStatus(status);

    if (!awb && !orderRef) {
      console.warn('Courier webhook ignored: no AWB or order reference', req.body);
      return acknowledge();
    }
    if (!mapped) {
      // Worth seeing: it is either a status we have not met or a shape change.
      console.warn('Courier webhook: unrecognised status', JSON.stringify(status));
      return acknowledge();
    }

    /*
     * Find by AWB first. The order reference is unreliable here: a re-booked
     * shipment carries a "-R2" suffix (see shiprocketBooking), so matching on
     * it would miss exactly the orders that have already had trouble.
     */
    const order = awb
      ? await Order.findOne({
          $or: [{ shippingAwb: awb }, { 'fulfilments.awb': awb }],
        })
      : await Order.findOne({ orderNumber: String(orderRef).replace(/-R\d+$/, '') });

    if (!order) {
      console.warn('Courier webhook: no order for', awb || orderRef);
      return acknowledge();
    }

    // In a split order only the parcel this AWB belongs to moves.
    const fulfilment =
      (awb && order.fulfilments.find((f) => f.awb === awb)) || order.fulfilments[0];

    if (!fulfilment) {
      console.warn('Courier webhook: order', order.orderNumber, 'has no fulfilment');
      return acknowledge();
    }

    const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();
    const was = fulfilment.status;

    fulfilment.courierStatus = status;
    fulfilment.courierStatusAt = when;

    if (etd && !Number.isNaN(Date.parse(etd))) {
      // Couriers revise this as the parcel moves, so the latest word wins.
      fulfilment.expectedDeliveryAt = new Date(etd);
    }

    if (scans.length) {
      // Replace rather than append: each event carries the WHOLE history, so
      // appending would duplicate every earlier stop on every update. Capped at
      // 30 - older scans stop being interesting once a parcel has arrived.
      fulfilment.scans = scans.slice(0, 30);
    }

    if (mapped === 'ndr') {
      fulfilment.ndrReason = reason || status;
      fulfilment.ndrAt = when;
    } else {
      const next = FULFILMENT_STATE[mapped];

      // Never walk a parcel backwards. Couriers resend events, and out-of-order
      // delivery of those events must not turn a delivered parcel into one in
      // transit.
      const RANK = { pending: 0, processing: 1, shipped: 2, delivered: 3, returned: 4, cancelled: 4 };
      if (next && (RANK[next] ?? 0) >= (RANK[fulfilment.status] ?? 0)) {
        fulfilment.status = next;
      }

      if (next === 'delivered' && !fulfilment.deliveredAt) {
        // The moment that starts the return window and, once it closes, makes
        // this seller's line payable.
        fulfilment.deliveredAt = when;
      }
      if (next === 'delivered') {
        /*
         * The courier's word, recorded as the courier's word.
         *
         * This overwrites a seller's earlier claim on purpose. Both cannot be
         * the source, and of the two only the courier has nothing to gain from
         * the answer - so when the tracking feed speaks, it is what the record
         * says happened.
         */
        fulfilment.deliveryConfirmedBy = 'courier';

        /*
         * COD is collected at the door by the courier, so their delivery scan
         * is the only honest signal that the cash exists. A seller pressing a
         * button used to declare this for money that had not reached anybody.
         */
        const everyPartDone = order.fulfilments
          .filter((f) => f.status !== 'cancelled')
          .every((f) => ['delivered', 'returned'].includes(f.status));

        if (
          order.paymentMethod === 'cod' &&
          order.paymentStatus === 'pending' &&
          everyPartDone
        ) {
          order.paymentStatus = 'paid';
        }
      }
      if (next === 'returned' && !fulfilment.returnedAt) fulfilment.returnedAt = when;
      if (next === 'shipped' && !fulfilment.shippedAt) fulfilment.shippedAt = when;
    }

    // order.status is derived from the fulfilments by the pre-validate hook.
    await order.save();

    console.log(
      `Courier update: ${order.orderNumber} ${was} -> ${fulfilment.status} (${status})`
    );

    // Tell the customer, but only when something actually changed for them.
    if (fulfilment.status !== was && ['delivered', 'returned'].includes(fulfilment.status)) {
      setImmediate(async () => {
        try {
          const customer = await User.findById(order.customerId).select('name email');
          if (!customer) return;
          const { subject, html, text } = orderStatusEmail(
            order,
            customer,
            fulfilment.status
          );
          await sendSafeEmail({ toUserId: customer._id, subject, html, text });
        } catch (err) {
          console.error('Delivery email failed for', order.orderNumber, '-', err.message);
        }
      });
    }

    return acknowledge();
  } catch (err) {
    // Still 200. An error here is ours to fix; making Shiprocket disable the
    // feed would cost every future update as well.
    console.error('Courier webhook error:', err.message);
    return acknowledge();
  }
};
