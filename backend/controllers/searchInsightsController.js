const { queries } = require('../utils/google/searchConsole');
const Product = require('../models/Product');
const { sendError } = require('../utils/apiError');

/**
 * What Google searchers typed before they saw us - from Search Console, via
 * the backend's service account, cached for six hours (the data itself lags
 * two days, so fresher calls buy nothing).
 *
 * Admin sees the whole site. A seller sees only queries that landed on THEIR
 * product pages - the page URL carries the product slug, and slugs are
 * looked up against their own products, so nobody reads a neighbour's data.
 */
const SIX_HOURS = 6 * 60 * 60 * 1000;
let cache = { at: 0, days: 0, result: null };

const siteQueries = async (days) => {
  if (cache.result && cache.days === days && Date.now() - cache.at < SIX_HOURS) return cache.result;
  const result = await queries({ days, limit: 500 });
  if (result.ok) cache = { at: Date.now(), days, result };
  return result;
};

const daysFrom = (req) => Math.min(90, Math.max(7, Number(req.query.days) || 28));

exports.adminQueries = async (req, res) => {
  try {
    const result = await siteQueries(daysFrom(req));
    res.set('Cache-Control', 'private, max-age=600');
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * Google's verdicts on one of the seller's products: indexed?, approved in
 * Merchant Center?, what was typed to find it. Own products only.
 */
exports.productGoogle = async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.productId, sellerId: req.user._id }).select('slug name').lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const { productGoogleStatus } = require('../utils/google/productStatus');
    const status = await productGoogleStatus(product);
    res.set('Cache-Control', 'private, max-age=900');
    res.json(status);
  } catch (error) {
    sendError(res, error);
  }
};

exports.sellerQueries = async (req, res) => {
  try {
    const result = await siteQueries(daysFrom(req));
    if (!result.ok) return res.json(result);
    const mine = await Product.find({ sellerId: req.user._id }).select('slug').lean();
    const slugs = new Set(mine.map((p) => p.slug).filter(Boolean));
    const rows = result.rows.filter((r) => {
      const m = /\/products\/([^/?#]+)/.exec(r.page);
      return m && slugs.has(m[1]);
    });
    res.set('Cache-Control', 'private, max-age=600');
    res.json({ ok: true, days: result.days, rows });
  } catch (error) {
    sendError(res, error);
  }
};

/**
 * The catalogue against Google, for the admin: which product pages are not
 * indexed, which items Merchant Center has disapproved and why. Problems
 * first. Fifty inspections take a minute, longer than a proxy waits, so the
 * first request starts the work and answers `building`; the page asks again
 * until the answer is there. Remembered for six hours; `?refresh=1` rebuilds.
 */
let catalogueCache = { at: 0, result: null, building: null };
const buildCatalogue = async () => {
  // The shop's name, never the owner's - the same rule as "Sold by".
  const { withShop } = require('../utils/shopNames');
  const products = await withShop(await Product.find({ isActive: true, isDeleted: { $ne: true } }).select('name slug sellerId').lean());
  const { catalogueGoogleStatus } = require('../utils/google/productStatus');
  const result = await catalogueGoogleStatus(products.map((p) => ({ ...p, sellerName: p.shop?.name || null })));
  const weight = (r) => (r.merchant.status === 'disapproved' ? 0 : r.index.indexed === false ? 1 : r.merchant.status === 'not in feed' ? 2 : r.index.indexed === null ? 3 : 4);
  result.rows.sort((a, b) => weight(a) - weight(b) || a.name.localeCompare(b.name));
  result.at = new Date().toISOString();
  return result;
};

exports.adminGoogleProducts = async (req, res) => {
  try {
    const fresh = catalogueCache.result && Date.now() - catalogueCache.at < SIX_HOURS;
    if (fresh && !req.query.refresh) return res.json({ ...catalogueCache.result, cached: true });
    if (!catalogueCache.building) {
      catalogueCache.building = buildCatalogue()
        .then((result) => {
          catalogueCache = { at: Date.now(), result, building: null };
        })
        .catch((err) => {
          catalogueCache.building = null;
          console.error('Google catalogue status failed:', err.message);
        });
    }
    // An old answer while the new one builds beats a spinner.
    if (catalogueCache.result) return res.json({ ...catalogueCache.result, cached: true, building: true });
    res.status(202).json({ ok: true, building: true, rows: [], summary: null });
  } catch (error) {
    sendError(res, error);
  }
};
