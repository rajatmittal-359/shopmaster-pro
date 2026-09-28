/**
 * Undoing a delete.
 *
 * WHY THIS IS TESTED (28 Sep 2026)
 *   The delete in the seller panel has no confirmation dialog, and that is
 *   only defensible because this route exists. If restore quietly stopped
 *   working, the delete would become permanent without anything on screen
 *   changing - the worst way for a safety net to fail.
 *
 *   Two of the three tests are about what restore must NOT do: it must not
 *   put the product back on the storefront, and it must not let one seller
 *   reach another's catalogue.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Product = require('../models/Product.js');
const { restoreProduct } = require('../controllers/sellerController.js');

const SELLER = '6a93cf88fbb4f39f4a6d5618';
const OTHER = '6a93cf88fbb4f39f4a6d5619';
const ID = '6a93cf84fbb4f39f4a6d559d';

const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => {
    r.code = c;
    return r;
  };
  r.json = (b) => {
    r.body = b;
    return r;
  };
  return r;
};

let original;
beforeEach(() => {
  original = Product.findOne;
});
afterEach(() => {
  Product.findOne = original;
});

describe('restoring a deleted product', () => {
  it('clears isDeleted and brings it back HIDDEN, not live', async () => {
    const doc = { _id: ID, isDeleted: true, isActive: false, save: vi.fn(async () => {}) };
    Product.findOne = vi.fn(async () => doc);

    const r = res();
    await restoreProduct({ user: { _id: SELLER }, params: { productId: ID } }, r);

    expect(doc.isDeleted).toBe(false);
    // The seller pressed delete. Putting it straight back on the storefront
    // would be a second decision they never made.
    expect(doc.isActive).toBe(false);
    expect(doc.save).toHaveBeenCalled();
    expect(r.code).toBe(200);
  });

  it('looks past the deleted flag, or it could never find anything', async () => {
    // sellerCatalogueFilter exists to HIDE deleted products, which is exactly
    // the one being restored. The sellerId match is what does the guarding.
    Product.findOne = vi.fn(async () => ({ isDeleted: true, isActive: false, save: async () => {} }));
    await restoreProduct({ user: { _id: SELLER }, params: { productId: ID } }, res());

    const query = Product.findOne.mock.calls[0][0];
    expect(query).toEqual({ sellerId: SELLER, _id: ID });
    expect('isDeleted' in query).toBe(false);
  });

  it('will not reach another shop\'s product', async () => {
    Product.findOne = vi.fn(async () => null); // the sellerId in the query did not match
    const r = res();
    await restoreProduct({ user: { _id: OTHER }, params: { productId: ID } }, r);

    expect(r.code).toBe(404);
    expect(Product.findOne.mock.calls[0][0].sellerId).toBe(OTHER);
  });

  it('says so, and changes nothing, when it was never deleted', async () => {
    const doc = { _id: ID, isDeleted: false, isActive: true, save: vi.fn(async () => {}) };
    Product.findOne = vi.fn(async () => doc);

    const r = res();
    await restoreProduct({ user: { _id: SELLER }, params: { productId: ID } }, r);

    expect(doc.save).not.toHaveBeenCalled();
    // A live product must not be knocked offline by a stray Undo.
    expect(doc.isActive).toBe(true);
    expect(r.body.message).toMatch(/not deleted/i);
  });
});
