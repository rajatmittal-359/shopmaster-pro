/**
 * backfillReturnModes.js - give every category its Fair Returns default.
 *
 * Earrings, nose pins, innerwear, cosmetics, custom → N (no change-of-mind
 * return; wrong/damaged always covered). Everything else → R. Names decide
 * (utils/returnPolicy.defaultModeForCategoryName); the admin can change any
 * category afterwards and this script never overwrites a category that has
 * set by hand (returnModeSetByAdmin).
 *
 *   node backfillReturnModes.js          apply
 *   node backfillReturnModes.js --dry    show what would change
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('./models/Category');
const { defaultModeForCategoryName } = require('./utils/returnPolicy');

const DRY = process.argv.includes('--dry');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const cats = await Category.find({}).select('name returnMode returnModesAllowed returnModeSetByAdmin').lean();
  let changed = 0;
  for (const c of cats) {
    const want = defaultModeForCategoryName(c.name);
    if (c.returnModeSetByAdmin || c.returnMode === want) continue;
    console.log(`${c.name.padEnd(32)} ${c.returnMode || '-'} -> ${want}`);
    if (!DRY) await Category.updateOne({ _id: c._id }, { $set: { returnMode: want, returnModesAllowed: ['R', 'X', 'N'] } });
    changed += 1;
  }
  console.log(`${DRY ? 'would change' : 'changed'} ${changed} of ${cats.length} categories`);
  await mongoose.disconnect();
})();
