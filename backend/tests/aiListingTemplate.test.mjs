/**
 * The listing writer follows the category's template (21 Sep 2026): the
 * schema it must fill carries the template's attributes as enums, the title
 * is built from the formula (facts first, no adjectives), the never-claim
 * list is enforced, and tags carry the template's SEO seeds.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { draftListing, schemaFor, promptFor } = require('../utils/ai/listing');
const { TEMPLATES } = require('../config/listingTemplates');

const CATS = ['Bridal Jewellery Sets', 'Kurtas & Suits', 'Bedsheets & Bedding'];
let seenOpts;
const answering = (payload) => ({ generate: async (prompt, opts) => { seenOpts = { prompt, opts }; return { ok: true, text: JSON.stringify(payload) }; } });

describe('schemaFor', () => {
  it('puts the template attributes into the schema as enums / strings, plus productType', () => {
    const s = schemaFor(TEMPLATES.jewellery);
    expect(s.properties.attributes.properties.plating.enum).toContain('Gold Plated');
    expect(s.properties.attributes.properties.occasion.type).toBe('array');
    expect(s.properties.attributes.properties.setContents.type).toBe('string');
    expect(s.properties.productType.enum).toContain('Necklace Set');
    expect(s.required).toContain('attributes');
  });
});

describe('draftListing with a template', () => {
  const good = {
    name: 'ignored by the formula', description: '<p>An imitation jewellery set for weddings.</p>', bullets: ['Necklace with earrings', 'Gold plated brass with kundan'],
    tags: ['kundan set'], color: 'Maroon', material: 'Brass', gender: 'women', ageGroup: 'adult', size: '', categoryName: 'Bridal Jewellery Sets', isJewellery: true,
    productType: 'Necklace Set', attributes: { baseMaterial: 'brass', plating: 'gold plated', stoneType: 'Kundan', occasion: ['Wedding'], closure: 'Adjustable Thread (Dori)', nonsense: 'x' },
  };
  it('cleans attributes to the template, builds the title from the formula, seeds tags, keeps the honest description', async () => {
    const r = await draftListing({ name: 'kundan set', categoryName: 'Bridal Jewellery Sets', categoryOptions: CATS, template: TEMPLATES.jewellery }, answering(good));
    expect(r.ok).toBe(true);
    expect(r.draft.attributes).toEqual({ baseMaterial: 'Brass', plating: 'Gold Plated', stoneType: 'Kundan', occasion: ['Wedding'], closure: 'Adjustable Thread (Dori)' });
    expect(r.draft.name).toBe('Brass Gold Plated Kundan Maroon Necklace Set');
    expect(r.draft.productType).toBe('Necklace Set');
    expect(r.draft.tags).toContain('kundan set');
    expect(r.draft.tags.length).toBeGreaterThan(3);
    expect(seenOpts.opts.responseSchema.properties.attributes).toBeDefined();
    expect(seenOpts.prompt).toMatch(/never say/i);
    expect(seenOpts.prompt).toMatch(/Plating/);
  });
  it('keeps the model title when the formula would be empty (no attributes came back)', async () => {
    const r = await draftListing({ name: 'diya', categoryOptions: CATS, template: TEMPLATES.general }, answering({ ...good, name: 'Brass Diya Set of 4', attributes: {}, productType: '', isJewellery: false, description: '<p>Brass diyas.</p>' }));
    expect(r.ok).toBe(true);
    expect(r.draft.name).toBe('Brass Diya Set of 4');
  });
});
