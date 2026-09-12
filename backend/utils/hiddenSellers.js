const Seller = require('../models/Seller');

/**
 * Sellers whose products must not be on the storefront right now.
 *
 * WHY THIS EXISTS
 *   Suspending a seller blocked their panel and 404'd their shop page, but
 *   their products stayed in every list, in suggest, on their own pages and
 *   in the sitemap - the messy-data pass (seedMessy.js, 13 Sep 2026) put a
 *   suspended seller in the database and the storefront did not notice.
 *   Amazon and Flipkart pull a suspended seller's listings the same minute.
 *
 * HOW
 *   One cached lookup (a minute) of suspended sellers' user ids, and every
 *   public product read adds `sellerId: { $nin: ids }`. Suspend and activate
 *   call `forget()` so the change is immediate, not a minute late. Nothing
 *   is written to the products - the seller's own active/inactive choices
 *   survive a suspension and come back with them.
 */
const TTL = 60 * 1000;
let cache = { at: 0, ids: [] };

const hiddenSellerIds = async (deps = {}) => {
  if (Date.now() - cache.at < TTL) return cache.ids;
  const find = deps.find || module.exports.defaults.find;
  try {
    const rows = await find();
    cache = { at: Date.now(), ids: rows.map((r) => r.userId).filter(Boolean) };
  } catch {
    // A failed lookup must not empty the shop; the last answer stands.
    cache.at = Date.now();
  }
  return cache.ids;
};

/** Adds the exclusion to a product filter; a no-op when nobody is suspended. */
const withoutHiddenSellers = async (filter, deps) => {
  const ids = await hiddenSellerIds(deps);
  if (ids.length) filter.sellerId = { ...(filter.sellerId || {}), $nin: ids };
  return filter;
};

const forget = () => {
  cache = { at: 0, ids: [] };
};

module.exports = {
  hiddenSellerIds,
  withoutHiddenSellers,
  forget,
  /** The real lookup; tests/setup.mjs swaps it for one that answers without a database. */
  defaults: { find: () => Seller.find({ status: 'suspended' }).select('userId').lean() },
};
