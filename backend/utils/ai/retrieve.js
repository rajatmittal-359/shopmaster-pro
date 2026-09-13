const mongoose = require('mongoose');
const KnowledgeChunk = require('../../models/KnowledgeChunk');
const { embed } = require('./embed');

/**
 * The assistant's memory of the platform: which chunks of the docs and the
 * code's own explanations are about this question.
 *
 * Vector search first (index `knowledge_vec`, cosine, built by
 * indexKnowledge.js). When the question cannot be embedded - quota gone, key
 * missing - or the index is not there, MongoDB's own text index on the same
 * chunks answers; worse recall, never silence.
 *
 * `audience` is the wall: a customer reads what everyone may read; a seller
 * also the seller material; the admin everything. It is a filter inside the
 * search, not a check afterwards, so a chunk the asker may not see never
 * ranks.
 */
const AUDIENCES = {
  customer: ['everyone'],
  seller: ['everyone', 'seller'],
  admin: ['everyone', 'seller', 'admin'],
};

const strip = (c) => ({ source: c.source, title: c.title, text: c.text, score: c.score });

const retrieve = async (question, role, { k = 8 } = {}) => {
  if (mongoose.connection.readyState !== 1) return { chunks: [], via: 'none' };
  const audience = AUDIENCES[role] || AUDIENCES.customer;
  const q = String(question || '').slice(0, 2000);

  const e = await embed(q, { taskType: 'RETRIEVAL_QUERY' }).catch((err) => ({ ok: false, reason: err.message }));
  if (e.ok) {
    try {
      const rows = await KnowledgeChunk.aggregate([
        {
          $vectorSearch: {
            index: 'knowledge_vec',
            path: 'vector',
            queryVector: e.vector,
            numCandidates: Math.max(50, k * 12),
            limit: k,
            filter: { audience: { $in: audience } },
          },
        },
        { $project: { _id: 0, source: 1, title: 1, text: 1, score: { $meta: 'vectorSearchScore' } } },
      ]);
      if (rows.length) return { chunks: rows.map(strip), via: 'vector' };
    } catch (err) {
      console.warn(`knowledge vector search unavailable (${err.message.slice(0, 80)}) - text search instead`);
    }
  }

  try {
    const rows = await KnowledgeChunk.find(
      { $text: { $search: q }, audience: { $in: audience } },
      { score: { $meta: 'textScore' }, source: 1, title: 1, text: 1 }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(k)
      .lean();
    return { chunks: rows.map(strip), via: 'text' };
  } catch {
    return { chunks: [], via: 'none' };
  }
};

/** The chunks as one block for the prompt, each with where it came from. */
const asContext = (chunks) =>
  chunks.map((c, i) => `[${i + 1}] ${c.title || c.source} (${c.source})\n${c.text}`).join('\n\n');

module.exports = { retrieve, asContext, AUDIENCES };
