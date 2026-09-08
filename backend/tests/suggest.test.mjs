/**
 * Search suggestions: what they match, and what they hand back.
 *
 * WHY THIS ENDPOINT IS SEPARATE FROM THE CATALOGUE ONE
 *   It fires on nearly every keystroke. The catalogue endpoint populates the
 *   seller, counts the whole result set for pagination and returns entire
 *   product documents - six times while somebody types "earring". This returns
 *   the handful of fields a suggestion row shows.
 *
 * WHAT THESE TESTS DEFEND
 *   1. The WORD BOUNDARY. The catalogue's own search is a plain substring
 *      match, which answers "ear" with "Pearl Maang Tikka" - technically a
 *      match, and visibly wrong in a list of six that is meant to look like it
 *      understood the question.
 *   2. That nothing private leaks. The response is built field by field, so a
 *      new field on the model cannot quietly start appearing in it.
 *   3. That the sale WINDOW travels with the sale price. Without it a sale
 *      scheduled for next week shows as today's price here and as the normal
 *      price on the card two clicks later.
 *   4. That a one-character query costs no database call at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);

const Product = require('../models/Product');
const Category = require('../models/Category');
const productRoutes = require('../routes/productRoutes');

const app = express();
app.use('/api/public/products', productRoutes);

/** A product document with every field the model carries, private parts too. */
const FULL_PRODUCT = {
  _id: '6a93cf86fbb4f39f4a6d55dc',
  name: 'Kundan Chandbali Earrings',
  slug: 'kundan-chandbali-earrings-6d55e2',
  price: 1850,
  salePrice: 1500,
  saleStartsAt: new Date('2026-12-01'),
  saleEndsAt: new Date('2026-12-31'),
  mrp: 2200,
  images: ['https://example.test/a.jpg', 'https://example.test/b.jpg'],
  category: { _id: 'c1', name: 'Earrings' },
  // None of these belong in a suggestion row.
  description: 'A long description nobody needs in a dropdown',
  stock: 4,
  sellerId: '6a93cf88fbb4f39f4a6d5618',
  costPrice: 900,
};

const originals = {};
let lastFilter = null;

const seed = ({ products = [FULL_PRODUCT], categories = [] } = {}) => {
  lastFilter = null;

  Product.find = vi.fn((filter) => {
    lastFilter = filter;
    return {
      select: () => ({
        populate: () => ({
          sort: () => ({ limit: () => ({ lean: async () => products }) }),
        }),
      }),
    };
  });

  Category.find = vi.fn(() => ({
    select: () => ({ limit: () => ({ lean: async () => categories }) }),
  }));

  Category.getBrowsableIds = vi.fn(async () => ['c1', 'c2']);
};

beforeEach(() => {
  originals.find = Product.find;
  originals.categoryFind = Category.find;
  originals.browsable = Category.getBrowsableIds;
  seed();
});

afterEach(() => {
  Product.find = originals.find;
  Category.find = originals.categoryFind;
  Category.getBrowsableIds = originals.browsable;
});

const suggest = (q) => request(app).get(`/api/public/products/suggest?q=${encodeURIComponent(q)}`);

describe('what it matches', () => {
  it('anchors the query to a word boundary, so "ear" cannot match "Pearl"', async () => {
    await suggest('ear');

    const pattern = lastFilter.$or[0].name.$regex;
    expect(pattern.startsWith('\\b')).toBe(true);

    // The regex the server builds, run against the two cases that matter.
    const rx = new RegExp(pattern, 'i');
    expect(rx.test('Kundan Chandbali Earrings')).toBe(true);
    expect(rx.test('True Wireless Earbuds Pro')).toBe(true);
    // A hyphen is a word boundary too.
    expect(rx.test('Wireless Over-Ear Headphones')).toBe(true);
    // The whole point:
    expect(rx.test('White Pearl Layered Necklace')).toBe(false);
  });

  it('searches the name, the brand and the tags - but NOT the description', async () => {
    await suggest('gift');

    const fields = lastFilter.$or.map((clause) => Object.keys(clause)[0]);
    expect(fields).toEqual(['name', 'brand', 'tags']);
    // A product whose description happens to contain the word is a poor
    // suggestion, and it is how "gift" returns the entire shop.
    expect(fields).not.toContain('description');
  });

  it('offers only what a shopper could reach anyway', async () => {
    await suggest('ring');

    expect(lastFilter.isActive).toBe(true);
    expect(lastFilter.stock).toEqual({ $gt: 0 });
    expect(lastFilter.isDeleted).toEqual({ $ne: true });
    expect(lastFilter.category).toEqual({ $in: ['c1', 'c2'] });
  });

  it('escapes a query full of regex characters instead of running it', async () => {
    await suggest('.*(');

    const pattern = lastFilter.$or[0].name.$regex;
    // Escaped, so it is looked for literally rather than matching everything.
    expect(pattern).toContain('\\.');
    expect(() => new RegExp(pattern)).not.toThrow();
  });
});

describe('what it answers with', () => {
  it('returns categories alongside products', async () => {
    seed({ categories: [{ _id: 'c1', name: 'Earrings', slug: 'earrings' }] });

    const res = await suggest('ear');

    expect(res.status).toBe(200);
    expect(res.body.categories).toEqual([{ _id: 'c1', name: 'Earrings', slug: 'earrings' }]);
  });

  it('gives a row its name, its category and ONE image', async () => {
    const res = await suggest('ear');
    const [row] = res.body.products;

    expect(row.name).toBe('Kundan Chandbali Earrings');
    expect(row.categoryName).toBe('Earrings');
    expect(row.image).toBe('https://example.test/a.jpg');
  });

  it('carries the sale window, not just the sale price', async () => {
    const res = await suggest('ear');
    const [row] = res.body.products;

    // Without these two the front end cannot tell a live sale from one that
    // starts in December, and the suggestion would contradict the card.
    expect(row.salePrice).toBe(1500);
    expect(row.saleStartsAt).toBeTruthy();
    expect(row.saleEndsAt).toBeTruthy();
  });

  it('leaks no description, stock, seller or cost price', async () => {
    const res = await suggest('ear');
    const body = JSON.stringify(res.body);

    for (const secret of ['description', 'stock', 'sellerId', 'costPrice', '6a93cf88fbb4f39f4a6d5618']) {
      expect(body).not.toContain(secret);
    }
  });
});

describe('queries too short to mean anything', () => {
  it('answers empty for one character, without touching the database', async () => {
    const res = await suggest('e');

    expect(res.body).toEqual({ products: [], categories: [] });
    // The real point: no query ran. One letter matches most of the catalogue,
    // so the "suggestions" would be noise bought at the price of a round trip
    // per keystroke.
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('answers empty for a query that is only spaces', async () => {
    const res = await request(app).get('/api/public/products/suggest?q=%20%20');

    expect(res.body.products).toEqual([]);
    expect(Product.find).not.toHaveBeenCalled();
  });

  it('answers empty when there is no query at all', async () => {
    const res = await request(app).get('/api/public/products/suggest');

    expect(res.body).toEqual({ products: [], categories: [] });
    expect(Product.find).not.toHaveBeenCalled();
  });
});
