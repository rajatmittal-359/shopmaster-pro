const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * The same question asked twice costs one model call (15 Sep 2026 - Rajat:
 * "bina baat faltu token waste na ho").
 *
 * Keyed by kind + person + the exact inputs; lives 24 hours (TTL). Used for
 * the listing writer, keywords and FAQ drafts - the calls a seller repeats
 * while editing ("suggest again" with nothing changed). Never for the
 * assistant (its context is the live order book) and never for images
 * (drafts already dedupe themselves through AiDraft).
 *
 * A cache miss or a store failure is silent: the model is called as before.
 */
const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    kind: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 24 * 3600 },
  },
  { timestamps: false }
);
const AiCache = mongoose.models.AiCache || mongoose.model('AiCache', schema);

const keyOf = (kind, userId, input) => crypto.createHash('sha1').update(`${kind}|${userId}|${JSON.stringify(input)}`).digest('hex');

/**
 * @template T
 * @param {string} kind
 * @param {string} userId
 * @param {object} input       everything that changes the answer
 * @param {() => Promise<T>} make
 * @returns {Promise<T & {cached?: boolean}>}
 */
const remember = async (kind, userId, input, make) => {
  const key = keyOf(kind, String(userId), input);
  try {
    const hit = await AiCache.findOne({ key }).lean();
    if (hit) return { ...hit.value, cached: true };
  } catch {
    /* no cache today */
  }
  const value = await make();
  if (value && value.ok !== false) {
    AiCache.updateOne({ key }, { $set: { kind, value, createdAt: new Date() } }, { upsert: true }).catch(require('../quiet').quiet('AI cache store'));
  }
  return value;
};

module.exports = { remember, keyOf, AiCache };
