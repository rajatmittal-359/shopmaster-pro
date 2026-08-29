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

const SELLER = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: String(SELLER), role: 'seller' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const mkOrder = (label, paymentMethod, paymentStatus, status = 'pending') => ({
  _id: new mongoose.Types.ObjectId(),
  customerId: { _id: new mongoose.Types.ObjectId(), name: 'C', email: 'c@t.local' },
  items: [{ sellerId: SELLER, name: label, quantity: 1, price: 100, status: 'active' }],
  paymentMethod,
  paymentStatus,
  status,
  trackingInfo: {},
  createdAt: new Date(),
});

// Mirrors the real production shape: mostly dead prepaid checkouts.
const ALL = [
  mkOrder('abandoned-1', 'razorpay', 'pending'),
  mkOrder('abandoned-2', 'razorpay', 'pending'),
  mkOrder('paid-prepaid', 'razorpay', 'paid', 'processing'),
  mkOrder('cod-awaiting', 'cod', 'pending'),
  mkOrder('cod-delivered', 'cod', 'paid', 'delivered'),
  mkOrder('refunded', 'razorpay', 'refunded', 'cancelled'),
];

const originals = {};
let filters;

/** Apply the controller's filter against the fixture. */
const applyFilter = (f = {}) =>
  ALL.filter((o) => {
    if (!f.$or) return true;
    return f.$or.some((clause) => {
      if (clause.paymentMethod?.$ne !== undefined)
        return o.paymentMethod !== clause.paymentMethod.$ne;
      if (clause.paymentStatus?.$ne !== undefined)
        return o.paymentStatus !== clause.paymentStatus.$ne;
      return false;
    });
  });

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.orderFind = Order.find;

  filters = [];

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'seller',
      isVerified: true,
      email: 's@test.local',
      name: 'S',
    })
  );
  Seller.findOne = vi.fn(() =>
    chainableQuery({ userId: SELLER, status: 'active', isApproved: true })
  );
  Order.find = vi.fn((f) => {
    filters.push(f);
    return chainableQuery(applyFilter(f));
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Order.find = originals.orderFind;
});

const queue = () =>
  request(app).get('/api/seller/orders').set('Authorization', `Bearer ${token()}`);

describe('seller order queue excludes abandoned prepaid checkouts', () => {
  it('unpaid razorpay orders never reach the seller', async () => {
    const res = await queue();

    expect(res.status).toBe(200);
    const names = res.body.orders.map((o) => o.items[0].name);
    expect(names).not.toContain('abandoned-1');
    expect(names).not.toContain('abandoned-2');
  });

  it('paid prepaid orders are shown', async () => {
    const res = await queue();
    const names = res.body.orders.map((o) => o.items[0].name);
    expect(names).toContain('paid-prepaid');
  });

  it('COD orders are actionable from creation and are still shown', async () => {
    const res = await queue();
    const names = res.body.orders.map((o) => o.items[0].name);
    expect(names).toContain('cod-awaiting');
    expect(names).toContain('cod-delivered');
  });

  it('cancelled/refunded history is preserved, not over-filtered', async () => {
    const res = await queue();
    const names = res.body.orders.map((o) => o.items[0].name);
    expect(names).toContain('refunded');
  });

  it('every returned order is genuinely actionable or historical', async () => {
    const res = await queue();

    res.body.orders.forEach((o) => {
      const dead = o.paymentMethod === 'razorpay' && o.paymentStatus === 'pending';
      expect(dead).toBe(false);
    });
    expect(res.body.count).toBe(4); // 6 total minus 2 abandoned
  });

  it('still scopes to the seller\'s own items', async () => {
    await queue();
    expect(String(filters[0]['items.sellerId'])).toBe(String(SELLER));
  });
});
