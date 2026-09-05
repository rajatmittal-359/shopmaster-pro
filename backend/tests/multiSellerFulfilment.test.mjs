/**
 * Split orders: one basket, two sellers, two independent parcels.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   The order carried a single `status`, and any seller with a line in the
 *   basket could move it. So one seller marking their parcel delivered declared
 *   the WHOLE order delivered - which set the order's deliveredAt, which
 *   started the return window, which is what makes a line payable. The other
 *   seller was then settled for goods they had never packed, and on COD the
 *   order was marked paid for money nobody had collected.
 *
 *   Delivery is now recorded per seller, and payout reads it per seller.
 *
 * The rules being defended:
 *   1. an order is only as advanced as its LEAST advanced live part
 *   2. one seller delivering makes ONLY that seller's lines payable
 *   3. a seller still inside their own return window is not payable
 *   4. an order with no fulfilments pays nobody - the safe default
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

import { InMemoryCollection, attach } from './helpers/inMemoryStore.mjs';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const Order = require('../models/Order');
const Seller = require('../models/Seller');
const Payout = require('../models/Payout');
const { getPayableSummary, RETURN_WINDOW_DAYS } = require('../utils/payout');

const ALPHA = new mongoose.Types.ObjectId(); // seller who ships promptly
const BETA = new mongoose.Types.ObjectId(); // seller who has not packed yet

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const SETTLED = daysAgo(RETURN_WINDOW_DAYS + 3);
const STILL_RETURNABLE = daysAgo(1);

const line = (sellerId, price, quantity = 1) => ({
  _id: new mongoose.Types.ObjectId(),
  productId: new mongoose.Types.ObjectId(),
  sellerId,
  name: 'Item',
  price,
  quantity,
  status: 'active',
  commissionRate: 8,
  commissionAmount: Math.round(price * quantity * 0.08 * 100) / 100,
  sellerEarning: Math.round(price * quantity * 0.92 * 100) / 100,
  payoutId: null,
});

/** A split order whose two sellers are at explicitly different stages. */
const splitOrder = (fulfilments, items) => ({
  _id: new mongoose.Types.ObjectId(),
  customerId: new mongoose.Types.ObjectId(),
  items,
  paymentStatus: 'paid',
  status: Order.deriveStatus(fulfilments),
  deliveredAt: null,
  fulfilments,
});

// ------------------------------------------------------------ status derivation
describe('what the customer sees for a split order', () => {
  it('is only as advanced as the least advanced part', () => {
    expect(
      Order.deriveStatus([
        { sellerId: ALPHA, status: 'delivered' },
        { sellerId: BETA, status: 'pending' },
      ])
    ).toBe('pending');

    expect(
      Order.deriveStatus([
        { sellerId: ALPHA, status: 'delivered' },
        { sellerId: BETA, status: 'shipped' },
      ])
    ).toBe('shipped');
  });

  it('is delivered only once every part has arrived', () => {
    expect(
      Order.deriveStatus([
        { sellerId: ALPHA, status: 'delivered' },
        { sellerId: BETA, status: 'delivered' },
      ])
    ).toBe('delivered');
  });

  it('ignores a cancelled part when another is still live', () => {
    expect(
      Order.deriveStatus([
        { sellerId: ALPHA, status: 'cancelled' },
        { sellerId: BETA, status: 'processing' },
      ])
    ).toBe('processing');
  });

  it('is cancelled only when every part is', () => {
    expect(
      Order.deriveStatus([
        { sellerId: ALPHA, status: 'cancelled' },
        { sellerId: BETA, status: 'cancelled' },
      ])
    ).toBe('cancelled');
  });

  it('is returned only when every part came back', () => {
    expect(
      Order.deriveStatus([
        { sellerId: ALPHA, status: 'returned' },
        { sellerId: BETA, status: 'returned' },
      ])
    ).toBe('returned');

    // One returned, one delivered: the order is done, not "returned".
    expect(
      Order.deriveStatus([
        { sellerId: ALPHA, status: 'returned' },
        { sellerId: BETA, status: 'delivered' },
      ])
    ).toBe('delivered');
  });
});

// ------------------------------------------------------------------- payout
describe('who gets paid for a split order', () => {
  let orders;
  let detach;

  beforeEach(() => {
    orders = new InMemoryCollection([]);
    const sellers = new InMemoryCollection(
      [ALPHA, BETA].map((userId, i) => ({
        _id: new mongoose.Types.ObjectId(),
        userId,
        businessName: i === 0 ? 'Alpha Crafts' : 'Beta Traders',
        isPlatformOwned: false,
        bankDetails: {
          accountNumber: '0000TESTACCOUNT0',
          ifscCode: 'HDFC0001234',
          accountHolderName: 'Test',
        },
      }))
    );

    const d1 = attach(Order, orders, ['find', 'findOne', 'updateMany', 'updateOne', 'create']);
    const d2 = attach(Seller, sellers, ['find', 'findOne']);
    const d3 = attach(Payout, new InMemoryCollection([]), ['find', 'findById']);
    detach = () => {
      d1();
      d2();
      d3();
    };
  });

  afterEach(() => detach());

  it('pays only the seller who actually delivered', async () => {
    await orders.create(
      splitOrder(
        [
          { sellerId: ALPHA, status: 'delivered', deliveredAt: SETTLED },
          { sellerId: BETA, status: 'pending', deliveredAt: null },
        ],
        [line(ALPHA, 1000), line(BETA, 5000)]
      )
    );

    const summary = await getPayableSummary();

    // Beta has not packed a thing. Before the fix, Alpha marking their parcel
    // delivered would have made Beta's Rs5000 line payable too.
    expect(summary).toHaveLength(1);
    expect(String(summary[0].sellerId)).toBe(String(ALPHA));
    expect(summary[0].grossSales).toBe(1000);
  });

  it('pays nobody while the delivering seller is still inside the return window', async () => {
    await orders.create(
      splitOrder(
        [
          { sellerId: ALPHA, status: 'delivered', deliveredAt: STILL_RETURNABLE },
          { sellerId: BETA, status: 'pending', deliveredAt: null },
        ],
        [line(ALPHA, 1000), line(BETA, 5000)]
      )
    );

    expect(await getPayableSummary()).toHaveLength(0);
  });

  it('pays each seller from their own delivery date, not the order\'s', async () => {
    await orders.create(
      splitOrder(
        [
          { sellerId: ALPHA, status: 'delivered', deliveredAt: SETTLED },
          { sellerId: BETA, status: 'delivered', deliveredAt: SETTLED },
        ],
        [line(ALPHA, 1000), line(BETA, 5000)]
      )
    );

    const summary = await getPayableSummary();
    expect(summary).toHaveLength(2);

    const byId = Object.fromEntries(summary.map((s) => [String(s.sellerId), s]));
    expect(byId[String(ALPHA)].grossSales).toBe(1000);
    expect(byId[String(BETA)].grossSales).toBe(5000);
  });

  it('pays nobody for an order that has no fulfilments at all', async () => {
    // A pre-migration record. Treating "no fulfilment" as undelivered under-pays
    // rather than over-pays, and backfillFulfilments.js repairs these.
    await orders.create({
      _id: new mongoose.Types.ObjectId(),
      customerId: new mongoose.Types.ObjectId(),
      items: [line(ALPHA, 1000)],
      paymentStatus: 'paid',
      status: 'delivered',
      deliveredAt: SETTLED,
      fulfilments: [],
    });

    expect(await getPayableSummary()).toHaveLength(0);
  });
});
