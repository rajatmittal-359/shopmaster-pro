const axios = require('axios');

const { BUSINESS } = require('../config/business');
// Module object, not destructured: the token call is replaced in tests, and a
// destructured copy binds the real function forever.
const shiprocket = require('./shiprocketBooking');

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

/**
 * Booking a courier to collect goods FROM the customer.
 *
 * WHY THIS IS NOT JUST THE FORWARD BOOKING WITH THE ADDRESSES SWAPPED
 *   It nearly is, and that is the trap. Shiprocket keeps the same field NAMES
 *   for a return and reverses what they mean:
 *
 *     pickup_*    the CUSTOMER - the goods are collected from them
 *     shipping_*  US - the goods are shipped back to the shop
 *
 *   Fill those in the forward sense and a courier is sent to our own door to
 *   collect a parcel that is sitting in somebody's house, and the money is
 *   spent either way. So the names are deliberately spelled out below rather
 *   than mapped from a shared helper, where the mistake would be invisible.
 *
 * WHY payment_method IS ALWAYS PREPAID
 *   Their docs are explicit: "This should always be prepaid." It is not a
 *   statement about how the customer originally paid - a COD order's return is
 *   still Prepaid here. Nobody collects cash for a return.
 *
 * WHY QC IS ON
 *   With QC enabled the pickup agent checks the item at the customer's door
 *   before taking it. For jewellery that is the whole ballgame: it is the only
 *   point at which "they sent back an empty box" can be caught by somebody with
 *   no stake in the answer, rather than argued about a week later between a
 *   seller and a customer who each remember it differently.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It does not book itself. A return pickup costs real money out of the
 *   Shiprocket wallet, and whether a particular return is worth collecting is a
 *   judgement - a Rs 40 item may not be. A person presses the button.
 */

const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
});

/** Split "Abha Mittal" into the two fields Shiprocket insists on. */
const splitName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: 'Customer', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
};

/**
 * @param {object} order       the order being returned
 * @param {object} fulfilment  the parcel coming back
 * @param {object} address     the customer's address it is collected from
 * @param {object} opts        { customerName, customerEmail, weightKg, items, sellerAddress }
 * @returns {Promise<{ok: boolean, reason?: string, orderId?, shipmentId?, status?}>}
 */
const bookReturnPickup = async (order, fulfilment, address, opts = {}) => {
  const { customerName, customerEmail, weightKg = 0.5, items = [], sellerAddress } = opts;

  /*
   * The goods go back to whoever sold them, not to the platform.
   *
   * A third-party seller's returned items delivered to the platform's door is
   * the same mistake as collecting from the wrong door, at the other end of
   * the journey - and it is the platform left holding somebody else's stock.
   * The shop's own address is the fallback only because the shop IS the
   * platform seller.
   */
  const home = sellerAddress?.address1
    ? {
        contactName: sellerAddress.contactName || BUSINESS.contactName,
        address1: sellerAddress.address1,
        address2: sellerAddress.address2 || '',
        city: sellerAddress.city,
        state: sellerAddress.state,
        country: 'India',
        pincode: sellerAddress.pincode,
        phone: sellerAddress.phone,
        email: BUSINESS.email,
      }
    : BUSINESS;

  if (!address?.zipCode || !address?.street) {
    return { ok: false, reason: 'The customer has no usable address to collect from' };
  }
  if (!items.length) {
    return { ok: false, reason: 'There are no items on this return' };
  }

  const who = splitName(customerName || address.fullName);
  const subTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const payload = {
    /*
     * Their own reference for this return. Suffixed so it can never collide
     * with the FORWARD order of the same name - Shiprocket treats order_id as
     * the key and would otherwise hand back the outbound shipment.
     */
    order_id: `${order.orderNumber}-RET`,
    order_date: new Date().toISOString().slice(0, 10),

    // ---- pickup: THE CUSTOMER. The goods are with them. ------------------
    pickup_customer_name: who.first,
    pickup_last_name: who.last,
    pickup_address: address.street,
    pickup_address_2: address.landmark || '',
    pickup_city: address.city,
    pickup_state: address.state,
    pickup_country: address.country || 'India',
    pickup_pincode: Number(address.zipCode),
    pickup_email: customerEmail || BUSINESS.email,
    pickup_phone: String(address.phoneNumber || ''),
    pickup_isd_code: '91',

    // ---- shipping: US. The goods are coming back here. -------------------
    shipping_customer_name: home.contactName,
    shipping_last_name: '',
    shipping_address: home.address1,
    shipping_address_2: home.address2 || '',
    shipping_city: home.city,
    shipping_state: home.state,
    shipping_country: home.country || 'India',
    shipping_pincode: Number(home.pincode),
    shipping_email: home.email,
    shipping_phone: Number(String(home.phone).replace(/\D/g, '').slice(-10)),
    shipping_isd_code: '91',

    order_items: items.map((item, index) => ({
      name: item.name,
      // We do not keep SKUs, and it is required. The product id is stable,
      // unique, and means something when read back in their panel.
      sku: String(item.productId || `ITEM-${index + 1}`),
      units: item.quantity,
      selling_price: item.price,
      discount: 0,

      /*
       * The agent checks the item before taking it. qc_product_name and
       * qc_product_image are required once this is on, and an image we cannot
       * supply would fail the whole booking - so QC is only claimed for items
       * that actually have a picture.
       */
      qc_enable: Boolean(item.image),
      ...(item.image
        ? { qc_product_name: item.name, qc_product_image: item.image }
        : {}),
    })),

    // Always Prepaid, whatever the original order was. Nobody collects cash on
    // a return - their docs are explicit about this.
    payment_method: 'Prepaid',
    total_discount: '0',
    sub_total: subTotal,

    // Shiprocket rejects zeroes. These are the same defaults the forward
    // booking uses for a small jewellery parcel.
    length: 12,
    breadth: 12,
    height: 6,
    weight: Math.max(0.5, Number(weightKg) || 0.5),
  };

  try {
    const token = await shiprocket.getToken();
    const { data } = await axios.post(`${BASE_URL}/orders/create/return`, payload, {
      headers: authHeaders(token),
      timeout: 20000,
    });

    if (!data?.order_id) {
      return {
        ok: false,
        reason: data?.message || 'Shiprocket did not return a return order',
      };
    }

    return {
      ok: true,
      orderId: String(data.order_id),
      shipmentId: data.shipment_id ? String(data.shipment_id) : null,
      // "RETURN PENDING" / 21 on a fresh booking.
      status: data.status || null,
    };
  } catch (err) {
    const body = err.response?.data;
    return {
      ok: false,
      reason:
        body?.message ||
        // Their validation errors arrive as { errors: { field: [msg] } }.
        (body?.errors && Object.values(body.errors).flat().join('; ')) ||
        err.message ||
        'Could not book the return pickup',
    };
  }
};

module.exports = { bookReturnPickup, splitName };
