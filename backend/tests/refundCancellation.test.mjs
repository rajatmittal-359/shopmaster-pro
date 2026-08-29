import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery, fakeOrderDoc } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const InventoryLog = require('../models/Inventory');

const CUSTOMER_ID = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();

const ORIGINAL_TOTAL = 2499;

const token = () =>
  jwt.sign(
    { userId: CUSTOMER_ID.toString(), role: 'customer' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const originals = {};
let orderDoc;
let refundSpy;
const razorpayPath = require.resolve('razorpay');

/** Build an order document in a given payment state. */
const makeOrder = (overrides = {}) =>
  fakeOrderDoc({
    _id: ORDER_ID,
    customerId: CUSTOMER_ID,
    status: 'pending',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayPaymentId: 'pay_CAPTURED123',
    razorpayOrderId: 'order_ABC',
    totalAmount: ORIGINAL_TOTAL,
    refundId: null,
    refundStatus: null,
    refundAmount: null,
    refundedAt: null,
    items: [{ productId: PRODUCT_ID, quantity: 1, price: ORIGINAL_TOTAL, status: 'active' }],
    ...overrides,
  });

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.orderFindOne = Order.findOne;
  originals.productFindById = Product.findById;
  originals.inventoryCreate = InventoryLog.create;
  originals.razorpayExports = require.cache[razorpayPath].exports;

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'c@test.local',
      name: 'Customer',
    })
  );

  orderDoc = makeOrder();
  Order.findOne = vi.fn(() => chainableQuery(orderDoc));

  // applyInventoryChange() reaches the DB only through these two.
  Product.findById = vi.fn(() =>
    chainableQuery({ _id: PRODUCT_ID, stock: 3, save: vi.fn(async () => {}) })
  );
  InventoryLog.create = vi.fn(async () => ({}));

  // Stub the Razorpay SDK at the genuine third-party boundary. The controllers
  // require('razorpay') lazily inside the refund branch, so replacing the
  // cached module export is enough - no live credentials, no network.
  refundSpy = vi.fn(async () => ({ id: 'rfnd_TEST123' }));
  require.cache[razorpayPath].exports = class FakeRazorpay {
    constructor() {
      this.payments = { refund: refundSpy };
    }
  };
});

afterEach(() => {
  User.findById = originals.userFindById;
  Order.findOne = originals.orderFindOne;
  Product.findById = originals.productFindById;
  InventoryLog.create = originals.inventoryCreate;
  require.cache[razorpayPath].exports = originals.razorpayExports;
});

const cancelOrder = () =>
  request(app)
    .patch(`/api/customer/orders/${ORDER_ID}/cancel`)
    .set('Authorization', `Bearer ${token()}`)
    .send({});

const returnOrder = () =>
  request(app)
    .post(`/api/customer/orders/${ORDER_ID}/return`)
    .set('Authorization', `Bearer ${token()}`)
    .send({});

describe('cancelling a paid prepaid order', () => {
  it('actually initiates a refund (the paymentStatus guard now matches the schema)', async () => {
    const res = await cancelOrder();

    expect(res.status).toBe(200);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    // Refund is requested in paise, for the full original value.
    expect(refundSpy.mock.calls[0][0]).toBe('pay_CAPTURED123');
    expect(refundSpy.mock.calls[0][1].amount).toBe(ORIGINAL_TOTAL * 100);
  });

  it('preserves the original financial total instead of zeroing it', async () => {
    await cancelOrder();

    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
    expect(orderDoc.status).toBe('cancelled');
  });

  it('records the refund for reconciliation and moves payment to a terminal state', async () => {
    await cancelOrder();

    expect(orderDoc.refundId).toBe('rfnd_TEST123');
    expect(orderDoc.refundStatus).toBe('processing');
    expect(orderDoc.refundAmount).toBe(ORIGINAL_TOTAL);
    expect(orderDoc.refundedAt).toBeInstanceOf(Date);
    expect(orderDoc.paymentStatus).toBe('refunded');
  });

  it('aborts the cancellation if the refund call fails', async () => {
    refundSpy.mockRejectedValueOnce(new Error('gateway down'));

    const res = await cancelOrder();

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/refund initiation failed/i);
    // Nothing was persisted: the order is still live and still worth its total.
    expect(orderDoc.__saveCount).toBeUndefined();
    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
  });
});

describe('cancelling an unpaid COD order', () => {
  it('cancels with no refund and keeps the original total', async () => {
    orderDoc = makeOrder({ paymentMethod: 'cod', paymentStatus: 'pending', razorpayPaymentId: null });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await cancelOrder();

    expect(res.status).toBe(200);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
    expect(orderDoc.status).toBe('cancelled');
    expect(orderDoc.paymentStatus).toBe('pending');
  });

  it('blocks cancelling a COD order whose payment was already collected', async () => {
    // Seller marks COD paid on delivery; status also moves to delivered.
    orderDoc = makeOrder({
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      status: 'processing',
      razorpayPaymentId: null,
    });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await cancelOrder();

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot cancel/i);
    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
  });
});

describe('returning a delivered prepaid order', () => {
  it('initiates a refund and preserves the order total', async () => {
    orderDoc = makeOrder({ status: 'delivered' });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await returnOrder();

    expect(res.status).toBe(200);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(refundSpy.mock.calls[0][1].amount).toBe(ORIGINAL_TOTAL * 100);
    expect(orderDoc.status).toBe('returned');
    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
    expect(orderDoc.paymentStatus).toBe('refunded');
    expect(orderDoc.refundAmount).toBe(ORIGINAL_TOTAL);
  });

  it('does not attempt a refund for a delivered COD order', async () => {
    orderDoc = makeOrder({
      status: 'delivered',
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      razorpayPaymentId: null,
    });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await returnOrder();

    expect(res.status).toBe(200);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
  });
});
