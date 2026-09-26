const { safeUrl } = require('./guard');
const firecrawl = require('./firecrawl');
const { remember, keyOf, AiCache } = require('../ai/aiCache');
const { generate } = require('../gemini');
const AiUsage = require('../../models/AiUsage');

/**
 * Reading the outside web, for the parts of this app that genuinely need it.
 *
 * THE ROUTE, CHEAPEST FIRST (24 Sep 2026, decided by four measurements)
 *   1. a question about US            -> the database, Search Console, Merchant
 *                                        Center. Free and authoritative; never here.
 *   2. a question about the market,
 *      no address in hand             -> Gemini grounded search (5,000 free
 *                                        prompts a month). Never here either.
 *   3. an address we were handed      -> `askPage`: Gemini reads it for nothing.
 *                                        Measured: it read a Meesho product page
 *                                        and returned title, price and fabric.
 *   4. that page keeps Google out,
 *      or we need its PHOTOGRAPHS     -> `fetchPage`: Firecrawl, one credit.
 *                                        Measured: amazon.in refused Gemini
 *                                        outright; Gemini returned no image URLs
 *                                        for Meesho either. Firecrawl got the
 *                                        Amazon page in six seconds with its
 *                                        pictures.
 *
 * WHAT STOPS IT RUNNING AWAY
 *   Every read is guarded (utils/research/guard - the seller hands us a URL, so
 *   SSRF is the risk), cached a day, counted against a DAILY CAP, and refused
 *   when the month's Firecrawl credits are near their end. The cap is per
 *   platform, not per seller: the allowance is one pool.
 */
const DAILY_CAP = Number(process.env.RESEARCH_DAILY_CAP || 25); // Firecrawl reads a day, whole platform
const CREDIT_RESERVE = 50; // never spend the month's last fifty

/** How many Firecrawl reads the platform has already made today. */
const usedToday = async () => {
  const row = await AiUsage.read('global', 'all');
  return Number(row.research || 0);
};

const recordRead = async (userId, provider) => {
  const day = AiUsage.today();
  const inc = { research: 1, [`byProvider.${provider}`]: 1 };
  await Promise.all([
    AiUsage.updateOne({ scope: 'user', key: String(userId || 'system'), day }, { $inc: inc }, { upsert: true }),
    AiUsage.updateOne({ scope: 'global', key: 'all', day }, { $inc: inc }, { upsert: true }),
  ]);
};

/**
 * Ask a question ABOUT a page. Free when the page lets Google in.
 *
 * @param {string} rawUrl
 * @param {string} question  what to answer, and in what shape
 * @param {object} [opts]
 * @param {string} [opts.userId]
 * @param {object} [opts.responseSchema] a JSON schema, when the answer must be data
 * @returns {Promise<{ok: boolean, text?: string, json?: object, via?: string, reason?: string}>}
 */
const askPage = async (rawUrl, question, opts = {}) => {
  const url = (await safeUrl(rawUrl)).toString();
  return remember(
    'research:ask',
    opts.userId || 'system',
    { url, question: question.slice(0, 200), schema: Boolean(opts.responseSchema) },
    async () => {
      const gem = await generate(`${question}\n\nThe page: ${url}`, {
        urlContext: true,
        model: process.env.GEMINI_LITE_MODEL || 'gemini-3.5-flash-lite',
        temperature: 0.2,
        ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
      });
      // Gemini answers even when it could not open the page, so the answer has
      // to say so itself - the prompt asks for `blocked` and we believe it.
      const said = String(gem.text || '');
      const blocked = !gem.ok || /"?blocked"?/i.test(said.slice(0, 120));
      if (!blocked) return { ok: true, text: said, json: gem.json, via: 'gemini' };

      const page = await readWithFirecrawl(url, opts);
      if (!page.ok) return page;
      const second = await generate(
        `${question}\n\nHere is the page, as text:\n\n${page.markdown.slice(0, 30_000)}`,
        { temperature: 0.2, ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}) },
      );
      return second.ok
        ? { ok: true, text: second.text, json: second.json, via: 'firecrawl' }
        : { ok: false, reason: second.reason || 'The page could not be read.' };
    },
  );
};

/** The Firecrawl leg on its own: the caps, the count, the plain error. */
const readWithFirecrawl = async (url, opts = {}) => {
  if (!firecrawl.enabled()) return { ok: false, reason: 'Reading web pages is not switched on.' };
  if ((await usedToday()) >= DAILY_CAP) {
    return { ok: false, reason: 'Today’s web-reading allowance is used up. It resets at midnight.' };
  }
  const left = await firecrawl.creditsLeft();
  if (left != null && left <= CREDIT_RESERVE) {
    return { ok: false, reason: 'The month’s web-reading allowance is nearly finished. It resets on the 26th.' };
  }
  try {
    const page = await firecrawl.scrape(url, { stealth: Boolean(opts.stealth) });
    await recordRead(opts.userId, 'firecrawl');
    return { ok: true, ...page };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
};

/**
 * The whole page AND its pictures. Firecrawl only - this is the job nothing
 * else here can do.
 *
 * @returns {Promise<{ok: boolean, markdown?: string, title?: string, images?: string[], reason?: string}>}
 */
const fetchPage = async (rawUrl, opts = {}) => {
  const url = (await safeUrl(rawUrl)).toString();
  /*
   * `fresh` throws away yesterday's answer first. The caller asks for it when
   * what came back was not the page it asked for - Amazon answers a product
   * URL with its own home page often enough that caching that would serve the
   * wrong thing all day (26 Sep 2026).
   */
  if (opts.fresh) {
    await AiCache.deleteOne({ key: keyOf('research:page', String(opts.userId || 'system'), { url }) }).catch(() => {});
  }
  return remember('research:page', opts.userId || 'system', { url }, () => readWithFirecrawl(url, opts));
};

/** For the admin panel's "where did the day go". */
const budget = async () => ({
  usedToday: await usedToday(),
  dailyCap: DAILY_CAP,
  creditsLeft: await firecrawl.creditsLeft(),
  enabled: firecrawl.enabled(),
});

module.exports = { askPage, fetchPage, budget, DAILY_CAP };
