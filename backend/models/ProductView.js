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

    /*
     * WHERE THOSE VIEWS CAME FROM (28 Sep 2026)
     *
     *   Etsy's per-listing Stats is mostly Traffic Sources, and it is the
     *   half a seller can act on: a forward that worked is worth repeating,
     *   search words that bring nobody are worth rewriting. `count` alone
     *   cannot tell them which.
     *
     *   Five named numbers rather than a Map or a free-text string, because
     *   the set is closed and a schema that accepts anything is a schema that
     *   will eventually hold a URL. `web/src/components/product/ViewPing`
     *   decides the bucket in the browser and sends ONLY the word - the
     *   referring address never reaches us at all, so there is nothing here
     *   to leak or to scrub later.
     *
     *   They sum to `count` for rows written after today; older rows have
     *   the total and zeroes, which the report page states rather than
     *   drawing as "100% direct".
     */
    sources: {
      direct: { type: Number, default: 0 }, // typed, bookmarked, or a link that sent no referrer
      site: { type: Number, default: 0 }, // our own shop, search or category pages
      search: { type: Number, default: 0 }, // Google and the other engines
      social: { type: Number, default: 0 }, // WhatsApp, Instagram, Facebook and the rest
      other: { type: Number, default: 0 }, // a real referrer that is none of the above
    },
  },
  { timestamps: false, versionKey: false }
);

productViewSchema.index({ productId: 1, day: 1 }, { unique: true });
// The shop-level read ("my busiest listings this month") without a scan.
productViewSchema.index({ sellerId: 1, day: 1 });

module.exports = mongoose.models.ProductView || mongoose.model('ProductView', productViewSchema);
