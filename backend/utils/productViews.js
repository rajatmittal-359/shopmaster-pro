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
 * The five buckets a visit can fall into, and the only five words accepted
 * from the browser. An allow-list, not a sanitiser: anything else becomes
 * `direct`, so a crafted body can add noise to one number and can never put
 * an arbitrary string - a URL, a script, somebody's session id - into the
 * database or into a seller's report page.
 */
const SOURCES = ['direct', 'site', 'search', 'social', 'other'];
const bucket = (from) => (SOURCES.includes(String(from)) ? String(from) : 'direct');

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
      {
        // Both in one write: the total stays the total whatever happens to
        // the split, so a bucket that is ever wrong cannot make "page opened"
        // wrong as well.
        $inc: { count: 1, [`sources.${bucket(req?.body?.from)}`]: 1 },
        $setOnInsert: { sellerId: product.sellerId },
      },
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
  const inWindow = rows.filter((r) => r.day >= from);
  const recent = inWindow.reduce((n, r) => n + (r.count || 0), 0);

  /*
   * EVERY DAY IN THE WINDOW, INCLUDING THE EMPTY ONES (28 Sep 2026)
   *
   *   A trend line drawn from the rows that exist is a lie about the shape:
   *   three views on Monday and three on Friday with nothing between reads
   *   as a flat, healthy line instead of two spikes. Days with no row are
   *   zeroes, and a zero is the fact.
   */
  const daily = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = istDay(new Date(now.getTime() - i * 86400000));
    daily.push({ day, count: inWindow.find((r) => r.day === day)?.count || 0 });
  }

  /*
   * The split covers the WINDOW, not all time, for the same reason the trend
   * line does: what a seller can still act on. Rows written before 28 Sep
   * have a total and no split at all, so `counted` says how many of the
   * window's views were bucketed - the page prints the split over that
   * number rather than implying the rest were direct.
   */
  const sources = { direct: 0, site: 0, search: 0, social: 0, other: 0 };
  for (const row of inWindow) {
    for (const key of Object.keys(sources)) sources[key] += row.sources?.[key] || 0;
  }
  const counted = Object.values(sources).reduce((a, b) => a + b, 0);

  return { total, recent, days, daily, sources, counted };
};

/** Total ever, the last `days` days, the day-by-day line and the split. */
const viewsFor = async (productId, days = 28) =>
  summariseViews(await ProductView.find({ productId }).select('day count sources').lean(), days);

module.exports = { countView, viewsFor, summariseViews, istDay };
