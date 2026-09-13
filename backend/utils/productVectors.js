const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
require('../models/Category'); // populate('category') needs the model registered
const { embed } = require('./ai/embed');

/**
 * Product embeddings (plan 2.21): the third and last free Atlas Search slot.
 *
 *   similarIds(productId)     "aapko ye bhi pasand aayega" on the product page
 *                             - Amazon's biggest lever, done with one vector
 *                             per product instead of a recommender team
 *   semanticSearchIds(query)  the search that understands "chhoti ladki ke
 *                             liye gift under 500" and "जन्मदिन का तोहफ़ा" when
 *                             the text search finds little
 *
 * One vector per active product from its name, category, colour, material,
 * tags and the first sentence of the description - the words a shopper would
 * use, not the HTML. Hash-checked, so indexProducts.js re-embeds only what
 * changed. Same embedding model as the knowledge index (one model, one
 * space). Everything here returns [] when Atlas cannot answer; callers keep
 * their category / text fallbacks.
 */
const INDEX = 'products_vec';
const strip = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const textOf = (p) =>
  [
    p.name,
    p.category?.name ? `Category: ${p.category.name}` : '',
    p.color ? `Colour: ${p.color}` : '',
    p.material ? `Material: ${p.material}` : '',
    p.gender && p.gender !== 'unisex' ? `For: ${p.gender}` : '',
    (p.tags || []).length ? `Tags: ${p.tags.join(', ')}` : '',
    strip(p.description).split(/(?<=\.)\s/)[0]?.slice(0, 300) || '',
  ]
    .filter(Boolean)
    .join('\n');

const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex');

/** Embed every active product whose text changed. Returns counts. */
const embedProducts = async ({ log = () => {} } = {}) => {
  const products = await Product.find({ isDeleted: { $ne: true } }).select('name description category color material gender tags vectorHash isActive').populate('category', 'name').lean();
  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  for (const p of products) {
    const text = textOf(p);
    const hash = hashOf(text);
    if (p.vectorHash === hash) {
      skipped += 1;
      continue;
    }
    const r = await embed(text, { taskType: 'RETRIEVAL_DOCUMENT' });
    if (!r.ok) {
      failed += 1;
      log(`  embed failed (${r.reason.slice(0, 60)}): ${p.name}`);
      if (/quota|429/i.test(r.reason)) break;
      continue;
    }
    await Product.updateOne({ _id: p._id }, { $set: { vector: r.vector, vectorHash: hash } });
    embedded += 1;
  }
  return { total: products.length, embedded, skipped, failed };
};

const ensureIndex = async () => {
  const col = mongoose.connection.db.collection('products');
  const existing = await col.listSearchIndexes().toArray().catch(() => []);
  const def = {
    fields: [
      { type: 'vector', path: 'vector', numDimensions: 768, similarity: 'cosine' },
      { type: 'filter', path: 'isActive' },
      { type: 'filter', path: 'category' },
      { type: 'filter', path: 'sellerId' },
    ],
  };
  if (existing.some((i) => i.name === INDEX)) await col.updateSearchIndex(INDEX, def);
  else await col.createSearchIndex({ name: INDEX, type: 'vectorSearch', definition: def });
};

const neighbours = async (queryVector, { k = 8, exclude = [], filter = {} } = {}) => {
  if (mongoose.connection.readyState !== 1) return [];
  try {
    const rows = await Product.aggregate([
      { $vectorSearch: { index: INDEX, path: 'vector', queryVector, numCandidates: Math.max(60, k * 15), limit: k + exclude.length, filter: { isActive: true, ...filter } } },
      { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
    ]);
    const skip = new Set(exclude.map(String));
    return rows.filter((r) => !skip.has(String(r._id))).slice(0, k).map((r) => ({ id: String(r._id), score: r.score }));
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.warn(`products_vec unavailable (${err.message.slice(0, 80)})`);
    return [];
  }
};

/** Ids of the products most like this one (never itself), best first. */
const similarIds = async (productId, { k = 8 } = {}) => {
  const p = await Product.findById(productId).select('vector').lean();
  if (!p?.vector?.length) return [];
  return neighbours(p.vector, { k, exclude: [productId] });
};

/** Ids of products whose meaning is closest to the query. */
const semanticSearchIds = async (q, { k = 24, filter = {} } = {}) => {
  const text = String(q || '').trim();
  if (text.length < 2) return [];
  const e = await embed(text, { taskType: 'RETRIEVAL_QUERY' }).catch(() => ({ ok: false }));
  if (!e.ok) return [];
  return neighbours(e.vector, { k, filter });
};

module.exports = { INDEX, textOf, embedProducts, ensureIndex, similarIds, semanticSearchIds, neighbours };
