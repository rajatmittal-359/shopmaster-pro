const mongoose = require('mongoose');

/**
 * One browser on one device that agreed to be woken (plan 2.26).
 *
 * WHY
 *   A seller's phone should buzz when an order lands - the way Meesho's or
 *   Shopify's apps do - without us shipping an app. The browser's Web Push
 *   gives that for free: the page asks permission once, the browser hands us
 *   an endpoint + two keys, and we post to it. This is that handoff, kept
 *   per device so a seller with a phone and a laptop gets both.
 *
 *   The endpoint is the identity (unique). A push service answering 404/410
 *   means the browser dropped the subscription; the sender deletes the row.
 */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 256 },
      auth: { type: String, required: true, maxlength: 256 },
    },
    /** Browser + OS as the page reported it - "Chrome · Android" on the Settings list. */
    label: { type: String, trim: true, maxlength: 120, default: '' },
    lastSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);
