import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Order = require('../models/Order');
const InventoryLog = require('../models/Inventory');

const SELLER_USER = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: SELLER_USER.toString(), role: 'seller' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let sellerProfile;

/** Routes that admin approval is meant to unlock. */
const WRITE_ROUTES = [
  ['post', '/api/seller/products', { name: 'X', price: 1 }],
  ['patch', `/api/seller/products/${PRODUCT_ID}`, { price: 5 }],
  ['delete', `/api/seller/products/${PRODUCT_ID}`, {}],
  ['patch', `/api/seller/products/${PRODUCT_ID}/stock`, { stock: 5 }],
  ['patch', `/api/seller/orders/${ORDER_ID}/status`, { status: 'processing' }],
  ['patch', `/api/seller/orders/${ORDER_ID}/tracking`, { courierName: 'X', trackingNumber: '1' }],
];

/** Routes an unapproved seller must keep, so the dashboard still renders. */
const READ_ROUTES = [
  '/api/seller/profile',
  '/api/seller/products',
  '/api/seller/analytics',
];

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.productFind = Product.find;
  originals.productCount = Product.countDocuments;
  originals.productCreate = Product.create;
  originals.productFindOne = Product.findOne;
  originals.productFindOneAndUpdate = Product.findOneAndUpdate;
  originals.orderFindById = Order.findById;
  originals.orderAggregate = Order.aggregate;
  // updateStock now writes an inventory audit log (Phase 2D), so this
  // third-party-of-the-controller must be stubbed for the write routes.
  originals.inventoryCreate = InventoryLog.create;

  sellerProfile = {
    _id: new mongoose.Types.ObjectId(),
    userId: SELLER_USER,
    businessName: 'Pending Traders',
    status: 'active',
    isApproved: false,
    kycStatus: 'pending',
  };

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'seller',
      isVerified: true,
      email: 's@test.local',
      name: 'S',
    })
  );
  Seller.findOne = vi.fn(() => chainableQuery(sellerProfile));

  Product.find = vi.fn(() => chainableQuery([]));
  Product.countDocuments = vi.fn(async () => 0);
  Product.create = vi.fn(async (doc) => ({ _id: PRODUCT_ID, ...doc }));
  Product.findOne = vi.fn(() =>
    chainableQuery({
      _id: PRODUCT_ID,
      sellerId: SELLER_USER,
      isActive: true,
      stock: 1,
      save: vi.fn(async () => {}),
      populate: vi.fn(async () => {}),
    })
  );
  Product.findOneAndUpdate = vi.fn(() => chainableQuery({ _id: PRODUCT_ID, stock: 5, lowStockThreshold: 10 }));
  Order.findById = vi.fn(() =>
    chainableQuery({
      _id: ORDER_ID,
      status: 'pending',
      paymentStatus: 'paid',
      paymentMethod: 'cod',
      items: [{ sellerId: SELLER_USER, quantity: 1, price: 1 }],
      save: vi.fn(async () => {}),
    })
  );
  Order.aggregate = vi.fn(async () => []);
  InventoryLog.create = vi.fn(async (doc) => doc);
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Product.find = originals.productFind;
  Product.countDocuments = originals.productCount;
  Product.create = originals.productCreate;
  Product.findOne = originals.productFindOne;
  Product.findOneAndUpdate = originals.productFindOneAndUpdate;
  Order.findById = originals.orderFindById;
  Order.aggregate = originals.orderAggregate;
  InventoryLog.create = originals.inventoryCreate;
});

const call = ([method, path, body]) =>
  request(app)[method](path).set('Authorization', `Bearer ${token()}`).send(body);

describe('unapproved seller is blocked from approval-gated capabilities', () => {
  for (const route of WRITE_ROUTES) {
    const [method, path] = route;
    it(`${method.toUpperCase()} ${path.replace(/[0-9a-f]{24}/, ':id')} is rejected with 403`, async () => {
      const res = await call(route);

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/pending admin approval/i);
      expect(res.body.isApproved).toBe(false);
    });
  }

  it('no product is created by a pending seller', async () => {
    await call(WRITE_ROUTES[0]);
    expect(Product.create).not.toHaveBeenCalled();
  });

  it('enforcement is server-side: a direct API call cannot bypass it', async () => {
    // No frontend involved - this is a raw HTTP request with a valid seller JWT.
    const res = await request(app)
      .post('/api/seller/products')
      .set('Authorization', `Bearer ${token()}`)
      .send({ name: 'Bypass attempt', price: 100, stock: 5 });

    expect(res.status).toBe(403);
    expect(Product.create).not.toHaveBeenCalled();
  });
});

describe('unapproved seller retains read-only dashboard access', () => {
  for (const path of READ_ROUTES) {
    it(`GET ${path} still works while pending`, async () => {
      const res = await request(app).get(path).set('Authorization', `Bearer ${token()}`);
      expect(res.status).toBe(200);
    });
  }

  it('the profile response still reports the pending state', async () => {
    const res = await request(app)
      .get('/api/seller/profile')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.body.isApproved).toBe(false);
    expect(res.body.kycStatus).toBe('pending');
  });
});

describe('approved seller retains full capabilities', () => {
  beforeEach(() => {
    sellerProfile.isApproved = true;
    sellerProfile.kycStatus = 'verified';
  });

  it('can create a product', async () => {
    const res = await call(WRITE_ROUTES[0]);
    expect(res.status).not.toBe(403);
    expect(Product.create).toHaveBeenCalled();
  });

  it('can update stock', async () => {
    const res = await call(WRITE_ROUTES[3]);
    expect(res.status).not.toBe(403);
  });

  it('can advance an order status', async () => {
    const res = await call(WRITE_ROUTES[4]);
    expect(res.status).not.toBe(403);
  });
});

describe('suspension still takes precedence over approval', () => {
  it('an approved but suspended seller is blocked', async () => {
    sellerProfile.isApproved = true;
    sellerProfile.status = 'suspended';

    const res = await call(WRITE_ROUTES[0]);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it('a suspended seller is blocked from read routes too (pre-existing behaviour)', async () => {
    sellerProfile.status = 'suspended';

    const res = await request(app)
      .get('/api/seller/products')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(403);
  });
});
