/**
 * migrateToProd.js - the one-time move from the dev database to production
 * (plan 2.15; the OPS "Production data" decision of 13 Sep 2026).
 *
 * WHAT MOVES
 *   - the admin user
 *   - the house shop: its seller user and its Seller document (about, links,
 *     pickup address, bank, application) exactly as they are
 *   - the platform settings document (identity, rulebook numbers, switches;
 *     the announcement bar switched OFF)
 *   - the category tree, as it is (same ObjectIds - products and the admin's
 *     per-category return modes key into them; seedCategories.js afterwards
 *     only ADDS what the taxonomy has grown since)
 *   - with --with-products: the house shop's live products, minus anything
 *     whose name starts with TEST or MESSY (their images stay on Cloudinary)
 *
 * WHAT DOES NOT
 *   test customers, orders, payouts, reviews, inventory logs, coupons, the
 *   partner sellers, notifications, AI drafts, caches, vectors, knowledge.
 *   Production starts with zero orders - the first real order is a real one.
 *
 * HOW IT REFUSES
 *   Dry run unless --write. Refuses when source and target are the same
 *   database, and when the target already has users (a second run, or the
 *   wrong URI) unless --target-has-data-i-know. Never deletes anything in
 *   the source. Passwords move as the hashes they are - nobody resets.
 *
 *   node migrateToProd.js --to "<prod uri>"                 dry run: prints the plan
 *   node migrateToProd.js --to "<prod uri>" --write         does it
 *   node migrateToProd.js --to "<prod uri>" --write --with-products
 *
 *   Source is MONGO_URI from .env (the dev database). Emails come from
 *   SEED_ADMIN_EMAIL / SEED_SELLER_EMAIL in .env, or --admin / --seller.
 *
 * AFTER
 *   MONGO_URI=<prod> node seedCategories.js
 *   MONGO_URI=<prod> npm run search-index
 *   MONGO_URI=<prod> npm run knowledge   (needs GEMINI_API_KEY)
 *   Render → MONGO_URI = <prod uri>; the Saturday digest should read zeros.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] || true;
};
const WRITE = args.includes('--write');
const WITH_PRODUCTS = args.includes('--with-products');
const OK_NONEMPTY = args.includes('--target-has-data-i-know');

const dbNameOf = (uri) => {
  try {
    const u = new URL(uri);
    return u.pathname.replace(/^\//, '') || '(default)';
  } catch {
    return '(unparsed)';
  }
};

/**
 * The plan, from what the source holds - pure, so it can be tested.
 * @returns {{admin:object|null, sellerUser:object|null, seller:object|null, settings:object|null, products:object[], problems:string[]}}
 */
const plan = ({ users, sellers, settings, products, categories = [] }, { adminEmail, sellerEmail, withProducts }) => {
  const problems = [];
  if (!categories.length) problems.push('no categories in the source - products would point at nothing');
  const admin = users.find((u) => u.email === adminEmail && u.role === 'admin') || null;
  if (!admin) problems.push(`no admin user with email ${adminEmail}`);
  const sellerUser = users.find((u) => u.email === sellerEmail) || null;
  if (!sellerUser) problems.push(`no seller user with email ${sellerEmail}`);
  const seller = sellerUser ? sellers.find((s) => String(s.userId) === String(sellerUser._id)) || null : null;
  if (sellerUser && !seller) problems.push(`no Seller document for ${sellerEmail}`);
  if (seller && !seller.isApproved) problems.push('the house shop is not approved in the source');
  const settingsDoc = settings ? { ...settings, announcement: { ...(settings.announcement || {}), enabled: false } } : null;
  if (!settingsDoc) problems.push('no platform settings document (platform) - the defaults will apply');
  const isTest = (p) => /^(TEST|MESSY)\b/i.test(p.name || '');
  const live = withProducts && seller ? products.filter((p) => String(p.sellerId) === String(seller.userId) && p.isActive && !p.isDeleted && !isTest(p)) : [];
  const skippedTest = withProducts && seller ? products.filter((p) => String(p.sellerId) === String(seller.userId) && isTest(p)).length : 0;
  const catIds = new Set(categories.map((c) => String(c._id)));
  const orphans = live.filter((p) => !catIds.has(String(p.category))).length;
  if (orphans) problems.push(`${orphans} product(s) reference a category that is not in the source tree - fix them in the panel first`);
  return { admin, sellerUser, seller, settings: settingsDoc, products: live, categories, skippedTest, orphans, problems };
};

/** Strip what must not travel: vectors, counters that belong to the dev history. */
const cleanProduct = (p) => {
  const { vector, vectorHash, avgRating, totalReviews, reserved, ...rest } = p; // eslint-disable-line no-unused-vars
  return { ...rest, avgRating: 0, totalReviews: 0, reserved: 0 };
};
const cleanSeller = (s) => {
  // The invoice series restarts at 00001 in production - dev orders were not real sales.
  const { adminEdits, invoiceSeq, invoicePrefix, ...rest } = s; // eslint-disable-line no-unused-vars
  return { ...rest, adminEdits: [], invoiceSeq: 0 };
};
const cleanUser = (u) => {
  const { risk, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
};

const run = async () => {
  const from = process.env.MONGO_URI;
  const to = flag('--to');
  if (!from) throw new Error('MONGO_URI (the source) is missing - run from backend/ with .env');
  if (!to || to === true) throw new Error('--to "<production uri>" is required');
  if (from === to || (dbNameOf(from) === dbNameOf(to) && new URL(from).host === new URL(to).host)) throw new Error('source and target are the same database - refusing');

  const adminEmail = flag('--admin') || process.env.SEED_ADMIN_EMAIL;
  const sellerEmail = flag('--seller') || process.env.SEED_SELLER_EMAIL;
  if (!adminEmail || !sellerEmail) throw new Error('SEED_ADMIN_EMAIL and SEED_SELLER_EMAIL (or --admin / --seller) are required');

  const src = new MongoClient(from);
  const dst = new MongoClient(to);
  await src.connect();
  await dst.connect();
  const S = src.db();
  const D = dst.db();
  console.log(`source ${S.databaseName} → target ${D.databaseName}  (${WRITE ? 'WRITE' : 'dry run'}${WITH_PRODUCTS ? ', with products' : ''})`);

  const targetUsers = await D.collection('users').countDocuments();
  if (targetUsers > 0 && !OK_NONEMPTY) throw new Error(`target already has ${targetUsers} users - is this really production, freshly created? Re-run with --target-has-data-i-know if so.`);

  const [users, sellers, settings, products, categories] = await Promise.all([
    S.collection('users').find({}).toArray(),
    S.collection('sellers').find({}).toArray(),
    S.collection('platformsettings').findOne({ _id: 'platform' }),
    WITH_PRODUCTS ? S.collection('products').find({}).toArray() : [],
    S.collection('categories').find({}).toArray(),
  ]);
  const p = plan({ users, sellers, settings, products, categories }, { adminEmail, sellerEmail, withProducts: WITH_PRODUCTS });

  console.log('\nPLAN');
  console.log(`  admin user      ${p.admin ? p.admin.email : 'MISSING'}`);
  console.log(`  seller user     ${p.sellerUser ? p.sellerUser.email : 'MISSING'}`);
  console.log(`  seller doc      ${p.seller ? `${p.seller.businessName} (approved ${p.seller.isApproved}, bank ${p.seller.bankDetails?.accountNumber ? 'yes' : 'no'}, pickup ${p.seller.pickupAddress?.pincode || 'no'})` : 'MISSING'}`);
  console.log(`  settings        ${p.settings ? `rules v${p.settings.rules?.version}, announcement off` : 'none (defaults)'}`);
  console.log(`  categories      ${p.categories.length}, same ids (products and return-mode rules key into them)`);
  console.log(`  products        ${WITH_PRODUCTS ? `${p.products.length} live (${p.skippedTest} TEST/MESSY skipped)` : 'not moving (list them through the panel)'}`);
  console.log(`  not moving      orders, payouts, reviews, customers, partner sellers, logs, caches, vectors`);
  for (const x of p.problems) console.log(`  ! ${x}`);
  if (p.problems.some((x) => x.startsWith('no admin') || x.startsWith('no seller') || x.startsWith('no Seller') || x.startsWith('no categories') || /reference a category/.test(x))) throw new Error('the plan is incomplete - fix the source or the emails first');

  if (!WRITE) {
    console.log('\nDry run - nothing written. Add --write to do it.');
    await src.close();
    await dst.close();
    return;
  }

  await D.collection('categories').insertMany(p.categories);
  await D.collection('users').insertMany([cleanUser(p.admin), cleanUser(p.sellerUser)]);
  await D.collection('sellers').insertOne(cleanSeller(p.seller));
  if (p.settings) await D.collection('platformsettings').replaceOne({ _id: 'platform' }, p.settings, { upsert: true });
  if (p.products.length) await D.collection('products').insertMany(p.products.map(cleanProduct));
  console.log(`\nDONE - ${p.categories.length} categories, 2 users, 1 seller, ${p.settings ? 1 : 0} settings, ${p.products.length} products written to ${D.databaseName}.`);
  console.log('Next: MONGO_URI=<prod> node seedCategories.js && npm run search-index && npm run knowledge');
  await src.close();
  await dst.close();
};

if (require.main === module) {
  run().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { plan, cleanProduct, cleanSeller, cleanUser };
