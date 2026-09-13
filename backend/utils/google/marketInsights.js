const { accessToken, SCOPES, configured } = require('./serviceAuth');

/**
 * Merchant Center's Market insights (plan 2.20) - two free reports Google
 * gives a merchant once the account has traffic:
 *
 *   price_competitiveness_product_view   our price vs the benchmark price
 *                                        other merchants charge for the same
 *                                        product ("aapka kada market se 12%
 *                                        mehenga hai")
 *   best_sellers_product_cluster_view    what sells in a category in India
 *                                        this week ("is hafte jewellery me top")
 *
 * 13 Sep 2026: the account answers "Market Insights is not enabled" - Google
 * switches it on itself when there are clicks to learn from (no button in
 * Merchant Center Next). So every caller gets {enabled:false, reason} until
 * then and the pages say "comes with traffic", never a broken box. Answers
 * are remembered for six hours: the reports change daily at most.
 */
const API = 'https://merchantapi.googleapis.com/reports/v1';
let cache = { at: 0, value: null };
const SIX_HOURS = 6 * 3600000;

const search = async (query, token, mc, deps) => {
  const res = await (deps.fetch || fetch)(`${API}/accounts/${mc}/reports:search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, pageSize: 500 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `reports ${res.status}`;
    return { ok: false, notEnabled: /not enabled/i.test(msg), reason: msg };
  }
  return { ok: true, rows: data.results || [] };
};

const lastMonday = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  return d.toISOString().slice(0, 10);
};

/**
 * @returns {Promise<{enabled:boolean, reason?:string, prices:Map<string,{benchmark:number,currency:string}>, bestSellers:Array<{title:string,rank:number,category:string,brand?:string,priceRange?:string}>, fetchedAt:string}>}
 */
const marketInsights = async (deps = {}) => {
  if (!deps.fresh && cache.value && Date.now() - cache.at < SIX_HOURS) return cache.value;
  const mc = process.env.MERCHANT_CENTER_ID;
  if (!mc || (!deps.token && !configured())) return { enabled: false, reason: 'not connected', prices: new Map(), bestSellers: [], fetchedAt: new Date().toISOString() };
  const token = deps.token || (await accessToken(SCOPES.merchant, deps));

  const price = await search('SELECT offer_id, price_competitiveness.benchmark_price_micros, price_competitiveness.benchmark_price_currency_code, price_competitiveness.country_code FROM price_competitiveness_product_view', token, mc, deps);
  if (!price.ok) {
    const out = { enabled: false, reason: price.notEnabled ? 'Google turns Market insights on once the account has enough clicks - nothing to switch' : price.reason, prices: new Map(), bestSellers: [], fetchedAt: new Date().toISOString() };
    cache = { at: Date.now(), value: out };
    return out;
  }
  const prices = new Map();
  for (const r of price.rows) {
    const v = r.priceCompetitivenessProductView || {};
    if (v.offerId && v.priceCompetitiveness?.benchmarkPriceMicros) prices.set(String(v.offerId), { benchmark: Number(v.priceCompetitiveness.benchmarkPriceMicros) / 1e6, currency: v.priceCompetitiveness.benchmarkPriceCurrencyCode || 'INR' });
  }

  const best = await search(`SELECT title, rank, category_l1, category_l2, brand, price_range FROM best_sellers_product_cluster_view WHERE report_date = '${lastMonday()}' AND report_granularity = 'WEEKLY' AND country_code = 'IN' ORDER BY rank ASC`, token, mc, deps);
  const bestSellers = best.ok
    ? best.rows.slice(0, 200).map((r) => {
        const v = r.bestSellersProductClusterView || {};
        return { title: v.title, rank: Number(v.rank), category: [v.categoryL1, v.categoryL2].filter(Boolean).join(' › '), brand: v.brand || null, priceRange: v.priceRange ? `${v.priceRange.min || ''}–${v.priceRange.max || ''} ${v.priceRange.currencyCode || ''}`.trim() : null };
      })
    : [];

  const out = { enabled: true, prices, bestSellers, fetchedAt: new Date().toISOString() };
  cache = { at: Date.now(), value: out };
  return out;
};

/** "12% above the market" / "8% below" for one product, or null when no benchmark. */
const priceVsMarket = (product, prices) => {
  const b = prices.get(String(product._id));
  if (!b || !product.price) return null;
  const pct = Math.round(((product.price - b.benchmark) / b.benchmark) * 100);
  return { benchmark: Math.round(b.benchmark), pct, verdict: pct > 10 ? 'above' : pct < -10 ? 'below' : 'in line' };
};

module.exports = { marketInsights, priceVsMarket, forget: () => { cache = { at: 0, value: null }; } };
