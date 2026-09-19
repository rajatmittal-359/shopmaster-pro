const sellerRules = require('../config/sellerRules');

/**
 * A seller's account health, the way Amazon's Account Health and Meesho's
 * Quality page put it: a handful of numbers, each beside the line the
 * rulebook draws, so the seller sees trouble before the admin writes.
 *
 * Pure: given the seller's orders (their fulfilments) and products for the
 * window, it returns the metrics. The controller fetches; this decides.
 *
 * WHAT COUNTS
 *   cancelRate     orders this seller cancelled ÷ their paid/COD orders (30 d)
 *   dispatchHours  median hours from order to shipped, paid orders (30 d)
 *   lateDispatch   share shipped after the rulebook's dispatch window
 *   ndr            parcels with a failed delivery attempt (30 d)
 *   rto            parcels that came back undelivered (status returned, no return request)
 *   rating         review average across their products, weighted by count
 *   listingQuality average listing score across active products
 *
 * Each metric carries `status`: 'good' | 'watch' | 'review' against the
 * thresholds below - the same numbers the Seller Agreement states.
 */
const HOUR = 3600000;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const grade = (value, { good, review }, higherIsBetter = false) => {
  if (value == null) return 'none';
  if (higherIsBetter) return value >= good ? 'good' : value >= review ? 'watch' : 'review';
  return value <= good ? 'good' : value < review ? 'watch' : 'review';
};

/**
 * @param {object} p
 * @param {Array} p.orders       orders containing this seller's lines, each with `fulfilments`, `createdAt`, `cancelledBy`, `paymentMethod`, `paymentStatus`
 * @param {string} p.sellerId
 * @param {Array} p.products     this seller's active products with avgRating, totalReviews, and a precomputed `score`
 * @param {Date}  [p.now]
 */
const computePerformance = ({ orders = [], sellerId, products = [], now = new Date() }) => {
  const since = new Date(now.getTime() - 30 * 86400000);
  const mine = (o) => (o.fulfilments || []).find((f) => String(f.sellerId) === String(sellerId));
  const recent = orders.filter((o) => new Date(o.createdAt) >= since && mine(o));
  const actionable = recent.filter((o) => o.paymentMethod !== 'razorpay' || o.paymentStatus !== 'pending');

  const cancelledBySeller = actionable.filter((o) => o.cancelledBy === 'seller' && mine(o)?.status === 'cancelled').length;
  const cancelRate = actionable.length ? Math.round((cancelledBySeller / actionable.length) * 1000) / 10 : null;

  const shipped = actionable
    .map((o) => ({ f: mine(o), at: new Date(o.createdAt) }))
    .filter(({ f }) => f?.shippedAt);
  const dispatchTimes = shipped.map(({ f, at }) => (new Date(f.shippedAt) - at) / HOUR);
  const dispatchHours = dispatchTimes.length ? Math.round(median(dispatchTimes)) : null;
  const windowHours = sellerRules.dispatchDays * 24;
  // Late = after the order's own dispatch-by date when it has one (a made-to-order
  // line earns its longer window, utils/dispatch); the rulebook window otherwise.
  const isLate = ({ f, at }) => (f.dispatchBy ? new Date(f.shippedAt) > new Date(f.dispatchBy) : (new Date(f.shippedAt) - at) / HOUR > windowHours);
  const lateDispatch = shipped.length ? Math.round((shipped.filter(isLate).length / shipped.length) * 1000) / 10 : null;

  const ndr = recent.filter((o) => (mine(o)?.ndrAttempts || 0) > 0).length;
  const rto = recent.filter((o) => mine(o)?.status === 'returned' && !mine(o)?.returnStage).length;

  const rated = products.filter((p) => p.totalReviews > 0);
  const ratingN = rated.reduce((n, p) => n + p.totalReviews, 0);
  const rating = ratingN ? Math.round((rated.reduce((n, p) => n + p.avgRating * p.totalReviews, 0) / ratingN) * 10) / 10 : null;

  const scored = products.filter((p) => typeof p.score === 'number');
  const listingQuality = scored.length ? Math.round(scored.reduce((n, p) => n + p.score, 0) / scored.length) : null;

  return {
    days: 30,
    orders: actionable.length,
    cancelRate: { value: cancelRate, count: cancelledBySeller, status: grade(cancelRate, { good: 2, review: sellerRules.cancelRateReviewPct }), threshold: sellerRules.cancelRateReviewPct },
    dispatchHours: { value: dispatchHours, status: grade(dispatchHours, { good: 24, review: windowHours }), threshold: windowHours, shipped: dispatchTimes.length },
    lateDispatch: { value: lateDispatch, status: grade(lateDispatch, { good: 5, review: 20 }) },
    ndr: { value: ndr, status: grade(ndr, { good: 0, review: 3 }) },
    rto: { value: rto, status: grade(rto, { good: 0, review: 2 }) },
    rating: { value: rating, count: ratingN, status: grade(rating, { good: 4.2, review: 3.5 }, true) },
    listingQuality: { value: listingQuality, products: scored.length, status: grade(listingQuality, { good: 80, review: 60 }, true) },
  };
};

module.exports = { computePerformance, median, grade };
