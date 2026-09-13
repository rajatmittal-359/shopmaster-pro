/**
 * indexProducts.js - embeddings for every active product (plan 2.21), and
 * the products_vec Atlas Vector Search index. Hash-checked: a rerun embeds
 * only products whose words changed. Run after a catalogue change, or let
 * the weekly job do it.
 *
 *   node indexProducts.js            embed what changed, ensure the index
 *   node indexProducts.js --ensure   index only
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { embedProducts, ensureIndex } = require('./utils/productVectors');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (!process.argv.includes('--ensure')) {
    const r = await embedProducts({ log: console.log });
    console.log(`products ${r.total}: embedded ${r.embedded}, unchanged ${r.skipped}, failed ${r.failed}`);
  }
  await ensureIndex();
  console.log('products_vec ready (a new index takes about a minute to build)');
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
