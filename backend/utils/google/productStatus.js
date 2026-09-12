const { accessToken, SCOPES, configured } = require('./serviceAuth');
const { queries } = require('./searchConsole');

/**
 * Google's three verdicts on one product page, in one answer.
 *
 *   index    - URL Inspection: is the page in Google's index, when was it
 *              last crawled. Today 8 of 10 pages are not, which no seller
 *              could see anywhere.
 *   merchant - Merchant Center product status: approved, or disapproved with
 *              the reason Google gives (which is always specific).
 *   queries  - what people typed when this page was shown (Search Console).
 *
 * Every field says "unknown" when Google did not answer - never a made-up
 * "fine". The URL is the canonical one the storefront renders.
 */
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.shopmasterpro.in';
const productUrl = (p) => `${SITE_ORIGIN}/products/${p.slug || p._id}`;

const inspect = async (url, deps = {}) => {
  if (!configured() || !process.env.GSC_SITE) return { ok: false, reason: 'not connected' };
  const token = await accessToken(SCOPES.searchConsole, deps);
  const res = await (deps.fetch || fetch)('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: process.env.GSC_SITE, languageCode: 'en' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `inspection ${res.status}` };
  const r = data.inspectionResult?.indexStatusResult || {};
  return { ok: true, verdict: r.verdict, coverageState: r.coverageState, lastCrawl: r.lastCrawlTime || null, url };
};

/**
 * Merchant Center, through the Merchant API (products v1).
 *
 * The Content API for Shopping this used to call was sunset on 18 Aug 2026
 * and started failing progressively on 1 Sep; Rajat enabled the Merchant
 * API on 13 Sep. The feed writes <g:id>{_id}</g:id>, and Merchant API names
 * that product accounts/{mc}/products/{contentLanguage}~{feedLabel}~{offerId}
 * - sent base64url-encoded, as Google recommends, so a tilde or slash in an
 * id can never break the path.
 */
const MERCHANT_API = 'https://merchantapi.googleapis.com/products/v1';
const FEED_LANGUAGE = process.env.MERCHANT_FEED_LANGUAGE || 'en';
const FEED_LABEL = process.env.MERCHANT_FEED_LABEL || 'IN';

const productName = (mc, offerId) => {
  const plain = `${FEED_LANGUAGE}~${FEED_LABEL}~${offerId}`;
  const encoded = Buffer.from(plain).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `accounts/${mc}/products/${encoded}`;
};

/** One product's verdict from a Merchant API Product resource. */
const parseMerchant = (r) => {
  const ds = r.productStatus?.destinationStatuses || [];
  const status = ds.some((d) => (d.disapprovedCountries || []).length)
    ? 'disapproved'
    : ds.some((d) => (d.pendingCountries || []).length)
      ? 'pending'
      : ds.some((d) => (d.approvedCountries || []).length)
        ? 'approved'
        : 'unknown';
  const issues = (r.productStatus?.itemLevelIssues || []).map((i) => ({
    code: i.code,
    severity: i.severity,
    text: i.description,
    detail: i.detail,
    help: i.documentationUri,
  }));
  return { status, issues };
};

const merchantStatus = async (productId, deps = {}) => {
  const mc = process.env.MERCHANT_CENTER_ID;
  if (!mc || !configured()) return { ok: false, reason: 'not connected' };
  const token = await accessToken(SCOPES.merchant, deps);
  const res = await (deps.fetch || fetch)(`${MERCHANT_API}/${productName(mc, productId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) return { ok: true, id: productId, status: 'not in feed', issues: [] };
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `merchant ${res.status}` };
  return { ok: true, id: productId, ...parseMerchant(data) };
};

const productGoogleStatus = async (product, deps = {}) => {
  const url = productUrl(product);
  const slugPath = `/products/${product.slug || product._id}`;
  const [idx, mer, q] = await Promise.all([
    (deps.inspect || inspect)(url).catch((e) => ({ ok: false, reason: e.message })),
    (deps.merchantStatus || merchantStatus)(String(product._id)).catch((e) => ({ ok: false, reason: e.message })),
    (deps.queries || queries)({ days: 28, pageContains: slugPath }).catch(() => ({ ok: false, rows: [] })),
  ]);
  return {
    url,
    index: idx.ok
      ? { indexed: idx.verdict === 'PASS', state: idx.coverageState || null, lastCrawl: idx.lastCrawl || null }
      : { indexed: null, state: null, lastCrawl: null, reason: idx.reason },
    merchant: mer.ok ? { status: mer.status, issues: mer.issues } : { status: 'unknown', issues: [], reason: mer.reason },
    queries: q.ok ? [...q.rows].sort((a, b) => b.impressions - a.impressions).slice(0, 10) : [],
  };
};

/**
 * Every product's Merchant Center status in one listing (pages of 250)
 * instead of one call per product - keyed by our product id (the offerId).
 */
const merchantStatuses = async (deps = {}) => {
  const mc = process.env.MERCHANT_CENTER_ID;
  if (!mc || !configured()) return { ok: false, reason: 'not connected', byId: new Map() };
  const token = await accessToken(SCOPES.merchant, deps);
  const byId = new Map();
  let pageToken = '';
  do {
    const url = `${MERCHANT_API}/accounts/${mc}/products?pageSize=250${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await (deps.fetch || fetch)(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `merchant ${res.status}`, byId };
    for (const r of data.products || []) if (r.offerId) byId.set(String(r.offerId), parseMerchant(r));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return { ok: true, byId };
};

/**
 * The whole catalogue against Google: for the admin's "which pages are not
 * indexed, which items are disapproved" list. Inspections run six at a time
 * (quota is 600/min, 2000/day per property) and are remembered per URL for
 * twelve hours - Google's index does not move faster than that.
 */
const TWELVE_HOURS = 12 * 60 * 60 * 1000;
const inspectCache = new Map();
const inspectCached = async (url, deps) => {
  const hit = inspectCache.get(url);
  if (hit && Date.now() - hit.at < TWELVE_HOURS) return hit.result;
  const result = await (deps.inspect || inspect)(url).catch((e) => ({ ok: false, reason: e.message }));
  if (result.ok) inspectCache.set(url, { at: Date.now(), result });
  return result;
};

const catalogueGoogleStatus = async (products, deps = {}) => {
  const mer = await (deps.merchantStatuses || merchantStatuses)(deps).catch((e) => ({ ok: false, reason: e.message, byId: new Map() }));
  const rows = new Array(products.length);
  let next = 0;
  const worker = async () => {
    while (next < products.length) {
      const i = next++;
      const p = products[i];
      const url = productUrl(p);
      const idx = await inspectCached(url, deps);
      const m = mer.byId.get(String(p._id));
      rows[i] = {
        id: String(p._id),
        name: p.name,
        slug: p.slug,
        sellerName: p.sellerName || p.sellerId?.name || null,
        url,
        index: idx.ok
          ? { indexed: idx.verdict === 'PASS', state: idx.coverageState || null, lastCrawl: idx.lastCrawl || null }
          : { indexed: null, state: null, lastCrawl: null, reason: idx.reason },
        merchant: !mer.ok
          ? { status: 'unknown', issues: [], reason: mer.reason }
          : m || { status: 'not in feed', issues: [] },
      };
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, products.length) }, worker));
  const count = (fn) => rows.filter(fn).length;
  const summary = {
    total: rows.length,
    indexed: count((r) => r.index.indexed === true),
    notIndexed: count((r) => r.index.indexed === false),
    indexUnknown: count((r) => r.index.indexed === null),
    approved: count((r) => r.merchant.status === 'approved'),
    disapproved: count((r) => r.merchant.status === 'disapproved'),
    pending: count((r) => r.merchant.status === 'pending'),
    notInFeed: count((r) => r.merchant.status === 'not in feed'),
  };
  return { ok: true, rows, summary, merchantReason: mer.ok ? null : mer.reason };
};

module.exports = { productGoogleStatus, catalogueGoogleStatus, merchantStatuses, inspect, merchantStatus, parseMerchant, productName, productUrl };
