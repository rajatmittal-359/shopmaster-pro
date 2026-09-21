const PushSubscription = require('../models/PushSubscription');

/**
 * Web Push to a seller's devices (plan 2.26).
 *
 * WHY
 *   notifySeller mails the seller on a new order, a return and a dispute.
 *   Mail reaches a phone, but only when the phone is opened. A push lands
 *   on the lock screen the same second - what Meesho's and Shopify's apps
 *   do, done with the browser's own standard (VAPID, RFC 8292): Android
 *   Chrome outright, iPhone once the site is added to the Home Screen.
 *
 * WHAT THIS IS
 *   sendToUser(userId, {title, body, url, tag}) - one payload to every
 *   device the user registered. Never throws: a push failure must not fail
 *   the order that caused it. 404/410 from the push service = the browser
 *   dropped the subscription; the row is deleted so we stop trying.
 *
 * KEYS
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT in .env (generate
 *   once with `npm run vapid`). Without them every call is a recorded no-op
 *   - tests, and a laptop that never set them, send nothing.
 *
 * `transport` is a seam: tests swap `transport.send`; production uses web-push.
 */
const transport = {
  send: async (subscription, payload) => {
    const webpush = require('web-push');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    return webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, payload, { TTL: 60 * 60 * 6, urgency: 'high' });
  },
};

const configured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);

/** What the page hands us must look like a browser's PushSubscription, over https, and small. */
const validateSubscription = (s) => {
  if (!s || typeof s !== 'object') return { ok: false, reason: 'No subscription was sent' };
  const endpoint = String(s.endpoint || '');
  if (!/^https:\/\/[^\s]{8,}$/i.test(endpoint) || endpoint.length > 2048) return { ok: false, reason: 'The subscription endpoint must be an https URL' };
  const p256dh = String(s.keys?.p256dh || '');
  const auth = String(s.keys?.auth || '');
  if (!p256dh || !auth || p256dh.length > 256 || auth.length > 256) return { ok: false, reason: 'The subscription is missing its keys' };
  return { ok: true, endpoint, keys: { p256dh, auth } };
};

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {{title:string, body:string, url:string, tag?:string}} note  url is a panel path, e.g. /seller/orders/<id>
 * @returns {Promise<{sent:number, pruned?:number, failed?:number, reason?:string}>}
 */
const sendToUser = async (userId, note) => {
  if (!configured()) return { sent: 0, reason: 'push not configured' };
  let subs = [];
  try {
    subs = await PushSubscription.find({ userId }).lean();
  } catch (err) {
    console.error('Push: could not read subscriptions:', err.message);
    return { sent: 0, reason: 'subscriptions unavailable' };
  }
  if (!subs.length) return { sent: 0, reason: 'no devices' };

  const payload = JSON.stringify({ title: String(note.title || 'ShopMaster Pro').slice(0, 80), body: String(note.body || '').slice(0, 200), url: String(note.url || '/seller'), tag: note.tag ? String(note.tag).slice(0, 60) : undefined });
  let sent = 0, pruned = 0, failed = 0;
  for (const s of subs) {
    try {
      await transport.send(s, payload);
      sent += 1;
      PushSubscription.updateOne({ _id: s._id }, { $set: { lastSentAt: new Date() } }).catch(require('./quiet').quiet('push subscription cleanup'));
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        pruned += 1;
        await PushSubscription.deleteOne({ _id: s._id }).catch(require('./quiet').quiet('push subscription cleanup'));
      } else {
        failed += 1;
        console.error(`Push to ${s.endpoint.slice(0, 40)}… failed:`, err?.message || err);
      }
    }
  }
  return { sent, pruned, failed };
};

module.exports = { sendToUser, validateSubscription, configured, transport };
