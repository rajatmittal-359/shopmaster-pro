/**
 * HTTP caching policy.
 *
 * THE RULE THAT MATTERS MOST: default to not caching.
 *
 * A `public` cache header on an authenticated response is a data leak, not a
 * performance win - a shared cache (a CDN, a corporate proxy) may hand one
 * customer's cart or order list to the next person who asks for the same URL.
 * So `noStore` is applied to everything, and only the genuinely public,
 * anonymous catalogue routes opt back in.
 *
 * WHY IT IS WORTH DOING AT ALL
 *   The catalogue is read on every page load, is identical for every visitor,
 *   and changes rarely. Without a max-age the browser revalidates on each
 *   navigation: a full round trip to Render just to be told 304 Not Modified.
 *   Sixty seconds of freshness removes that trip entirely for repeat views and
 *   costs at most a minute of staleness on a price or stock figure.
 *
 *   stale-while-revalidate lets a cache serve the slightly-old copy instantly
 *   while it refreshes in the background, so a visitor never waits on a
 *   cold backend.
 */

/** Public catalogue: safe to share, cheap to refresh. */
const PUBLIC_MAX_AGE = 60; // seconds a response stays fresh
const PUBLIC_SWR = 300; // seconds it may be served stale while revalidating

/**
 * Anything personal, authenticated or transactional.
 * Applied globally so a new route is private by default and has to opt out.
 */
const noStore = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

/**
 * The anonymous product catalogue.
 *
 * Only ever mounted on routes that take no user identity into account. If a
 * route here ever starts varying by user, it must be moved back to noStore.
 */
const publicCatalogue = (req, res, next) => {
  // A write must never be cached, even on an otherwise public route.
  if (req.method !== 'GET') {
    res.set('Cache-Control', 'no-store');
    return next();
  }

  res.set(
    'Cache-Control',
    `public, max-age=${PUBLIC_MAX_AGE}, stale-while-revalidate=${PUBLIC_SWR}`
  );
  next();
};

module.exports = { noStore, publicCatalogue, PUBLIC_MAX_AGE, PUBLIC_SWR };
