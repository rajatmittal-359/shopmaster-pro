import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

import { chainableQuery, fakeSession, fakeOrderDoc } from './helpers/testDouble.mjs';

// The backend is CommonJS. Loading it through createRequire keeps a single
// module registry shared with the controllers, so patching a model here patches
// the exact object the controller under test uses.
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

const OWNER_ID = new mongoose.Types.ObjectId();
const ATTACKER_ID = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();

const RZP_ORDER_ID = 'order_REALORDER123';
const RZP_PAYMENT_ID = 'pay_REALPAYMENT123';

/** The signature Razorpay checkout returns for this (order, payment) pair. */
const signFor = (orderId, paymentId) =>
  crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(orderId + '|' + paymentId)
    .digest('hex');

const tokenFor = (userId) =>
  jwt.sign({ userId: userId.toString(), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let session;
let orderDoc;
let findOneCalls;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.orderFindOne = Order.findOne;
  originals.productFindById = Product.findById;
  // Phase 2E: commitment now uses an atomic conditional decrement and a
  // compare-and-set on the order, so those must be stubbed too.
  originals.productFOAU = Product.findOneAndUpdate;
  originals.orderUpdateOne = Order.updateOne;
  originals.cartFindOneAndUpdate = Cart.findOneAndUpdate;
  originals.inventoryCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;

  session = fakeSession();
  mongoose.startSession = vi.fn(async () => session);

  // Authenticated, verified customer, resolved by the real auth middleware.
  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'owner@test.local',
      name: 'Owner',
    })
  );

  // A pending prepaid order owned by OWNER_ID.
  orderDoc = fakeOrderDoc({
    _id: ORDER_ID,
    customerId: OWNER_ID,
    razorpayOrderId: RZP_ORDER_ID,
    paymentMethod: 'razorpay',
    paymentStatus: 'pending',
    totalAmount: 1500,
    items: [{ productId: PRODUCT_ID, quantity: 1, price: 1500 }],
  });

  findOneCalls = [];
  Order.findOne = vi.fn((filter) => {
    findOneCalls.push(filter);
    // Honour whatever ownership scope the controller applies.
    const scopedToOwner =
      !filter.customerId || String(filter.customerId) === String(OWNER_ID);
    const idMatches = !filter._id || String(filter._id) === String(ORDER_ID);
    return chainableQuery(scopedToOwner && idMatches ? orderDoc : null);
  });

  Product.findById = vi.fn(() =>
    chainableQuery({ _id: PRODUCT_ID, stock: 10, save: vi.fn(async () => {}) })
  );
  Cart.findOneAndUpdate = vi.fn(() => chainableQuery({}));
  InventoryLog.create = vi.fn(async () => [{}]);

  // CAS claim: matches only while the order is still pending.
  Order.updateOne = vi.fn(async (filter, update) => {
    const wantsPending = filter.paymentStatus === 'pending';
    const matched = !wantsPending || orderDoc.paymentStatus === 'pending';
    if (matched && update.$set) Object.assign(orderDoc, update.$set);
    return { modifiedCount: matched ? 1 : 0, matchedCount: matched ? 1 : 0 };
  });

  // Atomic decrement returning the pre-image.
  Product.findOneAndUpdate = vi.fn(async () => ({ _id: PRODUCT_ID, stock: 10 }));
});

afterEach(() => {
  User.findById = originals.userFindById;
  Order.findOne = originals.orderFindOne;
  Product.findById = originals.productFindById;
  Product.findOneAndUpdate = originals.productFOAU;
  Order.updateOne = originals.orderUpdateOne;
  Cart.findOneAndUpdate = originals.cartFindOneAndUpdate;
  InventoryLog.create = originals.inventoryCreate;
  mongoose.startSession = originals.startSession;
});

const verify = (token, body) =>
  request(app)
    .post('/api/customer/verify-payment')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

const validBody = () => ({
  razorpay_order_id: RZP_ORDER_ID,
  razorpay_payment_id: RZP_PAYMENT_ID,
  razorpay_signature: signFor(RZP_ORDER_ID, RZP_PAYMENT_ID),
  dbOrderId: ORDER_ID.toString(),
});

describe('POST /api/customer/verify-payment', () => {
  it('confirms payment for the correct owner and matching Razorpay order', async () => {
    const res = await verify(tokenFor(OWNER_ID), validBody());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(orderDoc.paymentStatus).toBe('paid');
    expect(orderDoc.razorpayPaymentId).toBe(RZP_PAYMENT_ID);
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it('scopes the order lookup to the authenticated customer', async () => {
    await verify(tokenFor(OWNER_ID), validBody());

    expect(findOneCalls.length).toBeGreaterThan(0);
    expect(findOneCalls[0]).toHaveProperty('customerId');
    expect(String(findOneCalls[0].customerId)).toBe(String(OWNER_ID));
  });

  it("rejects a valid payment aimed at another customer's order", async () => {
    const res = await verify(tokenFor(ATTACKER_ID), validBody());

    expect(res.status).toBe(404);
    expect(orderDoc.paymentStatus).toBe('pending');
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });

  it('cannot redirect a valid signature onto a different database order', async () => {
    // A genuine, correctly signed payment for a DIFFERENT (cheaper) Razorpay order.
    const otherRzpOrder = 'order_CHEAPONE999';
    const res = await verify(tokenFor(OWNER_ID), {
      razorpay_order_id: otherRzpOrder,
      razorpay_payment_id: RZP_PAYMENT_ID,
      razorpay_signature: signFor(otherRzpOrder, RZP_PAYMENT_ID),
      dbOrderId: ORDER_ID.toString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong/i);
    expect(orderDoc.paymentStatus).toBe('pending');
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid signature', async () => {
    const res = await verify(tokenFor(OWNER_ID), {
      ...validBody(),
      razorpay_signature: 'f'.repeat(64),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid payment signature/i);
    expect(orderDoc.paymentStatus).toBe('pending');
  });

  it('rejects a wrong-length signature without throwing', async () => {
    const res = await verify(tokenFor(OWNER_ID), {
      ...validBody(),
      razorpay_signature: 'abc',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid payment signature/i);
  });

  it('is idempotent: an already-paid order is not processed again', async () => {
    orderDoc.paymentStatus = 'paid';

    const res = await verify(tokenFor(OWNER_ID), validBody());

    expect(res.status).toBe(200);
    expect(res.body.alreadyProcessed).toBe(true);
    // The critical guarantee: no second stock decrement, no second commit.
    expect(Product.findOneAndUpdate).not.toHaveBeenCalled();
    expect(InventoryLog.create).not.toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });

  it('refuses to re-confirm a refunded order', async () => {
    orderDoc.paymentStatus = 'refunded';

    const res = await verify(tokenFor(OWNER_ID), validBody());

    expect(res.status).toBe(400);
    expect(InventoryLog.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed order id instead of returning a server error', async () => {
    const res = await verify(tokenFor(OWNER_ID), {
      ...validBody(),
      dbOrderId: 'not-an-object-id',
    });

    expect(res.status).toBe(400);
  });

  it('rejects a request missing verification fields', async () => {
    const res = await verify(tokenFor(OWNER_ID), {
      dbOrderId: ORDER_ID.toString(),
    });

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/customer/verify-payment')
      .send({ dbOrderId: ORDER_ID.toString() });

    expect(res.status).toBe(401);
  });
});
