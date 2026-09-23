/**
 * Facts that are honestly more than one value (23 Sep 2026).
 *
 * Rajat, looking at the product form: "some of these should be multi-select".
 * The research agreed - Myntra lets a seller tick several occasions, and
 * Google itself takes up to THREE values on colour, material and pattern:
 * one primary and two secondary, joined by a SLASH, never a comma, or "only
 * one colour will be applied" (answer/6324487, answer/6324410).
 *
 * So Stone/work, Style, Ideal for, Fabric, Material, Pattern and Skin type
 * became multi, and colour learnt the slash shape. What these tests defend:
 *   - the cap is the attribute's own `max`, not a free-for-all;
 *   - a value saved before the change (a plain string) still loads;
 *   - the feed sends all three, slash-joined, in Google's order;
 *   - the shop's colour filter matches a part of "Red/Green" without
 *     "Gold" ever dragging in "Rose Gold".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { TEMPLATES, cleanAttributes, titleFrom } = require('../config/listingTemplates');
const { feedAttributeLines } = require('../controllers/feedController');
const { buildCatalogueFilter } = require('../utils/catalogueFilter');
const Category = require('../models/Category');

const build = buildCatalogueFilter;

describe('which facts may hold more than one value', () => {
  it('the seven the research named are multi, and the enum-shaped ones stay single', () => {
    const type = (key, attr) => TEMPLATES[key].attributes.find((a) => a.key === attr)?.type;
    expect(type('jewellery', 'stoneType')).toBe('multi');
    expect(type('jewellery', 'idealFor')).toBe('multi');
    expect(type('jewellery', 'collection')).toBe('multi');
    expect(type('apparel', 'fabric')).toBe('multi');
    expect(type('apparel', 'pattern')).toBe('multi');
    expect(type('home-textiles', 'material')).toBe('multi');
    expect(type('beauty', 'skinType')).toBe('multi');

    // Google's spec allows exactly one of these per item - multi here would
    // earn a disapproval, not a richer listing.
    expect(type('apparel', 'sleeve')).toBe('select');
    expect(type('apparel', 'neck')).toBe('select');
    expect(type('apparel', 'fit')).toBe('select');
    expect(type('jewellery', 'plating')).toBe('select');
    expect(type('jewellery', 'closure')).toBe('select');
    expect(type('home-textiles', 'size')).toBe('select');
    expect(type('beauty', 'formulation')).toBe('select');
  });

  it('keeps at most the attribute’s max, drops repeats and anything off the list', () => {
    const attrs = cleanAttributes(TEMPLATES.jewellery, {
      stoneType: ['Kundan', 'Pearl', 'Kundan', 'Meenakari', 'Moon Rock'],
    });
    expect(attrs.stoneType).toEqual(['Kundan', 'Pearl', 'Meenakari']);
  });

  it('a value saved before the field became multi still loads', () => {
    const attrs = cleanAttributes(TEMPLATES.apparel, { fabric: 'Pure Cotton', pattern: 'Printed' });
    expect(attrs.fabric).toEqual(['Pure Cotton']);
    expect(attrs.pattern).toEqual(['Printed']);
    // And the title still reads as one thing, taking the first value.
    const title = titleFrom(TEMPLATES.apparel, attrs, { idealFor: 'Women', productType: 'Kurta Set' });
    expect(title).toMatch(/Pure Cotton/);
    expect(title).not.toMatch(/,/);
  });
});

describe('what Google is sent', () => {
  it('joins up to three with a slash - never a comma - for material and pattern', () => {
    const lines = feedAttributeLines({
      templateKey: 'apparel',
      attributes: { fabric: ['Pure Cotton', 'Silk', 'Linen', 'Khadi'], pattern: ['Printed', 'Embroidered'] },
    }).join('\n');
    expect(lines).toContain('<g:material>Pure Cotton/Silk/Linen</g:material>');
    expect(lines).not.toContain('Khadi');
    expect(lines).toContain('<g:pattern>Printed/Embroidered</g:pattern>');
    expect(lines).not.toMatch(/<g:(material|pattern)>[^<]*,/);
  });

  it('a single value still goes out plain, and the old product-level material is the fallback', () => {
    const one = feedAttributeLines({ templateKey: 'apparel', attributes: { fabric: ['Rayon'] } }).join('\n');
    expect(one).toContain('<g:material>Rayon</g:material>');
    const legacy = feedAttributeLines({ templateKey: 'electronics', attributes: {}, material: 'Aluminium' }).join('\n');
    expect(legacy).toContain('<g:material>Aluminium</g:material>');
  });

  it('a multi fact that is not material or pattern goes out as a product_detail line, comma-read', () => {
    const lines = feedAttributeLines({
      templateKey: 'beauty',
      attributes: { skinType: ['Dry', 'Sensitive'], formulation: 'Cream' },
    }).join('\n');
    expect(lines).toMatch(/<g:attribute_name>Skin \/ hair type<\/g:attribute_name><g:attribute_value>Dry, Sensitive</);
  });
});

describe('the shop’s colour filter with slashed colours', () => {
  const originals = {};
  beforeEach(() => {
    originals.browsable = Category.getBrowsableIds;
    Category.getBrowsableIds = vi.fn(async () => ['cat1', 'cat2']);
    vi.spyOn(require('../utils/hiddenSellers'), 'withoutHiddenSellers').mockImplementation(async (f) => f);
  });
  afterEach(() => {
    Category.getBrowsableIds = originals.browsable;
    vi.restoreAllMocks();
  });

  it('matches a colour that is one part of "Rose Gold/Green", and still refuses a substring', async () => {
    const { filter } = await build({ color: 'Green' });
    const rx = filter.color;
    expect(rx.test('Rose Gold/Green')).toBe(true);
    expect(rx.test('Green')).toBe(true);
    expect(rx.test('Green Blue')).toBe(false);

    const gold = (await build({ color: 'Gold' })).filter.color;
    expect(gold.test('Gold/Red')).toBe(true);
    expect(gold.test('Rose Gold')).toBe(false); // the old promise, kept
  });

  it('several colours at once still work', async () => {
    const { filter } = await build({ color: 'Gold,Green' });
    expect(filter.color.$in).toHaveLength(2);
    expect(filter.color.$in.some((rx) => rx.test('Silver/Green'))).toBe(true);
  });
});
