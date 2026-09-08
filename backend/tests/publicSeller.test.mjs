/**
 * What a shopper may see about a seller, and what they may not.
 *
 * WHY THIS PAGE EXISTS
 *   On a marketplace the shopper is buying from somebody they have never heard
 *   of. Etsy and eBay both make the seller a place with a rating and a history;
 *   we printed a name on a product and nothing else.
 *
 * WHAT THESE TESTS DEFEND
 *   1. Nothing private leaks. The commission rate, payout details, GSTIN,
 *      phone, pickup address and whether the platform owns the shop are all on
 *      the same document, and a `.lean()` of the whole thing would have handed
 *      over every one of them.
 *   2. A shop that is unapproved or suspended is a 404, not an empty profile -
 *      a suspended seller's products are already hidden, and their page must
 *      go with them.
 *   3. The shop rating is WEIGHTED by review count. A plain average of
 *      averages lets one five-star review outrank fifty reviews at 4.2.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);

const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Category = require('../models/Category');
const publicSellerRoutes = require('../routes/publicSellerRoutes');

const app = express();
app.use('/api/public/sellers', publicSellerRoutes);

const USER_ID = '6a93cf88fbb4f39f4a6d5618';

/** Everything the Seller document actually holds, private parts included. */
const FULL_SELLER = {
  userId: USER_ID,
  businessName: 'Charming Jewels',
  isApproved: true,
  status: 'active',
  createdAt: new Date('2025-12-21'),
  commissionRate: 0,
  isPlatformOwned: true,
  gstNumber: 'GSTIN1234567',
  bankDetails: { accountNumber: '000123456789', ifscCode: 'HDFC0000001' },
  pickupAddress: { phone: '8769766908', address1: 'C-13, Hari Marg' },
};

const originals = {};

const seed = ({ seller = FULL_SELLER, products = [], rating = [] } = {}) => {
  Seller.findOne = vi.fn(() => ({
    select: () => ({ lean: async () => (seller ? { ...seller } : null) }),
  }));
  Product.find = vi.fn(() => ({
    select: () => ({ sort: () => ({ limit: () => ({ lean: async () => products }) }) }),
  }));
  Product.countDocuments = vi.fn(async () => products.length);
  Product.aggregate = vi.fn(async () => rating);
  Category.getBrowsableIds = vi.fn(async () => ['c1']);
};

beforeEach(() => {
  originals.sellerFindOne = Seller.findOne;
  originals.productFind = Product.find;
  originals.count = Product.countDocuments;
  originals.aggregate = Product.aggregate;
  originals.browsable = Category.getBrowsableIds;
  seed();
});

afterEach(() => {
  Seller.findOne = originals.sellerFindOne;
  Product.find = originals.productFind;
  Product.countDocuments = originals.count;
  Product.aggregate = originals.aggregate;
  Category.getBrowsableIds = originals.browsable;
});

describe('what a shopper is told', () => {
  it('gives the shop name, when it started, and how much it sells', async () => {
    seed({ products: [{ _id: 'p1', name: 'A ring' }] });

    const res = await request(app).get(`/api/public/sellers/${USER_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.seller.businessName).toBe('Charming Jewels');
    expect(res.body.seller.sellingSince).toBeTruthy();
    expect(res.body.seller.productCount).toBe(1);
  });

  it('weights the shop rating by how many reviews each product has', async () => {
    // 4.2 x 50 reviews and 5.0 x 1 = 4.2 to one decimal, not 4.6.
    seed({ rating: [{ weighted: 4.2 * 50 + 5 * 1, reviews: 51 }] });

    const res = await request(app).get(`/api/public/sellers/${USER_ID}`);

    expect(res.body.seller.rating.average).toBe(4.2);
    expect(res.body.seller.rating.reviews).toBe(51);
  });

  it('says nothing rather than zero when nobody has reviewed yet', async () => {
    // A shop showing "0.0 stars" reads as bad, not as new.
    seed({ rating: [] });

    const res = await request(app).get(`/api/public/sellers/${USER_ID}`);

    expect(res.body.seller.rating).toBeNull();
  });
});

describe('what never leaves the server', () => {
  it('leaks no commission, bank details, GSTIN, phone or pickup address', async () => {
    const res = await request(app).get(`/api/public/sellers/${USER_ID}`);
    const body = JSON.stringify(res.body);

    for (const secret of [
      'commissionRate',
      'bankDetails',
      '000123456789',
      'HDFC0000001',
      'GSTIN1234567',
      '8769766908',
      'Hari Marg',
      'isPlatformOwned',
    ]) {
      expect(body).not.toContain(secret);
    }
  });
});

describe('shops that are not open', () => {
  it('answers 404 for a seller who was never approved', async () => {
    seed({ seller: { ...FULL_SELLER, isApproved: false } });

    const res = await request(app).get(`/api/public/sellers/${USER_ID}`);
    expect(res.status).toBe(404);
  });

  it('answers 404 for a suspended shop, whose products are hidden anyway', async () => {
    seed({ seller: { ...FULL_SELLER, status: 'suspended' } });

    const res = await request(app).get(`/api/public/sellers/${USER_ID}`);
    expect(res.status).toBe(404);
  });

  it('answers 404 when there is no such seller', async () => {
    seed({ seller: null });

    const res = await request(app).get(`/api/public/sellers/${USER_ID}`);
    expect(res.status).toBe(404);
  });
});
