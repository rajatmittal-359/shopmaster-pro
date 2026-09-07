/**
 * Fill in the `color` Google asks for, from the name the product already has.
 *
 * WHY THIS IS SAFE TO DERIVE
 *   Google requires `color` for free listings in category 166, where all
 *   jewellery sits. It was missing on every product. Normally deriving an
 *   attribute is guessing - but in this catalogue the colour is written into
 *   the name by the person who named it: "Rose Gold Pearl Floral Ring",
 *   "Emerald Green Stone Studs", "Oxidised Silver Kada". Reading it back out is
 *   not invention.
 *
 * WHY IT STILL SHOWS BEFORE IT WRITES
 *   A wrong attribute earns a Merchant Center disapproval exactly as a missing
 *   one does. So the default is to print what it WOULD set and change nothing.
 *   Somebody who knows the stock reads the list, then runs it again with
 *   --apply.
 *
 *   node backfillProductColour.js           show what it would set
 *   node backfillProductColour.js --apply   write it
 *   node backfillProductColour.js --all     include products that already have one
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');

/**
 * Ordered longest-phrase-first, because "Rose Gold" has to win over "Gold" and
 * "Oxidised Silver" over "Silver". A shorter rule matching first is how a rose
 * gold ring ends up filed as gold.
 */
const RULES = [
  [/rose\s*gold/i, 'Rose Gold'],
  // Meenakari IS coloured enamel work - that is the whole point of it. Filing
  // it as gold because the base metal is gold describes the wrong half of the
  // piece. Tested before the gold rule, or it never gets the chance.
  [/meenakari|multicolour|multicolor|multi[-\s]?tone|rainbow/i, 'Multicolour'],
  [/oxidised|oxidized|antique\s*silver/i, 'Oxidised Silver'],
  [/antique\s*gold/i, 'Antique Gold'],
  [/gold\s*plated|gold[-\s]?tone|\bgold\b|kundan/i, 'Gold'],
  [/\bsilver\b|ghungroo|payal/i, 'Silver'],
  [/emerald|\bgreen\b/i, 'Green'],
  [/ruby|\bred\b|maroon/i, 'Red'],
  [/sapphire|\bblue\b/i, 'Blue'],
  [/pearl|\bwhite\b|\bivory\b/i, 'White'],
  [/\bblack\b/i, 'Black'],
  [/\bpink\b|rose\s*quartz/i, 'Pink'],
];

const colourFor = (name) => {
  for (const [pattern, colour] of RULES) {
    if (pattern.test(name)) return colour;
  }
  return null;
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}`);
  console.log(APPLY ? 'Mode: APPLY\n' : 'Mode: showing only, nothing is written\n');

  const filter = { isDeleted: { $ne: true } };
  if (!ALL) filter.$or = [{ color: { $exists: false } }, { color: null }, { color: '' }];

  const products = await Product.find(filter).select('name color').sort({ name: 1 }).lean();

  let set = 0;
  const unknown = [];

  for (const p of products) {
    const colour = colourFor(p.name);

    if (!colour) {
      unknown.push(p.name);
      continue;
    }

    console.log(`  ${colour.padEnd(16)} ${p.name}`);

    if (APPLY) {
      await Product.updateOne({ _id: p._id }, { $set: { color: colour } });
      set += 1;
    }
  }

  if (unknown.length) {
    console.log(`\n  No colour could be read from these ${unknown.length} name(s):`);
    unknown.forEach((n) => console.log(`    - ${n}`));
    console.log('  Set those by hand - a guess here is a disapproval later.');
  }

  console.log(`\n  looked at : ${products.length}`);
  console.log(`  written   : ${set}`);
  if (!APPLY) console.log('\nRe-run with --apply once the list above looks right.');

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('\nFailed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
