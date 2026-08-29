/**
 * Backfill script: populates `ancestors` and `slug` on existing categories.
 *
 * Safe to run repeatedly - it is idempotent and only writes documents whose
 * computed values differ from what is stored.
 *
 * Usage:  node backfillCategoryPaths.js          (report + apply)
 *         node backfillCategoryPaths.js --dry    (report only, no writes)
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Category = require('./models/Category');

const DRY_RUN = process.argv.includes('--dry');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}\n`);

  const all = await Category.find({}).lean();
  const byId = new Map(all.map((c) => [String(c._id), c]));

  /** Walk up parentCategory to build the ancestor chain, guarding against cycles. */
  const ancestorsOf = (cat) => {
    const chain = [];
    const seen = new Set([String(cat._id)]);
    let current = cat;

    while (current.parentCategory) {
      const parentId = String(current.parentCategory);
      if (seen.has(parentId)) {
        console.warn(`  ! cycle detected at "${cat.name}" - stopping walk`);
        break;
      }
      const parent = byId.get(parentId);
      if (!parent) {
        console.warn(`  ! "${cat.name}" references a missing parent ${parentId}`);
        break;
      }
      seen.add(parentId);
      chain.unshift(parent._id);
      current = parent;
    }
    return chain;
  };

  // Slugs must stay unique; disambiguate collisions deterministically.
  const usedSlugs = new Set();
  const uniqueSlug = (name, id) => {
    const base = Category.slugify(name) || 'category';
    if (!usedSlugs.has(base)) {
      usedSlugs.add(base);
      return base;
    }
    const suffixed = `${base}-${String(id).slice(-6)}`;
    usedSlugs.add(suffixed);
    return suffixed;
  };

  let updated = 0;
  let unchanged = 0;

  for (const cat of all) {
    const ancestors = ancestorsOf(cat);
    const slug = cat.slug || uniqueSlug(cat.name, cat._id);
    if (cat.slug) usedSlugs.add(cat.slug);

    const ancestorsDiffer =
      JSON.stringify((cat.ancestors || []).map(String)) !==
      JSON.stringify(ancestors.map(String));
    const slugDiffers = cat.slug !== slug;

    if (!ancestorsDiffer && !slugDiffers) {
      unchanged++;
      continue;
    }

    const depth = ancestors.length;
    console.log(
      `  ${'  '.repeat(depth)}${cat.name}  ->  depth=${depth} slug=${slug}` +
        (ancestorsDiffer ? '  [ancestors]' : '') +
        (slugDiffers ? '  [slug]' : '')
    );

    if (!DRY_RUN) {
      await Category.updateOne({ _id: cat._id }, { $set: { ancestors, slug } });
    }
    updated++;
  }

  console.log(`\nCategories: ${all.length}`);
  console.log(`  ${DRY_RUN ? 'would update' : 'updated'}: ${updated}`);
  console.log(`  already correct: ${unchanged}`);

  await mongoose.disconnect();
  console.log('\nDone.');
};

run().catch(async (err) => {
  console.error('Backfill failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
