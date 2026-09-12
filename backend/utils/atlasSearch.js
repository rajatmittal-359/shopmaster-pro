const Product = require('../models/Product');

/**
 * Search that forgives - typos, Hinglish spellings, half-typed words.
 *
 * WHAT IT REPLACES
 *   A regex. "jhumki" found nothing because the product says "jhumka";
 *   "kundn" found nothing; "ear" matched "Pearl". The catalogue's own
 *   search is where a shop loses the buyer who knew what they wanted.
 *
 * WHAT THIS IS
 *   Atlas Search (Lucene, free on the cluster we already have; index
 *   `products_search`, created 12 Sep 2026 from the app's own connection):
 *   autocomplete on the name for the box-as-you-type, fuzzy text on name,
 *   tags, brand and colour (one edit away still matches), description last
 *   and lightest. Scores come back; callers keep that order.
 *
 * WHAT IT IS NOT
 *   A dependency the shop dies without. Any failure - index still building,
 *   a cluster without Search, an operator typo - returns `null`, and the
 *   caller uses the regex it always had. The shop never shows an empty
 *   catalogue because search was clever.
 */
const INDEX = 'products_search';

const pipelineFor = (q, { limit = 60, filterIds } = {}) => {
  const term = String(q || '').trim();
  const should = [
    { autocomplete: { query: term, path: 'name', fuzzy: { maxEdits: 1, prefixLength: 1 }, score: { boost: { value: 3 } } } },
    { text: { query: term, path: 'name', fuzzy: { maxEdits: 1, prefixLength: 1 }, score: { boost: { value: 2 } } } },
    { text: { query: term, path: ['tags', 'brand', 'color'], fuzzy: { maxEdits: 1, prefixLength: 1 }, score: { boost: { value: 1.5 } } } },
    { text: { query: term, path: 'description' } },
  ];
  const filter = [{ equals: { path: 'isActive', value: true } }];
  if (filterIds && filterIds.length) filter.push({ in: { path: 'category', value: filterIds } });
  return [
    { $search: { index: INDEX, compound: { should, minimumShouldMatch: 1, filter } } },
    { $limit: limit },
    { $project: { _id: 1, score: { $meta: 'searchScore' } } },
  ];
};

/**
 * @returns {Promise<Array<string>|null>} product ids best-first, or null when
 * Atlas Search could not answer (caller falls back to regex).
 */
const searchProductIds = async (q, opts = {}, deps = {}) => {
  if (!String(q || '').trim()) return null;
  const aggregate = deps.aggregate || ((p) => Product.aggregate(p));
  try {
    const rows = await aggregate(pipelineFor(q, opts));
    return rows.map((r) => String(r._id));
  } catch (err) {
    // Not an error worth a 500 to a shopper; the regex path is a step away.
    if (process.env.NODE_ENV !== 'test') console.warn(`Atlas Search unavailable (${err.message.slice(0, 80)}) - regex fallback`);
    return null;
  }
};

/** Keeps `docs` in the order `ids` came back from search. */
const inSearchOrder = (docs, ids) => {
  const rank = new Map(ids.map((id, i) => [String(id), i]));
  return [...docs].sort((a, b) => (rank.get(String(a._id)) ?? 1e9) - (rank.get(String(b._id)) ?? 1e9));
};

module.exports = { INDEX, pipelineFor, searchProductIds, inSearchOrder };
