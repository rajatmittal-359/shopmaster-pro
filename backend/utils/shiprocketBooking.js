/**
 * Booking a courier shipment through Shiprocket.
 *
 * WHAT THIS REPLACES
 *   Shiprocket was only ever used to ASK for a price. To actually ship, the
 *   seller opened the Shiprocket dashboard, created the shipment by hand, then
 *   came back and typed the courier name and tracking number into ShopMaster.
 *   Two systems, the same data entered twice, and an AWB one typo away from
 *   being untrackable.
 *
 * THE CHAIN, verified against apidocs.shiprocket.in on 2026-08-30
 *
 *   1. POST /orders/create/adhoc     -> { order_id, shipment_id, awb_code: null }
 *   2. POST /courier/assign/awb      -> { shipment_id, courier_id? } gives the AWB
 *   3. POST /courier/generate/pickup -> { shipment_id: [id] } books the collection
 *   4. POST /orders/cancel           -> { ids: [order_id] }
 *
 *   Step 2 may be called without a courier_id, in which case Shiprocket picks.
 *   That is what happens here: the cheapest courier was already chosen when the
 *   customer was quoted, and forcing a different one now would mean charging
 *   for one courier and shipping with another.
 *
 * WHEN THIS RUNS
 *   Not at checkout. A courier is booked when the seller says the parcel is
 *   packed and ready, which is why a mistaken order can be cancelled with no
 *   courier ever involved. See controllers/sellerController.
 *
 * MONEY
 *   Every successful booking spends real money from the Shiprocket wallet and
 *   sends a real person to collect a real parcel. Nothing here is a dry run.
 */
const axios = require('axios');

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

/** Shiprocket refuses a shipment without dimensions, so a parcel needs a size. */
const DEFAULT_PARCEL_CM = { length: 15, breadth: 12, height: 6 };

/** Their minimum billable weight; anything lighter is charged at this anyway. */
const MIN_WEIGHT_KG = 0.5;

let cachedToken = null;
let tokenExpiresAt = 0;

/** Auth tokens last ten days; this keeps one until shortly before it lapses. */
const getToken = async () => {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const { data } = await axios.post(
    `${BASE_URL}/auth/login`,
    {
      email: process.env.SHIPROCKET_API_EMAIL,
      password: process.env.SHIPROCKET_API_PASSWORD,
    },
    { timeout: 15000 }
  );

  if (!data || !data.token) throw new Error('Shiprocket did not return a token');

  cachedToken = data.token;
  tokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return cachedToken;
};

const authHeaders = (token) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/** yyyy-mm-dd hh:mm, the only format their order_date accepts. */
const formatOrderDate = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(date);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
};

/**
 * Creates the shipment, gets an AWB, and asks for a pickup.
 *
 * Returns a reason rather than throwing, so a failure leaves the order exactly
 * as it was and the seller can read what went wrong and retry.
 *
 * @param {object} order    the ShopMaster order (needs orderNumber, items, totals)
 * @param {object} address  the delivery address
 * @param {number} weightKg parcel weight
 */
const bookShipment = async (order, address, weightKg) => {
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary';

  // sub_total is the goods only. Shiprocket does not compute it, and sending
  // the order total instead would declare the shipping fee as goods value.
  const subTotal = order.items
    .filter((i) => i.status !== 'cancelled')
    .reduce((sum, i) => sum + i.price * i.quantity, 0);

  const [firstName, ...restOfName] = String(address.label || 'Customer').split(' ');

  const payload = {
    // Our own reference. Shiprocket returns ITS order id separately, and that
    // is the one every later call needs.
    order_id: order.orderNumber,
    order_date: formatOrderDate(order.createdAt || new Date()),
    pickup_location: pickupLocation,

    billing_customer_name: firstName || 'Customer',
    billing_last_name: restOfName.join(' '),
    billing_address: address.street,
    billing_city: address.city,
    billing_pincode: address.zipCode,
    billing_state: address.state,
    billing_country: address.country || 'India',
    billing_email: address.email || process.env.SENDGRID_FROM_EMAIL,
    billing_phone: address.phoneNumber,
    shipping_is_billing: true,

    order_items: order.items
      .filter((i) => i.status !== 'cancelled')
      .map((i) => ({
        name: i.name,
        sku: String(i.productId?.sku || i.productId?._id || i.productId),
        units: i.quantity,
        selling_price: i.price,
      })),

    payment_method: order.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
    shipping_charges: order.shippingCharges || 0,
    sub_total: subTotal,

    ...DEFAULT_PARCEL_CM,
    weight: Math.max(weightKg, MIN_WEIGHT_KG),
  };

  try {
    const token = await getToken();

    const { data: created } = await axios.post(
      `${BASE_URL}/orders/create/adhoc`,
      payload,
      { headers: authHeaders(token), timeout: 20000 }
    );

    if (!created || !created.shipment_id) {
      return { ok: false, reason: created?.message || 'Shiprocket did not create the shipment' };
    }

    // The shipment exists from here on, so a later failure is reported WITH the
    // ids - otherwise a half-booked shipment would be invisible to the seller.
    const ids = {
      externalOrderId: String(created.order_id),
      shipmentId: String(created.shipment_id),
    };

    let awb = null;
    let courierName = null;
    try {
      const { data: assigned } = await axios.post(
        `${BASE_URL}/courier/assign/awb`,
        { shipment_id: created.shipment_id },
        { headers: authHeaders(token), timeout: 20000 }
      );
      const res = assigned?.response?.data || {};
      awb = res.awb_code || null;
      courierName = res.courier_name || null;
    } catch (awbErr) {
      return {
        ok: false,
        ...ids,
        reason:
          awbErr.response?.data?.message ||
          'Shipment created but no courier would take it. Check the wallet balance and pickup address.',
      };
    }

    if (!awb) {
      return {
        ok: false,
        ...ids,
        reason: 'Shipment created but no AWB was issued. Check the wallet balance.',
      };
    }

    // A pickup that fails is worth reporting but not worth failing the booking
    // over: the shipment and AWB exist, and a pickup can be re-requested.
    let pickupScheduled = true;
    try {
      await axios.post(
        `${BASE_URL}/courier/generate/pickup`,
        { shipment_id: [created.shipment_id] },
        { headers: authHeaders(token), timeout: 20000 }
      );
    } catch {
      pickupScheduled = false;
    }

    return {
      ok: true,
      provider: 'shiprocket',
      ...ids,
      courierName,
      trackingNumber: awb,
      trackingUrl: `https://shiprocket.co/tracking/${awb}`,
      pickupScheduled,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err.response?.data?.message || err.message || 'Shiprocket booking failed',
    };
  }
};

/**
 * Cancels a shipment before the courier collects it.
 *
 * Shiprocket allows this while the shipment is awaiting AWB, label or pickup.
 * Once it has been picked up the answer is no, which is the honest boundary.
 */
const cancelShipment = async (externalOrderId) => {
  try {
    const token = await getToken();
    const { data } = await axios.post(
      `${BASE_URL}/orders/cancel`,
      { ids: [Number(externalOrderId)] },
      { headers: authHeaders(token), timeout: 20000 }
    );

    // Their cancel returns 200 with a message either way, so the status alone
    // does not tell you whether it worked.
    const message = String(data?.message || '');
    if (/cannot|already|not allowed/i.test(message)) {
      return { ok: false, reason: message };
    }
    return { ok: true, message: message || 'Cancelled' };
  } catch (err) {
    return {
      ok: false,
      reason: err.response?.data?.message || err.message || 'Could not cancel the shipment',
    };
  }
};

module.exports = { bookShipment, cancelShipment, getToken };
