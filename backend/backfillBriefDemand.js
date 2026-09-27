/**
 * backfillBriefDemand.js - put India-wide search volumes on the briefs we
 * already have, without rebuilding them.
 *
 *   node backfillBriefDemand.js          show what would change, write nothing
 *   node backfillBriefDemand.js --apply  write them
 *
 * WHY THIS EXISTS (27 Sep 2026)
 *   Keyword Planner arrived on a Sunday. The weekly market-brief job will
 *   pick it up on its own next Monday, but the thirty briefs already stored
 *   carry no figures until then, so the seller panel would show none either.
 *   One call per category fixes that today.
 *
 *   It also repairs something older. Several briefs hold ZERO words: those
 *   categories were built on a day the grounded model was rate-limited, and
 *   the word list is the part that failed. Ads can supply words on its own -
 *   it needs nothing but the category name - so a brief that had nothing to
 *   say now says something.
 *
 * WHAT IT WILL NOT TOUCH
 *   The price band, the note, the trending list, the best sellers: all of
 *   that is the grounded model's and Merchant Center's work, and re-running
 *   those costs quota for no gain. Only `words` is rewritten, and a word
 *   that was already there keeps its existing sources - 'ads' is appended.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const MarketBrief = require('./models/MarketBrief');
const Category = require('./models/Category');
const Product = require('./models/Product');
const { keywordIdeas } = require('./utils/google/ads');
const { familySieve } = require('./utils/ai/marketBrief');

const APPLY = process.argv.includes('--apply');
const clean = (w) => String(w || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 60);

/**
 * A product title is written for a shelf - "Brass Gold-plated Kundan Maroon
 * Necklace Set". As a seed that is too specific to expand from, so it is cut
 * to the first four words, which is where the noun usually still is.
 */
const shortTitle = (name) => String(name || '').split(/\s+/).slice(0, 4).join(' ');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`database: ${mongoose.connection.name}${APPLY ? '' : '   (dry run - nothing is written)'}\n`);

  const briefs = await MarketBrief.find({}).select('category words').lean();
  if (!briefs.length) {
    console.log('no briefs yet - run the market-brief job first.');
    await mongoose.disconnect();
    return;
  }

  // The brief stores the category by name and slug, not by id; the seeds
  // need the id to find that category's products.
  const catIds = new Map((await Category.find({}).select('slug').lean()).map((c) => [c.slug, c._id]));

  let touched = 0;
  let quiet = 0;

  for (const b of briefs) {
    const name = b.category?.name;
    if (!name) continue;

    /*
     * SEED FROM WHAT IS ACTUALLY IN THE CATEGORY, NOT FROM ITS NAME.
     *   Seeded with the word "Rings" alone, Google's family expansion came
     *   back led by "earrings" (368,000/mo) - true, large, and about a
     *   different product. "Home Decor" produced "kitchens designs". A
     *   number that big on the wrong word is worse than no number: it would
     *   have pushed a ring listing towards the word for earrings.
     *
     *   Real product titles anchor it. Google expands around what the shop
     *   actually sells, which is the only expansion we want.
     */
    const titles = await Product.find({ category: catIds.get(String(b.category?.slug)) || undefined, isActive: true, isDeleted: { $ne: true } })
      .select('name')
      .limit(6)
      .lean()
      .catch(() => []);
    const seeds = [name, ...titles.map((p) => shortTitle(p.name)), ...(b.words || []).slice(0, 6).map((w) => w.word)];
    const out = await keywordIdeas(seeds);

    if (!out.ok) {
      console.log(`  ERROR ${name} - ${out.reason}`);
      continue;
    }

    // The same sieve the weekly job uses - anchored to the category name and
    // to what the shop actually sells, so "earrings" does not arrive under
    // Rings at 368,000 a month and outrank every real word there.
    const inFamily = familySieve(seeds);

    const volumes = new Map();
    for (const r of out.rows) {
      const k = clean(r.keyword);
      if (r.monthly > 0 && inFamily(k)) volumes.set(k, r.monthly);
    }
    if (!volumes.size) {
      quiet += 1;
      console.log(`  --    ${name.padEnd(26)} Google reported no volumes`);
      continue;
    }

    // Existing words keep their place and gain a figure where Google has one.
    const words = (b.words || []).map((w) => {
      const monthly = volumes.get(clean(w.word));
      if (!monthly) return { word: w.word, sources: w.sources || [] };
      volumes.delete(clean(w.word));
      return { word: w.word, sources: [...new Set([...(w.sources || []), 'ads'])], monthly };
    });

    // Then the strongest phrases Google added, biggest first, up to twenty
    // in all - the same ceiling the weekly job uses.
    const added = [...volumes.entries()]
      .sort((a, b2) => b2[1] - a[1])
      .slice(0, Math.max(0, 20 - words.length))
      .map(([word, monthly]) => ({ word, sources: ['ads'], monthly }));

    const next = [...words, ...added];
    const withNumbers = next.filter((w) => w.monthly).length;
    const top = [...next].sort((a, c) => (c.monthly || 0) - (a.monthly || 0))[0];

    console.log(
      `  ${APPLY ? 'SET  ' : 'would'} ${name.padEnd(26)} ${String(b.words?.length || 0).padStart(2)} -> ${String(next.length).padStart(2)} words, ${withNumbers} with a number` +
        (top?.monthly ? `   top: ${top.word} (${top.monthly}/mo)` : '')
    );

    if (APPLY) await MarketBrief.updateOne({ _id: b._id }, { $set: { words: next } });
    touched += 1;
  }

  console.log(`\n${APPLY ? `${touched} briefs written` : `${touched} briefs would be written`}, ${quiet} had no volumes to add.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
