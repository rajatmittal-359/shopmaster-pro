import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
const User = require('../models/User');
const Seller = require('../models/Seller');

const ADMIN = new mongoose.Types.ObjectId();
const CUSTOMER = new mongoose.Types.ObjectId();
const SELLER_A = new mongoose.Types.ObjectId();
const SELLER_B = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();

const ROLE_OF = new Map([
  [String(ADMIN), 'admin'],
  [String(CUSTOMER), 'customer'],
  [String(SELLER_A), 'seller'],
  [String(SELLER_B), 'seller'],
]);

const token = (userId) =>
  jwt.sign({ userId: String(userId), role: ROLE_OF.get(String(userId)) }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

// One order containing items from two different sellers.
const ORDERS = [
  {
    _id: ORDER_ID,
    customerId: CUSTOMER,
    status: 'pending',
    paymentStatus: 'pending',
    totalAmount: 500,
    items: [
      { sellerId: SELLER_A, name: 'A item', quantity: 1, price: 300 },
      { sellerId: SELLER_B, name: 'B item', quantity: 1, price: 200 },
    ],
  },
  {
    _id: new mongoose.Types.ObjectId(),
    customerId: CUSTOMER,
    status: 'cancelled',
    paymentStatus: 'pending',
    totalAmount: 100,
    items: [{ sellerId: SELLER_A, name: 'A item 2', quantity: 1, price: 100 }],
  },
];

const originals = {};
let orderFilters;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.orderFind = Order.find;
  originals.orderFindById = Order.findById;
  originals.orderCount = Order.countDocuments;

  orderFilters = [];

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: ROLE_OF.get(String(id)),
      isVerified: true,
      email: 'u@test.local',
      name: 'U',
    })
  );
  Seller.findOne = vi.fn(() =>
    chainableQuery({ userId: SELLER_A, status: 'active', isApproved: true })
  );

  Order.find = vi.fn((filter = {}) => {
    orderFilters.push(filter);
    let rows = ORDERS;
    if (filter.status) rows = rows.filter((o) => o.status === filter.status);
    if (filter['items.sellerId']) {
      rows = rows.filter((o) =>
        o.items.some((i) => String(i.sellerId) === String(filter['items.sellerId']))
      );
    }
    return chainableQuery(rows);
  });
  Order.findById = vi.fn((id) =>
    chainableQuery(ORDERS.find((o) => String(o._id) === String(id)) || null)
  );
  Order.countDocuments = vi.fn(async () => ORDERS.length);
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Order.find = originals.orderFind;
  Order.findById = originals.orderFindById;
  Order.countDocuments = originals.orderCount;
});

const get = (path, who) =>
  request(app).get(path).set('Authorization', `Bearer ${token(who)}`);

describe('admin order visibility (new capability)', () => {
  it('admin can list platform orders', async () => {
    const res = await get('/api/admin/orders', ADMIN);

    expect(res.status).toBe(200);
    expect(res.body.orders).toHaveLength(ORDERS.length);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('totalPages');
  });

  it('admin listing is not scoped to any single seller', async () => {
    await get('/api/admin/orders', ADMIN);

    expect(orderFilters[0]).not.toHaveProperty('items.sellerId');
    expect(orderFilters[0]).not.toHaveProperty('customerId');
  });

  it('admin can filter by status', async () => {
    const res = await get('/api/admin/orders?status=cancelled', ADMIN);

    expect(res.status).toBe(200);
    expect(orderFilters[0].status).toBe('cancelled');
    expect(res.body.orders).toHaveLength(1);
  });

  it('admin can open a single order and sees every seller\'s items', async () => {
    const res = await get(`/api/admin/orders/${ORDER_ID}`, ADMIN);

    expect(res.status).toBe(200);
    const sellers = res.body.order.items.map((i) => String(i.sellerId));
    expect(sellers).toContain(String(SELLER_A));
    expect(sellers).toContain(String(SELLER_B));
  });

  it('unknown order id returns 404, malformed returns 400', async () => {
    const missing = await get(`/api/admin/orders/${new mongoose.Types.ObjectId()}`, ADMIN);
    const malformed = await get('/api/admin/orders/not-an-id', ADMIN);

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe('existing order boundaries are not weakened', () => {
  it('a customer cannot reach the admin order list', async () => {
    const res = await get('/api/admin/orders', CUSTOMER);
    expect(res.status).toBe(403);
  });

  it('a seller cannot reach the admin order list', async () => {
    const res = await get('/api/admin/orders', SELLER_A);
    expect(res.status).toBe(403);
  });

  it('a seller cannot reach admin order detail', async () => {
    const res = await get(`/api/admin/orders/${ORDER_ID}`, SELLER_A);
    expect(res.status).toBe(403);
  });

  it("seller order listing is still scoped to that seller's own items", async () => {
    const res = await get('/api/seller/orders', SELLER_A);

    expect(res.status).toBe(200);
    const sellerFilter = orderFilters.find((f) => f['items.sellerId']);
    expect(String(sellerFilter['items.sellerId'])).toBe(String(SELLER_A));

    // And the returned items are filtered down to Seller A's only.
    res.body.orders.forEach((o) =>
      o.items.forEach((i) => expect(String(i.sellerId)).toBe(String(SELLER_A)))
    );
  });

  it('an admin still cannot use the customer order route', async () => {
    const res = await get('/api/customer/orders', ADMIN);
    expect(res.status).toBe(403);
  });
});
