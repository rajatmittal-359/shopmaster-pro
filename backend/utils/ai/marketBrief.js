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
const assembleBrief = ({ category, grounded, searchConsole = [], siteSearches = [], bestSellers = [], prices = null, weekOf }) => {
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

  const ranked = [...words.values()]
    .sort((a, b) => b.sources.length - a.sources.length || b.weight - a.weight)
    .slice(0, 20)
    .map(({ word, sources }) => ({ word, sources }));

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
  if (b.words?.length) parts.push(`Words buyers type: ${b.words.map((w) => `${w.word} [${w.sources.join('+')}]`).join(', ')}.`);
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
  // Resumable: a category already briefed this week with a grounded answer is
  // left alone, so a rerun after a rate limit fills only the gaps.
  const done = new Set((await MarketBrief.find({ weekOf: week, 'band.low': { $gt: 0 } }).select('category.slug').lean()).map((b) => b.category.slug));
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let built = 0;
  let skipped = 0;
  // At most a dozen grounded calls per run (about five minutes with the pauses):
  // a request-driven job must finish inside the proxy's patience; the rest
  // are picked up by the next run because the build is resumable.
  const MAX_PER_RUN = deps.max ?? 12;
  let left = MAX_PER_RUN;
  for (const category of cats) {
    if (done.has(category.slug)) { skipped += 1; continue; }
    if (left-- <= 0) break;
    const catTokens = tokens(category.name);
    const relevant = (text) => catTokens.some((t) => String(text || '').toLowerCase().includes(t));
    // The grounded roads meter per minute: space the calls, try once more after a wait.
    let grounded = await groundedFor(category, deps).catch(() => null);
    if (!grounded) { await pause(deps.retryMs ?? 20000); grounded = await groundedFor(category, deps).catch(() => null); }
    await pause(deps.pauseMs ?? 4000);
    const brief = assembleBrief({
      category,
      grounded,
      searchConsole: (sc.rows || []).filter((r) => relevant(r.query)).slice(0, 30),
      siteSearches: site.filter((r) => relevant(r._id)).map((r) => ({ term: r._id, count: r.count })).slice(0, 30),
      bestSellers: (mi.bestSellers || []).filter((b) => relevant(b.category) || relevant(b.title)),
      prices: mi.prices,
      weekOf: week,
    });
    await MarketBrief.updateOne({ 'category.slug': category.slug }, { $set: brief }, { upsert: true });
    built += 1;
  }
  return { built, skipped, pending: Math.max(0, cats.length - done.size - built), week, marketInsights: mi.enabled ? 'on' : 'not yet enabled by Google', searchConsole: sc.ok ? (sc.rows || []).length : 'not connected' };
};

module.exports = { briefPrompt, assembleBrief, briefToText, groundedFor, buildBriefs };
