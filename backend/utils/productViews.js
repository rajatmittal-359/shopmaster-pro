const jwt = require('jsonwebtoken');
const ProductView = require('../models/ProductView');
const Product = require('../models/Product');
const { cookies, COOKIE } = require('./auth/session');

/** The day a Jaipur seller means, not UTC's. */
const istDay = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

/*
 * WHY THIS IS COUNTED FROM THE BROWSER AND NOT FROM getProduct (27 Sep 2026)
 *
 *   The first version incremented inside the public product controller. It
 *   looked like it worked - one row appeared in the database on the first
 *   test - and it was a lie. `web/src/lib/api.js` fetches the product with
 *   Next's cached fetch (`next: { revalidate: CATALOGUE_TTL }`), so the API
 *   is hit ONCE PER TTL for the whole world, not once per visitor. A hundred
 *   shoppers would have been reported as one.
 *
 *   A number a seller cannot trust is worse than no number, so the count now
 *   comes from the page itself, one beacon per render. That also drops every
 *   crawler that does not run JavaScript - which is most of them, and
 *   Googlebot hits a product page more often than a shopper does.
 */

/** Who is asking, if they happen to be signed in. Never throws. */
const softUserId = (req) => {
  try {
    const bearer = req.header('Authorization')?.replace('Bearer ', '');
    const token = bearer || cookies(req)[COOKIE.access];
    if (!token) return null;
    // `userId`, not `id` - the same field middlewares/authMiddleware reads.
    return jwt.verify(token, process.env.JWT_SECRET)?.userId || null;
  } catch {
    return null;
  }
};

/**
 * Count one opening of a product page. Never throws: a beacon is not worth an
 * error anybody sees. Returns nothing - the caller answers 204 either way, so
 * a shopper can never tell whether they were counted.
 *
 * Not counted: the seller looking at their own listing. A number a seller can
 * inflate by refreshing is a number they will stop believing.
 */
const countView = async (productId, req) => {
  try {
    const product = await Product.findById(productId).select('sellerId').lean();
    if (!product?.sellerId) return;

    const who = softUserId(req);
    if (who && String(who) === String(product.sellerId)) return;

    await ProductView.updateOne(
      { productId: product._id, day: istDay() },
      { $inc: { count: 1 }, $setOnInsert: { sellerId: product.sellerId } },
      { upsert: true }
    );
  } catch {
    /* counting a view must never be the reason anything fails */
  }
};

/**
 * The arithmetic, kept pure and separate so it can be tested without a
 * database: which rows fall inside the window, and which are only history.
 * The window is today plus the `days - 1` days before it, by IST dates - a
 * view at 01:00 in Jaipur belongs to that day, not to yesterday in UTC.
 */
const summariseViews = (rows = [], days = 28, now = new Date()) => {
  const from = istDay(new Date(now.getTime() - (days - 1) * 86400000));
  const total = rows.reduce((n, r) => n + (r.count || 0), 0);
  const recent = rows.filter((r) => r.day >= from).reduce((n, r) => n + (r.count || 0), 0);
  return { total, recent, days };
};

/** Total ever, and the last `days` days, for one product. */
const viewsFor = async (productId, days = 28) =>
  summariseViews(await ProductView.find({ productId }).select('day count').lean(), days);

module.exports = { countView, viewsFor, summariseViews, istDay };
