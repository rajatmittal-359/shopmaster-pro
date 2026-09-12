const { accessToken, SCOPES, configured } = require('./serviceAuth');

/**
 * What people actually typed into Google before they saw us.
 *
 * Search Console's Search Analytics is the only keyword data that is about
 * OUR pages rather than the web in general: the query, the page it showed,
 * impressions, clicks, position. It turns "keyword guidance" from a guess
 * into a fact: a product page that appears for "kundan choker" at position
 * 18 with 40 impressions and no clicks needs that phrase in its title.
 *
 * The property is the domain one (`sc-domain:shopmasterpro.in`), so it covers
 * www and bare alike. Data lags about two days; we ask for the last 28.
 */
const API = 'https://searchconsole.googleapis.com/webmasters/v3/sites';

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/**
 * @param {object} [opts]
 * @param {number} [opts.days=28]
 * @param {string} [opts.pageContains]  restrict to pages whose URL contains this (e.g. a product slug)
 * @param {number} [opts.limit=250]
 * @returns {Promise<Array<{query:string,page:string,clicks:number,impressions:number,ctr:number,position:number}>>}
 */
const queries = async ({ days = 28, pageContains, limit = 250 } = {}, deps = {}) => {
  const site = process.env.GSC_SITE;
  if (!site || !configured()) return { ok: false, reason: 'Search Console is not connected', rows: [] };

  const token = await accessToken(SCOPES.searchConsole, deps);
  const body = {
    startDate: isoDaysAgo(days + 2),
    endDate: isoDaysAgo(2),
    dimensions: ['query', 'page'],
    rowLimit: limit,
    ...(pageContains
      ? { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: pageContains }] }] }
      : {}),
  };
  const doFetch = deps.fetch || fetch;
  const res = await doFetch(`${API}/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, status: res.status, reason: data?.error?.message || `Search Console said ${res.status}`, rows: [] };
  }
  const rows = (data.rows || []).map((r) => ({
    query: r.keys[0],
    page: r.keys[1],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: Math.round(r.position * 10) / 10,
  }));
  return { ok: true, rows, days };
};

module.exports = { queries };
