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

const isLive = () => process.env.BORZO_ENV === 'production';

const baseUrl = () => HOSTS[isLive() ? 'production' : 'test'];

/**
 * Same-day is only offered when Borzo can actually deliver it.
 *
 * A TOKEN IS NOT ENOUGH. With BORZO_ENV unset or 'test' every call goes to
 * robotapitest-in.borzodelivery.com, which is a simulator: it answers happily,
 * quotes a plausible price - it returned ₹59 for a real Jaipur address on
 * 6 Sep 2026 - and books orders that no rider will ever be given.
 *
 * That combination is worse than being switched off. The option appeared at
 * checkout, a customer could choose it, pay for it, and the parcel would simply
 * never be collected; nothing anywhere would report a failure, because as far
 * as the sandbox is concerned everything worked.
 *
 * So same-day stays hidden until Borzo is pointed at the real service. Nothing
 * else has to change when the production token arrives - set BORZO_ENV and the
 * option comes back on its own.
 */
const isConfigured = () => !!process.env.BORZO_API_TOKEN && isLive();

/**
 * Set up, but pointed at the simulator - so same-day is coming rather than
 * gone. This is what lets checkout say "coming soon" honestly, and what makes
 * that message disappear by itself the day BORZO_ENV becomes production.
 */
const isPending = () => !!process.env.BORZO_API_TOKEN && !isLive();

/**
 * Where the rider goes to collect, for the seller who is actually shipping.
 *
 * WHY (2.84, 2 Oct 2026)
 *   Until today every same-day booking was collected from BORZO_PICKUP_ADDRESS
 *   with the contact named "ShopMaster Pro" - one address for the whole
 *   marketplace. Rajat, looking at the Borzo account: *"Borzo me sirf Charming
 *   Jewels thodi, aur koi Jaipur ka seller bhi to bhej sakta hai."* A second
 *   seller's parcel would have been collected from a shop that did not have it,
 *   and the rider would have had nobody to call. Nothing threw - the quote and
 *   the booking both succeeded; only the pickup was wrong.
 *
 *   Standard shipping learnt this in 2.54 (one rate call per seller, from their
 *   own pincode). This is the same lesson for the same-day leg, and it is the
 *   ONLY place the env pickup is read, so the quote and the booking cannot
 *   disagree about where the rider is going.
 *
 * @returns {{address: string, phone: string, name: string}|null} null when this
 *          seller has no usable pickup on file - the caller must then NOT offer
 *          same-day. Falling back to the house shop's address would be exactly
 *          the bug this replaces.
 */
const sameDayPickupFor = (seller) => {
  const p = seller?.pickupAddress || {};
  const named = String(p.contactName || '').trim();

  // The house shop ships from the address the box is configured with, as it
  // always has. Its own contact name is used when it has one: the pickup
  // contact is a shop, never the platform (CLAUDE.md rule one).
  if (seller?.isPlatformOwned) {
    const address = process.env.BORZO_PICKUP_ADDRESS;
    const phone = process.env.BORZO_PICKUP_PHONE;
    return address && phone ? { address, phone, name: named || 'ShopMaster Pro' } : null;
  }

  const address = [p.address1, p.address2, p.city, p.state, p.pincode].filter(Boolean).join(', ');
  const phone = String(p.phone || '').trim();
  // A rider has to ask for somebody at the door. `deliveryTruth.pickupAddressFor`
  // - the guard that already runs before every booking - requires address, PIN
  // and phone but never a contact name, so insisting on one here would refuse a
  // seller that guard had just cleared. The shop's own name is the honest
  // stand-in, and it keeps the two helpers agreeing (house rule 1).
  const name = named || String(seller?.businessName || '').trim();
  return address && phone && name ? { address, phone, name } : null;
};

/** The configured pickup, for a basket whose seller is not known (dev data, old orders). */
const envPickup = () => {
  const address = process.env.BORZO_PICKUP_ADDRESS;
  const phone = process.env.BORZO_PICKUP_PHONE;
  return address && phone ? { address, phone, name: 'ShopMaster Pro' } : null;
};

/**
 * Asks Borzo what it would charge to take this basket to this address.
 *
 * @param {object} address   delivery address (street, city, state, zipCode, phoneNumber)
 * @param {number} weightKg  total parcel weight
 * @param {object} [pickup]  where to collect (`sameDayPickupFor`). Omitted =
 *                           the configured address; **null = this seller has no
 *                           pickup, so there is nothing to quote**.
 * @returns {{price: number, arrivalBy: Date, provider: 'borzo'}|null} null when
 *          unavailable for any reason - not configured, not serviceable, or down
 */
const quoteSameDay = async (address, weightKg, pickupPoint) => {
  if (!isConfigured()) return null;

  const from = pickupPoint === undefined ? envPickup() : pickupPoint;
  if (!from) return null;
  const pickup = from.address;
  const pickupPhone = from.phone;

  const drop = [address.street, address.landmark, address.city, address.state, address.zipCode]
    .filter(Boolean)
    .join(', ');

  try {
    const { data } = await axios.post(
      `${baseUrl()}/api/business/${API_VERSION}/calculate-order`,
      {
        // Never a category: one Borzo account serves every seller, and
        // ShopMaster Pro sells anything (CLAUDE.md - nothing in the frame may
        // name a category). "Jewellery and accessories" was true only while the
        // house shop was the only seller.
        matter: 'Retail goods',
        total_weight_kg: weightKg,
        vehicle_type_id: VEHICLE_MOTORBIKE,
        points: [
          {
            address: pickup,
            contact_person: { name: from.name, phone: pickupPhone },
          },
          {
            address: drop,
            contact_person: {
              // The person, not the address's nickname. See shiprocketBooking.
              // A quote needs no recipient name, and quoteSameDay has no order.
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
const bookSameDay = async (order, address, weightKg, pickupPoint) => {
  if (!isConfigured()) return { ok: false, reason: 'Same-day courier is not configured' };

  const from = pickupPoint === undefined ? envPickup() : pickupPoint;
  if (!from) {
    // Said as the seller would read it: the shop, not the platform, is the one
    // that can fix this, and the message says where.
    return { ok: false, reason: 'Add your pickup address in Settings before booking a same-day rider' };
  }
  const pickup = from.address;
  const pickupPhone = from.phone;

  const drop = [address.street, address.landmark, address.city, address.state, address.zipCode]
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
          { address: pickup, contact_person: { name: from.name, phone: pickupPhone } },
          {
            address: drop,
            contact_person: {
              name: order?.customerId?.name || address.label || 'Customer',
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

/*
 * THE WALLET (19 Sep 2026)
 *   Borzo books against a prepaid balance. With ₹0 the quote still succeeds
 *   and the BOOKING fails - after the customer has paid for same-day. So the
 *   balance is read before the option is offered: not enough for this
 *   delivery, no same-day on the checkout, and the admin hears once a day.
 *   GET /client returns balance_amount; cached ten minutes so a checkout
 *   does not cost a second round trip. A failed read counts as "unknown"
 *   and does NOT hide the option - the booking path already fails loudly.
 */
let balanceCache = { at: 0, amount: null };
const BALANCE_TTL_MS = 10 * 60 * 1000;

const balance = async ({ fresh = false } = {}) => {
  if (!isConfigured()) return null;
  if (!fresh && Date.now() - balanceCache.at < BALANCE_TTL_MS) return balanceCache.amount;
  try {
    const { data } = await axios.get(`${baseUrl()}/api/business/${API_VERSION}/client`, { headers: { 'X-DV-Auth-Token': process.env.BORZO_API_TOKEN }, timeout: 8000 });
    const amount = data?.is_successful && data.client ? Number(data.client.balance_amount) : null;
    balanceCache = { at: Date.now(), amount: Number.isFinite(amount) ? amount : null };
  } catch (err) {
    console.error('borzo balance read failed:', err.response?.data?.message || err.message);
    balanceCache = { at: Date.now(), amount: null };
  }
  return balanceCache.amount;
};

/** Whether the wallet can pay for a delivery quoted at `price`; null when unknown. */
const canAfford = async (price) => {
  const amount = await balance();
  if (amount === null) return null;
  return amount >= Number(price || 0);
};

/** Tests. */
const _resetBalanceCache = () => {
  balanceCache = { at: 0, amount: null };
};

module.exports = {
  balance,
  canAfford,
  _resetBalanceCache,
  isPending,
  sameDayPickupFor,
  quoteSameDay,
  bookSameDay,
  cancelSameDay,
  isConfigured,
  VEHICLE_MOTORBIKE,
};
