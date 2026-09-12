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
