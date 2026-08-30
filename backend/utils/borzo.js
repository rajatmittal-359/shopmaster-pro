/**
 * Borzo - same-day intracity delivery.
 *
 * WHY A SECOND COURIER AT ALL
 *   The shop is in Jaipur. A customer three kilometres away waiting two days
 *   for a ring is a bad experience the business does not have to accept.
 *   Borzo is hyperlocal: a rider collects the parcel and delivers it the same
 *   day, usually within the hour.
 *
 * HOW IT PRICES, AND WHY THAT MATTERS
 *   Borzo charges by DISTANCE, not weight. Measured on 2026-08-30 from the
 *   Katewa Nagar pickup, at 0.5 kg:
 *
 *       Vaishali Nagar   Rs69      Sitapura   Rs160
 *       Malviya Nagar    Rs102     Amer       Rs190
 *
 *   The same route quoted Rs102 whether the parcel was 6 g or 5 kg. So unlike
 *   the courier fallback there is no weight table to build - every quote has
 *   to come live from the API, which is exactly what calculate-order gives.
 *
 * WHEN IT WILL BE DELIVERED
 *   The response carries a real arrival window rather than a promise this
 *   codebase invents. That is deliberate: a hard-coded "order by 5pm" cut-off
 *   would be a guess, and would be wrong whenever riders are busy. Showing
 *   Borzo's own window means the customer is told what Borzo will actually do.
 *
 * FAILURE
 *   Every function here returns null rather than throwing. Same-day is an
 *   OPTIONAL upgrade: if Borzo is unreachable the customer simply does not see
 *   it, and standard delivery carries on untouched. A courier outage must
 *   never block a sale.
 */
const axios = require('axios');

/** Test and production are separate hosts with separate tokens. */
const HOSTS = {
  test: 'https://robotapitest-in.borzodelivery.com',
  production: 'https://robot-in.borzodelivery.com',
};

const API_VERSION = '1.8';

/** Motorbike. Right for jewellery and small parcels, and the cheapest. */
const VEHICLE_MOTORBIKE = 8;

const baseUrl = () => HOSTS[process.env.BORZO_ENV === 'production' ? 'production' : 'test'];

/** Same-day is only offered when Borzo is actually configured. */
const isConfigured = () => !!process.env.BORZO_API_TOKEN;

/**
 * Asks Borzo what it would charge to take this basket to this address.
 *
 * @param {object} address   delivery address (street, city, state, zipCode, phoneNumber)
 * @param {number} weightKg  total parcel weight
 * @returns {{price: number, arrivalBy: Date, provider: 'borzo'}|null} null when
 *          unavailable for any reason - not configured, not serviceable, or down
 */
const quoteSameDay = async (address, weightKg) => {
  if (!isConfigured()) return null;

  const pickup = process.env.BORZO_PICKUP_ADDRESS;
  const pickupPhone = process.env.BORZO_PICKUP_PHONE;
  if (!pickup || !pickupPhone) return null;

  const drop = [address.street, address.city, address.state, address.zipCode]
    .filter(Boolean)
    .join(', ');

  try {
    const { data } = await axios.post(
      `${baseUrl()}/api/business/${API_VERSION}/calculate-order`,
      {
        matter: 'Jewellery and accessories',
        total_weight_kg: weightKg,
        vehicle_type_id: VEHICLE_MOTORBIKE,
        points: [
          {
            address: pickup,
            contact_person: { name: 'ShopMaster Pro', phone: pickupPhone },
          },
          {
            address: drop,
            contact_person: {
              name: address.label || 'Customer',
              phone: address.phoneNumber,
            },
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-DV-Auth-Token': process.env.BORZO_API_TOKEN,
        },
        timeout: 8000,
      }
    );

    // Borzo answers 200 with is_successful:false for an address it cannot
    // service, so the flag matters more than the status code.
    if (!data || !data.is_successful || !data.order) return null;

    const price = Number(data.order.payment_amount);
    if (!Number.isFinite(price) || price <= 0) return null;

    // The drop point carries the window; fall back to the order-level one.
    const dropPoint = (data.order.points || [])[1] || {};
    const arrival =
      dropPoint.required_finish_datetime ||
      dropPoint.required_start_datetime ||
      data.order.arrival_finish_datetime ||
      null;

    return {
      provider: 'borzo',
      price: Math.round(price),
      arrivalBy: arrival ? new Date(arrival) : null,
    };
  } catch (err) {
    // Never surface this to the customer: they just do not see the option.
    console.warn('Borzo quote unavailable:', err.message);
    return null;
  }
};

/**
 * Books a rider for real.
 *
 * Same shape as the quote, plus the two ids needed to track or cancel it. A
 * failure returns null with a reason rather than throwing, so a booking that
 * does not go through leaves the order exactly as it was.
 */
const bookSameDay = async (order, address, weightKg) => {
  if (!isConfigured()) return { ok: false, reason: 'Same-day courier is not configured' };

  const pickup = process.env.BORZO_PICKUP_ADDRESS;
  const pickupPhone = process.env.BORZO_PICKUP_PHONE;
  if (!pickup || !pickupPhone) {
    return { ok: false, reason: 'Pickup address is not configured' };
  }

  const drop = [address.street, address.city, address.state, address.zipCode]
    .filter(Boolean)
    .join(', ');

  try {
    const { data } = await axios.post(
      `${baseUrl()}/api/business/${API_VERSION}/create-order`,
      {
        matter: `Order ${order.orderNumber}`,
        total_weight_kg: weightKg,
        vehicle_type_id: VEHICLE_MOTORBIKE,
        points: [
          { address: pickup, contact_person: { name: 'ShopMaster Pro', phone: pickupPhone } },
          {
            address: drop,
            contact_person: { name: address.label || 'Customer', phone: address.phoneNumber },
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-DV-Auth-Token': process.env.BORZO_API_TOKEN,
        },
        timeout: 15000,
      }
    );

    if (!data || !data.is_successful || !data.order) {
      const warnings = data && data.parameter_warnings;
      return {
        ok: false,
        reason: warnings ? JSON.stringify(warnings) : 'Courier refused the booking',
      };
    }

    return {
      ok: true,
      provider: 'borzo',
      courierName: 'Borzo',
      // Borzo has no AWB; its own order id is what tracks and cancels the job.
      externalOrderId: String(data.order.order_id),
      trackingNumber: String(data.order.order_name || data.order.order_id),
      trackingUrl: data.order.tracking_url || null,
    };
  } catch (err) {
    return { ok: false, reason: err.response?.data?.message || err.message };
  }
};

/**
 * Calls the rider off.
 *
 * Borzo refuses once a courier has visited an address, which is the honest
 * point of no return - by then the parcel is already moving.
 */
const cancelSameDay = async (externalOrderId) => {
  if (!isConfigured()) return { ok: false, reason: 'Same-day courier is not configured' };

  try {
    const { data } = await axios.post(
      `${baseUrl()}/api/business/${API_VERSION}/cancel-order`,
      { order_id: Number(externalOrderId) },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-DV-Auth-Token': process.env.BORZO_API_TOKEN,
        },
        timeout: 15000,
      }
    );

    if (!data || !data.is_successful) {
      return { ok: false, reason: 'The rider has already collected this parcel' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.response?.data?.message || err.message };
  }
};

module.exports = {
  quoteSameDay,
  bookSameDay,
  cancelSameDay,
  isConfigured,
  VEHICLE_MOTORBIKE,
};
