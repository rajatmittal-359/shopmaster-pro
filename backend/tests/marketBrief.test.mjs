/**
 * The weekly market brief (21 Sep 2026): one document per selling category,
 * built from Search Console queries, our own search box, Merchant Center's
 * market insights when Google enables them, and one grounded search - so
 * Ask ShopMaster answers "kya chal raha hai / kya rate rakhun" from a cached
 * page in milliseconds, and goes live to Google only for what the brief lacks.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { assembleBrief, briefPrompt, briefToText, siteSearchPipeline } = require('../utils/ai/marketBrief');

describe('assembleBrief', () => {
  it('merges the four sources into one brief and ranks words by evidence', () => {
    const b = assembleBrief({
      category: { name: 'Necklace Sets', slug: 'necklace-sets' },
      grounded: { band: { low: 800, high: 2500, typical: 1300 }, words: ['ad necklace set', 'kundan choker'], sources: ['Amazon', 'Meesho'], note: 'Most sets sit at ₹1,200-1,500.' },
      searchConsole: [{ query: 'ad necklace set', impressions: 40, clicks: 2 }, { query: 'silver necklace jaipur', impressions: 12, clicks: 0 }],
      siteSearches: [{ term: 'kundan choker', count: 5 }, { term: 'necklace', count: 3 }],
      bestSellers: [{ title: 'Zaveri Pearls AD set', rank: 1 }],
      weekOf: '2026-09-21',
    });
    expect(b.category.slug).toBe('necklace-sets');
    expect(b.band).toEqual({ low: 800, high: 2500, typical: 1300 });
    expect(b.words[0]).toMatchObject({ word: 'ad necklace set' });
    expect(b.words.find((w) => w.word === 'kundan choker').sources.sort()).toEqual(['grounded', 'site']);
    expect(b.bestSellers).toHaveLength(1);
    expect(b.weekOf).toBe('2026-09-21');
  });
  it('a brief with no grounded answer still carries the real queries', () => {
    const b = assembleBrief({ category: { name: 'Kurtas', slug: 'kurtas' }, grounded: null, searchConsole: [{ query: 'cotton kurta', impressions: 9, clicks: 1 }], siteSearches: [], bestSellers: [], weekOf: '2026-09-21' });
    expect(b.band).toBeNull();
    expect(b.words.map((w) => w.word)).toEqual(['cotton kurta']);
  });
  it('the prompt is about India, this month, this category; the text reads as one paragraph', () => {
    expect(briefPrompt({ name: 'Kurtas' })).toMatch(/India/);
    expect(briefPrompt({ name: 'Kurtas' })).toMatch(/Kurtas/);
    const text = briefToText({ category: { name: 'Kurtas' }, band: { low: 300, high: 900, typical: 499 }, words: [{ word: 'cotton kurta', sources: ['google'] }], note: 'x', bestSellers: [], weekOf: '2026-09-21', sources: ['Meesho'] });
    expect(text).toMatch(/Kurtas/);
    expect(text).toMatch(/₹300/);
    expect(text).toMatch(/cotton kurta/);
  });
});

/*
 * THE SOURCE THAT WAS NEVER THERE (found 28 Sep 2026)
 *
 *   `buildBriefs` reads our own search box with an aggregate, and that
 *   aggregate matched `createdAt`. `models/SearchLog` is declared
 *   `{ timestamps: false }`, so no document has ever had that field and the
 *   `$match` could not hit one. Every weekly brief was built from three
 *   sources while the comment above it said four, and the one silently lost
 *   was the only source that is OUR OWN BUYERS rather than Google's idea of
 *   India.
 *
 *   It failed the way the worst bugs fail: an aggregate matching nothing
 *   returns [], which is indistinguishable from "nobody has searched yet" -
 *   true for a shop this young, so the empty result looked correct for
 *   weeks. Proven against the dev database before the fix: `createdAt` gave
 *   0 terms, `day` gave 3.
 *
 *   These tests hold the pipeline against the MODEL rather than against a
 *   remembered field name, so the next rename fails here instead of going
 *   quiet for another month.
 */
describe('the brief reads our own search box from a field that exists', () => {
  const SearchLog = require('../models/SearchLog');

  /** Every field name a $match in this pipeline filters on. */
  const filtered = (pipeline) =>
    pipeline.flatMap((stage) => Object.keys(stage.$match || {}));

  it('filters only on fields SearchLog actually declares', () => {
    const fields = filtered(siteSearchPipeline(28));

    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      // `createdAt` is the one that broke it, and it is absent here because
      // the schema sets `timestamps: false`.
      expect(SearchLog.schema.path(field), `SearchLog has no field "${field}"`).toBeTruthy();
    }
  });

  it('windows by the IST day string the rows are keyed by, not by a Date', () => {
    const [match] = siteSearchPipeline(28);

    // A Date object here would compare against a string field and match
    // nothing - the same silent emptiness in a new costume.
    expect(typeof match.$match.day.$gte).toBe('string');
    expect(match.$match.day.$gte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('a window of N days really is N days wide', () => {
    // Measured as the GAP between two windows, so the assertion does not
    // drift with the clock or restate the implementation's own arithmetic.
    const gap =
      (Date.parse(siteSearchPipeline(7)[0].$match.day.$gte) -
        Date.parse(siteSearchPipeline(28)[0].$match.day.$gte)) /
      86400000;
    expect(gap).toBe(21);
  });

  it('groups by term and takes the busiest first', () => {
    const p = siteSearchPipeline(7);
    expect(p.find((s) => s.$group).$group._id).toBe('$term');
    expect(p.find((s) => s.$sort).$sort.count).toBe(-1);
  });

  it('a shorter window asks for a later day', () => {
    const wide = siteSearchPipeline(28)[0].$match.day.$gte;
    const narrow = siteSearchPipeline(7)[0].$match.day.$gte;
    expect(narrow > wide).toBe(true);
  });
});
