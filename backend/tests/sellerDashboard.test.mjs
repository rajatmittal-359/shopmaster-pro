import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Product = require('../models/Product');
const Order = require('../models/Order');
const User = require('../models/User');
const Seller = require('../models/Seller');

const SELLER_USER_ID = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: SELLER_USER_ID.toString(), role: 'seller' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

/**
 * Catalogue fixture covering every case the two flags now express:
 *  - deleted     (isDeleted true)  gone from the seller's catalogue entirely
 *  - hidden      (isActive false)  still theirs, just not on sale
 *  - on sale     (both clear)
 *  - one product exactly AT its threshold (the '<' vs '<=' boundary)
 *
 * Deleting and hiding used to write the same flag, so a hidden product vanished
 * from the seller's own list with no way back, and "total" and "active" were
 * the same query.
 */
const PRODUCTS = [
  { name: 'healthy',         stock: 50, lowStockThreshold: 10, isActive: true,  isDeleted: false },
  { name: 'below-threshold', stock: 3,  lowStockThreshold: 10, isActive: true,  isDeleted: false },
  { name: 'at-threshold',    stock: 10, lowStockThreshold: 10, isActive: true,  isDeleted: false },
  { name: 'hidden-and-low',  stock: 2,  lowStockThreshold: 10, isActive: false, isDeleted: false },
  { name: 'deleted-and-low', stock: 0,  lowStockThreshold: 10, isActive: false, isDeleted: true  },
];

/** What the seller can see and manage: everything not deleted. */
const CATALOGUE = PRODUCTS.filter((p) => !p.isDeleted);
/** Of that, what customers can actually buy. */
const ON_SALE = CATALOGUE.filter((p) => p.isActive);

const EXPECTED_CATALOGUE = CATALOGUE.length;                                    // 4
const EXPECTED_ACTIVE = ON_SALE.length;                                         // 3
const EXPECTED_LOW = ON_SALE.filter((p) => p.stock <= p.lowStockThreshold).length; // 2

const originals = {};

/**
 * Honour the filter the controller passes, so the test measures real scoping
 * rather than assuming it. Mirrors `{ isDeleted: { $ne: true } }` and the
 * optional `isActive` narrowing.
 */
const applyFilter = (filter = {}) =>
  PRODUCTS.filter((p) => {
    if (filter.isDeleted && filter.isDeleted.$ne === true && p.isDeleted) return false;
    if (filter.isActive !== undefined && p.isActive !== filter.isActive) return false;
    return true;
  });

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.productFind = Product.find;
  originals.productCount = Product.countDocuments;
  originals.orderAggregate = Order.aggregate;

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'seller',
      isVerified: true,
      email: 's@test.local',
      name: 'Seller',
    })
  );
  Seller.findOne = vi.fn(() =>
    chainableQuery({ _id: new mongoose.Types.ObjectId(), userId: SELLER_USER_ID, status: 'active' })
  );

  Product.find = vi.fn((filter) => chainableQuery(applyFilter(filter)));
  Product.countDocuments = vi.fn(async (filter) => applyFilter(filter).length);
  Order.aggregate = vi.fn(async () => []);
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Product.find = originals.productFind;
  Product.countDocuments = originals.productCount;
  Order.aggregate = originals.orderAggregate;
});

const get = (path) =>
  request(app).get(path).set('Authorization', `Bearer ${token()}`);

describe('seller dashboard matches the seller product listing', () => {
  it('dashboard product total equals the product list length', async () => {
    const analytics = await get('/api/seller/analytics');
    const list = await get('/api/seller/products');

    expect(analytics.status).toBe(200);
    expect(list.status).toBe(200);
    expect(list.body.count).toBe(EXPECTED_CATALOGUE);
    expect(analytics.body.products.total).toBe(list.body.count);
  });

  it('excludes deleted products from the dashboard total, but keeps hidden ones', async () => {
    const analytics = await get('/api/seller/analytics');

    // 5 products exist. One is deleted and gone; the hidden one is still the
    // seller's and must stay countable, or they can never bring it back.
    expect(PRODUCTS).toHaveLength(5);
    expect(analytics.body.products.total).toBe(EXPECTED_CATALOGUE); // 4
  });

  it('reports "active" as a genuinely different number from "total"', async () => {
    const analytics = await get('/api/seller/analytics');

    // Both cards ran the same query before, so they could never disagree and
    // the seller had no way to see that something was hidden.
    expect(analytics.body.products.total).toBe(EXPECTED_CATALOGUE); // 4
    expect(analytics.body.products.active).toBe(EXPECTED_ACTIVE);   // 3
    expect(analytics.body.products.active).not.toBe(analytics.body.products.total);
  });

  it('keeps a hidden product in the seller list so it can be unhidden', async () => {
    const list = await get('/api/seller/products');

    const names = list.body.products.map((p) => p.name);
    expect(names).toContain('hidden-and-low');
    expect(names).not.toContain('deleted-and-low');
  });

  it('dashboard low-stock count equals the low-stock list length', async () => {
    const analytics = await get('/api/seller/analytics');
    const lowList = await get('/api/seller/products/low-stock');

    expect(lowList.status).toBe(200);
    expect(analytics.body.products.lowStock).toBe(lowList.body.count);
  });

  it('low stock uses "at or below threshold" (<=), counting the boundary product', async () => {
    const analytics = await get('/api/seller/analytics');
    const lowList = await get('/api/seller/products/low-stock');

    // 'at-threshold' (stock 10, threshold 10) must be included.
    expect(analytics.body.products.lowStock).toBe(EXPECTED_LOW); // 2, not 1
    const names = lowList.body.products.map((p) => p.name);
    expect(names).toContain('at-threshold');
    expect(names).toContain('below-threshold');
  });

  it('leaves deleted and hidden products out of the low-stock list', async () => {
    const lowList = await get('/api/seller/products/low-stock');

    const names = lowList.body.products.map((p) => p.name);
    expect(names).not.toContain('deleted-and-low');
    // Restocking something that is not on sale is not work the seller has to do.
    expect(names).not.toContain('hidden-and-low');
  });

  it('all three seller product endpoints agree on catalogue scope', async () => {
    const analytics = await get('/api/seller/analytics');
    const list = await get('/api/seller/products');
    const lowList = await get('/api/seller/products/low-stock');

    // Every low-stock product must also appear in the seller's product list.
    const listNames = list.body.products.map((p) => p.name);
    lowList.body.products.forEach((p) => expect(listNames).toContain(p.name));
    expect(analytics.body.products.total).toBe(listNames.length);
    // 'active' counts the on-sale subset, so it is the one number that is
    // legitimately smaller than the list.
    expect(analytics.body.products.active).toBe(EXPECTED_ACTIVE);
  });
});
