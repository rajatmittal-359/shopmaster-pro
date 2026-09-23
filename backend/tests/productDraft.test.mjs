/**
 * "Save for later" - a listing kept half-finished (23 Sep 2026).
 *
 * Rajat: Mummy fills a listing between customers, half at four o'clock and the
 * rest at seven. Every marketplace answers this the same way - Shopify's
 * product status is Active or Draft (a draft reaches no sales channel), Etsy
 * has "Save as draft", Amazon "complete your drafts", Flipkart calls a listing
 * that never went to QC a draft.
 *
 * Our draft is deliberately the smallest change that can be safe: it is also
 * `isActive: false`, so every query that already asks "is this on sale?" -
 * the storefront, search, the Google feed, the sitemap - leaves it out
 * without being touched. `status` only records WHY it is off.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Product = require('../models/Product');
const Category = require('../models/Category');
const Seller = require('../models/Seller');
const { chainableQuery } = require('./helpers/testDouble.mjs');

const SELLER = '6a93cf88fbb4f39f4a6d5618';

describe('a draft is allowed to be incomplete', () => {
  it('saves with nothing but a name', async () => {
    const draft = new Product({ name: 'Pink haar, adhoora', sellerId: SELLER, status: 'draft' });
    await expect(draft.validate()).resolves.toBeUndefined();
  });

  it('a listed product still demands the facts a shopper needs', async () => {
    const live = new Product({ name: 'Pink haar', sellerId: SELLER });
    const err = await live.validate().catch((e) => e);
    expect(Object.keys(err.errors)).toEqual(expect.arrayContaining(['description', 'category', 'price']));
  });

  it('the honest-price rules wait until it is listed', async () => {
    const draft = new Product({ name: 'Adhoora haar', sellerId: SELLER, status: 'draft', price: 1200, mrp: 1000 });
    await expect(draft.validate()).resolves.toBeUndefined();

    const live = new Product({
      name: 'Pink haar', sellerId: SELLER, description: 'A necklace.', category: '6a93cf86fbb4f39f4a6d55dc', price: 1200, mrp: 1000, stock: 1,
    });
    const err = await live.validate().catch((e) => e);
    expect(err.errors.price.message).toMatch(/cannot be above the MRP/i);
  });

  it('defaults to a real listing, so nothing that existed before becomes a draft', () => {
    expect(new Product({ name: 'Pink haar', sellerId: SELLER }).status).toBe('active');
  });
});

describe('the API: what "Save for later" and "List it" actually do', () => {
  const call = async (handler, body, product) => {
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    const req = { body, user: { _id: SELLER, id: String(SELLER) }, params: { id: 'p1' } };
    await handler(req, res, () => {});
    return res;
  };

  let saved;
  beforeEach(() => {
    saved = null;
    vi.spyOn(Product.prototype, 'save').mockImplementation(async function save() { saved = this; return this; });
    vi.spyOn(require('../utils/listingTemplate'), 'applyAttributes').mockResolvedValue({ key: 'general', attributes: [] });
    // The database is not here: the seller's GST row and the category lookup are answered in place.
    vi.spyOn(Seller, 'findOne').mockImplementation(() => chainableQuery({ application: { gstMode: 'none' } }));
    vi.spyOn(Category, 'findById').mockImplementation(() => chainableQuery(null));
  });
  afterEach(() => vi.restoreAllMocks());

  it('a draft is saved off the site, and no gate refuses it for being incomplete', async () => {
    const { addProduct } = require('../controllers/sellerController');
    const res = await call(addProduct, { name: 'Adhoora haar', status: 'draft' });
    expect(res.code).toBe(201);
    expect(saved.status).toBe('draft');
    expect(saved.isActive).toBe(false);
  });

  it('without a status it is a real listing, and the gates still speak', async () => {
    const { addProduct } = require('../controllers/sellerController');
    const res = await call(addProduct, { name: 'Pink haar', description: 'A pink necklace for daily wear.', price: 100, stock: 1 });
    expect(res.code).toBe(400);
    // The same body as a draft sails through; as a listing it is stopped and told why.
    expect(String(res.body.message)).toMatch(/categor/i);
  });
});
