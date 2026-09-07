/**
 * Which products a shopper is allowed to see, and what the sidebar may offer.
 *
 * THE BUGS THIS DEFENDS AGAINST
 *   1. "Gold" dragging in "Rose Gold". They are different pieces to anyone
 *      shopping for one, and a substring match silently merges them.
 *   2. A colour or a search term from the URL being read as a regular
 *      expression. `?color=.*` would match every product; a crafted one is a
 *      denial of service against the database.
 *   3. A category slug that does not exist answering 200 with an empty grid.
 *      That is a soft 404 and Google indexes it as real content.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const Category = require('../models/Category');
const { buildCatalogueFilter } = require('../utils/catalogueFilter');

const originals = {};

beforeEach(() => {
  originals.findOne = Category.findOne;
  originals.browsable = Category.getBrowsableIds;

  Category.findOne = vi.fn(() => ({ select: () => ({ lean: async () => ({ _id: 'cat1' }) }) }));
  Category.getBrowsableIds = vi.fn(async () => ['cat1', 'cat2']);
});

afterEach(() => {
  Category.findOne = originals.findOne;
  Category.getBrowsableIds = originals.browsable;
});

const filterFor = async (query) => {
  const built = await buildCatalogueFilter(query);
  return built.filter;
};

describe('colour', () => {
  it('matches the whole value, so Gold does not include Rose Gold', async () => {
    const filter = await filterFor({ color: 'Gold' });
    const re = new RegExp(filter.color.$regex, filter.color.$options);

    expect(re.test('Gold')).toBe(true);
    expect(re.test('gold')).toBe(true);
    expect(re.test('Rose Gold')).toBe(false);
    expect(re.test('Gold Plated')).toBe(false);
  });

  it('treats a colour with regex characters as text', async () => {
    const filter = await filterFor({ color: 'Rose (Gold)' });
    const re = new RegExp(filter.color.$regex, filter.color.$options);

    expect(re.test('Rose (Gold)')).toBe(true);
    expect(re.test('Rose Gold')).toBe(false);
  });

  it('cannot be turned into a wildcard', async () => {
    const filter = await filterFor({ color: '.*' });
    const re = new RegExp(filter.color.$regex, filter.color.$options);

    expect(re.test('Silver')).toBe(false);
    expect(re.test('.*')).toBe(true);
  });

  it('is absent when nothing was asked for', async () => {
    expect(await filterFor({})).not.toHaveProperty('color');
  });
});

describe('search', () => {
  it('escapes the term rather than running it', async () => {
    const filter = await filterFor({ search: 'ring(' });
    const re = new RegExp(filter.$or[0].name.$regex, 'i');

    expect(re.test('Gold ring( set')).toBe(true);
    // The point: an unescaped "(" would have thrown when compiled.
    expect(() => new RegExp(filter.$or[0].name.$regex)).not.toThrow();
  });
});

describe('rating', () => {
  it('filters at or above the value asked for', async () => {
    expect(await filterFor({ minRating: '4' })).toMatchObject({ avgRating: { $gte: 4 } });
  });

  it('ignores nonsense instead of erroring on it', async () => {
    for (const bad of ['0', '6', 'four', '', '-2']) {
      expect(await filterFor({ minRating: bad })).not.toHaveProperty('avgRating');
    }
  });
});

describe('category', () => {
  it('says notFound for a slug that does not exist, so the route can 404', async () => {
    Category.findOne = vi.fn(() => ({ select: () => ({ lean: async () => null }) }));

    expect(await buildCatalogueFilter({ category: 'no-such-thing' })).toEqual({ notFound: true });
  });

  it('says empty when the category exists but nothing beneath it is browsable', async () => {
    Category.getBrowsableIds = vi.fn(async () => []);

    expect(await buildCatalogueFilter({ category: 'rings' })).toEqual({ empty: true });
  });

  it('still excludes deactivated branches when no category is chosen', async () => {
    const filter = await filterFor({});
    expect(filter.category).toEqual({ $in: ['cat1', 'cat2'] });
  });
});

describe('what is always true', () => {
  it('only ever shows active products that are in stock', async () => {
    const filter = await filterFor({ color: 'Gold', minRating: '4', search: 'ring' });
    expect(filter.isActive).toBe(true);
    expect(filter.stock).toEqual({ $gt: 0 });
  });
});
