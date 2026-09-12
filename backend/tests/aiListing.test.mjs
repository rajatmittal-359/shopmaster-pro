/**
 * The listing writer: what it asks for, and what it refuses to pass on.
 *
 * WHAT THESE TESTS DEFEND
 *   1. The prompt is category-neutral. productCopy.js wrote for "a jewellery
 *      shop"; this platform sells kurtis and bedsheets too, and the prompt
 *      must not tell the model otherwise.
 *   2. Jewellery honesty is CHECKED, not just requested. A draft that says
 *      "22k gold" for imitation jewellery is refused, whatever the prompt
 *      said - a prompt is a request, and a request is not a guarantee.
 *   3. Every field comes back normalised to what the Product model accepts -
 *      an unknown gender does not reach Mongoose as a validation error the
 *      seller has to decode.
 *   4. A category the platform does not have is not "suggested".
 *
 *   Gemini is never called; `generate` is a stub returning whatever JSON the
 *   test wants to see the writer handle.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { draftListing, promptFor, looksLikeJewellery } = require('../utils/ai/listing');

const good = {
  name: 'Handcrafted Boho Beaded Dangler Earrings',
  description: '<p>Copper-toned links with burgundy glass beads.</p><p>Wear them with a cotton kurta for college or a festive evening. These are imitation jewellery.</p>',
  bullets: ['Handcrafted', 'Lightweight'],
  tags: ['Beaded Earrings', 'boho'],
  color: 'Copper',
  material: 'Glass and metal',
  gender: 'female',
  ageGroup: 'adult',
  size: '',
  categoryName: 'Earrings',
  isJewellery: true,
};

const answering = (payload) => ({ generate: async () => ({ ok: true, text: JSON.stringify(payload) }) });
const CATS = ['Earrings', 'Kurtas & Suits', 'Bedsheets'];

describe('the prompt', () => {
  it('does not assume the product is jewellery', () => {
    const p = promptFor({ name: 'Cotton bedsheet', categoryOptions: CATS, hasImage: true });
    expect(p).toMatch(/small Indian seller list a product/);
    expect(p).not.toMatch(/online jewellery shop/);
    // The jewellery rule is conditional, and says so.
    expect(p).toMatch(/If this is jewellery/);
  });

  it('lists the platform\'s own categories for the model to choose from', () => {
    const p = promptFor({ name: 'x', categoryOptions: CATS });
    for (const c of CATS) expect(p).toContain(`- ${c}`);
  });

  it('says whether there is a photograph', () => {
    expect(promptFor({ name: 'x', hasImage: true })).toMatch(/Look carefully at the photograph/);
    expect(promptFor({ name: 'x', hasImage: false })).toMatch(/no photograph/);
  });
});

describe('a good draft', () => {
  it('comes back normalised for the Product model', async () => {
    const r = await draftListing({ name: 'earrings', categoryOptions: CATS }, answering(good));
    expect(r.ok).toBe(true);
    expect(r.draft.tags).toEqual(['beaded earrings', 'boho']); // lowercased
    expect(r.draft.categoryName).toBe('Earrings');
    expect(r.draft.gender).toBe('female');
    expect(r.warnings).toEqual([]);
  });

  it('needs at least a photo, a name, or a few words - in any language', async () => {
    const r = await draftListing({}, answering(good));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/photo, a name, or a few words/);
    // Keywords alone are enough: a seller who types "laal kundan jhumka" has told us the product.
    const k = await draftListing({ keywords: 'laal kundan jhumka' }, answering(good));
    expect(k.ok).toBe(true);
  });
});

describe('what it refuses or corrects', () => {
  it('refuses a jewellery draft that claims real gold', async () => {
    const r = await draftListing(
      { name: 'earrings', categoryOptions: CATS },
      answering({ ...good, description: '<p>Made of 22k gold with natural emeralds.</p>' })
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/real gold, silver or stones/);
  });

  it('lets the same words through for a product that is not jewellery', async () => {
    // "Gold" on a bedsheet is a colour, and the purity rule is about metal.
    const r = await draftListing(
      { name: 'Cotton bedsheet', categoryOptions: CATS },
      answering({ ...good, name: 'Gold Printed Cotton Bedsheet', description: '<p>A pure gold colour print.</p>', categoryName: 'Bedsheets', isJewellery: false })
    );
    expect(r.ok).toBe(true);
  });

  it('drops a category the platform does not have', async () => {
    const r = await draftListing({ name: 'x', categoryOptions: CATS }, answering({ ...good, categoryName: 'Wristwear' }));
    expect(r.draft.categoryName).toBe('');
  });

  it('coerces an unknown gender or age group to the safe value', async () => {
    const r = await draftListing({ name: 'x', categoryOptions: CATS }, answering({ ...good, gender: 'ladies', ageGroup: 'teen' }));
    expect(r.draft.gender).toBe('unisex');
    expect(r.draft.ageGroup).toBe('adult');
  });

  it('flattens disallowed HTML to paragraphs instead of failing', async () => {
    const r = await draftListing(
      { name: 'x', categoryOptions: CATS },
      answering({ ...good, description: '<h2>Big</h2><p>Text <a href="x">link</a></p>' })
    );
    expect(r.ok).toBe(true);
    expect(r.draft.description).toBe('<p>Big Text link</p>');
    expect(r.warnings[0]).toMatch(/simplified/);
  });

  it('warns when the draft states a weight or names the shop', async () => {
    const r = await draftListing(
      { name: 'x', brand: 'Charming Jewels', categoryOptions: CATS },
      answering({ ...good, description: '<p>Weighs 20 grams, from Charming Jewels.</p>' })
    );
    expect(r.warnings.join(' ')).toMatch(/weight/);
    expect(r.warnings.join(' ')).toMatch(/named your shop/);
  });

  it('reports unparseable output as a retryable failure, not a crash', async () => {
    const r = await draftListing({ name: 'x' }, { generate: async () => ({ ok: true, text: 'not json' }) });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Try again/);
  });
});

describe('looksLikeJewellery', () => {
  it('spots jewellery words in any of the inputs', () => {
    expect(looksLikeJewellery('Silver Kada', undefined, 'Men')).toBe(true);
    expect(looksLikeJewellery('Cotton Kurti', 'summer', 'Kurtas & Suits')).toBe(false);
  });
});
