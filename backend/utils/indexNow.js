/**
 * IndexNow - tell Bing (and through it Copilot, Yandex, Naver, Seznam) the
 * moment a page changed, instead of waiting for a crawl (plan 2.37c,
 * 19 Sep 2026; Bing Webmaster verified the same day).
 *
 * WHY
 *   ChatGPT, Copilot and Perplexity answer from Bing's index. A product
 *   listed today should be findable there tonight, not in three weeks when
 *   Bingbot next reads the sitemap. Google does not take IndexNow; the
 *   sitemap and Search Console still cover Google.
 *
 * HOW
 *   One POST to api.indexnow.org with the host, a key we chose, and up to
 *   10,000 URLs. The key is proven by a file at https://<host>/<key>.txt -
 *   public by design, so it lives in web/public (and frontend/public until
 *   the old app goes). Pings are batched: product saves come in bursts
 *   (a seller editing five listings, a bulk import), so URLs collect for a
 *   few seconds and go as one request. Off without INDEXNOW_KEY; a failure
 *   is logged and never surfaces to the person who saved the product.
 */
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
const BATCH_MS = 5000;

const siteUrl = () => (process.env.SITE_URL || 'https://www.shopmasterpro.in').replace(/\/$/, '');
const enabled = () => Boolean(process.env.INDEXNOW_KEY);

let pending = new Set();
let timer = null;

/** Send what has collected - one request, urls deduped. */
const flush = async () => {
  timer = null;
  const urls = [...pending];
  pending = new Set();
  if (!urls.length || !enabled()) return { ok: false, sent: 0, reason: urls.length ? 'INDEXNOW_KEY is not set' : 'nothing to send' };
  const host = new URL(siteUrl()).host;
  const key = process.env.INDEXNOW_KEY;
  const body = { host, key, keyLocation: `${siteUrl()}/${key}.txt`, urlList: urls.slice(0, 10000) };
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    // 200 and 202 both mean accepted; 4xx names a key or format problem worth reading.
    if (res.status === 200 || res.status === 202) return { ok: true, sent: urls.length, status: res.status };
    const text = await res.text().catch(() => '');
    console.error(`indexnow: ${res.status} ${text.slice(0, 120)}`);
    return { ok: false, sent: 0, status: res.status, reason: text.slice(0, 120) };
  } catch (err) {
    console.error('indexnow: could not reach the endpoint -', err.message);
    return { ok: false, sent: 0, reason: err.message };
  }
};

/**
 * Queue one or more paths or URLs. Returns immediately; the batch goes in
 * BATCH_MS. `now: true` sends at once (scripts, tests).
 */
const ping = (paths, { now = false } = {}) => {
  if (!enabled()) return Promise.resolve({ ok: false, sent: 0, reason: 'INDEXNOW_KEY is not set' });
  for (const p of [].concat(paths).filter(Boolean)) pending.add(/^https?:\/\//.test(p) ? p : `${siteUrl()}${p.startsWith('/') ? '' : '/'}${p}`);
  if (now) {
    if (timer) clearTimeout(timer);
    return flush();
  }
  if (!timer) {
    timer = setTimeout(() => flush().catch(require('./quiet').quiet('IndexNow flush')), BATCH_MS);
    if (timer.unref) timer.unref();
  }
  return Promise.resolve({ ok: true, queued: pending.size });
};

/** The pages a product change touches: its page, the shop listing, the seller's page. */
const productPaths = (product) => [product?.slug ? `/products/${product.slug}` : null, '/shop', product?.sellerId ? `/sellers/${product.sellerId}` : null].filter(Boolean);

/** For tests. */
const _reset = () => {
  pending = new Set();
  if (timer) clearTimeout(timer);
  timer = null;
};

module.exports = { ping, flush, productPaths, enabled, _reset, BATCH_MS };
