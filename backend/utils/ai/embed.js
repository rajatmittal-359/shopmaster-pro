/**
 * Text → vector, for the knowledge index and for questions against it.
 *
 * Gemini's embedding model on the free key (768 dimensions - enough for a
 * few thousand chunks, and Atlas's vector index is happier small). One
 * model for indexing and querying, always: vectors from two models do not
 * live in one space. If Gemini cannot answer, the caller falls back to
 * Atlas text search over the same chunks rather than to another embedder.
 */
const MODEL = process.env.EMBED_MODEL || 'gemini-embedding-001';
const DIMS = 768;
const { GEMINI_MODELS: API } = require('./endpoints');

const embed = async (text, { taskType = 'RETRIEVAL_DOCUMENT' } = {}) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, reason: 'GEMINI_API_KEY is not set' };
  const res = await fetch(`${API}/${MODEL}:embedContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text: String(text).slice(0, 8000) }] }, taskType, outputDimensionality: DIMS }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.embedding?.values) return { ok: false, reason: data?.error?.message || `embed ${res.status}` };
  return { ok: true, vector: data.embedding.values };
};

/** Several at once, in order; stops at the first failure and says where. */
const embedMany = async (texts, opts) => {
  const out = [];
  for (const t of texts) {
    const r = await embed(t, opts);
    if (!r.ok) return { ok: false, reason: r.reason, done: out.length, vectors: out };
    out.push(r.vector);
  }
  return { ok: true, vectors: out };
};

module.exports = { embed, embedMany, MODEL, DIMS };
