/**
 * Home sections (Option A S1, 21 Sep 2026): the home page is an ordered list
 * of sections the admin arranges - Shopify's theme editor, Etsy's home modules.
 * The normaliser is the one gate between the admin form and the page.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normaliseSections, DEFAULT_SECTIONS, TYPES } = require('../utils/homeSections');

describe('normaliseSections', () => {
  it('an empty or missing list is the default layout', () => {
    expect(normaliseSections(undefined)).toEqual(DEFAULT_SECTIONS);
    expect(normaliseSections([])).toEqual(DEFAULT_SECTIONS);
  });
  it('keeps order, drops unknown types, caps titles, forces hero first and single', () => {
    const out = normaliseSections([
      { type: 'newest', enabled: true, title: 'x'.repeat(100) },
      { type: 'hero' },
      { type: 'nonsense' },
      { type: 'hero' },
      { type: 'collection', title: 'Diwali picks', href: '/shop?search=diya', slugs: ['a-1', 'b-2', 'bad slug!'], until: '2026-11-15' },
    ]);
    expect(out.map((s) => s.type)).toEqual(['hero', 'newest', 'collection']);
    expect(out[1].title).toHaveLength(60);
    expect(out[2].slugs).toEqual(['a-1', 'b-2']);
    expect(out[2].href).toBe('/shop?search=diya');
  });
  it('refuses a collection link off the shop and a banner link off-site', () => {
    const out = normaliseSections([{ type: 'hero' }, { type: 'collection', title: 'Bad', href: 'https://evil.example/' }, { type: 'banner', title: 'Sale', href: 'javascript:alert(1)', image: 'https://res.cloudinary.com/x/y.jpg' }]);
    expect(out[1].href).toBe('/shop');
    expect(out[2].href).toBe('/shop');
  });
  it('categories and sellers keep at most 8 picks and every id is a string', () => {
    const out = normaliseSections([{ type: 'hero' }, { type: 'categories', slugs: Array.from({ length: 12 }, (_, i) => `c-${i}`) }, { type: 'sellers', ids: [123, 'abc', null] }]);
    expect(out[1].slugs).toHaveLength(8);
    expect(out[2].ids).toEqual(['123', 'abc']);
  });
  it('every type has a default title and the hero cannot be disabled', () => {
    for (const t of TYPES) expect(typeof normaliseSections([{ type: 'hero' }, { type: t }]).find((s) => s.type === t).title).toBe('string');
    expect(normaliseSections([{ type: 'hero', enabled: false }])[0].enabled).toBe(true);
  });
});
