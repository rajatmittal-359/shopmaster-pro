#!/usr/bin/env node
/**
 * One shop, one spelling of its brand.
 *
 * WHY (26 Sep 2026)
 *   The live audit found the house shop's six products carrying TWO brands:
 *   three say "Charming Jewels" and three say "Charming jewels". To Merchant
 *   Center and to every brand search those are two different brands, so the
 *   shop's own catalogue is split in half - and the feed sends whatever the
 *   product says, so the split reaches Google.
 *
 * WHAT IT CHANGES, AND WHAT IT REFUSES TO
 *   Only the SPELLING, and only where the existing brand is already the shop's
 *   own name in a different case or with stray spacing. It will not rename a
 *   product from one real brand to another, and by default it will not invent
 *   a brand where the seller left the field empty - filling an empty brand is
 *   a decision about what the product IS, so it needs --fill-empty said out
 *   loud. Everything else in the catalogue is the seller's own work and is not
 *   this script's business.
 *
 *   node fixSellerBrand.js                    show what would change
 *   node fixSellerBrand.js --apply            write the case fixes
 *   node fixSellerBrand.js --fill-empty       also show empty brands
 *   node fixSellerBrand.js --fill-empty --apply
 *   node fixSellerBrand.js --shop "All in one"    a different shop
 *   node fixSellerBrand.js --brand "Charming Jewels"   say the canonical name
 *
 * THE FIELD IS `businessName`
 *   The first version read `Seller.shopName`, which does not exist on the
 *   model at all - so it found an empty string on every shop and refused to
 *   do anything, on dev and on production alike. The shop's name lives in
 *   `businessName`; `utils/shopNames.js` is the one place that already knew
 *   that, and it is what the public API serves as `shop.name`.
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Product = require('./models/Product');
const Seller = require('./models/Seller');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f, fallback) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const APPLY = has('--apply');
const FILL_EMPTY = has('--fill-empty');
const SHOP = valueOf('--shop', null);
const BRAND = valueOf('--brand', null);

/** Same name, said differently: case and spacing only. */
const sameName = (a, b) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to: ${mongoose.connection.name}`);
  console.log(APPLY ? 'Mode: APPLY - this writes\n' : 'Mode: dry run - nothing is written\n');

  const sellers = SHOP ? await Seller.find({ businessName: SHOP }).lean() : await Seller.find({ isPlatformOwned: true }).lean();
  if (!sellers.length) {
    console.log(SHOP ? `No shop named "${SHOP}".` : 'No platform-owned shop found. Pass --shop "<name>".');
    await mongoose.disconnect();
    return;
  }

  let fixed = 0;
  let filled = 0;
  let left = 0;

  for (const s of sellers) {
    const canonical = String(BRAND || s.businessName || '').trim();
    /*
     * Found on the dev database, where this shop's shopName is empty: without
     * this guard the canonical name is "" and --fill-empty --apply would write
     * an empty brand onto every product - worse than the split spelling it was
     * meant to repair.
     */
    if (!canonical) {
      console.log(`  REFUSED: this shop has no businessName, so there is no canonical brand to apply. Pass --brand "<name>" (seller ${s.userId})`);
      continue;
    }

    const products = await Product.find({ sellerId: s.userId, isDeleted: { $ne: true } }).select('name brand').lean();
    console.log(`${canonical} - ${products.length} products, canonical brand "${canonical}"`);

    for (const p of products) {
      const current = p.brand;

      if (current && sameName(current, canonical) && current !== canonical) {
        console.log(`  case   "${current}" -> "${canonical}"   ${p.name.slice(0, 44)}`);
        if (APPLY) await Product.updateOne({ _id: p._id }, { $set: { brand: canonical } });
        fixed += 1;
      } else if (!current) {
        if (FILL_EMPTY) {
          console.log(`  empty  (none) -> "${canonical}"   ${p.name.slice(0, 44)}`);
          if (APPLY) await Product.updateOne({ _id: p._id }, { $set: { brand: canonical } });
          filled += 1;
        } else {
          console.log(`  SKIP   no brand, needs --fill-empty   ${p.name.slice(0, 44)}`);
          left += 1;
        }
      } else if (!sameName(current, canonical)) {
        // A real brand that is not the shop's name. Never touched.
        console.log(`  keep   "${current}" is its own brand   ${p.name.slice(0, 44)}`);
      }
    }
  }

  console.log(`\n  case fixed : ${fixed}`);
  console.log(`  empty filled: ${filled}`);
  if (left) console.log(`  left empty : ${left}  (re-run with --fill-empty to set them)`);
  if (!APPLY && (fixed || filled)) console.log('\nNothing was written. Re-run with --apply.');

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect();
  process.exit(1);
});
