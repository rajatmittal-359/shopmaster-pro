const mongoose = require('mongoose');

/**
 * One piece of what the platform knows about itself: a slice of a document
 * or a source file's explanatory comments, with its embedding. Written by
 * indexKnowledge.js; read by the assistant through Atlas Vector Search
 * (index `knowledge_vec`) with a plain text search as the fallback.
 *
 * `audience` keeps admin-only material (ops, credentials notes, internal
 * plans) out of a seller's or customer's answers.
 */
const knowledgeChunkSchema = new mongoose.Schema(
  {
    source: { type: String, required: true, index: true }, // e.g. FRONTEND-PLAN.md#4.20
    title: { type: String, default: '' },
    text: { type: String, required: true },
    audience: { type: String, enum: ['everyone', 'seller', 'admin'], default: 'everyone', index: true },
    vector: { type: [Number], default: undefined },
    hash: { type: String, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// The fallback road when a question cannot be embedded: MongoDB's own text
// index over the same chunks (a normal index, not one of the three Atlas
// Search slots).
knowledgeChunkSchema.index({ title: 'text', text: 'text' }, { weights: { title: 3, text: 1 }, default_language: 'none' });

module.exports = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
