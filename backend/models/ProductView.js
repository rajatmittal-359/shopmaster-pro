const mongoose = require('mongoose');

/**
 * One row per product per day: how many times its page was opened.
 *
 * WHY THIS EXISTS (27 Sep 2026)
 *   The per-product report page (WHAT-IS-LEFT 3b) is modelled on Etsy's
 *   per-listing Stats, and most of what makes that page worth opening is
 *   views. Nothing counted them here: no field on Product, no model, and GA4
 *   is client-side and never queried by us. A report page that can only say
 *   "Google showed it 34 times" and nothing about the shop's own visitors is
 *   half a page.
 *
 * WHY A DAY BUCKET AND NOT A COUNTER ON THE PRODUCT
 *   A single `views` number can only ever answer "how many, ever". A day row
 *   answers "how many this month", "is it rising", and later feeds a
 *   sparkline - at the cost of one small upsert per page view, which on a
 *   catalogue this size is nothing. The day is stored as a plain YYYY-MM-DD
 *   string in IST, because that is the day a Jaipur seller means.
 *
 * WHAT IS NOT COUNTED
 *   The seller looking at their own listing, and anything that announces
 *   itself as a bot. Neither is a shopper, and a number a seller can inflate
 *   by refreshing is a number they will stop believing.
 */
const productViewSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true }, // YYYY-MM-DD, IST
    count: { type: Number, default: 0 },
  },
  { timestamps: false, versionKey: false }
);

productViewSchema.index({ productId: 1, day: 1 }, { unique: true });
// The shop-level read ("my busiest listings this month") without a scan.
productViewSchema.index({ sellerId: 1, day: 1 });

module.exports = mongoose.models.ProductView || mongoose.model('ProductView', productViewSchema);
