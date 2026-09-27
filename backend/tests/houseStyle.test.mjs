/**
 * House style in the prompt - the free half of what a fine-tune would buy.
 *
 * WHY IT IS TESTED (27 Sep 2026)
 *   Showing the model two of our own listings makes new ones look like they
 *   came from the same shop. It also hands the model two products' worth of
 *   facts that are NOT this product's, which is the most convincing way an
 *   invented fact can arrive: a brass ring described as "92.5 sterling
 *   silver" because the example above it was.
 *
 *   So the block is tested for what it must NOT carry - price, material,
 *   measurement - and for saying, in the prompt itself, that the examples
 *   are different products.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { examplesBlock, promptFor } = require('../utils/ai/listing.js');

const EXAMPLES = [
  { name: 'Brass Gold-plated Kundan Maroon Necklace Set', opening: 'A maroon kundan set for wedding days...', tags: ['kundan set', 'necklace set'] },
  { name: 'Silver Oxidised Jhumka Earrings for Women', opening: 'Oxidised jhumkas that sit light on the ear...', tags: ['jhumka', 'oxidised earrings'] },
];

describe('the examples block', () => {
  it('is absent entirely when there is nothing good to show', () => {
    // A brand-new category has no finished listing. Showing a bad one would
    // teach the wrong shape, so we teach nothing.
    expect(examplesBlock([])).toBe('');
    expect(examplesBlock()).toBe('');
  });

  it('shows the title, the opening and the tags - and nothing else', () => {
    const out = examplesBlock(EXAMPLES);
    // Only the part that describes the products - the warning after it is
    // allowed to say the word "price", and must.
    const shown = out.split('These are DIFFERENT PRODUCTS')[0];

    expect(shown).toContain('Brass Gold-plated Kundan Maroon Necklace Set');
    expect(shown).toContain('jhumka');
    // The fields a model would most convincingly steal are not there to
    // steal. This is structural, not a plea in the prompt.
    expect(shown).not.toMatch(/₹|INR|\bprice\b/i);
    expect(shown).not.toMatch(/\b\d+\s?(cm|mm|inch|gram|g)\b/i);
  });

  it('says in words that these are different products', () => {
    const out = examplesBlock(EXAMPLES);
    expect(out).toContain('DIFFERENT PRODUCTS');
    expect(out).toMatch(/Never take a material, a measurement, a colour, a stone, a count or a price/);
  });

  it('rides into the real prompt after the rules, not before them', () => {
    const prompt = promptFor({ name: 'kada', hasImage: true, examples: EXAMPLES });

    expect(prompt).toContain('HOUSE STYLE');
    // Rule 1 is "invent nothing". The examples must come after it, so the
    // last thing read before the examples is the instruction not to invent.
    expect(prompt.indexOf('Invent NOTHING')).toBeLessThan(prompt.indexOf('HOUSE STYLE'));
  });

  it('changes nothing about a prompt with no examples', () => {
    const withNone = promptFor({ name: 'kada', hasImage: true });
    expect(withNone).not.toContain('HOUSE STYLE');
  });
});
