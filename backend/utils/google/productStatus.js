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

const merchantStatus = async (productId, deps = {}) => {
  const mc = process.env.MERCHANT_CENTER_ID;
  if (!mc || !configured()) return { ok: false, reason: 'not connected' };
  const token = await accessToken(SCOPES.merchant, deps);
  // The feed writes <g:id>{_id}</g:id>; Merchant Center's REST id is online:{lang}:{country}:{offerId}.
  const restId = `online:en:IN:${productId}`;
  const res = await (deps.fetch || fetch)(
    `https://shoppingcontent.googleapis.com/content/v2.1/${mc}/productstatuses/${encodeURIComponent(restId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) return { ok: true, id: productId, status: 'not in feed', issues: [] };
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `merchant ${res.status}` };
  const statuses = (data.destinationStatuses || []).map((d) => d.status);
  const status = statuses.includes('disapproved')
    ? 'disapproved'
    : statuses.includes('pending')
      ? 'pending'
      : statuses.length
        ? 'approved'
        : 'unknown';
  const issues = (data.itemLevelIssues || []).map((i) => ({
    code: i.code,
    severity: i.servability,
    text: i.description,
    detail: i.detail,
    help: i.documentation,
  }));
  return { ok: true, id: productId, status, issues };
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
 * Every product's Merchant Center status in one listing call (pages of 250)
 * instead of one call per product - keyed by our product id.
 */
const parseMerchant = (r) => {
  const statuses = (r.destinationStatuses || []).map((d) => d.status);
  const status = statuses.includes('disapproved')
    ? 'disapproved'
    : statuses.includes('pending')
      ? 'pending'
      : statuses.length
        ? 'approved'
        : 'unknown';
  const issues = (r.itemLevelIssues || []).map((i) => ({ code: i.code, severity: i.servability, text: i.description, detail: i.detail, help: i.documentation }));
  return { status, issues };
};

const merchantStatuses = async (deps = {}) => {
  const mc = process.env.MERCHANT_CENTER_ID;
  if (!mc || !configured()) return { ok: false, reason: 'not connected', byId: new Map() };
  const token = await accessToken(SCOPES.merchant, deps);
  const byId = new Map();
  let pageToken = '';
  do {
    const url = `https://shoppingcontent.googleapis.com/content/v2.1/${mc}/productstatuses?maxResults=250${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await (deps.fetch || fetch)(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `merchant ${res.status}`, byId };
    for (const r of data.resources || []) byId.set(String(r.productId).split(':').pop(), parseMerchant(r));
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

module.exports = { productGoogleStatus, catalogueGoogleStatus, merchantStatuses, inspect, merchantStatus, productUrl };
