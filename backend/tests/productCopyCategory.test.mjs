/**
 * The description writer must describe the thing it was given.
 *
 * WHAT WENT WRONG (26 Sep 2026)
 *   `draftProductDescriptions.js` was run over the catalogue and the drafts
 *   were read before applying. A Chikankari Anarkali KURTA came back with
 *   "Please note that this product is imitation jewellery". A BRASS DIYA SET
 *   came back with "this item is part of our imitation jewellery and fashion
 *   accessories". Sixteen products were about to get that copy on the live
 *   site.
 *
 *   The cause was not the model. `promptFor` opened with "You are writing the
 *   product description for an Indian online JEWELLERY shop... sells IMITATION
 *   jewellery", and rule 3 ordered it to "state plainly that this is imitation
 *   jewellery" - for every product, whatever it was. The model obeyed.
 *
 *   That prompt was written when the shop sold only jewellery. It also breaks
 *   the rule in CLAUDE.md that nothing in the frame may name a category:
 *   ShopMaster Pro sells anything.
 *
 *   `config/listingTemplates.js` already knows what each category may and may
 *   not claim - `mustSay` exists for jewellery alone, and `neverClaim` differs
 *   per category. The prompt has to read from there instead of assuming.
 *
 * These tests read the PROMPT, not the model's answer: the prompt is where the
 * fault was, and checking it costs no quota and cannot be flaky.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { promptFor } = require('../utils/productCopy');

/*
 * The category is passed as the POPULATED shape the script really hands over:
 * a sub-category carrying its parent. Products live in "Earrings", not in
 * "Jewellery", and the templates are keyed on the top category - so a test
 * that passed only a flat name would pass while the real run resolved every
 * product to `general`.
 */
const prompt = (name, sub, parent, price = 999) =>
  promptFor({
    name,
    category: sub ? { name: sub, parentCategory: parent ? { name: parent } : undefined } : undefined,
    price,
  });

describe('the prompt does not call everything jewellery', () => {
  it('does not order a kurta to declare itself imitation jewellery', () => {
    const p = prompt('Chikankari Anarkali Kurta', 'Kurtas & Suits', "Women's Fashion", 2400);
    expect(p).not.toMatch(/imitation jewell/i);
  });

  it('does not order a brass diya set to declare itself imitation jewellery', () => {
    const p = prompt('Brass Diya Set of 6', 'Home Decor', 'Home & Kitchen', 750);
    expect(p).not.toMatch(/imitation jewell/i);
  });

  it('does not tell a USB cable when to wear it to a sangeet', () => {
    const p = prompt('Braided USB-C Cable 2m', 'Mobile Accessories', 'Electronics', 299);
    expect(p).not.toMatch(/sangeet|mehendi|lehenga|saree/i);
  });
});

describe('but jewellery keeps every rule it needs', () => {
  it('still requires the imitation sentence', () => {
    const p = prompt('Oxidised Silver Plated Jhumka', 'Earrings', 'Jewellery', 349);
    expect(p).toMatch(/imitation/i);
  });

  it('still forbids the purity claims that would be illegal', () => {
    const p = prompt('Oxidised Silver Plated Jhumka', 'Earrings', 'Jewellery', 349);
    expect(p).toMatch(/hallmark/i);
    expect(p).toMatch(/carat|purity/i);
  });
});

describe('each category gets its own never-claim list', () => {
  it('warns electronics off BIS and waterproof', () => {
    const p = prompt('Fitness Band with SpO2', 'Wearables', 'Electronics', 1999);
    expect(p).toMatch(/BIS/i);
    expect(p).toMatch(/waterproof/i);
  });

  it('warns beauty off medical claims', () => {
    const p = prompt('Vitamin C Face Serum 30ml', 'Skincare', 'Beauty & Personal Care', 499);
    expect(p).toMatch(/cures|treats|medical/i);
  });

  it('warns apparel off unearned fabric claims', () => {
    const p = prompt("Women's Wide Leg Trousers", 'Trousers', "Women's Fashion", 899);
    expect(p).toMatch(/handloom|pure silk|organic/i);
  });
});

describe('the shop is never described as a jewellery shop', () => {
  it('names no category in the framing, whatever is being written', () => {
    for (const [name, sub, parent] of [
      ['Brass Diya Set of 6', 'Home Decor', 'Home & Kitchen'],
      ['Oxidised Silver Plated Jhumka', 'Earrings', 'Jewellery'],
      ['Braided USB-C Cable 2m', 'Mobile Accessories', 'Electronics'],
    ]) {
      expect(prompt(name, sub, parent), name).not.toMatch(/online jewellery shop/i);
    }
  });

  it('still says Jaipur, which is the trust story and not a category', () => {
    expect(prompt('Brass Diya Set of 6', 'Home Decor', 'Home & Kitchen')).toMatch(/Jaipur/);
  });
});

describe('the contract: the category must arrive populated', () => {
  /*
   * Pinned rather than fixed, because it cannot be fixed from here: given
   * only the string "Necklaces & Pendants" there is nothing to look up - the
   * templates are keyed on the TOP category and only the parent carries it.
   * The one caller (draftProductDescriptions.js) populates the parent. This
   * test exists so the next caller finds out here instead of on the live site.
   */
  it('falls back to general when handed a bare category name, silently', () => {
    const flat = promptFor({ name: 'Antique Gold Temple Necklace', category: 'Necklaces & Pendants', price: 6800 });
    expect(flat).not.toMatch(/imitation/i);

    const populated = promptFor({
      name: 'Antique Gold Temple Necklace',
      category: { name: 'Necklaces & Pendants', parentCategory: { name: 'Jewellery' } },
      price: 6800,
    });
    expect(populated).toMatch(/imitation/i);
  });
});

describe('a product with no category still gets a prompt that works', () => {
  it('falls back to the general template without inventing rules', () => {
    const p = prompt('Assorted Gift Box', undefined, undefined, 600);
    expect(p).toMatch(/Invent NOTHING/i);
    expect(p).not.toMatch(/imitation jewell/i);
  });
});
