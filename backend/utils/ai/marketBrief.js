/**
 * The weekly market brief (21 Sep 2026).
 *
 * Rajat wanted an AI that "seedha bahar ki duniya dekh sake - Google, trends,
 * demand/supply - aur satik jawab de bina token waste kiye." Per-question
 * web search is the expensive, slow way. This is the cheap one: once a week a
 * job builds ONE brief per selling category from four sources and stores it;
 * Ask ShopMaster reads the brief in milliseconds (zero model tokens for the
 * facts) and goes live to Google only for what the brief does not hold.
 *
 * SOURCES, in order of trust
 *   1. Search Console   the queries real people typed to reach us (google/searchConsole)
 *   2. our search box   what shoppers typed on the site (SearchLog)
 *   3. Merchant Center  best sellers + price benchmarks, once Google enables
 *                       Market insights for the account (google/marketInsights)
 *   4. one grounded search per category (Gemini grounding; Groq compound when
 *      Gemini's day is out): the price band on Indian marketplaces, the words
 *      buyers use, what is moving this month
 *
 * Amazon Brand Analytics and Meesho's trend page do this from their own
 * traffic; ours joins Google's numbers to a small catalogue's. Advice only.
 */
const { parseMarketCheck } = require('./marketCheck');

const briefPrompt = (category) => `You are researching the Indian online market for a small marketplace in Jaipur. Category: ${category.name}.

Search Google Shopping and the Indian marketplaces (Amazon.in, Flipkart, Meesho, Myntra, Nykaa) for this category, sold in India, priced in INR, this month. Answer with ONE JSON object and nothing else:
{"low": <typical low price in INR>, "high": <typical high price in INR>, "typical": <where most listings sit>, "sources": ["sites you actually saw"], "words": ["8-12 short search phrases buyers type for this category, lowercase, as typed"], "trending": ["3-6 specific product kinds or styles moving this month in this category"], "note": "two plain sentences: what sells at what price, and what is rising or fading this month"}
If nothing comparable is found: {"low":0,"high":0,"typical":0,"sources":[],"words":[],"trending":[],"note":"nothing comparable found"}.`;

const clean = (w) => String(w || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);

/**
 * Four sources → one brief. Words are ranked by how many sources agree, then
 * by Search Console impressions - a phrase Google, the site and the model all
 * name is worth more than one any of them names alone.
 */
const assembleBrief = ({ category, grounded, searchConsole = [], siteSearches = [], bestSellers = [], prices = null, adsWords = [], weekOf }) => {
  const words = new Map();
  const add = (word, source, weight = 1) => {
    const key = clean(word);
    if (!key) return;
    const row = words.get(key) || { word: key, sources: [], weight: 0 };
    if (!row.sources.includes(source)) row.sources.push(source);
    row.weight += weight;
    words.set(key, row);
  };
  for (const q of searchConsole) add(q.query, 'google', 2 + Math.log10(1 + (q.impressions || 0)));
  for (const t of siteSearches) add(t.term, 'site', 1.5 + Math.log10(1 + (t.count || 0)));
  for (const w of grounded?.words || []) add(w, 'grounded', 1);
  /*
   * THE FOURTH SOURCE, AND THE ONLY ONE ABOUT PEOPLE WHO NEVER CAME HERE
   *   The three above all describe our own traffic: what Google showed for
   *   OUR pages, what was typed in OUR box, what a model read about the
   *   category. For a shop with three sellers that is a small, flattering
   *   mirror - it cannot name a phrase we have never ranked for, which is
   *   most of them.
   *
   *   Keyword Planner is the whole of India. Its weight is kept in the same
   *   range as the others deliberately: a phrase Google, the site and the
   *   model all name is still worth more than one with a big number and no
   *   local evidence. The NUMBER is what matters downstream, not the rank -
   *   `monthly` is carried on the row for the listing prompt and the
   *   seller's chips to sort by and to show.
   */
  for (const a of adsWords) {
    add(a.keyword, 'ads', 1.5 + Math.log10(1 + (a.monthly || 0)));
    const row = words.get(clean(a.keyword));
    if (row) row.monthly = a.monthly || 0;
  }

  const ranked = [...words.values()]
    .sort((a, b) => b.sources.length - a.sources.length || b.weight - a.weight)
    .slice(0, 20)
    .map(({ word, sources, monthly }) => (monthly ? { word, sources, monthly } : { word, sources }));

  return {
    category: { name: category.name, slug: category.slug },
    weekOf,
    band: grounded?.band || null,
    typicalBenchmark: prices && prices.size ? Math.round([...prices.values()].reduce((s, p) => s + (p.benchmark || 0), 0) / prices.size) : null,
    sources: grounded?.sources || [],
    trending: (grounded?.trending || []).map(clean).filter(Boolean).slice(0, 6),
    note: grounded?.note || '',
    words: ranked,
    bestSellers: (bestSellers || []).slice(0, 10).map((b) => ({ title: b.title, rank: b.rank, brand: b.brand || null })),
    googleQueries: searchConsole.slice(0, 10).map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks })),
    builtAt: new Date().toISOString(),
  };
};

/** The brief as the assistant reads it: one paragraph of facts with their sources, no prose of its own. */
const briefToText = (b) => {
  const parts = [`Market brief · ${b.category.name} · week of ${b.weekOf}.`];
  if (b.band) parts.push(`Similar items on Indian marketplaces list at ₹${b.band.low}–₹${b.band.high}, most around ₹${b.band.typical}${b.sources?.length ? ` (${b.sources.join(', ')})` : ''}.`);
  if (b.typicalBenchmark) parts.push(`Google's benchmark price for our listed items in this category averages ₹${b.typicalBenchmark}.`);
  if (b.note) parts.push(b.note);
  if (b.trending?.length) parts.push(`Moving this month: ${b.trending.join(', ')}.`);
  if (b.words?.length)
    parts.push(
      `Words buyers type: ${b.words
        .map((w) => `${w.word} [${w.sources.join('+')}]${w.monthly ? ` ${w.monthly}/month in India` : ''}`)
        .join(', ')}.`
    );
  if (b.bestSellers?.length) parts.push(`Google best sellers in the category: ${b.bestSellers.slice(0, 5).map((x) => `#${x.rank} ${x.title}`).join('; ')}.`);
  if (b.googleQueries?.length) parts.push(`Searches that reached us: ${b.googleQueries.slice(0, 5).map((q) => `${q.query} (${q.impressions} impressions)`).join(', ')}.`);
  return parts.join(' ');
};

/** One grounded call, parsed with the same care as the market check; null when no road answers. */
const groundedFor = async (category, deps = {}) => {
  const prompt = briefPrompt(category);
  const gemini = deps.generate || require('../gemini').generate;
  let r = await gemini(prompt, { grounded: true, textModel: 'gemini', temperature: 0.2, attempts: 1 });
  if (!r.ok) {
    const groq = deps.groqPlain || require('./groq').groqPlain;
    const g = await groq([{ role: 'user', parts: [{ text: prompt }] }], { model: 'groq/compound-mini', temperature: 0.2 });
    if (!g.ok) return null;
    r = { ok: true, text: g.text };
  }
  const m = String(r.text || '').match(/\{[\s\S]*\}/);
  let raw = null;
  try { raw = m ? JSON.parse(m[0]) : null; } catch { raw = null; }
  if (!raw) return null;
  const parsed = parseMarketCheck(raw, null);
  return { ...parsed, trending: Array.isArray(raw.trending) ? raw.trending : [] };
};

/*
 * KEEPING GOOGLE'S EXPANSION INSIDE THE CATEGORY (27 Sep 2026)
 *
 * Keyword Planner answers a seed with its whole family, and the family is
 * wider than the shelf. Seeded with three real ring titles, the biggest
 * phrase it returned was "earrings" at 368,000 a month - true, enormous,
 * and about a different product. Stored, it would have told the model that
 * the most-searched word for a ring listing is "earrings".
 *
 * So a returned phrase is kept only if it shares a word with the category
 * name or with one of the seed product titles. Matching is by WHOLE word,
 * reduced to a crude stem: "earrings" stems to "earring", which is not
 * "ring", though it contains those letters - the trap the first version
 * fell into. "gold ring for women" shares "ring" and stays.
 *
 * This is deliberately looser than it could be. A phrase only has to touch
 * ONE word, so "jhumka earrings" survives under Earrings while plain
 * "jhumka" does not unless something in the shop is named that. Discovery
 * of genuinely new words is the point of the source; discovery of the wrong
 * product is not.
 */
/*
 * Words too general to anchor anything. "Rose Gold Pearl Floral Ring" would
 * otherwise let "gold earrings" into the Rings brief through the word gold,
 * which is how the second version still leaked - the family is decided by
 * the NOUN, not by the metal or who wears it.
 */
const TOO_GENERAL = new Set([
  'gold', 'silver', 'rose', 'white', 'black', 'blue', 'green', 'red', 'pink', 'maroon',
  'women', 'woman', 'men', 'man', 'girl', 'boy', 'kid', 'lady', 'ladie',
  'set', 'design', 'designs', 'new', 'best', 'online', 'price', 'buy', 'latest', 'style',
  'plated', 'oxidised', 'antique', 'fancy', 'simple', 'small', 'large', 'mini',
].map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)));

const stem = (w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const wordsOf = (text) =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .map(stem);

const familySieve = (anchors = []) => {
  const allowed = new Set(anchors.flatMap(wordsOf).filter((w) => !TOO_GENERAL.has(w)));
  if (!allowed.size) return () => true;
  return (phrase) => wordsOf(phrase).some((w) => allowed.has(w));
};

/**
 * India-wide monthly searches for a category's phrases, or nothing.
 *
 * Ads is optional infrastructure: a box without the six GOOGLE_ADS_ vars,
 * or an access level that withholds the planner, must leave the brief
 * exactly as it was before - three sources instead of four, never an error
 * and never a zero pretending to be a measurement.
 */
const keywordVolumes = async (seeds, deps = {}) => {
  try {
    const list = [...new Set(seeds.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean))];
    if (!list.length) return [];
    const ads = deps.ads || require('../google/ads');
    const out = await ads.keywordIdeas(list);
    if (!out.ok) return [];
    // Google returns the whole family, hundreds of it. Sieve it back to this
    // category, then keep the head: past twenty, nothing survives the
    // brief's own cut anyway.
    const inFamily = familySieve(list);
    return out.rows.filter((r) => r.monthly > 0 && inFamily(r.keyword)).slice(0, 25);
  } catch {
    return [];
  }
};

/**
 * Which categories this run should work on, in which order.
 *
 * @param {Array<{slug:string}>} cats          categories with live products
 * @param {Array<{category:{slug:string}, band?:{low?:number}}>} thisWeek  briefs already stored for this week
 * @returns {{queue:Array, skipped:number}}
 */
const planQueue = (cats, thisWeek = []) => {
  const briefed = new Map(thisWeek.map((b) => [b.category?.slug, Number(b.band?.low) > 0]));
  const complete = new Set([...briefed].filter(([, hasBand]) => hasBand).map(([slug]) => slug));
  return {
    // Nothing at all first, then a brief that is only missing its band.
    queue: [...cats.filter((c) => !briefed.has(c.slug)), ...cats.filter((c) => briefed.has(c.slug) && !complete.has(c.slug))],
    skipped: cats.filter((c) => complete.has(c.slug)).length,
  };
};

/**
 * Build and store a brief for every category that has live products (the
 * ones a seller or the assistant can be asked about). Returns a summary line.
 */
const buildBriefs = async (deps = {}) => {
  const Product = require('../../models/Product');
  const Category = require('../../models/Category');
  const MarketBrief = require('../../models/MarketBrief');
  const SearchLog = require('../../models/SearchLog');

  const counts = await Product.aggregate([{ $match: { isActive: true, isDeleted: { $ne: true } } }, { $group: { _id: '$category', n: { $sum: 1 } } }]);
  const cats = await Category.find({ _id: { $in: counts.map((c) => c._id) } }).select('name slug').lean();
  if (!cats.length) return { built: 0, note: 'no selling categories yet' };

  const weekOf = new Date();
  weekOf.setUTCDate(weekOf.getUTCDate() - ((weekOf.getUTCDay() + 6) % 7));
  const week = weekOf.toISOString().slice(0, 10);

  const sc = await require('../google/searchConsole').queries({ days: 28, limit: 250 }).catch(() => ({ rows: [] }));
  const since = new Date(Date.now() - 28 * 86400000);
  const site = await SearchLog.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: '$term', count: { $sum: '$count' } } }, { $sort: { count: -1 } }, { $limit: 200 }]).catch(() => []);
  const mi = await require('../google/marketInsights').marketInsights().catch(() => ({ enabled: false, bestSellers: [], prices: new Map() }));

  const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9ऀ-ॿ]+/).filter((t) => t.length > 2);

  /*
   * WHAT COUNTS AS DONE, AND THE STARVATION IT USED TO CAUSE (28 Sep 2026)
   *
   *   The rule was "briefed this week AND carrying a price band", so that a
   *   run cut short by a rate limit could come back and fill the band in.
   *   Good intent, and it starved everything behind it: on production the
   *   grounded model refuses every call at the moment, so NO brief gets a
   *   band, so nothing is ever done, so every run rebuilt the same first
   *   five categories and the fifteen behind them were never reached.
   *   Eight rounds of the new caller made that visible - `built: 5,
   *   pending: 15`, identical, eight times.
   *
   *   Now there are two queues and they are worked in order. A category
   *   with NO brief for this week is first: it has nothing at all and the
   *   words alone are worth having. A category whose brief lacks a band is
   *   second: it already carries its words, and the band is the only thing
   *   missing. So a bad Gemini day costs the band, never the coverage.
   */
  const thisWeek = await MarketBrief.find({ weekOf: week }).select('category.slug band.low').lean();
  const { queue, skipped } = planQueue(cats, thisWeek);

  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let built = 0;
  // At most a dozen grounded calls per run (about five minutes with the pauses):
  // a request-driven job must finish inside the proxy's patience; the rest
  // are picked up by the next run because the build is resumable.
  const MAX_PER_RUN = deps.max ?? 12;
  let left = MAX_PER_RUN;
  for (const category of queue) {
    if (left-- <= 0) break;
    const catTokens = tokens(category.name);
    const relevant = (text) => catTokens.some((t) => String(text || '').toLowerCase().includes(t));
    // The grounded roads meter per minute: space the calls, try once more after a wait.
    let grounded = await groundedFor(category, deps).catch(() => null);
    if (!grounded) { await pause(deps.retryMs ?? 20000); grounded = await groundedFor(category, deps).catch(() => null); }
    await pause(deps.pauseMs ?? 4000);

    const catSearchConsole = (sc.rows || []).filter((r) => relevant(r.query)).slice(0, 30);
    /*
     * ONE Keyword Planner call per category, once a week - about thirty
     * operations against a Basic allowance of 15,000 a day. Live calls from
     * the product form were the obvious alternative and the wrong one: the
     * numbers move weekly at most, the call costs a second, and a form that
     * waits is a form Mummy stops using.
     *
     * The seeds are what we already believe buyers say, from the three
     * cheaper sources. Google answers with the rest of the phrase family and
     * a number against each.
     */
    // Real titles from this category anchor the expansion; without them
    // Google answers a jewellery seed with the whole of jewellery.
    const titles = await Product.find({ category: category._id, isActive: true, isDeleted: { $ne: true } })
      .select('name')
      .limit(6)
      .lean()
      .catch(() => []);
    const adsWords = await keywordVolumes(
      [
        category.name,
        ...titles.map((p) => String(p.name || '').split(/\s+/).slice(0, 4).join(' ')),
        ...(grounded?.words || []).slice(0, 8),
        ...catSearchConsole.slice(0, 6).map((r) => r.query),
      ],
      deps
    );

    const brief = assembleBrief({
      category,
      grounded,
      searchConsole: catSearchConsole,
      siteSearches: site.filter((r) => relevant(r._id)).map((r) => ({ term: r._id, count: r.count })).slice(0, 30),
      bestSellers: (mi.bestSellers || []).filter((b) => relevant(b.category) || relevant(b.title)),
      prices: mi.prices,
      adsWords,
      weekOf: week,
    });
    await MarketBrief.updateOne({ 'category.slug': category.slug }, { $set: brief }, { upsert: true });
    built += 1;
  }
  return { built, skipped, pending: Math.max(0, queue.length - built), week, marketInsights: mi.enabled ? 'on' : 'not yet enabled by Google', searchConsole: sc.ok ? (sc.rows || []).length : 'not connected' };
};

module.exports = { briefPrompt, assembleBrief, briefToText, groundedFor, buildBriefs, keywordVolumes, familySieve, planQueue };
