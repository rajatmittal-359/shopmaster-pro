const { accessToken, SCOPES, configured } = require('./serviceAuth');

/**
 * GA4 Data API - who came, what they looked at, where they stopped.
 *
 * Search Console says what Google showed; this says what happened after the
 * click: sessions, the pages they read, and the four ecommerce events the
 * storefront sends (web/src/lib/analytics.js) counted into a funnel -
 * view_item → add_to_cart → begin_checkout → purchase. That funnel is the
 * one number a small shop should watch: where the drop is, is the next job.
 *
 * Needs GA4_PROPERTY_ID (the 9-digit property number, not the G- id) and the
 * service account added to the property as Viewer. Silent otherwise.
 */
const API = 'https://analyticsdata.googleapis.com/v1beta';

const runReport = async (body, deps = {}) => {
  const property = process.env.GA4_PROPERTY_ID;
  if (!property || !configured()) return { ok: false, reason: 'Analytics is not connected' };
  const token = await accessToken(SCOPES.analytics, deps);
  const res = await (deps.fetch || fetch)(`${API}/properties/${property}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, reason: data?.error?.message || `analytics ${res.status}` };
  return { ok: true, rows: data.rows || [], totals: data.totals || [] };
};

const num = (v) => Number(v?.value ?? v) || 0;

/**
 * The overview card: totals, the funnel, the most-read pages.
 * @returns {{ok:boolean, days, sessions, users, pageViews, funnel:{view_item,add_to_cart,begin_checkout,purchase}, topPages:[{path,views}]}}
 */
const overview = async ({ days = 28 } = {}, deps = {}) => {
  const range = [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }];

  const [totals, events, pages] = await Promise.all([
    runReport({ dateRanges: range, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }] }, deps),
    runReport(
      {
        dateRanges: range,
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'] } } },
      },
      deps
    ),
    runReport(
      {
        dateRanges: range,
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      },
      deps
    ),
  ]);
  if (!totals.ok) return { ok: false, reason: totals.reason, days };

  const t = totals.rows[0]?.metricValues || [];
  const funnel = { view_item: 0, add_to_cart: 0, begin_checkout: 0, purchase: 0 };
  if (events.ok) for (const r of events.rows) funnel[r.dimensionValues[0].value] = num(r.metricValues[0]);
  const topPages = pages.ok ? pages.rows.map((r) => ({ path: r.dimensionValues[0].value, views: num(r.metricValues[0]) })) : [];

  return { ok: true, days, sessions: num(t[0]), users: num(t[1]), pageViews: num(t[2]), funnel, topPages };
};

module.exports = { overview, runReport };
