const mongoose = require('mongoose');

/**
 * One line in a person's bell (plan 2.30).
 *
 * WHY
 *   Mail reaches a phone, push reaches a lock screen; both are gone the
 *   moment they are swiped. The bell is the record: "what happened to my
 *   shop / my order since I last looked" - Amazon Seller Central's
 *   notification list, Flipkart's order updates tab. Every event writes
 *   one of these before it goes anywhere else, so the three channels
 *   never disagree about what was said.
 *
 *   `tag` dedupes: the same event for the same person (a dispute that
 *   fires twice, a courier scan repeated) updates one row instead of
 *   stacking. `category` is what preferences route by.
 *
 *   Rows live 90 days (TTL) - long enough for a return window and a
 *   payout cycle, short enough that the collection never needs tending.
 */
const CATEGORY_KEYS = ['orders', 'returns', 'disputes', 'payouts', 'account', 'trust'];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** Which panel drew it - one account can be a customer and a seller. */
    role: { type: String, enum: ['customer', 'seller', 'admin'], required: true },
    category: { type: String, enum: CATEGORY_KEYS, required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: '', maxlength: 400 },
    /** A panel path - /seller/orders/<id>, /orders/<id>, /admin/trust. */
    url: { type: String, required: true, maxlength: 300 },
    tag: { type: String, default: null, maxlength: 80 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ userId: 1, tag: 1 }, { unique: true, partialFilterExpression: { tag: { $type: 'string' } } });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

notificationSchema.statics.CATEGORY_KEYS = CATEGORY_KEYS;

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
