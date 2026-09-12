/**
 * Give every product a description of its own.
 *
 * WHY THIS RUNS IN TWO STEPS
 *   It rewrites the field a customer reads before deciding to buy, on every
 *   product at once. So by default it writes NOTHING: it drafts, saves the
 *   drafts and the originals side by side to a JSON file, and stops. A human
 *   reads that file, and only then does --apply put them in the database.
 *
 *   The originals are kept in the same file, which is what makes this
 *   reversible: --revert reads it back and puts every previous description
 *   where it was.
 *
 *   node draftProductDescriptions.js                 draft, write the JSON, change nothing
 *   node draftProductDescriptions.js --apply         write the SAVED drafts to the database - no Gemini call
 *   node draftProductDescriptions.js --draft --apply draft and write in one pass (the old behaviour)
 *   node draftProductDescriptions.js --revert        put the originals back
 *   node draftProductDescriptions.js --limit 3       just the first few, for a look
 *   node draftProductDescriptions.js --all           include products that already have real copy
 *
 * WHAT IT SKIPS
 *   Anything already carrying a description that is not the boilerplate. A
 *   seller who has written their own copy should not have it replaced by a
 *   machine, and --all is there for the day somebody deliberately wants that.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');
require('./models/Category');
const { draftDescription } = require('./utils/productCopy');
const { DEFAULT_MODEL } = require('./utils/gemini');

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};

const APPLY = has('--apply');
// --apply on its own used to DRAFT AGAIN and then write - so a draft run followed
// by an apply run paid Gemini twice, and on 12 Sep 2026 the second pass hit the
// daily quota after one product. Now --apply reads the file the draft run
// wrote; only --draft (or no flag) talks to Gemini.
const REDRAFT = has('--draft') || !APPLY;
const REVERT = has('--revert');
const ALL = has('--all');
const LIMIT = valueOf('--limit', 0);

const OUT = path.join(__dirname, 'drafted-descriptions.json');

/**
 * The boilerplate every product shares. Matched loosely on the distinctive
 * middle of it, so a stray full stop or a different name still counts.
 */
const BOILERPLATE = /carefully selected and finished to a high standard/i;

/** A description worth keeping: somebody wrote it, and it says something. */
const isRealCopy = (text) => {
  const plain = String(text || '').replace(/<[^>]*>/g, ' ').trim();
  return plain.length > 0 && !BOILERPLATE.test(plain) && plain.split(/\s+/).length >= 40;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const revert = async () => {
  if (!fs.existsSync(OUT)) {
    console.error(`Nothing to revert from - ${OUT} does not exist.`);
    process.exit(1);
  }

  const saved = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  let restored = 0;

  for (const row of saved.drafts) {
    if (row.error) continue;
    const result = await Product.updateOne(
      { _id: row._id },
      { $set: { description: row.before } }
    );
    if (result.modifiedCount) restored += 1;
  }

  console.log(`Restored ${restored} description${restored === 1 ? '' : 's'}.`);
};

/** Puts the drafts already in the JSON live, without asking Gemini again. */
const applySaved = async () => {
  if (!fs.existsSync(OUT)) {
    console.error(`Nothing to apply - ${OUT} does not exist. Run without flags first to draft.`);
    process.exit(1);
  }
  const saved = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const ready = saved.drafts.filter((row) => row.after && !row.error);
  let written = 0;
  for (const row of ready) {
    const result = await Product.updateOne(
      { _id: row._id, description: row.before },
      { $set: { description: row.after } }
    );
    if (result.modifiedCount) written += 1;
  }
  console.log(`Applied ${written} of ${ready.length} saved draft${ready.length === 1 ? '' : 's'} (drafted ${saved.generatedAt}).`);
  console.log('Rows whose description changed since the draft were left alone.');
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}`);

  if (REVERT) {
    await revert();
    await mongoose.disconnect();
    return;
  }

  if (APPLY && !REDRAFT) {
    await applySaved();
    await mongoose.disconnect();
    return;
  }

  console.log(`Model: ${DEFAULT_MODEL}`);
  console.log(APPLY ? 'Mode: APPLY - this writes to the database\n' : 'Mode: draft only - nothing is written to the database\n');

  const products = await Product.find({ isDeleted: { $ne: true } })
    .populate('category', 'name')
    .select('name description price brand category')
    .sort({ createdAt: 1 })
    .lean();

  const targets = products.filter((p) => ALL || !isRealCopy(p.description));
  const chosen = LIMIT > 0 ? targets.slice(0, LIMIT) : targets;

  console.log(`${products.length} products, ${targets.length} without real copy, drafting ${chosen.length}\n`);

  const drafts = [];
  let written = 0;

  for (const [i, p] of chosen.entries()) {
    process.stdout.write(`[${i + 1}/${chosen.length}] ${p.name} ... `);

    const result = await draftDescription({
      name: p.name,
      category: p.category?.name,
      price: p.price,
      brand: p.brand,
    });

    if (!result.ok) {
      console.log(`FAILED - ${result.reason}`);
      drafts.push({ _id: String(p._id), name: p.name, error: result.reason });
      continue;
    }

    drafts.push({
      _id: String(p._id),
      name: p.name,
      before: p.description || '',
      after: result.html,
    });

    if (APPLY) {
      await Product.updateOne({ _id: p._id }, { $set: { description: result.html } });
      written += 1;
      console.log('written');
    } else {
      console.log('drafted');
    }

    // Gentle on the free tier. A burst of fifty is how a run meets 429.
    await sleep(700);
  }

  /*
   * Written whether or not --apply was passed. Without it there is no record of
   * what the previous descriptions were, and --revert would have nothing to put
   * back.
   */
  fs.writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), model: DEFAULT_MODEL, drafts }, null, 2),
    'utf8'
  );

  const failed = drafts.filter((d) => d.error).length;
  console.log(`\n  drafted : ${drafts.length - failed}`);
  console.log(`  failed  : ${failed}`);
  console.log(`  written : ${written}`);
  console.log(`\nSaved to: ${OUT}`);

  if (!APPLY) {
    console.log('Read it, then re-run with --apply to put them live.');
  } else {
    console.log('To undo: node draftProductDescriptions.js --revert');
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nFailed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
