import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery, fakeOrderDoc } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
// The window the controller enforces, read from its single source of truth.
const { RETURN_WINDOW_DAYS } = require('../utils/payout');
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
// The gateway moved behind utils/refund.js so it can be stood in front of
// without reaching into the module cache for a third-party package.
const refunds = require('../utils/refund');

const SELLER_ID = new mongoose.Types.ObjectId();

/**
 * Build an order document in a given payment state.
 *
 * Fulfilments are built from the items the way the model's pre-validate hook
 * does in production, and `fulfilmentFor` is provided because cancel and return
 * both move this seller's part rather than the order's status directly.
 */
const makeOrder = (overrides = {}) => {
  const base = {
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
    items: [
      { productId: PRODUCT_ID, sellerId: SELLER_ID, quantity: 1, price: ORIGINAL_TOTAL, status: 'active' },
    ],
    ...overrides,
  };

  // A delivered order needs a delivery date: the return window is measured
  // from it, and a return is only allowed while that window is open.
  if (base.status === 'delivered' && base.deliveredAt === undefined) {
    base.deliveredAt = new Date();
  }

  const sellerIds = [...new Set(base.items.map((i) => String(i.sellerId)))];
  base.fulfilments = base.fulfilments || sellerIds.map((sellerId) => ({
    sellerId,
    status: base.status,
    deliveredAt: base.status === 'delivered' ? base.deliveredAt : null,
    returnedAt: null,
    returnStage: null,
    returnRequestedAt: null,
    returnReason: null,
    disputeStatus: null,
  }));

  const doc = fakeOrderDoc(base);
  doc.fulfilmentFor = (sellerId) =>
    doc.fulfilments.find((f) => String(f.sellerId) === String(sellerId));
  return doc;
};

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.orderFindOne = Order.findOne;
  originals.productFindById = Product.findById;
  originals.inventoryCreate = InventoryLog.create;
  originals.refundPayment = refunds.refundPayment;

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

  // One module boundary instead of a patched constructor, and it takes rupees:
  // the paise conversion now lives in utils/refund.js, not in every caller.
  refundSpy = vi.fn(async () => ({ id: 'rfnd_TEST123' }));
  refunds.refundPayment = refundSpy;
});

afterEach(() => {
  User.findById = originals.userFindById;
  Order.findOne = originals.orderFindOne;
  Product.findById = originals.productFindById;
  InventoryLog.create = originals.inventoryCreate;
  refunds.refundPayment = originals.refundPayment;
});

const cancelOrder = () =>
  request(app)
    .patch(`/api/customer/orders/${ORDER_ID}/cancel`)
    .set('Authorization', `Bearer ${token()}`)
    .send({});

const returnOrder = (body = { reason: 'The clasp is broken' }) =>
  request(app)
    .post(`/api/customer/orders/${ORDER_ID}/return`)
    .set('Authorization', `Bearer ${token()}`)
    .send(body);

describe('cancelling a paid prepaid order', () => {
  it('actually initiates a refund (the paymentStatus guard now matches the schema)', async () => {
    const res = await cancelOrder();

    expect(res.status).toBe(200);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    // Refund is requested in paise, for the full original value.
    expect(refundSpy.mock.calls[0][0]).toBe('pay_CAPTURED123');
    expect(refundSpy.mock.calls[0][1]).toBe(ORIGINAL_TOTAL);
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
    expect(res.body.message).toMatch(/refund could not be started/i);
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
    expect(res.body.message).toMatch(/cannot be cancelled/i);
    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
  });
});

/**
 * Asking to send something back.
 *
 * THE BUG THESE NOW DEFEND AGAINST
 *   Pressing Return refunded the money on the spot and counted the goods back
 *   in as sellable stock - before anything was collected and without anybody
 *   ever seeing the item. A customer could keep a RS 2,300 necklace and the
 *   RS 2,300, while the shop's own stock figure said the necklace was on the
 *   shelf.
 *
 *   Flipkart's policy is the model: "the refund will be processed once the
 *   returned product has been received by the seller." Asking is a claim.
 *   Receiving it back is the fact, and only facts move money.
 */
describe('asking to return a delivered prepaid order', () => {
  it('refunds nothing yet - the goods have not moved', async () => {
    orderDoc = makeOrder({ status: 'delivered' });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await returnOrder();

    expect(res.status).toBe(200);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(orderDoc.paymentStatus).toBe('paid');
    expect(orderDoc.refundAmount).toBeNull();
    expect(orderDoc.totalAmount).toBe(ORIGINAL_TOTAL);
  });

  /**
   * The parcel is still with the customer. Calling it 'returned' would be the
   * system agreeing with a claim nobody has checked - and it is what let the
   * stock figure count goods that had never come back.
   */
  it("does not mark the parcel returned on a customer's word alone", async () => {
    orderDoc = makeOrder({ status: 'delivered' });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    await returnOrder();

    expect(orderDoc.fulfilments[0].status).toBe('delivered');
    expect(orderDoc.fulfilments[0].returnStage).toBe('requested');
    expect(orderDoc.fulfilments[0].returnReason).toMatch(/clasp/i);
  });

  it('insists on a reason, which is what the seller answers', async () => {
    orderDoc = makeOrder({ status: 'delivered' });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await returnOrder({});

    expect(res.status).toBe(400);
    expect(orderDoc.fulfilments[0].returnStage).toBeNull();
  });

  it('refuses a second request while one is already open', async () => {
    orderDoc = makeOrder({ status: 'delivered' });
    orderDoc.fulfilments[0].returnStage = 'requested';
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await returnOrder();

    expect(res.status).toBe(409);
    expect(refundSpy).not.toHaveBeenCalled();
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

  it('is still allowed on the last day of the return window', async () => {
    orderDoc = makeOrder({
      status: 'delivered',
      deliveredAt: new Date(Date.now() - (RETURN_WINDOW_DAYS - 1) * 86400000),
    });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await returnOrder();

    expect(res.status).toBe(200);
    expect(orderDoc.fulfilments[0].returnStage).toBe('requested');
  });

  it('refuses a return once the window has closed, and refunds nothing', async () => {
    orderDoc = makeOrder({
      status: 'delivered',
      deliveredAt: new Date(Date.now() - (RETURN_WINDOW_DAYS + 23) * 86400000),
    });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    const res = await returnOrder();

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/return window/i);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(orderDoc.status).toBe('delivered');
    expect(orderDoc.paymentStatus).toBe('paid');
  });
});
