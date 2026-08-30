/**
 * Booking and cancelling a shipment, whichever courier the customer chose.
 *
 * WHEN A COURIER IS BOOKED
 *   When the seller says the parcel is packed - never at checkout.
 *
 *   That timing is the whole safety story. A customer who orders by mistake, or
 *   a seller who spots a fake order, cancels while the order is still `pending`
 *   and no courier ever hears about it. Booking at checkout would mean a rider
 *   dispatched for every accidental click.
 *
 *   Even after booking there is a second chance: both couriers allow a cancel
 *   until the parcel is physically collected.
 *
 * WHICH COURIER
 *   Whatever the customer paid for. An order quoted and charged as same-day
 *   must not quietly ship by two-day courier, and the reverse would spend money
 *   the customer never paid.
 */
const borzo = require('./borzo');
const shiprocket = require('./shiprocketBooking');

const DEFAULT_ITEM_WEIGHT = 0.5;

/** Total weight of everything still active in the order. */
const parcelWeight = (order) =>
  order.items
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => {
      const product = i.productId && typeof i.productId === 'object' ? i.productId : null;
      const weight = product?.weight ?? DEFAULT_ITEM_WEIGHT;
      return sum + weight * i.quantity;
    }, 0);

/** True once a courier has been booked for this order. */
const isBooked = (order) => Boolean(order.shippingAwb || order.shippingOrderId);

/**
 * Books the courier the customer paid for and returns what to store.
 *
 * Refuses to book twice: a second booking would create a second shipment, spend
 * the money again, and send a rider for a parcel that has already gone.
 *
 * @returns {{ok: true, update: object}|{ok: false, reason: string, update?: object}}
 */
const bookForOrder = async (order, address) => {
  if (isBooked(order)) {
    return { ok: false, reason: 'A courier is already booked for this order' };
  }
  if (order.status === 'cancelled') {
    return { ok: false, reason: 'This order was cancelled' };
  }

  const weightKg = parcelWeight(order);

  const result =
    order.deliveryOption === 'same_day'
      ? await borzo.bookSameDay(order, address, weightKg)
      : await shiprocket.bookShipment(order, address, weightKg);

  if (!result.ok) {
    // A shipment that was created but never got an AWB still has ids worth
    // storing, otherwise it is invisible and nobody can go and cancel it.
    const partial =
      result.externalOrderId || result.shipmentId
        ? {
            shippingOrderId: result.externalOrderId || null,
            shippingShipmentId: result.shipmentId || null,
          }
        : null;
    return { ok: false, reason: result.reason, update: partial };
  }

  return {
    ok: true,
    update: {
      status: 'shipped',
      shippingProvider: result.provider,
      shippingCourierName: result.courierName,
      shippingAwb: result.trackingNumber,
      shippingOrderId: result.externalOrderId || null,
      shippingShipmentId: result.shipmentId || null,
      shippingTrackingUrl: result.trackingUrl || null,
      trackingInfo: {
        courierName: result.courierName,
        trackingNumber: result.trackingNumber,
        shippedDate: new Date(),
      },
    },
    pickupScheduled: result.pickupScheduled !== false,
  };
};

/**
 * Calls the courier off, if it has not collected yet.
 *
 * The order is only moved back out of 'shipped' when the courier actually
 * accepted the cancellation - otherwise the record would say the parcel is
 * still here while a rider is carrying it away.
 */
const cancelForOrder = async (order) => {
  if (!isBooked(order)) {
    return { ok: false, reason: 'No courier has been booked for this order' };
  }

  const result =
    order.shippingProvider === 'borzo'
      ? await borzo.cancelSameDay(order.shippingOrderId)
      : await shiprocket.cancelShipment(order.shippingOrderId);

  if (!result.ok) return { ok: false, reason: result.reason };

  return {
    ok: true,
    update: {
      status: 'processing',
      shippingAwb: null,
      shippingOrderId: null,
      shippingShipmentId: null,
      shippingTrackingUrl: null,
      trackingInfo: { courierName: null, trackingNumber: null, shippedDate: null },
    },
  };
};

module.exports = { bookForOrder, cancelForOrder, isBooked, parcelWeight };
