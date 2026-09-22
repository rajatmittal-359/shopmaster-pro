/**
 * Two feeds, one per Merchant Center sub-account (23 Sep 2026).
 *
 * Google's marketplace structure (support.google.com/merchants/answer/14228975):
 * a sub-account holds ONE seller's offers, except the multi-seller type, which
 * holds many and requires `external_seller_id` on every item. Ours is the pair
 * Google recommends for a marketplace that also sells its own goods:
 *
 *   /api/feed/google.xml          → the house shop only       (1P sub-account)
 *   /api/feed/google-sellers.xml  → every other seller        (multi-seller)
 *
 * What these tests defend: the two feeds never carry each other's products
 * (mixing them is the misrepresentation suspension), external_seller_id is on
 * every third-party item, and the seller's NAME is not sent - Google does not
 * display it for a multi-seller account.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const Product = require('../models/Product');
const Seller = require('../models/Seller');

const HOUSE = '6a93cf88fbb4f39f4a6d5618';
const RAHUL = '6a93cf88fbb4f39f4a6d5620';

const product = (over = {}) => ({
  _id: '6a93cf8bfbb4f39f4a6d5659',
  name: 'Pearl Maang Tikka',
  slug: 'pearl-maang-tikka-6d5659',
  description: 'A tikka.',
  price: 1100,
  stock: 4,
  images: ['https://res.cloudinary.com/x/a.jpg'],
  sellerId: HOUSE,
  category: { name: 'Maang Tikka', googleProductCategory: '', parentCategory: { name: 'Jewellery' } },
  ...over,
});

describe('the marketplace feeds', () => {
  let lastFilter;
  beforeEach(() => {
    lastFilter = null;
    vi.spyOn(Seller, 'find').mockImplementation((q) => {
      // the house-shop lookup, and shopNames' own lookup
      if (q?.isPlatformOwned) return chainableQuery([{ userId: HOUSE }]);
      return chainableQuery([
        { userId: HOUSE, businessName: 'Charming Jewels' },
        { userId: RAHUL, businessName: 'All in one' },
      ]);
    });
    vi.spyOn(Product, 'find').mockImplementation((filter) => {
      lastFilter = filter;
      const mine = String(Object.keys(filter.sellerId || {})[0]) === '$in';
      return chainableQuery([mine ? product() : product({ _id: 'p2', name: 'Cotton Kurti', slug: 'cotton-kurti-2', sellerId: RAHUL })]);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('the house-shop feed asks for the owned sellers only and sends no seller attributes', async () => {
    const res = await request(app).get('/api/feed/google.xml');
    expect(res.status).toBe(200);
    expect(lastFilter.sellerId).toEqual({ $in: [HOUSE] });
    expect(res.text).toMatch(/Pearl Maang Tikka/);
    expect(res.text).not.toMatch(/external_seller_id/);
    expect(res.text).not.toMatch(/seller_name/);
  });

  it('the sellers feed EXCLUDES the house shop and carries external_seller_id on every item, without the name', async () => {
    const res = await request(app).get('/api/feed/google-sellers.xml');
    expect(res.status).toBe(200);
    expect(lastFilter.sellerId).toEqual({ $nin: [HOUSE] });
    expect(res.text).toMatch(/Cotton Kurti/);
    expect(res.text).not.toMatch(/Pearl Maang Tikka/);
    expect(res.text).toMatch(new RegExp(`<g:external_seller_id>${RAHUL}</g:external_seller_id>`));
    // Google does not display the seller name for a multi-seller account.
    expect(res.text).not.toMatch(/seller_name/);
  });

  it('both feeds are XML the fetcher can read', async () => {
    for (const path of ['/api/feed/google.xml', '/api/feed/google-sellers.xml']) {
      const res = await request(app).get(path);
      expect(res.headers['content-type']).toMatch(/xml/);
      expect(res.text.startsWith('<?xml')).toBe(true);
      expect(res.text).toMatch(/<\/rss>\s*$/);
    }
  });
});
