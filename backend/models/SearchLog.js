const mongoose = require('mongoose');

/**
 * What people type into the shop's own search box, per day (plan 2.32).
 *
 * WHY
 *   Search Console tells a seller what Google searchers typed; nothing told
 *   them what OUR shoppers typed - the more honest signal for a marketplace
 *   this size, and the one that catches Hinglish ("oxidised jhumka", "lal
 *   chudi") that Google never shows. One row per term per day, counted with
 *   $inc; `results` is the last result count, so "searched 14×, found 0" is
 *   visible - a product that should exist.
 *
 *   Terms are lower-cased and trimmed; nothing about who searched is kept.
 *   Rows expire after 180 days.
 */
const searchLogSchema = new mongoose.Schema(
  {
    term: { type: String, required: true, maxlength: 80 },
    day: { type: String, required: true }, // YYYY-MM-DD, IST
    count: { type: Number, default: 0 },
    results: { type: Number, default: null },
    lastAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

searchLogSchema.index({ term: 1, day: 1 }, { unique: true });
searchLogSchema.index({ day: 1 });
searchLogSchema.index({ lastAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

/** Fire-and-forget: never awaited by a request, never throws. */
searchLogSchema.statics.record = function record(term, results) {
  const t = String(term || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
  if (t.length < 2) return;
  const day = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  this.updateOne({ term: t, day }, { $inc: { count: 1 }, $set: { results: Number.isFinite(results) ? results : null, lastAt: new Date() } }, { upsert: true }).catch(() => {});
};

module.exports = mongoose.models.SearchLog || mongoose.model('SearchLog', searchLogSchema);
