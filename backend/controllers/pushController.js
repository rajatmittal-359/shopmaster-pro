const PushSubscription = require('../models/PushSubscription');
const push = require('../utils/push');
const { sendError } = require('../utils/apiError');

/**
 * The seller's "Turn on notifications" button, server side (plan 2.26).
 *
 *   GET    /seller/push/public-key   the VAPID public key the browser subscribes with
 *   GET    /seller/push              this seller's devices (Settings shows them)
 *   POST   /seller/push/subscribe    { subscription, label } - save one device
 *   DELETE /seller/push/subscribe    { endpoint } - forget one device
 *   POST   /seller/push/test         buzz every device now - the seller sees it work
 *
 * A subscription is saved per endpoint (unique); posting the same one again
 * just refreshes it. Only the seller's own rows are ever read or deleted.
 */
exports.publicKey = (req, res) => {
  if (!push.configured()) return res.status(503).json({ message: 'Notifications are not switched on for this server yet.' });
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

exports.list = async (req, res) => {
  try {
    const rows = await PushSubscription.find({ userId: req.user._id }).select('endpoint label lastSentAt createdAt').sort({ createdAt: -1 }).lean();
    res.json({ configured: push.configured(), devices: rows.map((r) => ({ endpoint: r.endpoint, label: r.label, lastSentAt: r.lastSentAt, createdAt: r.createdAt })) });
  } catch (error) {
    sendError(res, error);
  }
};

exports.subscribe = async (req, res) => {
  try {
    if (!push.configured()) return res.status(503).json({ message: 'Notifications are not switched on for this server yet.' });
    const v = push.validateSubscription(req.body?.subscription);
    if (!v.ok) return res.status(400).json({ message: v.reason });
    const label = String(req.body?.label || '').slice(0, 120);
    await PushSubscription.findOneAndUpdate(
      { endpoint: v.endpoint },
      { $set: { userId: req.user._id, keys: v.keys, label } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || '');
    if (!endpoint) return res.status(400).json({ message: 'Which device? Send its endpoint.' });
    const r = await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
    res.json({ ok: true, removed: r.deletedCount || 0 });
  } catch (error) {
    sendError(res, error);
  }
};

exports.test = async (req, res) => {
  try {
    const r = await push.sendToUser(req.user._id, {
      title: 'ShopMaster Pro',
      body: 'नोटिफ़िकेशन चालू हैं · Notifications are on. नया ऑर्डर आते ही यहीं दिखेगा।',
      url: '/seller',
      tag: 'push-test',
    });
    if (!r.sent) return res.status(400).json({ message: r.reason === 'no devices' ? 'No device is registered yet - press Turn on notifications first.' : 'Nothing could be sent right now. Try again in a minute.' , detail: r });
    res.json({ ok: true, ...r });
  } catch (error) {
    sendError(res, error);
  }
};
