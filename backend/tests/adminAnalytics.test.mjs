/**
 * The numbers on the admin dashboard.
 *
 * All three were wrong, and each was wrong in a way that reads as plausible -
 * which is what makes them worth a test rather than a glance:
 *
 *   "Platform Revenue Rs18,496"  was gross sales. Almost all of that money
 *                                belongs to the sellers. The platform earns the
 *                                commission, and Rs0 of it on the family shop's
 *                                own sales, which are set to 0%.
 *   "Orders Today: 10"           was every order ever placed. The newest was a
 *                                week old.
 *   "Total Sellers: 4"           counted approved sellers only, while Manage
 *                                Sellers listed 5.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Seller = require('../models/Seller');

const ADMIN = new mongoose.Types.ObjectId();
const HOUSE = new mongoose.Types.ObjectId(); // the platform's own shop, 0%
const PARTNER = new mongoose.Types.ObjectId(); // a paying seller, 8%

const token = () =>
  jwt.sign({ userId: String(ADMIN), role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

/**
 * Two paid orders. The house sells Rs10,000 at 0% and the partner Rs1,000 at
 * 8%, so gross is Rs11,000 while the platform has actually earned Rs80.
 */
const GROSS = 11000;
const COMMISSION = 80;

const originals = {};
let sellerCounts;
let orderCounts;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerCount = Seller.countDocuments;
  originals.productCount = Product.countDocuments;
  originals.orderCount = Order.countDocuments;
  originals.orderAggregate = Order.aggregate;
  originals.productFind = Product.find;

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'admin',
      isVerified: true,
      email: 'a@test.local',
      name: 'Admin',
    })
  );

  // 4 approved + 1 pending = 5 sellers on the platform.
  sellerCounts = [];
  Seller.countDocuments = vi.fn(async (filter) => {
    sellerCounts.push(filter);
    return filter.isApproved === true ? 4 : 1;
  });

  Product.countDocuments = vi.fn(async () => 50);

  // 10 orders all time, none in the last 24 hours.
  orderCounts = [];
  Order.countDocuments = vi.fn(async (filter = {}) => {
    orderCounts.push(filter);
    return filter.createdAt ? 0 : 10;
  });

  Product.find = vi.fn(() => chainableQuery([]));

  // Each aggregation is identified by what it groups on, so the stub does not
  // depend on the order the controller happens to run them in.
  Order.aggregate = vi.fn(async (pipeline) => {
    const json = JSON.stringify(pipeline);
    if (json.includes('$totalAmount')) return [{ _id: null, total: GROSS }];
    if (json.includes('items.commissionAmount')) return [{ _id: null, total: COMMISSION }];
    return [];
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.countDocuments = originals.sellerCount;
  Product.countDocuments = originals.productCount;
  Order.countDocuments = originals.orderCount;
  Order.aggregate = originals.orderAggregate;
  Product.find = originals.productFind;
});

const analytics = () =>
  request(app).get('/api/admin/analytics').set('Authorization', `Bearer ${token()}`);

describe('the admin dashboard numbers', () => {
  it('reports revenue as the commission, not what customers spent', async () => {
    const res = await analytics();

    expect(res.status).toBe(200);
    expect(res.body.revenue).toBe(COMMISSION);
    expect(res.body.grossSales).toBe(GROSS);
    // The distinction is the whole point: reading one as the other overstates
    // the platform's earnings by more than a hundred times here.
    expect(res.body.revenue).toBeLessThan(res.body.grossSales);
  });

  it('counts orders from the last 24 hours separately from all time', async () => {
    const res = await analytics();

    expect(res.body.ordersToday).toBe(0);
    expect(res.body.orders).toBe(10);

    // One of the counts must genuinely be date-scoped, or "today" is a label
    // on an all-time number again.
    const scoped = orderCounts.filter((f) => f && f.createdAt && f.createdAt.$gte);
    expect(scoped).toHaveLength(1);
  });

  it('counts every seller in the total, approved or not', async () => {
    const res = await analytics();

    // Manage Sellers lists all 5. The dashboard used to say 4.
    expect(res.body.sellers.total).toBe(5);
    expect(res.body.sellers.approved).toBe(4);
    expect(res.body.sellers.pending).toBe(1);
    expect(res.body.sellers.total).toBe(
      res.body.sellers.approved + res.body.sellers.pending
    );
  });

  it('leaves deleted products out of the product count', async () => {
    await analytics();

    const [filter] = Product.countDocuments.mock.calls[0];
    expect(filter).toEqual({ isDeleted: { $ne: true } });
  });
});
