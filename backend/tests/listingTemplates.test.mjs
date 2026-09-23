/**
 * Category listing templates (21 Sep 2026): one source of truth for what a
 * listing in a category must say - attributes with fixed options (Flipkart's
 * live facets), the title formula, the legal lines, what may never be claimed.
 * The seller form, the AI writer, the product page, the shop filters and the
 * Google feed all read this file.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const T = require('../config/listingTemplates');

describe('templates', () => {
  it('maps every top-level category to a template and falls back to general', () => {
    expect(T.templateFor({ name: 'Jewellery' }).key).toBe('jewellery');
    expect(T.templateFor({ name: 'Bridal Jewellery Sets', parent: { name: 'Jewellery' } }).key).toBe('jewellery');
    expect(T.templateFor({ name: 'Kurtas & Suits', parent: { name: "Women's Fashion" } }).key).toBe('apparel');
    expect(T.templateFor({ name: 'Bedsheets & Bedding', parent: { name: 'Home & Kitchen' } }).key).toBe('home-textiles');
    expect(T.templateFor({ name: 'Makeup', parent: { name: 'Beauty & Personal Care' } }).key).toBe('beauty');
    expect(T.templateFor({ name: 'Chargers & Power Banks', parent: { name: 'Electronics' } }).key).toBe('electronics');
    expect(T.templateFor({ name: 'Blue Pottery', parent: { name: 'Handicrafts & Art' } }).key).toBe('general');
    expect(T.templateFor(null).key).toBe('general');
  });
  it('every template has attributes with keys, a title formula of known keys, and legal lines', () => {
    for (const t of Object.values(T.TEMPLATES)) {
      expect(t.attributes.length).toBeGreaterThan(0);
      const keys = new Set(t.attributes.map((a) => a.key));
      for (const k of t.title) expect(keys.has(k) || ['type', 'setContents'].includes(k) || k.startsWith('$')).toBe(true);
      expect(Array.isArray(t.legal)).toBe(true);
    }
  });
});

describe('cleanAttributes', () => {
  it('keeps only template keys, snaps selects to an option (case-insensitive), caps text, drops junk', () => {
    const t = T.TEMPLATES.jewellery;
    const out = T.cleanAttributes(t, { plating: 'gold plated', stoneType: 'American Diamond (AD)', baseMaterial: 'brass', occasion: ['Wedding', 'Festive', 'Nonsense'], nonsense: 'x', careInstructions: 'x'.repeat(300) });
    expect(out.plating).toBe('Gold Plated');
    // 23 Sep 2026: Stone / work is multi - a piece can be Kundan AND pearl - so one value arrives as a one-item list.
    expect(out.stoneType).toEqual(['American Diamond (AD)']);
    expect(out.baseMaterial).toBe('Brass');
    expect(out.occasion).toEqual(['Wedding', 'Festive']);
    expect(out.nonsense).toBeUndefined();
    expect(out.careInstructions.length).toBeLessThanOrEqual(200);
  });
  it('an unknown select value is dropped, not stored', () => {
    expect(T.cleanAttributes(T.TEMPLATES.apparel, { fabric: 'unobtainium' }).fabric).toBeUndefined();
  });
});

describe('titleFrom', () => {
  it('builds the marketplace title formula from attributes, skipping empties, never twice the same word', () => {
    const title = T.titleFrom(T.TEMPLATES['home-textiles'], { material: 'Cotton', size: 'Double', type: 'Flat', threadCount: '144 TC', pattern: 'Jaipuri Prints', setContents: '1 Bedsheet with 2 Pillow Covers' }, { productType: 'Bedsheet' });
    expect(title).toBe('Cotton Double Flat 144 TC Jaipuri Prints Bedsheet with 2 Pillow Covers');
    const j = T.titleFrom(T.TEMPLATES.jewellery, { baseMaterial: 'Brass', plating: 'Gold Plated', stoneType: 'Kundan' }, { productType: 'Necklace Set', color: 'Maroon' });
    expect(j).toBe('Brass Gold Plated Kundan Maroon Necklace Set');
  });
});

describe('missingRequired', () => {
  it('names the required attributes a listing still lacks', () => {
    expect(T.missingRequired(T.TEMPLATES.jewellery, { plating: 'Gold Plated' })).toEqual(expect.arrayContaining(['baseMaterial', 'stoneType']));
    expect(T.missingRequired(T.TEMPLATES.general, {})).toEqual([]);
  });
});
