/**
 * backfillSellerSlugs.js - give every shop its short link.
 *
 *   node backfillSellerSlugs.js          show what would change, write nothing
 *   node backfillSellerSlugs.js --apply  write them
 *
 * A shop minted before 27 Sep 2026 has no slug, so www.shopmasterpro.in/<slug>
 * cannot find it. This fills them in from the business name.
 *
 * Nothing is overwritten: a shop that already has a slug is left exactly as
 * it is, because that slug may already be printed on a parcel, pasted into a
 * Google Business Profile or sitting in someone's WhatsApp. A short link that
 * changes under a seller is worse than one they never had.
 *
 * A name that yields nothing usable - Devanagari only, or a reserved word -
 * is reported and skipped. That shop keeps /sellers/<id>, which still works.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Seller = require('./models/Seller');
const { uniqueSlug } = require('./utils/sellerSlug');

const APPLY = process.argv.includes('--apply');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 20000 });
  console.log(`database: ${mongoose.connection.name}${APPLY ? '' : '   (dry run - nothing is written)'}\n`);

  const sellers = await Seller.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] })
    .select('_id userId businessName slug')
    .lean();

  if (!sellers.length) {
    console.log('every shop already has a short link.');
    await mongoose.disconnect();
    return;
  }

  let done = 0;
  let skipped = 0;
  for (const s of sellers) {
    const slug = await uniqueSlug(Seller, s.businessName, s._id);
    if (!slug) {
      console.log(`  SKIP  ${s.businessName || '(no name)'} - no usable slug from that name`);
      skipped += 1;
      continue;
    }
    console.log(`  ${APPLY ? 'SET ' : 'would'}  /${slug}   <- ${s.businessName}`);
    if (APPLY) {
      await Seller.updateOne({ _id: s._id }, { $set: { slug } });
      done += 1;
    }
  }

  console.log(`\n${APPLY ? `${done} written` : `${sellers.length - skipped} would be written`}, ${skipped} skipped.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
