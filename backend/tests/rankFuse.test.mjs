/**
 * Reciprocal Rank Fusion - the maths that joins the two retrieval roads.
 *
 * WHY THIS IS TESTED AND THE SEARCHES ARE NOT (27 Sep 2026)
 *   `retrieve` now runs vector search and text search together and fuses
 *   their rankings. The searches themselves belong to Atlas and MongoDB and
 *   are checked against the real index by hand; the fusion is ours, it is
 *   pure, and it decides which evidence the assistant actually reads.
 *
 *   The failure it guards against is silent. Fuse two lists wrongly and the
 *   assistant still answers, fluently, from slightly worse evidence - nobody
 *   sees a bug, the answers just get a little vaguer.
 */
import { describe, it, expect } from 'vitest';
import pkg from '../utils/ai/retrieve.js';

const { rankFuse, RRF_K } = pkg;

/** A list of chunks, in rank order, from their titles. */
const list = (...titles) => titles.map((t) => ({ source: `${t}.md`, title: t, text: `about ${t}` }));

describe('rankFuse', () => {
  it('puts a chunk both roads agree on above one only a single road ranked first', () => {
    const vector = list('shiprocket', 'courier', 'returns');
    const text = list('courier', 'shiprocket', 'gst');
    const out = rankFuse([vector, text], 4);
    // "courier" is 2nd + 1st, "shiprocket" is 1st + 2nd - both beat anything
    // that appears once, and the pair sit at the top in either order.
    expect(out.slice(0, 2).map((c) => c.title).sort()).toEqual(['courier', 'shiprocket']);
  });

  it('still surfaces a chunk only one road found', () => {
    const vector = list('a', 'b');
    const text = list('c', 'd');
    const out = rankFuse([vector, text], 4);
    expect(out.map((c) => c.title).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('never returns the same chunk twice', () => {
    const same = list('one', 'two');
    const out = rankFuse([same, same], 10);
    expect(out).toHaveLength(2);
  });

  it('adds both contributions when a chunk appears in both lists', () => {
    const out = rankFuse([list('x'), list('x')], 1);
    expect(out[0].rrf).toBeCloseTo(2 / (RRF_K + 1), 10);
  });

  it('keeps at most k', () => {
    expect(rankFuse([list('a', 'b', 'c'), list('d', 'e', 'f')], 2)).toHaveLength(2);
  });

  it('is unbothered by an empty road', () => {
    expect(rankFuse([list('a', 'b'), []], 5).map((c) => c.title)).toEqual(['a', 'b']);
    expect(rankFuse([[], []], 5)).toEqual([]);
  });

  it('caps how many chunks one file may take, so the evidence can disagree with itself', () => {
    // Sources carry the section too ("CLAUDE.md#4"), so the cap has to count
    // the file. Counting the whole string capped nothing - measured.
    const many = (src, n) =>
      Array.from({ length: n }, (_, i) => ({ source: `${src}#${i}`, title: `${src} ${i}`, text: `piece ${i}` }));
    // One file ranks first six times; another file's chunk is seventh.
    const out = rankFuse([[...many('big.js', 6), ...many('other.js', 2)], []], 5);
    const fromBig = out.filter((c) => c.source.startsWith('big.js'));
    expect(fromBig).toHaveLength(3);
    expect(out.some((c) => c.source.startsWith('other.js'))).toBe(true);
  });

  it('returns the overflow rather than less evidence when only one file answers', () => {
    const only = Array.from({ length: 6 }, (_, i) => ({ source: `one.js#${i}`, title: `t${i}`, text: `p${i}` }));
    expect(rankFuse([only, []], 5)).toHaveLength(5);
  });

  it('compares positions, not scores - a confident road cannot run away with it', () => {
    // The scores are deliberately absurd; only the ranks should matter.
    const vector = [{ source: 'a.md', title: 'a', text: 'a', score: 0.99 }];
    const text = [
      { source: 'b.md', title: 'b', text: 'b', score: 9999 },
      { source: 'a.md', title: 'a', text: 'a', score: 0.0001 },
    ];
    const out = rankFuse([vector, text], 2);
    // "a" is 1st and 2nd; "b" is only 1st once. "a" wins on ranks alone.
    expect(out[0].title).toBe('a');
  });
});
