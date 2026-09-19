/**
 * Meta Conversions API - the server-side copy of Purchase (19 Sep 2026).
 *
 * WHY A SERVER COPY OF AN EVENT THE PIXEL ALREADY SENDS
 *   iOS, ad blockers and Brave drop a third to a half of browser pixel
 *   events; Meta's own numbers say advertisers see ~13% more attributed
 *   purchases once the server sends them too. A pixel that under-reports
 *   makes every future ad look worse than it is and trains the algorithm on
 *   half the truth. The browser sends Purchase with eventID = the order's
 *   database id; this sends the same id, and Meta keeps one.
 *
 * CONSENT
 *   Leaves only when the request carries `smp_consent=all` - the cookie the
 *   web app writes when the visitor pressed "Accept all" (web/src/lib/consent).
 *   No cookie, "necessary", an API call from the old app or a script: nothing
 *   is sent. Identifiers go hashed (SHA-256, lower-cased, trimmed; the phone
 *   as digits with the 91 country code) - Meta's required form, and never
 *   the plain value.
 *
 * Off without META_PIXEL_ID + META_CAPI_TOKEN. A failure is logged and never
 * touches the order: a paid order is a paid order whether Meta heard or not.
 * META_TEST_EVENT_CODE (from Events Manager > Test events) routes events to
 * the test tab while checking the wiring.
 */
const crypto = require('crypto');

const GRAPH = process.env.META_GRAPH_VERSION || 'v21.0';
const enabled = () => Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);

const sha = (v) => (v ? crypto.createHash('sha256').update(String(v)).digest('hex') : undefined);
const normEmail = (e) => (e ? String(e).trim().toLowerCase() : '');
/** Indian numbers: last ten digits with the 91 code; anything else as its digits. */
const normPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 10 ? `91${d}` : d.replace(/^0+/, '');
};

const cookies = (req) => {
  const out = {};
  for (const part of String(req?.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
};

const consented = (req) => cookies(req).smp_consent === 'all';

/** The address on the order, for the phone - loaded only when asked to send. */
const addressOf = async (order, address) => {
  if (address) return address;
  const id = order?.shippingAddressId?._id || order?.shippingAddressId;
  if (!id) return null;
  return require('../models/Address').findById(id).select('phoneNumber').lean().catch(() => null);
};

/** The Purchase payload - a pure function so a test can read it. */
const purchasePayload = ({ order, user, address, req, now = Date.now() }) => {
  const c = cookies(req);
  const items = (order.items || []).filter((i) => i.status !== 'cancelled');
  const em = sha(normEmail(user?.email));
  const ph = sha(normPhone(address?.phoneNumber));
  const userData = {
    em: em ? [em] : undefined,
    ph: ph ? [ph] : undefined,
    external_id: user?._id ? [sha(String(user._id))] : undefined,
    client_ip_address: req?.ip || undefined,
    client_user_agent: req?.headers?.['user-agent'] || undefined,
    fbp: c._fbp || undefined,
    fbc: c._fbc || undefined,
  };
  Object.keys(userData).forEach((k) => userData[k] === undefined && delete userData[k]);
  return {
    event_name: 'Purchase',
    event_time: Math.floor(now / 1000),
    event_id: String(order._id),
    action_source: 'website',
    event_source_url: `${(process.env.SITE_URL || 'https://www.shopmasterpro.in').replace(/\/$/, '')}/checkout`,
    user_data: userData,
    custom_data: {
      currency: 'INR',
      value: Number(order.totalAmount) || 0,
      content_type: 'product',
      content_ids: items.map((i) => String(i.productId?._id || i.productId)),
      num_items: items.reduce((n, i) => n + (Number(i.quantity) || 1), 0),
      order_id: String(order.orderNumber || order._id),
    },
  };
};

/**
 * Send Purchase for a confirmed order. Never throws; returns what happened.
 * `user` is the customer (req.user at checkout); `address` is optional and
 * loaded from the order when missing.
 */
const purchase = async ({ order, user, address, req }) => {
  if (!enabled()) return { ok: false, reason: 'META_PIXEL_ID / META_CAPI_TOKEN not set' };
  if (!consented(req)) return { ok: false, reason: 'no consent' };
  try {
    const data = purchasePayload({ order, user, address: await addressOf(order, address), req });
    // The token travels in the body, not the query string - URLs end up in logs.
    const body = { data: [data], access_token: process.env.META_CAPI_TOKEN };
    if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
    const url = `https://graph.facebook.com/${GRAPH}/${process.env.META_PIXEL_ID}/events`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (res.ok) return { ok: true, eventId: data.event_id };
    const text = await res.text().catch(() => '');
    console.error(`meta capi: ${res.status} for order ${order._id} - ${text.slice(0, 160)}`);
    return { ok: false, status: res.status, reason: text.slice(0, 160) };
  } catch (err) {
    console.error('meta capi: could not send for order', order?._id, '-', err.message);
    return { ok: false, reason: err.message };
  }
};

module.exports = { purchase, purchasePayload, enabled, consented, normPhone, normEmail };
