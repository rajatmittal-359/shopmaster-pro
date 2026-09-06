/**
 * Who may cancel an order.
 *
 * Only the CUSTOMER could. A seller who found an item out of stock had one
 * button - "cancel shipment" - which calls off the courier and leaves the order
 * paid for and undeliverable, forever. An admin had two read endpoints and no
 * way to act at all.
 *
 * Every marketplace lets all three cancel, for reasons that are not
 * interchangeable: a customer changed their mind, a seller cannot supply, the
 * platform stepped in. These tests hold the parts where getting it wrong costs
 * money.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const { cancelOrderFor } = require('../utils/cancelOrder');
const inventory = require('../controllers/inventoryController');
const refunds = require('../utils/refund');

const SELLER_A = new mongoose.Types.ObjectId();
const SELLER_B = new mongoose.Types.ObjectId();

let refundCalls;
let originalApply;
let originalRefund;

/** An order with two sellers in it, paid online. */
const buildOrder = (over = {}) => {
  const order = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: 'SMP-TEST-CANCEL',
    status: 'pending',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    razorpayPaymentId: 'pay_TEST123',
    totalAmount: 1500,
    items: [
      { sellerId: SELLER_A, price: 500, quantity: 2, status: 'active', productId: new mongoose.Types.ObjectId() },
      { sellerId: SELLER_B, price: 500, quantity: 1, status: 'active', productId: new mongoose.Types.ObjectId() },
    ],
    fulfilments: [
      { sellerId: SELLER_A, status: 'pending' },
      { sellerId: SELLER_B, status: 'pending' },
    ],
    save: vi.fn(async function () { return this; }),
    ...over,
  };
  return order;
};

beforeEach(() => {
  refundCalls = [];
  originalApply = inventory.applyInventoryChange;
  inventory.applyInventoryChange = vi.fn(async () => ({}));

  // The gateway is a module boundary now, so it stands in like any other.
  originalRefund = refunds.refundPayment;
  refunds.refundPayment = vi.fn(async (paymentId, amount) => {
    refundCalls.push({ paymentId, amount });
    return { id: 'rfnd_TEST' };
  });
});

afterEach(() => {
  inventory.applyInventoryChange = originalApply;
  refunds.refundPayment = originalRefund;
  vi.restoreAllMocks();
});

describe('a seller cancelling their own lines', () => {
  it('refunds only their share, not the whole basket', async () => {
    const order = buildOrder();

    const res = await cancelOrderFor(order, {
      by: 'seller',
      actorId: SELLER_A,
      reason: 'out of stock',
      sellerId: SELLER_A,
    });

    expect(res.ok).toBe(true);
    // 2 x 500 rupees, NOT the 1500 total - the other seller is still delivering.
    expect(refundCalls).toHaveLength(1);
    expect(refundCalls[0].amount).toBe(1000);
  });

  it('leaves the other seller alone', async () => {
    const order = buildOrder();

    await cancelOrderFor(order, {
      by: 'seller', actorId: SELLER_A, reason: 'out of stock', sellerId: SELLER_A,
    });

    const byStatus = Object.fromEntries(
      order.fulfilments.map((f) => [String(f.sellerId), f.status])
    );
    expect(byStatus[String(SELLER_A)]).toBe('cancelled');
    expect(byStatus[String(SELLER_B)]).toBe('pending');

    expect(order.items[0].status).toBe('cancelled');
    expect(order.items[1].status).toBe('active');
  });

  /**
   * A partial cancel must not settle the payment: the rest of the basket is
   * still paid for and still coming.
   */
  it('does not mark the whole order refunded', async () => {
    const order = buildOrder();

    await cancelOrderFor(order, {
      by: 'seller', actorId: SELLER_A, reason: 'out of stock', sellerId: SELLER_A,
    });

    expect(order.paymentStatus).toBe('paid');
  });

  it('records who cancelled and why', async () => {
    const order = buildOrder();

    await cancelOrderFor(order, {
      by: 'seller', actorId: SELLER_A, reason: 'stock damaged in storage', sellerId: SELLER_A,
    });

    // A seller who keeps cancelling is a problem the platform must be able to
    // see; without this the order records only THAT it was cancelled.
    expect(order.cancelledBy).toBe('seller');
    expect(order.cancellationReason).toBe('stock damaged in storage');
    expect(order.cancelledAt).toBeInstanceOf(Date);
  });
});

describe('an admin cancelling', () => {
  it('takes the whole order and refunds all of it', async () => {
    const order = buildOrder();

    const res = await cancelOrderFor(order, {
      by: 'admin', actorId: new mongoose.Types.ObjectId(), reason: 'seller unreachable',
    });

    expect(res.ok).toBe(true);
    expect(refundCalls[0].amount).toBe(1500);
    expect(order.fulfilments.every((f) => f.status === 'cancelled')).toBe(true);
    expect(order.paymentStatus).toBe('refunded');
    expect(order.cancelledBy).toBe('admin');
  });
});

describe('what cancelling refuses to do', () => {
  it('will not touch a shipped order', async () => {
    const order = buildOrder({ status: 'shipped' });

    const res = await cancelOrderFor(order, { by: 'admin', actorId: SELLER_A, reason: 'x' });

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/cannot be cancelled/i);
    expect(refundCalls).toHaveLength(0);
  });

  it('will not cancel a COD order whose cash was collected', async () => {
    const order = buildOrder({ paymentMethod: 'cod', paymentStatus: 'paid' });

    const res = await cancelOrderFor(order, { by: 'admin', actorId: SELLER_A, reason: 'x' });

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/return instead/i);
  });

  /**
   * The order of operations is the whole point: refund first, and if it fails
   * change nothing. Cancelling first would leave an order marked cancelled
   * while the customer's money is still gone.
   */
  it('changes NOTHING when the refund fails', async () => {
    const order = buildOrder();
    refunds.refundPayment = vi.fn(async () => {
      throw new Error('gateway down');
    });

    const res = await cancelOrderFor(order, { by: 'admin', actorId: SELLER_A, reason: 'x' });

    expect(res.ok).toBe(false);
    expect(order.status).toBe('pending');
    expect(order.items.every((i) => i.status === 'active')).toBe(true);
    expect(order.fulfilments.every((f) => f.status === 'pending')).toBe(true);
    expect(order.save).not.toHaveBeenCalled();
  });

  it('refuses a paid order with no payment reference rather than guessing', async () => {
    const order = buildOrder({ razorpayPaymentId: null });

    const res = await cancelOrderFor(order, { by: 'admin', actorId: SELLER_A, reason: 'x' });

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/no payment reference/i);
    expect(order.save).not.toHaveBeenCalled();
  });
});
