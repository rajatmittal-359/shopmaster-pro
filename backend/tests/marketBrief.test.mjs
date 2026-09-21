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
const { assembleBrief, briefPrompt, briefToText } = require('../utils/ai/marketBrief');

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
