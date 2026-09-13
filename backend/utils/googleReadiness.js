const Product = require('../models/Product');
const Seller = require('../models/Seller');
const SearchLog = require('../models/SearchLog');
const { scoreListing } = require('./listingScore');
const { GROUPS } = require('./searchSynonyms');

/**
 * The seller's Google coach, the facts half (plan 2.32).
 *
 * WHY
 *   Rajat, 14 Sep 2026: the seller knows the product and the market, the
 *   AI knows ShopMaster and Google - "dono ke dimaag milake". Before any
 *   model writes a word, this module gathers what is actually known:
 *
 *   keywordEvidence   the words real people typed - on Google for this
 *                     seller's pages (Search Console), in our own search
 *                     box (SearchLog, catches Hinglish Google never shows),
 *                     and the synonym families the catalogue already maps -
 *                     each with a count and a source, so the coach can say
 *                     "searched 14× on ShopMaster this month" instead of
 *                     "consider adding keywords".
 *   shopReadiness     the shop-level list Grow shows: products under 80,
 *                     the "near me" facts (location shown, city in About,
 *                     pickup address), GBP linked, FAQs missing.
 *
 *   Nothing here calls a model. Nothing here writes.
 */
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'set', 'of', 'in', 'on', 'a', 'an', 'to', 'ki', 'ka', 'ke', 'wala', 'wali', 'hai', 'new', 'buy', 'online', 'price', 'best']);
// \p{M} keeps Devanagari vowel signs (matras) - without it झुमका becomes झ मक.
const tokens = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Every synonym-family word that shares a member with the product's words. */
const familyWords = (productWords) => {
  const out = new Set();
  for (const g of GROUPS) if (g.some((w) => productWords.includes(w))) g.forEach((w) => out.add(w));
  return [...out];
};

/**
 * @param {{sellerId:string, name?:string, categoryName?:string, tags?:string[], description?:string, days?:number}} p
 * @returns {Promise<{words:Array<{word:string, source:'google'|'shop'|'family', count:number, note:string}>, google:boolean}>}
 */
const keywordEvidence = async ({ sellerId, name = '', categoryName = '', tags = [], description = '', days = 30 }) => {
  const mine = [...new Set([...tokens(name), ...tokens(categoryName), ...(tags || []).map((t) => String(t).toLowerCase())])];
  const family = familyWords(mine);
  const relevant = (term) => {
    const tw = tokens(term);
    return tw.some((w) => mine.includes(w) || family.includes(w));
  };

  const found = new Map();
  const add = (word, source, count, note) => {
    const key = word.toLowerCase().trim();
    if (!key || mine.includes(key) && source === 'family') return;
    const prev = found.get(key);
    if (!prev || prev.count < count) found.set(key, { word: key, source, count, note });
  };

  // 1. Google - what searchers typed to reach this seller's pages, then the site.
  let google = false;
  try {
    const { sellerGoogleQueries } = require('../controllers/searchInsightsController');
    const r = await sellerGoogleQueries(sellerId, Math.min(90, Math.max(7, days)));
    if (r.ok) {
      google = true;
      for (const row of r.rows) add(row.query, 'google', row.impressions || 0, `Google showed your page for this ${row.impressions || 0}× (${row.clicks || 0} clicks)`);
      for (const row of r.site || []) if (relevant(row.query)) add(row.query, 'google', row.impressions || 0, `Google showed ShopMaster for this ${row.impressions || 0}×`);
    }
  } catch {
    google = false;
  }

  // 2. Our own search box, last N days, terms that share a word with the product or its family.
  try {
    const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const rows = await SearchLog.aggregate([
      { $match: { day: { $gte: since } } },
      { $group: { _id: '$term', count: { $sum: '$count' }, results: { $last: '$results' } } },
      { $sort: { count: -1 } },
      { $limit: 400 },
    ]);
    for (const row of rows) if (relevant(row._id)) add(row._id, 'shop', row.count, `Searched ${row.count}× on ShopMaster in ${days} days${row.results === 0 ? ' - found nothing' : ''}`);
  } catch {
    /* no log yet */
  }

  // 3. The synonym family - the words the catalogue already treats as the same thing.
  for (const w of family) add(w, 'family', 1, 'Shoppers also type this for the same thing');

  const words = [...found.values()]
    .filter((w) => !mine.includes(w.word))
    .sort((a, b) => ({ google: 0, shop: 1, family: 2 })[a.source] - ({ google: 0, shop: 1, family: 2 })[b.source] || b.count - a.count)
    .slice(0, 24);
  return { words, google, description: description ? tokens(description).length : 0 };
};

/**
 * Shop-level readiness for Grow.
 * @returns {Promise<{products:{total:number, weak:Array<{_id:string,name:string,slug:string,score:number,topFix:string}>, avg:number}, nearMe:{showLocation:boolean, cityInAbout:boolean, pickupSet:boolean, gbpLinked:boolean}, faqsMissing:number}>}
 */
const shopReadiness = async (sellerId) => {
  const [seller, products] = await Promise.all([
    Seller.findOne({ userId: sellerId }).select('about links showLocation pickupAddress').lean(),
    Product.find({ sellerId, isDeleted: { $ne: true } }).select('name slug images description category color size gender ageGroup brand sku weight tags faqs material price stock isActive').lean(),
  ]);
  const scored = products.map((p) => {
    const r = scoreListing(p);
    return { _id: p._id, name: p.name, slug: p.slug, score: Math.round((r.score / r.max) * 100), topFix: r.fixes[0]?.text || '', faqs: (p.faqs || []).length };
  });
  const weak = scored.filter((p) => p.score < 80).sort((a, b) => a.score - b.score).slice(0, 10);
  const avg = scored.length ? Math.round(scored.reduce((n, p) => n + p.score, 0) / scored.length) : 0;
  const city = String(seller?.pickupAddress?.city || '').toLowerCase();
  return {
    products: { total: scored.length, weak, avg },
    nearMe: {
      showLocation: Boolean(seller?.showLocation),
      cityInAbout: Boolean(city) && String(seller?.about || '').toLowerCase().includes(city),
      pickupSet: Boolean(seller?.pickupAddress?.pincode),
      gbpLinked: Boolean(seller?.links?.googleBusiness),
    },
    faqsMissing: scored.filter((p) => p.faqs < 2).length,
  };
};

module.exports = { keywordEvidence, shopReadiness, tokens };
