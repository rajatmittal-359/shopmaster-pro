/**
 * seedCategories.js - grows the category tree to config/taxonomy.js.
 *
 * Add-only and re-runnable: existing categories keep their ids (products
 * point at them), get their Google product category filled in, and are
 * renamed only where the taxonomy names them differently (Ethnic Wear ->
 * Men's Ethnic Wear). Nothing is deleted; the admin hides what the shop
 * does not need from the Categories page.
 *
 *   node seedCategories.js --dry    show the plan
 *   node seedCategories.js          apply
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('./models/Category');
const TREE = require('./config/taxonomy');

const DRY = process.argv.includes('--dry');
// Old name -> new name, where the taxonomy disambiguates a name that must be unique.
const RENAMES = { 'Ethnic Wear': "Men's Ethnic Wear" };

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const admin = await require('./models/User').findOne({ role: 'admin' }).lean();
  const all = await Category.find();
  const byName = new Map(all.map((c) => [c.name.toLowerCase(), c]));
  let created = 0;
  let updated = 0;
  const lines = [];

  for (const [from, to] of Object.entries(RENAMES)) {
    const c = byName.get(from.toLowerCase());
    if (c && !byName.get(to.toLowerCase())) {
      lines.push(`rename  ${from} -> ${to}`);
      if (!DRY) {
        c.name = to;
        await c.save();
      }
      byName.delete(from.toLowerCase());
      byName.set(to.toLowerCase(), c);
      updated += 1;
    }
  }

  for (const main of TREE) {
    let parent = byName.get(main.name.toLowerCase());
    if (!parent) {
      lines.push(`create  ${main.name}`);
      created += 1;
      if (!DRY) {
        parent = await Category.create({ name: main.name, googleProductCategory: main.google, createdBy: admin?._id });
        byName.set(main.name.toLowerCase(), parent);
      }
    } else if (parent.googleProductCategory !== main.google) {
      lines.push(`google  ${main.name}`);
      updated += 1;
      if (!DRY) {
        parent.googleProductCategory = main.google;
        await parent.save();
      }
    }
    for (const [name, google] of main.children) {
      const existing = byName.get(name.toLowerCase());
      if (!existing) {
        lines.push(`create    ${main.name} > ${name}`);
        created += 1;
        if (!DRY && parent) {
          const child = await Category.create({ name, parentCategory: parent._id, googleProductCategory: google, createdBy: admin?._id });
          byName.set(name.toLowerCase(), child);
        }
      } else if (existing.googleProductCategory !== google) {
        lines.push(`google    ${main.name} > ${name}`);
        updated += 1;
        if (!DRY) {
          existing.googleProductCategory = google;
          await existing.save();
        }
      }
    }
  }

  console.log(lines.join('\n'));
  console.log(`\n${DRY ? 'Would create' : 'Created'} ${created}, ${DRY ? 'would update' : 'updated'} ${updated}. Tree now ${await Category.countDocuments()} categories.`);
  await mongoose.disconnect();
};

run().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
