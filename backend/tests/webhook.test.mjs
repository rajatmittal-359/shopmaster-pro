import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

import { chainableQuery, fakeSession, fakeOrderDoc } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const InventoryLog = require('../models/Inventory');

const WEBHOOK_PATH = '/api/customer/razorpay/webhook';
const ORDER_ID = new mongoose.Types.ObjectId();
const CUSTOMER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();
const RZP_ORDER_ID = 'order_WEBHOOK123';

/** Razorpay signs the raw request bytes, so the test must sign the same bytes. */
const signRaw = (raw) =>
  crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex');

const capturedEvent = (rzpOrderId = RZP_ORDER_ID) =>
  JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_WEBHOOK123', order_id: rzpOrderId } } },
  });

const send = (raw, signature) =>
  request(app)
    .post(WEBHOOK_PATH)
    .set('Content-Type', 'application/json')
    .set(signature === undefined ? {} : { 'x-razorpay-signature': signature })
    .send(raw);

const originals = {};
let session;
let orderDoc;

beforeEach(() => {
  originals.orderFindOne = Order.findOne;
  originals.productFindById = Product.findById;
  originals.productFOAU = Product.findOneAndUpdate;
  originals.orderUpdateOne = Order.updateOne;
  originals.cartFindOneAndUpdate = Cart.findOneAndUpdate;
  originals.inventoryCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;

  session = fakeSession();
  mongoose.startSession = vi.fn(async () => session);

  orderDoc = fakeOrderDoc({
    _id: ORDER_ID,
    customerId: CUSTOMER_ID,
    razorpayOrderId: RZP_ORDER_ID,
    paymentMethod: 'razorpay',
    paymentStatus: 'pending',
    totalAmount: 900,
    items: [{ productId: { _id: PRODUCT_ID }, quantity: 1, price: 900 }],
  });

  Order.findOne = vi.fn((filter) =>
    chainableQuery(filter.razorpayOrderId === RZP_ORDER_ID ? orderDoc : null)
  );
  Product.findById = vi.fn(() =>
    chainableQuery({ _id: PRODUCT_ID, stock: 5, save: vi.fn(async () => {}) })
  );
  Cart.findOneAndUpdate = vi.fn(() => chainableQuery({}));
  InventoryLog.create = vi.fn(async () => [{}]);

  // Phase 2E: CAS claim + atomic stock decrement.
  Order.updateOne = vi.fn(async (filter, update) => {
    const wantsPending = filter.paymentStatus === 'pending';
    const matched = !wantsPending || orderDoc.paymentStatus === 'pending';
    if (matched && update.$set) Object.assign(orderDoc, update.$set);
    return { modifiedCount: matched ? 1 : 0, matchedCount: matched ? 1 : 0 };
  });
  Product.findOneAndUpdate = vi.fn(async () => ({ _id: PRODUCT_ID, stock: 10 }));
});

afterEach(() => {
  Order.findOne = originals.orderFindOne;
  Product.findById = originals.productFindById;
  Product.findOneAndUpdate = originals.productFOAU;
  Order.updateOne = originals.orderUpdateOne;
  Cart.findOneAndUpdate = originals.cartFindOneAndUpdate;
  InventoryLog.create = originals.inventoryCreate;
  mongoose.startSession = originals.startSession;
});

describe('POST /api/customer/razorpay/webhook', () => {
  it('accepts a correctly signed raw payload and confirms the order', async () => {
    const raw = capturedEvent();
    const res = await send(raw, signRaw(raw));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(orderDoc.paymentStatus).toBe('paid');
    expect(orderDoc.razorpayPaymentId).toBe('pay_WEBHOOK123');
    expect(session.commitTransaction).toHaveBeenCalled();
  });

  it('verifies against the ORIGINAL bytes, not a re-serialized object', async () => {
    // This is the decisive raw-body test. The payload is pretty-printed, so
    // JSON.stringify(JSON.parse(raw)) !== raw. Any implementation that hashes a
    // re-serialized body computes a different HMAC and rejects this valid call.
    const raw = JSON.stringify(
      {
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_WEBHOOK123', order_id: RZP_ORDER_ID } } },
      },
      null,
      2
    );
    expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw); // guard the premise

    const res = await send(raw, signRaw(raw));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(orderDoc.paymentStatus).toBe('paid');
  });

  it('rejects a tampered payload whose signature no longer matches', async () => {
    const raw = capturedEvent();
    const signature = signRaw(raw);
    // Same signature, different body - the classic replay/tamper attempt.
    const tampered = capturedEvent('order_ATTACKERCONTROLLED');

    const res = await send(tampered, signature);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid webhook signature/i);
    expect(orderDoc.paymentStatus).toBe('pending');
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });

  it('rejects an outright invalid signature', async () => {
    const raw = capturedEvent();
    const res = await send(raw, 'f'.repeat(64));

    expect(res.status).toBe(400);
    expect(orderDoc.paymentStatus).toBe('pending');
  });

  it('rejects a wrong-length signature without throwing', async () => {
    const raw = capturedEvent();
    const res = await send(raw, 'short');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid webhook signature/i);
  });

  it('rejects a missing signature header', async () => {
    const raw = capturedEvent();
    const res = await request(app)
      .post(WEBHOOK_PATH)
      .set('Content-Type', 'application/json')
      .send(raw);

    expect(res.status).toBe(400);
  });

  it('is idempotent: a replayed capture does not decrement stock twice', async () => {
    orderDoc.paymentStatus = 'paid';
    const raw = capturedEvent();

    const res = await send(raw, signRaw(raw));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already_processed');
    expect(InventoryLog.create).not.toHaveBeenCalled();
    expect(session.commitTransaction).not.toHaveBeenCalled();
  });

  it('does not re-sell an order that was already refunded', async () => {
    orderDoc.paymentStatus = 'refunded';
    const raw = capturedEvent();

    const res = await send(raw, signRaw(raw));

    expect(res.body.status).toBe('already_processed');
    expect(InventoryLog.create).not.toHaveBeenCalled();
  });

  it('handles a signed event with no payment entity without crashing', async () => {
    // e.g. a refund.processed or order.paid event
    const raw = JSON.stringify({ event: 'payment.captured', payload: {} });
    const res = await send(raw, signRaw(raw));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
  });

  it('ignores unrelated signed events', async () => {
    const raw = JSON.stringify({ event: 'refund.processed', payload: {} });
    const res = await send(raw, signRaw(raw));

    expect(res.status).toBe(200);
  });

  it('rejects a signed but malformed JSON body', async () => {
    const raw = '{not valid json';
    const res = await send(raw, signRaw(raw));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/malformed/i);
  });

  it('reports order_not_found for an unknown razorpay order', async () => {
    const raw = capturedEvent('order_DOESNOTEXIST');
    const res = await send(raw, signRaw(raw));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('order_not_found');
  });
});

describe('body parsing is not broken for other routes', () => {
  it('still parses JSON on a normal API route', async () => {
    // /api/auth/login parses req.body; with no credentials it must answer 400,
    // which proves express.json() still ran for non-webhook routes.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });
});
