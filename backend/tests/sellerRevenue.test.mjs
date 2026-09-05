/**
 * What a seller is told they earned.
 *
 * Both seller screens worked the number out themselves as `price * quantity`
 * and labelled it "Your Revenue". That is the GROSS - what the CUSTOMER paid.
 * A seller on the default 8% saw ₹1000 on the order and ₹920 in their payout,
 * with nothing on screen to explain the gap. The platform's own store is on 0%,
 * so the two numbers matched there and the fault stayed invisible while only it
 * was selling - it would have surfaced on the first third-party payout.
 *
 * The same client-side sum also counted CANCELLED lines, which are owed nothing.
 *
 * The money is computed on the server now, from the commission SNAPSHOT written
 * when the order was placed, and these tests hold that contract.
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
const User = require('../models/User');
const Seller = require('../models/Seller');

const SELLER = new mongoose.Types.ObjectId();
const OTHER_SELLER = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: String(SELLER), role: 'seller' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

/**
 * One order at 8%, holding four lines:
 *   two live lines of this seller's  (₹1000 + ₹500 gross)
 *   one CANCELLED line of this seller's
 *   one line belonging to a different seller
 */
const buildOrder = () => ({
  _id: ORDER_ID,
  orderNumber: 'SMP-TEST-0001',
  customerId: { _id: new mongoose.Types.ObjectId(), name: 'C', email: 'c@t.local' },
  items: [
    {
      sellerId: SELLER,
      name: 'live-a',
      quantity: 2,
      price: 500,
      status: 'active',
      commissionRate: 8,
      commissionAmount: 80,
      sellerEarning: 920,
    },
    {
      sellerId: SELLER,
      name: 'live-b',
      quantity: 1,
      price: 500,
      status: 'active',
      commissionRate: 8,
      commissionAmount: 40,
      sellerEarning: 460,
    },
    {
      sellerId: SELLER,
      name: 'cancelled',
      quantity: 1,
      price: 900,
      status: 'cancelled',
      commissionRate: 8,
      commissionAmount: 72,
      sellerEarning: 828,
    },
    {
      sellerId: OTHER_SELLER,
      name: 'not-mine',
      quantity: 1,
      price: 7000,
      status: 'active',
      commissionRate: 8,
      commissionAmount: 560,
      sellerEarning: 6440,
    },
  ],
  // Two sellers in the basket: this seller has shipped, the other has not, so
  // the ORDER is still only 'pending'.
  fulfilments: [
    { sellerId: SELLER, status: 'shipped', deliveredAt: null },
    { sellerId: OTHER_SELLER, status: 'pending', deliveredAt: null },
  ],
  status: 'pending',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  shippingAddressId: null,
  trackingInfo: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

const originals = {};

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.orderFind = Order.find;
  originals.orderFindById = Order.findById;

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
  Order.find = vi.fn(() => chainableQuery([buildOrder()]));
  Order.findById = vi.fn(() => chainableQuery(buildOrder()));
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Order.find = originals.orderFind;
  Order.findById = originals.orderFindById;
});

const list = () =>
  request(app).get('/api/seller/orders').set('Authorization', `Bearer ${token()}`);

const details = () =>
  request(app)
    .get(`/api/seller/orders/${ORDER_ID}`)
    .set('Authorization', `Bearer ${token()}`);

describe.each([
  ['the orders list', async () => (await list()).body.orders[0]],
  ['the order details page', async () => (await details()).body.order],
])('%s reports the seller money', (_label, fetch) => {
  it('separates gross, commission and what the seller actually earns', async () => {
    const order = await fetch();

    // 2×500 + 1×500. NOT 2400 - the cancelled ₹900 line is excluded.
    expect(order.sellerSubtotal).toBe(1500);
    expect(order.sellerCommission).toBe(120);
    expect(order.sellerEarning).toBe(1380);
  });

  it('never counts another seller in the same basket', async () => {
    const order = await fetch();

    // The other seller's ₹7000 line must not appear in any of the three.
    expect(order.sellerSubtotal).toBeLessThan(7000);
    expect(order.sellerEarning).toBeLessThan(7000);

    // The seller still SEES their own cancelled line - it is their history, and
    // it is marked cancelled. It just earns them nothing. What they must never
    // see is the other seller's line.
    const names = order.items.map((i) => i.name);
    expect(names).toEqual(['live-a', 'live-b', 'cancelled']);
    expect(names).not.toContain('not-mine');
  });

  it('always adds back up, so no rupee is unexplained', async () => {
    const order = await fetch();

    expect(order.sellerCommission + order.sellerEarning).toBeCloseTo(
      order.sellerSubtotal,
      2
    );
  });

  it('reads the snapshot rather than recomputing from a live rate', async () => {
    const order = await fetch();

    // 8% of 1500 happens to be 120, but the point is WHERE it came from: the
    // amounts stamped on the lines. If this ever starts recomputing, a rate
    // change tomorrow silently rewrites what was earned today.
    expect(order.sellerCommission).toBe(80 + 40);
  });

  /**
   * The order is 'pending' because the OTHER seller has not started. Showing
   * that here tells a seller who has already shipped that they have not.
   */
  it('shows this seller their own progress, not the whole basket', async () => {
    const order = await fetch();

    expect(order.status).toBe('shipped');
    expect(order.orderStatus).toBe('pending');
    expect(order.isSplitOrder).toBe(true);
  });

  /**
   * Without this the page's `paymentMethod === 'cod'` test was always false and
   * every order claimed to be paid online - including COD, where the seller has
   * to collect cash at the door.
   */
  it('says how the order is being paid for', async () => {
    const order = await fetch();

    expect(order.paymentMethod).toBe('cod');
  });
});
