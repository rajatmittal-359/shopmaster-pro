/**
 * PageSpeed Insights - Core Web Vitals, the way Google scores them.
 *
 * Page experience is a ranking signal; a product page that takes four
 * seconds on a phone loses both the position and the shopper. This asks
 * Google's own scorer for the pages that matter - home, a category, a
 * product - on mobile (India shops on phones), and keeps what a person can
 * act on: the performance score and the three vitals, with Google's verdict
 * on each (good / needs work / poor), plus field data from real Chrome
 * users when there is enough traffic for Google to have any.
 *
 * Needs PAGESPEED_API_KEY (an API key restricted to this API). One run per
 * page per day - the API is free but slow (10-30 s a page) and the numbers
 * do not move by the hour.
 */
const API = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

/** Google's thresholds (web.dev/vitals). */
const RATING = {
  LCP: [2500, 4000],
  CLS: [0.1, 0.25],
  INP: [200, 500],
  TBT: [200, 600],
};
const rate = (metric, value) => {
  if (value == null) return null;
  const [good, poor] = RATING[metric];
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor';
};

const analyse = async (url, { strategy = 'mobile' } = {}, deps = {}) => {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return { ok: false, url, reason: 'PageSpeed is not connected' };
  const qs = new URLSearchParams({ url, strategy, key, category: 'performance' });
  const res = await (deps.fetch || fetch)(`${API}?${qs}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, url, status: res.status, reason: data?.error?.message || `pagespeed ${res.status}` };

  const audits = data.lighthouseResult?.audits || {};
  const lab = {
    LCP: audits['largest-contentful-paint']?.numericValue ?? null,
    CLS: audits['cumulative-layout-shift']?.numericValue ?? null,
    TBT: audits['total-blocking-time']?.numericValue ?? null,
  };
  // Field data: real users, when Google has enough of them for this URL.
  const field = data.loadingExperience?.metrics || {};
  const fieldOut = {
    LCP: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
    CLS: field.CUMULATIVE_LAYOUT_SHIFT_SCORE != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
    INP: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
    overall: data.loadingExperience?.overall_category || null,
  };
  const score = Math.round((data.lighthouseResult?.categories?.performance?.score ?? 0) * 100);

  return {
    ok: true,
    url,
    strategy,
    score,
    lab: Object.fromEntries(Object.entries(lab).map(([k, v]) => [k, { value: v, rating: rate(k, v) }])),
    field: {
      LCP: { value: fieldOut.LCP, rating: rate('LCP', fieldOut.LCP) },
      CLS: { value: fieldOut.CLS, rating: rate('CLS', fieldOut.CLS) },
      INP: { value: fieldOut.INP, rating: rate('INP', fieldOut.INP) },
      overall: fieldOut.overall,
      hasData: Boolean(data.loadingExperience?.metrics),
    },
    checkedAt: new Date().toISOString(),
  };
};

module.exports = { analyse, rate, RATING };
