/**
 * The words a category's search-words field offers before anyone asks it to.
 *
 * WHY THIS IS TESTED (28 Sep 2026)
 *   This runs on every new listing, so it must be cheap, silent when it has
 *   nothing, and honest about what it does not know. Each test below is one
 *   of those three:
 *
 *   - it must never reach for a model or the Ads API. The whole reason the
 *     weekly job pays for Keyword Planner once per category is so that this
 *     read costs nothing.
 *   - a leaf with no brief of its own must borrow its parent's, because the
 *     first seller in an empty category is exactly who needs the coaching.
 *   - a word Google reports too rarely to count must come back with no
 *     `monthly` at all. A zero would read as "nobody searches this", which
 *     Google never said.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Category = require('../models/Category.js');
const MarketBrief = require('../models/MarketBrief.js');
const { categoryWords } = require('../utils/categoryWords.js');

const LEAF = '6a93cf88fbb4f39f4a6d5618';
const PARENT = '6a93cf88fbb4f39f4a6d5619';

const originals = {};
const lean = (value) => ({ select: () => ({ lean: async () => value }) });

beforeEach(() => {
  originals.findById = Category.findById;
  originals.findOne = MarketBrief.findOne;
});

afterEach(() => {
  Category.findById = originals.findById;
  MarketBrief.findOne = originals.findOne;
});

describe('the words a category offers', () => {
  it('returns them biggest first, with the figure attached', async () => {
    Category.findById = vi.fn(() => lean({ _id: LEAF, name: 'Rings', slug: 'rings' }));
    MarketBrief.findOne = vi.fn(() =>
      lean({
        words: [
          { word: 'rings', sources: ['ads'], monthly: 246000 },
          { word: 'gold rings for women', sources: ['ads'], monthly: 301000 },
        ],
      })
    );

    const out = await categoryWords(LEAF);
    expect(out.map((w) => w.word)).toEqual(['gold rings for women', 'rings']);
    expect(out[0].monthly).toBe(301000);
  });

  it('leaves monthly off a word Google reports too rarely to count', async () => {
    Category.findById = vi.fn(() => lean({ _id: LEAF, name: 'Rings', slug: 'rings' }));
    MarketBrief.findOne = vi.fn(() => lean({ words: [{ word: 'jaipur kundan ring', sources: ['site'] }] }));

    const [row] = await categoryWords(LEAF);
    expect(row.word).toBe('jaipur kundan ring');
    expect('monthly' in row).toBe(false);
  });

  it("borrows the parent's words when the leaf has none of its own", async () => {
    Category.findById = vi
      .fn()
      .mockImplementationOnce(() => lean({ _id: LEAF, name: 'Nose Pins & Nath', slug: 'nose-pins', parentCategory: PARENT }))
      .mockImplementationOnce(() => lean({ _id: PARENT, slug: 'jewellery' }));
    MarketBrief.findOne = vi
      .fn()
      .mockImplementationOnce(() => lean(null)) // the leaf
      .mockImplementationOnce(() => lean({ words: [{ word: 'nath', monthly: 2900 }] })); // the parent

    const out = await categoryWords(LEAF);
    expect(out).toEqual([{ word: 'nath', monthly: 2900 }]);
  });

  it('says nothing rather than failing when there is no brief anywhere', async () => {
    Category.findById = vi.fn(() => lean({ _id: LEAF, name: 'Rings', slug: 'rings' }));
    MarketBrief.findOne = vi.fn(() => lean(null));
    expect(await categoryWords(LEAF)).toEqual([]);
  });

  it('does not go to the database at all for a bad id', async () => {
    Category.findById = vi.fn(() => lean(null));
    expect(await categoryWords('none')).toEqual([]);
    expect(Category.findById).not.toHaveBeenCalled();
  });

  it('swallows a database failure - this decorates a form, it does not gate one', async () => {
    Category.findById = vi.fn(() => {
      throw new Error('no connection');
    });
    expect(await categoryWords(LEAF)).toEqual([]);
  });
});
