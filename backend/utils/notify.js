const Notification = require('../models/Notification');
const User = require('../models/User');
const push = require('./push');
const sendSafeEmail = require('./sendSafeEmail');

/**
 * The one notification dispatcher (plan 2.30).
 *
 * WHY ONE DOOR
 *   Before this, a new order mailed the seller from notifySeller, a courier
 *   scan mailed the customer from logisticsController, and nothing was
 *   written down anywhere a person could look later. Amazon Seller Central
 *   and Shopify both do it the other way round: every event is a line in
 *   the notification list first, and the person's preferences say which
 *   channels also carry it. That is this function.
 *
 *   notify({ userId, role, category, title, body, url, tag?, mail? })
 *     1. in-app row   always (upsert by tag when given, so repeats collapse)
 *     2. push         if prefs.push[category] is on and a device exists
 *     3. email        if a `mail` was given and prefs.email[category] is on
 *
 *   Never throws. A failure here is logged; the order, scan or decision that
 *   caused it has already happened and must not be undone by a bell.
 *
 * CATEGORIES (what a person routes per channel - Amazon's list, trimmed)
 *   orders     new order (seller) · confirmed / shipped / delivered (customer)
 *   returns    return requested (seller) · approved / refused / refund (customer) · needs approval (admin)
 *   disputes   opened (seller, admin) · decided (both)
 *   payouts    paid (seller)
 *   account    application approved / suspended / commission changed (seller) · new application (admin)
 *   trust      held review / About (admin only)
 */
const CATEGORIES = [
  { key: 'orders', label: 'Orders', hint: 'New orders; confirmed, shipped, delivered' },
  { key: 'returns', label: 'Returns & refunds', hint: 'Return requests, approvals, refunds' },
  { key: 'disputes', label: 'Disputes', hint: 'Opened, replies, decisions' },
  { key: 'payouts', label: 'Payouts', hint: 'Money transferred to your bank' },
  { key: 'account', label: 'Account', hint: 'Approval, commission, rules' },
  { key: 'trust', label: 'Trust queue', hint: 'Held reviews and shop text (admin)' },
];
const KEYS = CATEGORIES.map((c) => c.key);

/** Missing = on. A preference only ever turns a channel off. */
const prefsOf = (user) => {
  const p = user?.notificationPrefs || {};
  const fill = (ch) => Object.fromEntries(KEYS.map((k) => [k, p?.[ch]?.[k] !== false]));
  return { push: fill('push'), email: fill('email') };
};

/** Seam for tests: mail goes through here. */
const transport = { mail: (m) => sendSafeEmail(m) };

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

const notify = async ({ userId, role, category, title, body = '', url, tag = null, mail = null }) => {
  if (!KEYS.includes(category)) return { inApp: false, pushed: false, mailed: false, reason: `unknown category ${category}` };
  if (!userId || !role || !title || !url) return { inApp: false, pushed: false, mailed: false, reason: 'userId, role, title and url are required' };

  const doc = { userId, role, category, title: clip(title, 120), body: clip(body, 400), url: clip(url, 300), tag: tag ? clip(tag, 80) : null };
  let inApp = false;
  try {
    if (doc.tag) await Notification.findOneAndUpdate({ userId, tag: doc.tag }, { $set: { ...doc, readAt: null }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: 'after' });
    else await Notification.create(doc);
    inApp = true;
  } catch (err) {
    console.error(`Notification row (${category}) failed:`, err.message);
  }

  let user = null;
  try {
    user = await User.findById(userId).select('email notificationPrefs').lean();
  } catch (err) {
    console.error('Notification prefs read failed:', err.message);
  }
  const prefs = prefsOf(user);

  let pushed = false;
  if (prefs.push[category]) {
    try {
      const r = await push.sendToUser(userId, { title: doc.title, body: doc.body.slice(0, 200), url: doc.url, tag: doc.tag || undefined });
      pushed = (r?.sent || 0) > 0;
    } catch (err) {
      console.error(`Notification push (${category}) failed:`, err.message);
    }
  }

  let mailed = false;
  if (mail && prefs.email[category] && user?.email) {
    try {
      await transport.mail({ toUserId: userId, toEmail: user.email, subject: mail.subject, html: mail.html, text: mail.text });
      mailed = true;
    } catch (err) {
      console.error(`Notification mail (${category}) failed:`, err.message);
    }
  }

  return { inApp, pushed, mailed };
};

/** Every admin, for the events the platform itself must see. */
const notifyAdmins = async (note) => {
  let admins = [];
  try {
    admins = await User.find({ role: 'admin' }).select('_id').lean();
  } catch (err) {
    console.error('Admin list failed:', err.message);
    return [];
  }
  return Promise.all(admins.map((a) => notify({ ...note, userId: a._id, role: 'admin' })));
};

module.exports = { notify, notifyAdmins, CATEGORIES, prefsOf, transport };
