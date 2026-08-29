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

const RZP_ORDER = 'order_LIFECYCLE01';
const RZP_PAYMENT = 'pay_LIFECYCLE01';

const sign = (o, p) =>
  crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(o + '|' + p)
    .digest('hex');

const token = () =>
  jwt.sign({ userId: String(CUSTOMER), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let session;
let orderDoc;
let productStock;       // live stock the atomic update reads
let claimMatched;       // whether the CAS finds paymentStatus:'pending'
let stockOps;           // atomic decrement calls
let logs;
let unfulfillableWrites;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.orderFindOne = Order.findOne;
  originals.orderFindById = Order.findById;
  originals.orderUpdateOne = Order.updateOne;
  originals.productFOAU = Product.findOneAndUpdate;
  originals.cartFOAU = Cart.findOneAndUpdate;
  originals.logCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;

  productStock = 5;
  claimMatched = true;
  stockOps = [];
  logs = [];
  unfulfillableWrites = [];

  // A session double that actually models rollback: writes made inside the
  // transaction are reverted on abort, exactly as MongoDB would. Without this
  // the test cannot distinguish "claim rolled back" from "claim persisted".
  session = fakeSession();
  let snapshot = null;
  session.startTransaction = vi.fn(() => {
    snapshot = { order: { ...orderDoc }, claimMatched, stock: productStock };
  });
  session.abortTransaction = vi.fn(async () => {
    if (snapshot) {
      Object.keys(orderDoc).forEach((k) => delete orderDoc[k]);
      Object.assign(orderDoc, snapshot.order);
      claimMatched = snapshot.claimMatched;
      productStock = snapshot.stock;
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
    items: [{ productId: PRODUCT_ID, name: 'Ruby Ring', quantity: 2, price: 700, status: 'active' }],
  };

  Order.findOne = vi.fn(() => chainableQuery(orderDoc));
  Order.findById = vi.fn(() => chainableQuery(orderDoc));

  Order.updateOne = vi.fn(async (filter, update) => {
    // Compare-and-set: only matches while the order is still pending.
    const wantsPending = filter.paymentStatus === 'pending';
    const matched = !wantsPending || claimMatched;
    if (matched && update.$set) {
      Object.assign(orderDoc, update.$set);
      if (update.$set.status === 'cancelled') unfulfillableWrites.push(update.$set);
      claimMatched = false; // a second CAS cannot match
    }
    return { modifiedCount: matched ? 1 : 0, matchedCount: matched ? 1 : 0 };
  });

  // Atomic conditional decrement: only succeeds when stock >= requested.
  Product.findOneAndUpdate = vi.fn(async (filter, update) => {
    stockOps.push({ filter, update });
    const required = filter.stock?.$gte ?? 0;
    if (productStock < required) return null; // no document matched
    const before = productStock;
    productStock += update.$inc.stock; // $inc is negative
    return { _id: PRODUCT_ID, stock: before };
  });

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
  Order.updateOne = originals.orderUpdateOne;
  Product.findOneAndUpdate = originals.productFOAU;
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

describe('successful prepaid commitment', () => {
  it('commits the order and decrements stock atomically', async () => {
    const res = await verify();

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(orderDoc.paymentStatus).toBe('paid');
    expect(orderDoc.razorpayPaymentId).toBe(RZP_PAYMENT);
    expect(productStock).toBe(3); // 5 - 2
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it('uses a conditional decrement, never a read-then-write', async () => {
    await verify();

    expect(stockOps).toHaveLength(1);
    // The guard that makes it atomic and prevents negative stock.
    expect(stockOps[0].filter.stock).toEqual({ $gte: 2 });
    expect(stockOps[0].update.$inc.stock).toBe(-2);
  });

  it('writes one inventory log with accurate before/after', async () => {
    await verify();

    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('sale');
    expect(logs[0].quantity).toBe(-2);
    expect(logs[0].stockBefore).toBe(5);
    expect(logs[0].stockAfter).toBe(3);
  });

  it('claims the order with a compare-and-set on paymentStatus', async () => {
    await verify();

    const claim = Order.updateOne.mock.calls.find(
      ([f]) => f.paymentStatus === 'pending'
    );
    expect(claim).toBeDefined();
    expect(claim[0]._id).toEqual(ORDER_ID);
  });

  it('clears the cart only after a successful commitment', async () => {
    await verify();
    expect(Cart.findOneAndUpdate).toHaveBeenCalled();
  });
});

describe('paid but unfulfillable - the money-loss scenario', () => {
  beforeEach(() => {
    productStock = 1; // order needs 2; someone else took the units
  });

  it('does not lose the payment: it is recorded on the order', async () => {
    const res = await verify();

    expect(res.status).toBe(409);
    expect(res.body.paymentCaptured).toBe(true);
    expect(res.body.refundRequired).toBe(true);
    expect(orderDoc.paymentStatus).toBe('paid');
    expect(orderDoc.razorpayPaymentId).toBe(RZP_PAYMENT);
  });

  it('cancels the order so it never reaches a seller queue', async () => {
    await verify();

    expect(orderDoc.status).toBe('cancelled');
    expect(unfulfillableWrites).toHaveLength(1);
  });

  it('leaves stock untouched and writes no inventory log', async () => {
    await verify();

    expect(productStock).toBe(1);
    expect(logs).toHaveLength(0);
    expect(session.commitTransaction).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it('never drives stock negative', async () => {
    await verify();
    expect(productStock).toBeGreaterThanOrEqual(0);
  });

  it('tells the customer their payment is safe', async () => {
    const res = await verify();
    expect(res.body.message).toMatch(/payment was received/i);
    expect(res.body.message).toMatch(/refunded/i);
  });

  it('does not clear the cart when the order could not be committed', async () => {
    await verify();
    expect(Cart.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('exact-stock boundary', () => {
  it('commits when stock exactly equals the quantity ordered', async () => {
    productStock = 2;

    const res = await verify();

    expect(res.status).toBe(200);
    expect(productStock).toBe(0);
    expect(orderDoc.paymentStatus).toBe('paid');
  });
});

describe('duplicate verification is safe', () => {
  it('a second verification does not decrement stock again', async () => {
    await verify();
    expect(productStock).toBe(3);

    const second = await verify();

    expect(second.status).toBe(200);
    expect(second.body.alreadyProcessed).toBe(true);
    expect(productStock).toBe(3); // unchanged
    expect(logs).toHaveLength(1); // no second log
  });

  it('a verification that loses the compare-and-set race is idempotent, not an error', async () => {
    // Simulate a concurrent request having claimed the order in the gap between
    // the fast-path read and the CAS: the doc still reads 'pending' here.
    claimMatched = false;

    const res = await verify();

    expect(res.status).toBe(200);
    expect(res.body.alreadyProcessed).toBe(true);
    expect(stockOps).toHaveLength(0); // never reached stock commitment
    expect(session.abortTransaction).toHaveBeenCalled();
  });
});

describe('pre-existing protections still hold', () => {
  it('rejects an invalid signature before any commitment', async () => {
    const res = await verify({ razorpay_signature: 'f'.repeat(64) });

    expect(res.status).toBe(400);
    expect(stockOps).toHaveLength(0);
    expect(orderDoc.paymentStatus).toBe('pending');
  });

  it("rejects a payment bound to a different razorpay order", async () => {
    const other = 'order_SOMETHINGELSE';
    const res = await verify({
      razorpay_order_id: other,
      razorpay_signature: sign(other, RZP_PAYMENT),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong/i);
    expect(stockOps).toHaveLength(0);
  });

  it('refuses to re-commit a refunded order', async () => {
    orderDoc.paymentStatus = 'refunded';

    const res = await verify();

    expect(res.status).toBe(400);
    expect(stockOps).toHaveLength(0);
  });
});
