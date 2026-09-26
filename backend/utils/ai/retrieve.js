const mongoose = require('mongoose');
const KnowledgeChunk = require('../../models/KnowledgeChunk');
const { embed } = require('./embed');

/**
 * The assistant's memory of the platform: which chunks of the docs and the
 * code's own explanations are about this question.
 *
 * BOTH ROADS AT ONCE, NOT ONE AS A FALLBACK (27 Sep 2026)
 *   This used to run vector search and fall back to the text index only when
 *   embedding failed. That treated lexical search as the poor relation, and
 *   the evidence says it is not.
 *
 *   Rajat had been told that semantic chunking and Google's new Open
 *   Knowledge Format are "much better than RAG", and asked for the research.
 *   The one controlled study of OKF (Abhinav, SSRN 7227678, Aug 2026 - a
 *   623-page filing, 93 questions with page-level answer keys) found the
 *   opposite of the claim, and something far more useful on the way:
 *
 *     - OKF looked like a huge win, 91.1% page hit against 65.8% for a dense
 *       vector baseline, until they checked the baseline. That encoder read
 *       only 256 word-piece tokens while 80.9% of the passages were longer.
 *     - Plain BM25 over the ordinary chunks, no OKF at all, reached 97.5%.
 *     - A proper OKF bundle (1,011 concepts, 99.9% of the source words) still
 *       did not beat ordinary chunk retrieval, and added to a strong hybrid
 *       pipeline it added nothing at all.
 *
 *   So the lesson is not "adopt OKF". It is that a lexical retriever beat a
 *   dense one outright on real documents, and that an apparent win for
 *   anything new usually means the baseline was weak. Ours was half-weak: the
 *   text index sat right here and was only ever used when the vector road was
 *   broken.
 *
 *   Now both run together and their rankings are fused (rankFuse). Vector
 *   finds the chunk that means the same thing in other words; text finds the
 *   chunk carrying the asker's exact word - a SKU, "Shiprocket", "jhumka", a
 *   pincode - which is exactly what an embedding blurs. Neither is a fallback
 *   any more, and if either road fails the other still answers.
 *
 * THE TRADE-OFF, MEASURED AND ACCEPTED
 *   Fusion reorders, so a chunk the vector road put 2nd can land 6th once
 *   the text road disagrees. Checked on the live index with "how do I see
 *   how one listing is doing": ProductReport.jsx went from 2nd to 6th and
 *   GoogleStatus.jsx from 3rd to 8th - both still inside the eight chunks
 *   the assistant reads, so nothing was lost from its context, only from the
 *   top of it. That is fine at k=8. It would NOT be fine at k=3: if the
 *   default k is ever lowered, check this again, because the right answer
 *   would start falling off the end.
 *
 * WHAT WAS DELIBERATELY NOT DONE
 *   Semantic chunking. Three independent evaluations say it does not pay:
 *   "cluster-based semantic chunking did not yield any consistent
 *   improvement... and adds computing complexity" (arXiv 2607.01852);
 *   Vectara found no clear advantage for evidence retrieval; Chroma's own
 *   numbers put plain recursive chunking at the top. And indexKnowledge.js
 *   already splits on markdown headings - structural chunking, which is the
 *   thing semantic chunking tries to approximate, except ours is exact
 *   because a person wrote the headings.
 *
 * `audience` is the wall: a customer reads what everyone may read; a seller
 * also the seller material; the admin everything. It is a filter inside both
 * searches, not a check afterwards, so a chunk the asker may not see never
 * ranks.
 */
const AUDIENCES = {
  customer: ['everyone'],
  seller: ['everyone', 'seller'],
  admin: ['everyone', 'seller', 'admin'],
};

const strip = (c) => ({ source: c.source, title: c.title, text: c.text, score: c.score });

/**
 * Reciprocal Rank Fusion - how two ranked lists become one.
 *
 * Each list contributes 1/(RRF_K + rank) for every chunk it returns, and the
 * contributions add up. A chunk both roads rank highly wins; a chunk only one
 * road found can still place well if it placed near the top there.
 *
 * It compares POSITIONS, never scores, which is the whole point: a cosine
 * similarity of 0.82 and a MongoDB textScore of 4.1 are not on the same scale
 * and cannot be added, averaged or weighted without inventing a conversion
 * between them. Ranks need no conversion.
 *
 * RRF_K = 60 is the constant from the original paper (Cormack et al., 2009)
 * and the one Atlas and Elastic both use. It flattens the gap between rank 1
 * and rank 2 so that neither road can win on its own confidence alone.
 */
const RRF_K = 60;

/*
 * AND A CEILING PER FILE.
 *
 * Measured against the real index the night this went in: for "Shiprocket se
 * booking kaise hoti hai", four of the top five chunks were consecutive
 * pieces of shiprocketBooking.js. They are not wrong, but they are one
 * voice - and they were crowding out settleReplacement.js and
 * shipmentBooking.js, which answer the parts of the question that file does
 * not. Eight slots spent on one file is eight slots that cannot disagree
 * with each other.
 *
 * Three is a floor high enough to keep a genuinely long explanation intact
 * and low enough to leave room for a second source.
 *
 * The cap counts FILES, not chunk ids. `source` is "CLAUDE.md#4" - the file
 * plus the section - so counting it whole would treat six consecutive pieces
 * of one file as six different sources and cap nothing. Measured: that is
 * exactly what happened on the first run.
 */
const fileOf = (source) => String(source || '').split('#')[0];
const PER_SOURCE = 3;

const rankFuse = (lists, k, perSource = PER_SOURCE) => {
  const byId = new Map();
  for (const list of lists) {
    list.forEach((chunk, i) => {
      const id = `${chunk.source}|${chunk.title || ''}|${(chunk.text || '').slice(0, 80)}`;
      const add = 1 / (RRF_K + i + 1);
      const seen = byId.get(id);
      if (seen) seen.rrf += add;
      else byId.set(id, { ...chunk, rrf: add });
    });
  }

  const ranked = [...byId.values()].sort((a, b) => b.rrf - a.rrf);
  const used = new Map();
  const kept = [];
  const spare = [];
  for (const c of ranked) {
    const file = fileOf(c.source);
    const n = used.get(file) || 0;
    if (n < perSource) {
      used.set(file, n + 1);
      kept.push(c);
    } else spare.push(c);
    if (kept.length === k) return kept;
  }
  // If capping left us short of k - a question only one file answers - the
  // overflow comes back in rank order rather than returning less evidence.
  return [...kept, ...spare].slice(0, k);
};

const retrieve = async (question, role, { k = 8 } = {}) => {
  if (mongoose.connection.readyState !== 1) return { chunks: [], via: 'none' };
  const audience = AUDIENCES[role] || AUDIENCES.customer;
  const q = String(question || '').slice(0, 2000);

  // Ask each road for more than we will keep: fusion needs something to
  // choose between, and a chunk ranked 9th by one road and 2nd by the other
  // deserves to be seen at all.
  const want = Math.max(k * 2, 12);

  const vectorSearch = async () => {
    const e = await embed(q, { taskType: 'RETRIEVAL_QUERY' }).catch((err) => ({ ok: false, reason: err.message }));
    if (!e.ok) return [];
    return KnowledgeChunk.aggregate([
      {
        $vectorSearch: {
          index: 'knowledge_vec',
          path: 'vector',
          queryVector: e.vector,
          numCandidates: Math.max(50, want * 12),
          limit: want,
          filter: { audience: { $in: audience } },
        },
      },
      { $project: { _id: 0, source: 1, title: 1, text: 1, score: { $meta: 'vectorSearchScore' } } },
    ]);
  };

  const textSearch = async () =>
    KnowledgeChunk.find(
      { $text: { $search: q }, audience: { $in: audience } },
      { score: { $meta: 'textScore' }, source: 1, title: 1, text: 1 }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(want)
      .lean();

  // Both roads at once, and allSettled so one failing never silences the
  // other: a missing Atlas index or a spent embedding quota costs recall,
  // never an answer.
  const [vec, txt] = await Promise.allSettled([vectorSearch(), textSearch()]);
  const vectorRows = vec.status === 'fulfilled' ? vec.value || [] : [];
  const textRows = txt.status === 'fulfilled' ? txt.value || [] : [];

  if (vec.status === 'rejected') {
    console.warn(`knowledge vector search unavailable (${String(vec.reason && vec.reason.message ? vec.reason.message : vec.reason).slice(0, 80)})`);
  }

  if (!vectorRows.length && !textRows.length) return { chunks: [], via: 'none' };
  if (!textRows.length) return { chunks: vectorRows.map(strip).slice(0, k), via: 'vector' };
  if (!vectorRows.length) return { chunks: textRows.map(strip).slice(0, k), via: 'text' };

  return { chunks: rankFuse([vectorRows.map(strip), textRows.map(strip)], k), via: 'hybrid' };
};

/** The chunks as one block for the prompt, each with where it came from. */
const asContext = (chunks) =>
  chunks.map((c, i) => `[${i + 1}] ${c.title || c.source} (${c.source})\n${c.text}`).join('\n\n');

module.exports = { retrieve, asContext, AUDIENCES, rankFuse, RRF_K };
