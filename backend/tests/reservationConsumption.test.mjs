/**
 * Turning a hold into a sale.
 *
 * Reservation is only half the story: the payment must consume the hold
 * EXACTLY ONCE, and the browser callback racing the Razorpay webhook must not
 * produce two sales, two stock movements or two audit entries.
 *
 * The properties defended here:
 *
 *   - a held order's payment lowers stock AND reserved in one operation
 *   - the hold is then marked consumed, so it can never be released afterwards
 *   - the loser of the payment race changes no inventory at all
 *   - a replayed callback changes no inventory at all
 *   - exactly one inventory log per sale; holds are never logged
 *   - an order with no hold still commits the old way (COD, or expired hold)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

import { chainableQuery, fakeSession } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const InventoryLog = require('../models/Inventory');

const CUSTOMER = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();

const RZP_ORDER = 'order_RESERVED01';
const RZP_PAYMENT = 'pay_RESERVED01';

const sign = (o, p) =>
  crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(o + '|' + p).digest('hex');

const token = () =>
  jwt.sign({ userId: String(CUSTOMER), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let session;
let orderDoc;
let stock;
let reserved;
let claimMatched;
let stockOps;
let logs;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.orderFindOne = Order.findOne;
  originals.orderFindById = Order.findById;
  originals.orderFind = Order.find;
  originals.orderUpdateOne = Order.updateOne;
  originals.productFOAU = Product.findOneAndUpdate;
  originals.productFindById = Product.findById;
  originals.cartFOAU = Cart.findOneAndUpdate;
  originals.logCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;

  // The product starts with two units physically present, both held by THIS
  // order. available is therefore already zero before payment.
  stock = 2;
  reserved = 2;
  claimMatched = true;
  stockOps = [];
  logs = [];

  session = fakeSession();
  let snapshot = null;
  session.startTransaction = vi.fn(() => {
    snapshot = { order: { ...orderDoc }, claimMatched, stock, reserved };
  });
  session.abortTransaction = vi.fn(async () => {
    if (snapshot) {
      Object.keys(orderDoc).forEach((k) => delete orderDoc[k]);
      Object.assign(orderDoc, snapshot.order);
      claimMatched = snapshot.claimMatched;
      stock = snapshot.stock;
      reserved = snapshot.reserved;
    }
  });
  session.commitTransaction = vi.fn(async () => {
    snapshot = null;
  });
  mongoose.startSession = vi.fn(async () => session);

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'c@test.local',
      name: 'C',
    })
  );

  orderDoc = {
    _id: ORDER_ID,
    customerId: CUSTOMER,
    razorpayOrderId: RZP_ORDER,
    paymentMethod: 'razorpay',
    paymentStatus: 'pending',
    status: 'pending',
    totalAmount: 1500,
    reservationStatus: 'held',
    reservationExpiresAt: new Date(Date.now() + 600000),
    items: [{ productId: PRODUCT_ID, name: 'Ruby Ring', quantity: 2, price: 700, status: 'active' }],
  };

  Order.findOne = vi.fn(() => chainableQuery(orderDoc));
  Order.findById = vi.fn(() => chainableQuery(orderDoc));
  Order.find = vi.fn(() => chainableQuery([]));

  Order.updateOne = vi.fn(async (filter, update) => {
    const wantsPending = filter.paymentStatus === 'pending';
    const wantsHeld = filter.reservationStatus === 'held';

    if (wantsPending && !claimMatched) return { modifiedCount: 0, matchedCount: 0 };
    if (wantsHeld && orderDoc.reservationStatus !== 'held') {
      return { modifiedCount: 0, matchedCount: 0 };
    }

    if (update.$set) Object.assign(orderDoc, update.$set);
    if (wantsPending) claimMatched = false;
    return { modifiedCount: 1, matchedCount: 1 };
  });

  // Models BOTH counters. The filter decides; the update applies. One step.
  Product.findOneAndUpdate = vi.fn(async (filter, update) => {
    stockOps.push({ filter, update });

    const needStock = filter.stock?.$gte ?? 0;
    const needReserved = filter.reserved?.$gte;

    if (stock < needStock) return null;
    if (needReserved !== undefined && reserved < needReserved) return null;

    const before = { _id: PRODUCT_ID, stock, reserved };
    stock += update.$inc.stock || 0;
    reserved += update.$inc.reserved || 0;
    return before;
  });

  Product.findById = vi.fn(() => chainableQuery({ _id: PRODUCT_ID, name: 'Ruby Ring', stock, reserved }));
  Cart.findOneAndUpdate = vi.fn(() => chainableQuery({}));
  InventoryLog.create = vi.fn(async (docs) => {
    logs.push(Array.isArray(docs) ? docs[0] : docs);
    return docs;
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Order.findOne = originals.orderFindOne;
  Order.findById = originals.orderFindById;
  Order.find = originals.orderFind;
  Order.updateOne = originals.orderUpdateOne;
  Product.findOneAndUpdate = originals.productFOAU;
  Product.findById = originals.productFindById;
  Cart.findOneAndUpdate = originals.cartFOAU;
  InventoryLog.create = originals.logCreate;
  mongoose.startSession = originals.startSession;
});

const verify = (overrides = {}) =>
  request(app)
    .post('/api/customer/verify-payment')
    .set('Authorization', `Bearer ${token()}`)
    .send({
      razorpay_order_id: RZP_ORDER,
      razorpay_payment_id: RZP_PAYMENT,
      razorpay_signature: sign(RZP_ORDER, RZP_PAYMENT),
      dbOrderId: String(ORDER_ID),
      ...overrides,
    });

describe('a held order converts its hold into a sale', () => {
  it('lowers stock and reserved together, in one operation', async () => {
    const res = await verify();

    expect(res.status).toBe(200);
    expect(stock).toBe(0);
    expect(reserved).toBe(0);
    expect(stockOps).toHaveLength(1);
    expect(stockOps[0].update.$inc).toEqual({ stock: -2, reserved: -2 });
  });

  it('requires the units to still be held, not merely in stock', async () => {
    await verify();

    // Without `reserved: {$gte}` in the filter the sale could take units that
    // belong to a different customer's hold.
    expect(stockOps[0].filter.reserved).toEqual({ $gte: 2 });
    expect(stockOps[0].filter.stock).toEqual({ $gte: 2 });
  });

  it('marks the hold consumed so it can never be released afterwards', async () => {
    await verify();
    expect(orderDoc.reservationStatus).toBe('consumed');
  });

  it('writes exactly one inventory log, and only for the sale', async () => {
    await verify();

    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('sale');
    expect(logs[0].quantity).toBe(-2);
    expect(logs[0].stockBefore).toBe(2);
    expect(logs[0].stockAfter).toBe(0);
  });

  it('records no log for the hold itself', async () => {
    await verify();

    // A hold changes nothing permanent, so the audit trail stays answerable:
    // every entry is a real movement of sellable stock.
    expect(logs.filter((l) => l.type !== 'sale')).toHaveLength(0);
  });
});

describe('the payment race consumes the hold exactly once', () => {
  it('the caller that loses the compare-and-set changes no inventory', async () => {
    claimMatched = false; // the webhook already claimed it
    orderDoc.paymentStatus = 'pending'; // fast path must not short-circuit

    const res = await verify();

    expect(res.status).toBe(200);
    expect(res.body.alreadyProcessed).toBe(true);
    expect(stockOps).toHaveLength(0);
    expect(stock).toBe(2);
    expect(reserved).toBe(2);
    expect(logs).toHaveLength(0);
  });

  it('a replay after the sale changes nothing', async () => {
    await verify();
    const stockAfterFirst = stock;
    const reservedAfterFirst = reserved;
    const opsAfterFirst = stockOps.length;

    const replay = await verify();

    expect(replay.body.alreadyProcessed).toBe(true);
    expect(stock).toBe(stockAfterFirst);
    expect(reserved).toBe(reservedAfterFirst);
    expect(stockOps).toHaveLength(opsAfterFirst);
    expect(logs).toHaveLength(1);
  });

  it('a replay cannot re-consume an already consumed hold', async () => {
    await verify();
    await verify();

    expect(orderDoc.reservationStatus).toBe('consumed');
    expect(reserved).toBe(0); // never driven negative
  });
});

describe('an order without a hold still commits the old way', () => {
  beforeEach(() => {
    // COD, or a prepaid hold that expired before the payment landed.
    orderDoc.reservationStatus = 'none';
    reserved = 0;
    stock = 5;
  });

  it('decrements stock alone and does not touch reserved', async () => {
    await verify();

    expect(stockOps[0].update.$inc).toEqual({ stock: -2 });
    expect(stockOps[0].filter.reserved).toBeUndefined();
    expect(stock).toBe(3);
    expect(reserved).toBe(0);
  });

  it('still writes exactly one truthful inventory log', async () => {
    await verify();

    expect(logs).toHaveLength(1);
    expect(logs[0].stockBefore).toBe(5);
    expect(logs[0].stockAfter).toBe(3);
  });

  it('does not mark a non-existent hold as consumed', async () => {
    await verify();
    expect(orderDoc.reservationStatus).toBe('none');
  });
});

describe('a hold that expired before payment is handled honestly', () => {
  it('falls back to plain availability when the hold was already released', async () => {
    orderDoc.reservationStatus = 'released';
    reserved = 0;
    stock = 2;

    const res = await verify();

    // The units happened to still be there, so the sale goes through - but on
    // the plain condition, not by claiming a hold that no longer exists.
    expect(res.status).toBe(200);
    expect(stockOps[0].update.$inc).toEqual({ stock: -2 });
    expect(stock).toBe(0);
  });

  it('reports the payment as captured-but-unfulfillable when the units are gone', async () => {
    orderDoc.reservationStatus = 'released';
    reserved = 0;
    stock = 0; // somebody else took them while this checkout was abandoned

    const res = await verify();

    expect(res.status).toBe(409);
    expect(res.body.paymentCaptured).toBe(true);
    expect(res.body.refundRequired).toBe(true);
    expect(logs).toHaveLength(0);
  });
});
