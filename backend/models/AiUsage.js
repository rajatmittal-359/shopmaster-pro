const mongoose = require('mongoose');

/**
 * How much AI each account has used today, and how much the whole shop has.
 *
 * WHY IT EXISTS
 *   Every provider here is free only up to a line, and one of those lines
 *   (Pollen, for the premium image model) is about seven images a day for the
 *   entire platform. Without a counter, the first seller to discover the
 *   button would spend everyone's premium quota before breakfast - and the
 *   counter is also what lets the admin panel SHOW where the day's allowance
 *   went, instead of nobody knowing until a request fails.
 *
 * ONE ROW PER (scope, key, day)
 *   scope 'user' + a user id is a seller's own day. scope 'global' + 'all' is
 *   the platform's day. Both are bumped on every success, so a per-seller cap
 *   and a platform-wide cap can be read from the same collection.
 *
 * The day is a string in IST, because that is the day the seller is living in
 * and the day the free allowances reset closest to.
 */
const aiUsageSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['user', 'global'], required: true },
    key: { type: String, required: true },
    day: { type: String, required: true }, // YYYY-MM-DD, IST

    texts: { type: Number, default: 0 },
    images: { type: Number, default: 0 },
    premiumImages: { type: Number, default: 0 },

    // Which provider actually answered, for the admin's "where did it go".
    byProvider: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

aiUsageSchema.index({ scope: 1, key: 1, day: 1 }, { unique: true });

/** Today, as the seller sees it. */
aiUsageSchema.statics.today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** Read a row without creating it. */
aiUsageSchema.statics.read = async function (scope, key) {
  const row = await this.findOne({ scope, key, day: this.today() }).lean();
  return row || { texts: 0, images: 0, premiumImages: 0, byProvider: {} };
};

/**
 * Record one success. `$inc` with upsert, so two requests landing together
 * both count - the check-before happens in the controller and is allowed to
 * be a little generous under a race; the count is never allowed to be wrong.
 */
aiUsageSchema.statics.record = async function (userId, { kind, provider, premium = false }) {
  const day = this.today();
  const inc = {};
  if (kind === 'text') inc.texts = 1;
  if (kind === 'image') {
    inc.images = 1;
    if (premium) inc.premiumImages = 1;
  }
  if (provider) inc[`byProvider.${provider}`] = 1;

  await Promise.all([
    this.updateOne({ scope: 'user', key: String(userId), day }, { $inc: inc }, { upsert: true }),
    this.updateOne({ scope: 'global', key: 'all', day }, { $inc: inc }, { upsert: true }),
  ]);
};

module.exports = mongoose.model('AiUsage', aiUsageSchema);
