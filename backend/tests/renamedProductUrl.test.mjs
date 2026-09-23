/**
 * The URL of a product that was renamed (24 Sep 2026).
 *
 * Search Console wrote to say pages were being dropped for "Not found (404)".
 * This is why: a slug is the name plus the last six characters of the id, and
 * it is rebuilt every time the name changes - so editing a title silently
 * breaks the address Google indexed, WhatsApp forwarded and the customer
 * bookmarked. Worse, the page answered 200 with "Product not found" on it,
 * which is the soft 404 Google warns about.
 *
 * Those six characters never change. They are enough to find the product, and
 * the web app turns that into a 308 to its current address.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Product = require('../models/Product');
const Seller = require('../models/Seller');
const { getProduct } = require('../controllers/productController');

const ID = '6aa59aafa15daa75bbd89ffe';
const LIVE = { _id: ID, name: 'Silver Toe Ring', slug: 'silver-toe-ring-d89ffe', sellerId: 'u1', reserved: 0, toObject() { return this; } };

/** Product.findOne(...).populate(...).populate(...) */
const found = (row) => ({ populate: () => ({ populate: async () => row }) });

const call = async (productId) => {
  const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await getProduct({ params: { productId }, query: {} }, res, () => {});
  return res;
};

describe('an address a product used to have', () => {
  let queries;
  beforeEach(() => {
    queries = [];
    vi.spyOn(Seller, 'findOne').mockImplementation(() => ({ select: () => ({ lean: async () => ({ status: 'active' }) }) }));
    vi.spyOn(Product, 'findOne').mockImplementation((q) => {
      queries.push(q);
      // The exact slug misses; the id-suffix regex finds it.
      if (q.slug && typeof q.slug === 'string') return found(q.slug === LIVE.slug ? LIVE : null);
      if (q.slug?.$regex) return found(LIVE);
      if (q.$or) return found(LIVE);
      return found(null);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  /*
   * These two assert the LOOKUP, not the whole reply: building the reply needs
   * half the catalogue's models (variants, reviews, the shop) and doubling all
   * of them would test the doubles. What matters here is which questions the
   * database is asked, and in what order.
   */
  it('still finds the product, by the six characters that never change', async () => {
    await call('purana-naam-d89ffe');
    expect(queries[0]).toEqual({ slug: 'purana-naam-d89ffe' });
    expect(queries[1].slug.$regex).toBe('-d89ffe$');
  });

  it('does not go looking when the exact slug is right', async () => {
    await call(LIVE.slug);
    // One question, no scan: the fallback runs only after an exact miss.
    expect(queries).toHaveLength(1);
  });

  it('a slug with no id on the end is simply not found', async () => {
    const res = await call('something-somebody-invented');
    expect(res.code).toBe(404);
    expect(queries).toHaveLength(1);
  });
});
