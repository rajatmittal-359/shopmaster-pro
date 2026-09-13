const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { CATEGORIES, prefsOf } = require('../utils/notify');
const { sendError } = require('../utils/apiError');

/**
 * The bell (plan 2.30) - for every signed-in role, their own rows only.
 *
 *   GET   /notifications?role=seller&before=<iso>&limit=30   newest first, one page
 *   GET   /notifications/unread-count?role=seller
 *   PATCH /notifications/:id/read
 *   POST  /notifications/read-all?role=seller
 *   GET   /notifications/preferences          categories + this person's push/email switches
 *   PATCH /notifications/preferences          { push: {orders:false}, email: {...} } - partial, merged
 *
 * `role` scopes the list to the panel asking: one account that both buys
 * and sells sees its customer rows in the storefront bell and its seller
 * rows in the seller panel. Omitted = every row.
 */
const roleFilter = (req) => (['customer', 'seller', 'admin'].includes(req.query.role) ? { role: req.query.role } : {});

exports.list = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const filter = { userId: req.user._id, ...roleFilter(req) };
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };
    const rows = await Notification.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean();
    const more = rows.length > limit;
    const items = (more ? rows.slice(0, limit) : rows).map((r) => ({ _id: r._id, category: r.category, title: r.title, body: r.body, url: r.url, readAt: r.readAt, createdAt: r.createdAt }));
    const unread = await Notification.countDocuments({ userId: req.user._id, ...roleFilter(req), readAt: null });
    res.json({ items, more, unread, nextBefore: more ? items[items.length - 1].createdAt : null });
  } catch (error) {
    sendError(res, error);
  }
};

exports.unreadCount = async (req, res) => {
  try {
    const unread = await Notification.countDocuments({ userId: req.user._id, ...roleFilter(req), readAt: null });
    res.set('Cache-Control', 'private, max-age=20');
    res.json({ unread });
  } catch (error) {
    sendError(res, error);
  }
};

exports.markRead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid id' });
    const r = await Notification.updateOne({ _id: req.params.id, userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true, changed: r.modifiedCount || 0 });
  } catch (error) {
    sendError(res, error);
  }
};

exports.readAll = async (req, res) => {
  try {
    const r = await Notification.updateMany({ userId: req.user._id, ...roleFilter(req), readAt: null }, { $set: { readAt: new Date() } });
    res.json({ ok: true, changed: r.modifiedCount || 0 });
  } catch (error) {
    sendError(res, error);
  }
};

exports.getPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notificationPrefs role').lean();
    // The trust category is the admin's alone; nobody else is asked about it.
    const categories = CATEGORIES.filter((c) => c.key !== 'trust' || req.user.role === 'admin');
    res.json({ categories, prefs: prefsOf(user) });
  } catch (error) {
    sendError(res, error);
  }
};

exports.setPreferences = async (req, res) => {
  try {
    const keys = CATEGORIES.map((c) => c.key);
    const $set = {};
    for (const ch of ['push', 'email']) {
      const given = req.body?.[ch];
      if (!given || typeof given !== 'object') continue;
      for (const [k, v] of Object.entries(given)) {
        if (!keys.includes(k)) return res.status(400).json({ message: `Unknown category "${k}"` });
        if (typeof v !== 'boolean') return res.status(400).json({ message: `${ch}.${k} must be true or false` });
        $set[`notificationPrefs.${ch}.${k}`] = v;
      }
    }
    if (!Object.keys($set).length) return res.status(400).json({ message: 'Send { push: {...} } and/or { email: {...} } with true/false per category.' });
    await User.updateOne({ _id: req.user._id }, { $set });
    const user = await User.findById(req.user._id).select('notificationPrefs').lean();
    res.json({ ok: true, prefs: prefsOf(user) });
  } catch (error) {
    sendError(res, error);
  }
};
