/**
 * ensureSearchIndex.js - gives a database its Atlas Search index.
 *
 * Mongoose builds the ordinary indexes on its own; the Atlas Search index
 * (`products_search`, utils/atlasSearch.js) it does not know about. Any fresh
 * database - shopmaster_dev today, the clean production database at cutover -
 * needs this run once. Idempotent: an existing index of the same name is
 * updated to this definition, not duplicated. Free tier allows 3; we use 1.
 *
 *   npm run search-index
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { INDEX } = require('./utils/atlasSearch');

const DEFINITION = {
  mappings: {
    dynamic: false,
    fields: {
      name: [
        { type: 'autocomplete', tokenization: 'edgeGram', minGrams: 2, maxGrams: 15, foldDiacritics: true },
        { type: 'string' },
      ],
      description: { type: 'string' },
      tags: { type: 'string' },
      color: { type: 'string' },
      brand: { type: 'string' },
      isActive: { type: 'boolean' },
      category: { type: 'objectId' },
      sellerId: { type: 'objectId' },
      price: { type: 'number' },
      avgRating: { type: 'number' },
      totalReviews: { type: 'number' },
    },
  },
};

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('products');
  const existing = await col.listSearchIndexes().toArray().catch(() => []);
  const found = existing.find((i) => i.name === INDEX);
  if (found) {
    await col.updateSearchIndex(INDEX, DEFINITION);
    console.log(`${INDEX} updated on ${mongoose.connection.db.databaseName} (was ${found.status})`);
  } else {
    await col.createSearchIndex({ name: INDEX, definition: DEFINITION });
    console.log(`${INDEX} created on ${mongoose.connection.db.databaseName} - READY in a minute or two`);
  }
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
