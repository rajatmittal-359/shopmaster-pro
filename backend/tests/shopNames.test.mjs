/**
 * A product is sold by a SHOP, and the page must say so.
 *
 * The public product routes populated `sellerId` with the User's `name` -
 * so every product page said "Sold by Rajat Mittal", a person's name, while
 * the seller's own page says "Charming Jewels". Etsy and Amazon both name
 * the shop, never the owner; and naming the owner on every product also
 * tells the world which shop the platform's operator runs. `shopNamesFor`
 * resolves seller user ids to business names in one query, and `withShop`
 * stamps `{ shop: { id, name } }` onto each product without touching the
 * document the feed and the old app still read.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Seller = require('../models/Seller');

const U1 = new mongoose.Types.ObjectId();
const U2 = new mongoose.Types.ObjectId();

let original;
let lastFilter;
beforeEach(() => {
  original = Seller.find;
  Seller.find = vi.fn((filter) => {
    lastFilter = filter;
    return {
      select: () => ({
        lean: async () => [
          { userId: U1, businessName: 'Charming Jewels' },
          { userId: U2, businessName: 'Rahul Handlooms' },
        ],
      }),
    };
  });
});
afterEach(() => {
  Seller.find = original;
});

describe('shopNamesFor', () => {
  it('resolves many seller user ids to business names in one query', async () => {
    const { shopNamesFor } = require('../utils/shopNames');
    const names = await shopNamesFor([U1, U2, U1]);
    expect(names.get(String(U1))).toBe('Charming Jewels');
    expect(names.get(String(U2))).toBe('Rahul Handlooms');
    expect(Seller.find).toHaveBeenCalledTimes(1);
    expect(lastFilter.userId.$in).toHaveLength(2);
  });

  it('asks nothing when there is nothing to ask', async () => {
    const { shopNamesFor } = require('../utils/shopNames');
    const names = await shopNamesFor([]);
    expect(names.size).toBe(0);
    expect(Seller.find).not.toHaveBeenCalled();
  });
});

describe('withShop', () => {
  it('stamps the shop onto each product and leaves the document alone', async () => {
    const { withShop } = require('../utils/shopNames');
    const product = { _id: 'p1', name: 'Kundan Choker', sellerId: { _id: U1, name: 'Rajat Mittal' }, toObject() { return { ...this, toObject: undefined }; } };
    const [out] = await withShop([product]);
    expect(out.shop).toEqual({ id: String(U1), name: 'Charming Jewels' });
    expect(out.sellerId.name).toBe('Rajat Mittal'); // untouched, for the old app
    expect(product.shop).toBeUndefined();
  });

  it('falls back to the plain id and no name when the seller record is missing', async () => {
    const { withShop } = require('../utils/shopNames');
    const stranger = new mongoose.Types.ObjectId();
    const [out] = await withShop([{ _id: 'p2', sellerId: stranger }]);
    expect(out.shop).toEqual({ id: String(stranger), name: null });
  });
});
