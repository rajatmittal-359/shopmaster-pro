/**
 * Firecrawl, the narrow way (24 Sep 2026).
 *
 * WHY IT IS HERE AT ALL - the four tests that decided it
 *   Gemini's `url_context` reads a page for free, and it is good: it read a
 *   Meesho product page and returned the title, the price (₹217) and the
 *   fabric, correctly. So for most pages Firecrawl would be money spent on
 *   nothing. Two things it could not do:
 *     - amazon.in answered its fetcher with URL_RETRIEVAL_STATUS_ERROR. The
 *       big marketplaces do not let Google's fetcher in.
 *     - asked for the product's photographs it returned an empty list. It
 *       reads text; it does not hand back the page's image URLs.
 *   Firecrawl got the same Amazon page in 6 seconds with 92 images and the
 *   price, for one credit. That is the whole of its job here: the pages that
 *   keep everyone else out, and the pictures.
 *
 * WHAT IT IS NOT FOR
 *   "What is the market doing" - Gemini's grounded search answers that free,
 *   5,000 prompts a month. Anything about our own shop - the database, Search
 *   Console and Merchant Center are the truth and they are free. Crawling a
 *   whole site - never: it is somebody else's catalogue.
 *
 * THE BUDGET IS REAL
 *   The account is the free plan: 1,000 credits a month, reset on the 26th.
 *   A scrape is one credit. `creditsLeft()` is cached for an hour and the
 *   caller refuses to spend when the reserve is reached, so a runaway loop
 *   cannot eat the month in an afternoon.
 */
const API = 'https://api.firecrawl.dev/v2';
const TIMEOUT_MS = 30_000;

const key = () => process.env.FIRECRAWL_API_KEY || '';
const enabled = () => Boolean(key());

const call = async (path, body) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 402) throw new Error('The month’s web-reading allowance is finished. It resets on the 26th.');
    if (!res.ok || data.success === false) throw new Error(data.error || `Firecrawl answered ${res.status}`);
    return data.data || {};
  } finally {
    clearTimeout(timer);
  }
};

/**
 * One page, as markdown, with its images.
 * @param {string} url  already through `safeUrl`
 * @returns {Promise<{markdown: string, title: string, images: string[]}>}
 */
const scrape = async (url, { stealth = false } = {}) => {
  const data = await call('/scrape', {
    url,
    formats: ['markdown'],
    /*
     * The second knock, when the first was answered by a bot wall (26 Sep
     * 2026: Amazon started returning its own home page for product URLs after
     * a few reads). A stealth fetch is a real browser behind a residential
     * address - it costs FIVE credits instead of one, so it is never the
     * first attempt and the caller only asks for it after a page came back
     * that was plainly not the one requested.
     */
    ...(stealth ? { proxy: 'stealth' } : {}),
    /*
     * The WHOLE main column, not a filtered slice. An early version asked for
     * `includeTags: ['img']` thinking it would keep the pictures - it kept
     * only the pictures, the page came back an eighth of its size, and the
     * price and the specification table went with it. The caller filters; the
     * fetch does not.
     */
    onlyMainContent: true,
  });
  const markdown = data.markdown || '';
  const images = [...markdown.matchAll(/!\[[^\]]*\]\((https:[^)\s]+)\)/g)].map((m) => m[1]);
  return { markdown, title: data.metadata?.title || '', images };
};

/** What is left of the month, cached an hour - one HTTP call, no credits. */
let creditCache = { at: 0, left: null };
const creditsLeft = async () => {
  if (!enabled()) return 0;
  if (Date.now() - creditCache.at < 3600_000) return creditCache.left;
  try {
    const res = await fetch(`${API}/team/credit-usage`, { headers: { Authorization: `Bearer ${key()}` } });
    const d = await res.json();
    creditCache = { at: Date.now(), left: Number(d?.data?.remainingCredits ?? d?.remainingCredits ?? 0) };
  } catch {
    // Unknown is not zero: the caller's daily cap is the real brake.
    creditCache = { at: Date.now(), left: creditCache.left };
  }
  return creditCache.left;
};

const forgetCredits = () => {
  creditCache = { at: 0, left: null };
};

module.exports = { scrape, creditsLeft, enabled, forgetCredits };
