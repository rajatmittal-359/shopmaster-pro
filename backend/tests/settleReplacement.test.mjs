/**
 * Exchanges: when the customer wants the item again, not the money.
 *
 * WHY THIS IS ITS OWN RISK
 *   A return and an exchange arrive through the same door and settle in
 *   opposite currencies. Confuse them in either direction and it is quiet and
 *   expensive:
 *
 *     refund an exchange  - the customer has been paid AND is owed a parcel
 *     exchange a refund   - the customer is posted goods they wanted money for
 *     pay the seller out early - the exchange is only half done when the faulty
 *                           item comes back; the customer is holding nothing
 *     ship the replacement COD - the customer pays for one necklace twice
 *     restock the faulty item - a broken piece goes back on the shelf, and the
 *                           good one leaving cancels it out so stock never
 *                           notices it lost an item
 *
 * The rules being defended:
 *   1. a replacement return refunds NOTHING and restocks NOTHING
 *   2. the seller's money is held until the replacement is DELIVERED
 *   3. the replacement parcel is never COD
 *   4. stock comes off when it is sent, not when it is owed
 *   5. a shortage refuses before any courier money is spent
 *   6. the replacement takes over the tracking fields; the old parcel is kept
 *   7. a refund return still behaves exactly as it always did
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const refunds = require('../utils/refund');
const inventory = require('../controllers/inventoryController');
const shiprocket = require('../utils/shiprocketBooking');

const { receiveReturn } = require('../utils/settleReturn');
const { dispatchReplacement } = require('../utils/settleReplacement');
const { payoutBlockedReason } = require('../utils/deliveryTruth');
const { applyCourierUpdate } = require('../utils/applyCourierUpdate');

const SELLER = new mongoose.Types.ObjectId();
const PRODUCT = new mongoose.Types.ObjectId();

const originals = {};
let refundSpy;
let stockSpy;
let bookSpy;

const ADDRESS = {
  street: 'C-13, Hari Marg, Devi Nagar',
  city: 'Jaipur',
  state: 'Rajasthan',
  zipCode: '302019',
  phoneNumber: '8769766908',
};

const orderWith = (over = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  orderNumber: 'SMP-TEST-EXC',
  paymentMethod: 'razorpay',
  paymentStatus: 'paid',
  razorpayPaymentId: 'pay_CAPTURED123',
  totalAmount: 2300,
  createdAt: new Date(),
  items: [
    {
      _id: new mongoose.Types.ObjectId(),
      productId: PRODUCT,
      sellerId: SELLER,
      name: 'Kundan necklace',
      price: 2300,
      quantity: 1,
      status: 'active',
    },
  ],
  fulfilments: [
    {
      sellerId: SELLER,
      status: 'delivered',
      deliveredAt: new Date(),
      returnStage: 'requested',
      returnResolution: 'replacement',
      returnReason: 'The clasp is broken',
      awb: 'AWB-ORIGINAL-1',
      courierName: 'Delhivery',
      shipmentId: 'SHIP-1',
      shippingOrderId: 'SR-1',
      trackingUrl: 'https://track/1',
      scans: [{ at: new Date(), activity: 'Delivered', location: 'Jaipur' }],
      previousParcels: [],
      bookingAttempts: 0,
    },
  ],
  save: vi.fn(async function () {
    return this;
  }),
  populate: vi.fn(async function () {
    return this;
  }),
  ...over,
});

beforeEach(() => {
  originals.refundPayment = refunds.refundPayment;
  originals.applyInventoryChange = inventory.applyInventoryChange;
  originals.bookShipment = shiprocket.bookShipment;

  refundSpy = vi.fn(async () => ({ id: 'rfnd_TEST1' }));
  stockSpy = vi.fn(async () => ({}));
  bookSpy = vi.fn(async () => ({
    ok: true,
    provider: 'shiprocket',
    courierName: 'Delhivery',
    trackingNumber: 'AWB-REPLACEMENT-2',
    externalOrderId: 'SR-2',
    shipmentId: 'SHIP-2',
    trackingUrl: 'https://track/2',
  }));

  refunds.refundPayment = refundSpy;
  inventory.applyInventoryChange = stockSpy;
  shiprocket.bookShipment = bookSpy;
});

afterEach(() => {
  refunds.refundPayment = originals.refundPayment;
  inventory.applyInventoryChange = originals.applyInventoryChange;
  shiprocket.bookShipment = originals.bookShipment;
});

describe('receiving an item that is being exchanged', () => {
  it('refunds nothing, because the customer is keeping the purchase', async () => {
    const order = orderWith();

    const result = await receiveReturn(order, {
      by: 'seller',
      actorId: SELLER,
      sellerId: SELLER,
    });

    expect(result.ok).toBe(true);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(order.paymentStatus).toBe('paid');
  });

  it('does not put the faulty item back on the shelf', async () => {
    const order = orderWith();

    await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(stockSpy).not.toHaveBeenCalled();
  });

  it('marks a replacement due rather than calling the parcel returned', async () => {
    const order = orderWith();

    await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    const f = order.fulfilments[0];
    expect(f.returnStage).toBe('received');
    expect(f.replacementStage).toBe('due');
    // Not 'returned': the sale stands and the seller owes a parcel.
    expect(f.status).toBe('processing');
  });

  it('still refunds when the customer asked for their money', async () => {
    const order = orderWith();
    order.fulfilments[0].returnResolution = 'refund';

    await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(stockSpy).toHaveBeenCalledTimes(1);
    expect(order.fulfilments[0].status).toBe('returned');
    expect(order.fulfilments[0].replacementStage).toBeFalsy();
  });

  it('treats a return opened before exchanges existed as a refund', async () => {
    const order = orderWith();
    // Older orders carry no resolution at all. Those customers were promised
    // their money, so a missing value must never be read as an exchange.
    order.fulfilments[0].returnResolution = undefined;

    await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(refundSpy).toHaveBeenCalledTimes(1);
  });
});

describe("the seller's money during an exchange", () => {
  it('is held while a replacement is owed but not sent', () => {
    const reason = payoutBlockedReason({
      status: 'processing',
      returnStage: 'received',
      replacementStage: 'due',
    });
    expect(reason).toMatch(/not been sent/i);
  });

  it('is still held while the replacement is in transit', () => {
    const reason = payoutBlockedReason({
      status: 'shipped',
      returnStage: 'received',
      replacementStage: 'shipped',
    });
    expect(reason).toMatch(/on its way/i);
  });

  it('is released once the replacement has been delivered', () => {
    const reason = payoutBlockedReason({
      status: 'delivered',
      returnStage: 'received',
      replacementStage: 'delivered',
      deliveredAt: new Date(),
      deliveryConfirmedBy: 'courier',
    });
    expect(reason).toBeNull();
  });
});

describe('sending the replacement', () => {
  const readyOrder = () => {
    const order = orderWith();
    const f = order.fulfilments[0];
    f.returnStage = 'received';
    f.replacementStage = 'due';
    f.status = 'processing';
    return order;
  };

  it('books a parcel that is never collected for again', async () => {
    const order = readyOrder();
    order.paymentMethod = 'cod';

    const result = await dispatchReplacement(order, ADDRESS, {
      sellerId: SELLER,
      actorId: SELLER,
    });

    expect(result.ok).toBe(true);
    // A COD replacement would have a rider ask for the money a second time.
    expect(bookSpy.mock.calls[0][4]).toMatchObject({ prepaid: true });
  });

  it('carries its own Shiprocket reference so it cannot collide with the original', async () => {
    const order = readyOrder();

    await dispatchReplacement(order, ADDRESS, { sellerId: SELLER, actorId: SELLER });

    expect(bookSpy.mock.calls[0][4]).toMatchObject({ reference: 'EX' });
  });

  it('declares only the item actually in the box', async () => {
    const order = readyOrder();

    await dispatchReplacement(order, ADDRESS, { sellerId: SELLER, actorId: SELLER });

    const items = bookSpy.mock.calls[0][4].items;
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Kundan necklace');
  });

  it('takes a unit off the shelf, because one is genuinely leaving', async () => {
    const order = readyOrder();

    await dispatchReplacement(order, ADDRESS, { sellerId: SELLER, actorId: SELLER });

    expect(stockSpy).toHaveBeenCalledTimes(1);
    expect(stockSpy.mock.calls[0][0]).toMatchObject({ type: 'sale', quantity: 1 });
  });

  it('refuses before spending courier money when there is nothing left to send', async () => {
    const order = readyOrder();
    inventory.applyInventoryChange = vi.fn(async () => {
      throw new Error('Insufficient stock');
    });

    const result = await dispatchReplacement(order, ADDRESS, {
      sellerId: SELLER,
      actorId: SELLER,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/do not have one of these left/i);
    expect(bookSpy).not.toHaveBeenCalled();
  });

  it('puts the unit back when the courier booking fails', async () => {
    const order = readyOrder();
    shiprocket.bookShipment = vi.fn(async () => ({
      ok: false,
      reason: 'Your Shiprocket wallet is empty',
    }));

    const result = await dispatchReplacement(order, ADDRESS, {
      sellerId: SELLER,
      actorId: SELLER,
    });

    expect(result.ok).toBe(false);
    // Off the shelf, then straight back on: nothing left the shop.
    expect(stockSpy).toHaveBeenCalledTimes(2);
    expect(stockSpy.mock.calls[1][0]).toMatchObject({ type: 'restock', quantity: 1 });
    expect(order.fulfilments[0].bookingFailedReason).toMatch(/wallet/i);
  });

  it('hands the tracking fields to the new parcel and keeps the old one', async () => {
    const order = readyOrder();

    await dispatchReplacement(order, ADDRESS, { sellerId: SELLER, actorId: SELLER });

    const f = order.fulfilments[0];
    // Everything that watches a parcel move looks at `awb`.
    expect(f.awb).toBe('AWB-REPLACEMENT-2');
    expect(f.status).toBe('shipped');
    expect(f.replacementStage).toBe('shipped');

    // The journey it replaces is still readable for a dispute.
    expect(f.previousParcels).toHaveLength(1);
    expect(f.previousParcels[0].awb).toBe('AWB-ORIGINAL-1');
    expect(f.previousParcels[0].replacedBecause).toMatch(/clasp/i);
  });

  it("clears the first parcel's delivery so the return window cannot run early", async () => {
    const order = readyOrder();

    await dispatchReplacement(order, ADDRESS, { sellerId: SELLER, actorId: SELLER });

    const f = order.fulfilments[0];
    // Left in place, the customer's seven days would be counting down on an
    // item they had already posted back.
    expect(f.deliveredAt).toBeNull();
    expect(f.scans).toHaveLength(0);
  });

  it('refuses when no replacement is owed', async () => {
    const order = orderWith();

    const result = await dispatchReplacement(order, ADDRESS, {
      sellerId: SELLER,
      actorId: SELLER,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no replacement is owed/i);
    expect(bookSpy).not.toHaveBeenCalled();
  });
});

describe('the courier closing the exchange', () => {
  it('finishes it only on the delivery scan', () => {
    const order = orderWith();
    const f = order.fulfilments[0];
    f.status = 'shipped';
    f.returnStage = 'received';
    f.replacementStage = 'shipped';
    f.awb = 'AWB-REPLACEMENT-2';
    f.deliveredAt = null;

    applyCourierUpdate(order, f, { status: 'Delivered', statusId: 7, at: new Date() });

    expect(f.replacementStage).toBe('delivered');
    expect(f.replacementDeliveredAt).toBeTruthy();
    expect(payoutBlockedReason(f)).toBeNull();
  });

  it('does not collect COD a second time on the replacement', () => {
    const order = orderWith();
    order.paymentMethod = 'cod';
    // The cash was handed over at the FIRST delivery.
    order.paymentStatus = 'paid';

    const f = order.fulfilments[0];
    f.status = 'shipped';
    f.replacementStage = 'shipped';

    applyCourierUpdate(order, f, { status: 'Delivered', statusId: 7, at: new Date() });

    expect(order.paymentStatus).toBe('paid');
  });
});
