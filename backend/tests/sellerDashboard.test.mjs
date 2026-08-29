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
 * Catalogue fixture that exercises both historical inconsistencies:
 *  - one soft-deleted product (isActive: false)
 *  - one product exactly AT its threshold (the '<' vs '<=' boundary)
 */
const PRODUCTS = [
  { name: 'healthy',        stock: 50, lowStockThreshold: 10, isActive: true },
  { name: 'below-threshold', stock: 3, lowStockThreshold: 10, isActive: true },
  { name: 'at-threshold',   stock: 10, lowStockThreshold: 10, isActive: true },
  { name: 'deleted-and-low', stock: 0, lowStockThreshold: 10, isActive: false },
];

const ACTIVE = PRODUCTS.filter((p) => p.isActive);
const EXPECTED_CATALOGUE = ACTIVE.length;                                  // 3
const EXPECTED_LOW = ACTIVE.filter((p) => p.stock <= p.lowStockThreshold).length; // 2

const originals = {};

/** Honour the filter the controller passes, so the test measures real scoping. */
const applyFilter = (filter = {}) =>
  PRODUCTS.filter((p) => (filter.isActive === undefined ? true : p.isActive === filter.isActive));

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

  it('excludes soft-deleted products from the dashboard total', async () => {
    const analytics = await get('/api/seller/analytics');

    // 4 products exist; one is soft-deleted and the seller cannot inspect it.
    expect(PRODUCTS).toHaveLength(4);
    expect(analytics.body.products.total).toBe(3);
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

  it('excludes soft-deleted products from the low-stock list', async () => {
    const lowList = await get('/api/seller/products/low-stock');

    const names = lowList.body.products.map((p) => p.name);
    expect(names).not.toContain('deleted-and-low');
  });

  it('all three seller product endpoints agree on catalogue scope', async () => {
    const analytics = await get('/api/seller/analytics');
    const list = await get('/api/seller/products');
    const lowList = await get('/api/seller/products/low-stock');

    // Every low-stock product must also appear in the seller's product list.
    const listNames = list.body.products.map((p) => p.name);
    lowList.body.products.forEach((p) => expect(listNames).toContain(p.name));
    expect(analytics.body.products.total).toBe(listNames.length);
    expect(analytics.body.products.active).toBe(listNames.length);
  });
});
