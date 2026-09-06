const shiprocket = require('./shiprocketBooking');
const { parcelWeight } = require('./shipmentBooking');
// Held as a module object rather than destructured so tests can replace it -
// a destructured copy binds the real function forever. Same reason as
// utils/settleReturn.js.
const inventory = require('../controllers/inventoryController');

/**
 * Sending the customer a working item in place of the one that failed.
 *
 * WHAT AN EXCHANGE IS, AND WHAT IT IS NOT
 *   It is a return whose settlement is GOODS instead of MONEY. The customer
 *   keeps the purchase - they wanted the necklace, not the rupees - so nothing
 *   is refunded, no commission is recalculated, and the seller's earning on
 *   that line is exactly what it always was. The only things that move are a
 *   parcel and one unit of stock.
 *
 *   Getting that wrong in either direction is expensive and quiet. Refund the
 *   line as well and the customer has been paid AND is owed a parcel. Re-price
 *   the line and a payout that was already snapshotted at sale time disagrees
 *   with itself. So this function deliberately touches neither.
 *
 * WHY THE REPLACEMENT IS NEVER COD
 *   The customer has already paid for this item - on a COD order they handed
 *   cash to the first rider. Booking the second parcel as COD would send a
 *   rider to ask for the money again, and the customer would have paid twice
 *   for one necklace. The booking is forced to Prepaid for that reason alone.
 *
 * WHY STOCK COMES OFF HERE AND NOT WHEN THE RETURN WAS RECEIVED
 *   A replacement that is owed is not a replacement that has been sent. If the
 *   seller never packs it - it goes to a dispute instead, or the customer
 *   changes their mind - no unit ever left the shelf, and a deduction made
 *   earlier would have quietly lost one.
 */

/** The fulfilment this seller owns that is waiting on a replacement. */
const dueParcel = (order, sellerId) =>
  (order.fulfilments || []).find(
    (f) =>
      f.replacementStage === 'due' &&
      (!sellerId || String(f.sellerId) === String(sellerId))
  );

/**
 * Book and record the replacement parcel.
 *
 * @param {object} order    a Mongoose order, with customerId and products populated
 * @param {object} address  where the customer wants it - the original delivery address
 * @param {object} opts
 * @param {string} [opts.sellerId]  when a SELLER dispatches: only their parcel
 * @param {string} opts.actorId     for the inventory audit trail
 * @returns {Promise<{ok: boolean, status?: number, message: string, awb?: string}>}
 */
const dispatchReplacement = async (order, address, { sellerId, actorId }) => {
  const fulfilment = dueParcel(order, sellerId);
  if (!fulfilment) {
    return {
      ok: false,
      status: 400,
      message: 'No replacement is owed on this order',
    };
  }

  if (!address || !address.street || !address.zipCode) {
    return {
      ok: false,
      status: 400,
      message:
        'The delivery address for this order could not be read, so no courier has been booked.',
    };
  }

  const lines = order.items.filter(
    (i) =>
      i.status !== 'cancelled' && String(i.sellerId) === String(fulfilment.sellerId)
  );

  if (!lines.length) {
    return { ok: false, status: 400, message: 'That replacement has no items on it' };
  }

  /*
   * Stock comes off FIRST, and a shortage stops everything before a rupee of
   * courier money is spent.
   *
   * The other order - book, then deduct - can leave a rider on their way to
   * collect a parcel the seller has not got, which costs the pickup fee and a
   * second disappointment for a customer who is already on their second one.
   * If the booking then fails, the units go straight back below.
   */
  const deducted = [];
  try {
    for (const item of lines) {
      await inventory.applyInventoryChange({
        productId: item.productId?._id || item.productId,
        quantity: item.quantity,
        type: 'sale',
        orderId: order._id,
        performedBy: actorId,
        reason: `Replacement sent for ${order.orderNumber}`,
      });
      deducted.push(item);
    }
  } catch (stockErr) {
    for (const item of deducted) {
      await inventory.applyInventoryChange({
        productId: item.productId?._id || item.productId,
        quantity: item.quantity,
        type: 'restock',
        orderId: order._id,
        performedBy: actorId,
        reason: `Replacement booking abandoned for ${order.orderNumber}`,
      });
    }
    return {
      ok: false,
      status: 409,
      message:
        stockErr.message === 'Insufficient stock'
          ? 'You do not have one of these left to send. Restock it, or settle this as a refund instead.'
          : `The replacement could not be prepared: ${stockErr.message}`,
    };
  }

  /*
   * Shiprocket standard, not whatever the original travelled by.
   *
   * A same-day booking through Borzo is a premium the customer paid for on the
   * first parcel. Nobody is paying for this one, and quietly spending that
   * money again on every exchange would make a broken clasp cost the shop far
   * more than the necklace. If a seller wants to rush one, they can - by hand,
   * as a decision, which is what it is.
   */
  const booked = await shiprocket.bookShipment(
    order,
    address,
    parcelWeight(order),
    1,
    {
      reference: 'EX',
      prepaid: true,
      items: lines,
    }
  );

  if (!booked.ok) {
    for (const item of deducted) {
      await inventory.applyInventoryChange({
        productId: item.productId?._id || item.productId,
        quantity: item.quantity,
        type: 'restock',
        orderId: order._id,
        performedBy: actorId,
        reason: `Replacement booking failed for ${order.orderNumber}`,
      });
    }

    fulfilment.bookingFailedReason = booked.reason;
    fulfilment.bookingFailedAt = new Date();
    fulfilment.bookingAttempts = (fulfilment.bookingAttempts || 0) + 1;
    await order.save();

    return { ok: false, status: 502, message: booked.reason };
  }

  /*
   * The parcel that failed steps aside, and the new one takes over the fields
   * everything else watches. See Order.previousParcels for why it works this
   * way round rather than giving the replacement its own field names.
   */
  if (fulfilment.awb || fulfilment.shippingOrderId) {
    fulfilment.previousParcels.push({
      awb: fulfilment.awb,
      courierName: fulfilment.courierName,
      shipmentId: fulfilment.shipmentId,
      shippingOrderId: fulfilment.shippingOrderId,
      trackingUrl: fulfilment.trackingUrl,
      deliveredAt: fulfilment.deliveredAt,
      replacedBecause: fulfilment.returnReason || 'Exchanged',
    });
  }

  const now = new Date();

  fulfilment.shippingProvider = booked.provider || 'shiprocket';
  fulfilment.awb = booked.trackingNumber;
  fulfilment.courierName = booked.courierName;
  fulfilment.shipmentId = booked.shipmentId || null;
  fulfilment.shippingOrderId = booked.externalOrderId || null;
  fulfilment.trackingUrl = booked.trackingUrl || null;

  /*
   * The journey starts again from nothing. Leaving the old scans in place would
   * show the customer their broken parcel's delivery scan at the top of the
   * tracking for the parcel that is replacing it.
   */
  fulfilment.scans = [];
  fulfilment.courierStatus = null;
  fulfilment.courierStatusAt = null;
  fulfilment.expectedDeliveryAt = null;
  fulfilment.podUrl = null;
  fulfilment.ndrReason = null;
  fulfilment.ndrAt = null;
  fulfilment.ndrAttempts = 0;
  fulfilment.nprReason = null;

  /*
   * deliveredAt is cleared on purpose. It is what the return window and
   * therefore the seller's payout are measured from, and leaving the FIRST
   * delivery there would start the customer's seven days on an item they had
   * already sent back - the window could close before the replacement even
   * arrived. It is set again by the courier's scan on the new parcel.
   */
  fulfilment.deliveredAt = null;
  fulfilment.deliveryConfirmedBy = null;

  fulfilment.bookingFailedReason = null;
  fulfilment.bookingFailedKind = null;
  fulfilment.bookingFailedAt = null;

  fulfilment.replacementStage = 'shipped';
  fulfilment.replacementBookedAt = now;
  fulfilment.status = 'shipped';
  fulfilment.shippedAt = now;

  await order.save();

  return {
    ok: true,
    message: 'Replacement booked. The customer can track it from their order.',
    awb: booked.trackingNumber,
  };
};

module.exports = { dispatchReplacement, dueParcel };
