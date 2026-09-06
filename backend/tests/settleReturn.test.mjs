/**
 * Closing out a return: when the money actually moves.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   A return refunded the customer the moment they asked for one, and counted
 *   the goods back in as sellable stock at the same moment. Nothing had been
 *   collected and nobody had looked at the item, so a customer could keep both
 *   a RS 2,300 necklace and the RS 2,300 - while the shop's stock figure
 *   insisted the necklace was on the shelf and sold it to somebody else.
 *
 *   Flipkart's policy is the model: "the refund will be processed once the
 *   returned product has been received by the seller."
 *
 * The rules being defended:
 *   1. the refund is raised when the goods are BACK, not when they are asked for
 *   2. stock comes back at that same moment, and never before
 *   3. refund first - goods marked back with no refund raised is unrecoverable
 *   4. a seller settling a shared basket refunds only their own lines
 *   5. a refusal needs a reason and moves no money
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const refunds = require('../utils/refund');
const inventory = require('../controllers/inventoryController');
const { receiveReturn, rejectReturn } = require('../utils/settleReturn');

const SELLER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
const ADMIN = new mongoose.Types.ObjectId();

const originals = {};
let refundSpy;
let stockSpy;

const line = (sellerId, price) => ({
  _id: new mongoose.Types.ObjectId(),
  productId: new mongoose.Types.ObjectId(),
  sellerId,
  name: 'Necklace',
  price,
  quantity: 1,
  status: 'active',
});

const orderWith = (over = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  orderNumber: 'SMP-TEST-RET',
  paymentMethod: 'razorpay',
  paymentStatus: 'paid',
  razorpayPaymentId: 'pay_CAPTURED123',
  totalAmount: 2300,
  refundId: null,
  refundStatus: null,
  refundAmount: null,
  refundedAt: null,
  items: [line(SELLER, 2300)],
  fulfilments: [
    {
      sellerId: SELLER,
      status: 'delivered',
      deliveredAt: new Date(),
      returnStage: 'requested',
      returnedAt: null,
      returnNote: null,
    },
  ],
  save: vi.fn(async function () {
    return this;
  }),
  ...over,
});

beforeEach(() => {
  originals.refundPayment = refunds.refundPayment;
  originals.applyInventoryChange = inventory.applyInventoryChange;

  refundSpy = vi.fn(async () => ({ id: 'rfnd_TEST1' }));
  stockSpy = vi.fn(async () => ({}));

  refunds.refundPayment = refundSpy;
  inventory.applyInventoryChange = stockSpy;
});

afterEach(() => {
  refunds.refundPayment = originals.refundPayment;
  inventory.applyInventoryChange = originals.applyInventoryChange;
});

describe('the goods coming back', () => {
  it('is what raises the refund', async () => {
    const order = orderWith();

    const result = await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(result.ok).toBe(true);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    // Rupees, not paise: utils/refund.js is the only place that converts.
    expect(refundSpy.mock.calls[0][1]).toBe(2300);
    expect(order.paymentStatus).toBe('refunded');
    expect(order.refundAmount).toBe(2300);
  });

  it('is what puts the stock back, because now it really is back', async () => {
    const order = orderWith();

    await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(stockSpy).toHaveBeenCalledTimes(1);
    expect(stockSpy.mock.calls[0][0]).toMatchObject({ type: 'return', quantity: 1 });
  });

  it('marks the parcel returned and closes the return', async () => {
    const order = orderWith();

    await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(order.fulfilments[0].status).toBe('returned');
    expect(order.fulfilments[0].returnStage).toBe('received');
    expect(order.fulfilments[0].returnedAt).toBeInstanceOf(Date);
  });

  /**
   * Refund first, always. Goods marked back with no refund raised is the one
   * state with nothing left to retry from: the order says settled and the
   * customer's money is still gone.
   */
  it('changes nothing when the refund fails', async () => {
    refunds.refundPayment = vi.fn(async () => {
      throw new Error('gateway down');
    });
    const order = orderWith();

    const result = await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(result.ok).toBe(false);
    expect(order.fulfilments[0].status).toBe('delivered');
    expect(order.fulfilments[0].returnStage).toBe('requested');
    expect(stockSpy).not.toHaveBeenCalled();
    expect(order.save).not.toHaveBeenCalled();
  });

  it('refuses when nothing was ever asked for', async () => {
    const order = orderWith();
    order.fulfilments[0].returnStage = null;

    const result = await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(result.ok).toBe(false);
    expect(refundSpy).not.toHaveBeenCalled();
  });

  /**
   * In a shared basket the other seller's goods are still with the customer.
   * Refunding order.totalAmount here would hand back their money too.
   */
  it("refunds only this seller's lines in a shared basket", async () => {
    const order = orderWith({
      totalAmount: 3300,
      items: [line(SELLER, 2300), line(OTHER, 1000)],
      fulfilments: [
        { sellerId: SELLER, status: 'delivered', deliveredAt: new Date(), returnStage: 'requested' },
        { sellerId: OTHER, status: 'delivered', deliveredAt: new Date(), returnStage: null },
      ],
    });

    await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(refundSpy.mock.calls[0][1]).toBe(2300);
    // A partial refund does not settle the whole order's payment.
    expect(order.paymentStatus).toBe('paid');
    expect(order.fulfilments[1].status).toBe('delivered');
  });

  it('does not call the gateway for a COD order', async () => {
    const order = orderWith({ paymentMethod: 'cod', razorpayPaymentId: null });

    const result = await receiveReturn(order, { by: 'seller', actorId: SELLER, sellerId: SELLER });

    expect(result.ok).toBe(true);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(order.fulfilments[0].status).toBe('returned');
  });

  it('refuses a paid order with no payment reference rather than guessing', async () => {
    const order = orderWith({ razorpayPaymentId: null });

    const result = await receiveReturn(order, { by: 'admin', actorId: ADMIN });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(order.fulfilments[0].status).toBe('delivered');
  });
});

describe('a seller refusing a return', () => {
  /**
   * An empty box, or a different item. A seller has to be able to say so -
   * otherwise fixing the customer's side of this just moves the fraud.
   */
  it('moves no money and no stock, and the sale stands', async () => {
    const order = orderWith();

    const result = await rejectReturn(order, {
      actorId: SELLER,
      sellerId: SELLER,
      reason: 'The box came back empty',
    });

    expect(result.ok).toBe(true);
    expect(refundSpy).not.toHaveBeenCalled();
    expect(stockSpy).not.toHaveBeenCalled();
    expect(order.fulfilments[0].status).toBe('delivered');
    expect(order.fulfilments[0].returnStage).toBe('rejected');
  });

  /**
   * A seller who refuses everything is a problem the platform has to be able to
   * see, and the customer needs something to dispute.
   */
  it('insists on a reason', async () => {
    const order = orderWith();

    const result = await rejectReturn(order, { actorId: SELLER, sellerId: SELLER, reason: '' });

    expect(result.ok).toBe(false);
    expect(order.fulfilments[0].returnStage).toBe('requested');
  });

  it('keeps the reason where the customer can read it', async () => {
    const order = orderWith();

    await rejectReturn(order, {
      actorId: SELLER,
      sellerId: SELLER,
      reason: 'The box came back empty',
    });

    expect(order.fulfilments[0].returnNote).toMatch(/empty/i);
  });
});

/**
 * An admin deciding a dispute for the customer.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   adminController set returnStage to 'received' on the disputed parcels and
 *   THEN called receiveReturn - which only picks up returns still sitting at
 *   'requested' or 'picked'. So it found nothing, every single time, and the
 *   400 it came back with was swallowed because only a 500 was surfaced.
 *
 *   Reproduced on 7 Sep 2026 before the fix:
 *     receiveReturn -> {ok:false, status:400, "There is no open return here"}
 *     refunds raised: 0
 *
 *   The admin ruled for the customer, the parcel was marked returned, and not
 *   a rupee moved. Nothing on any screen said so.
 *
 * The rules being defended:
 *   1. an admin can settle a parcel whatever stage its return is at
 *   2. stock only goes back when the goods are actually back - and the admin
 *      says which, because the record cannot tell the two disputes apart
 *   3. a settlement that moved no money says so instead of claiming success
 */
describe('an admin settling a disputed parcel', () => {
  const disputed = (over = {}) =>
    orderWith({
      fulfilments: [
        {
          sellerId: SELLER,
          status: 'delivered',
          deliveredAt: new Date(),
          // A DELIVERY dispute: no return was ever opened on it.
          returnStage: null,
          disputeStatus: 'open',
          returnedAt: null,
          returnNote: null,
          ...over,
        },
      ],
    });

  it('refunds a parcel that has no open return, which is what silently failed before', async () => {
    const order = disputed();

    const result = await receiveReturn(order, {
      by: 'admin',
      actorId: ADMIN,
      parcels: order.fulfilments,
      restock: false,
    });

    expect(result.ok).toBe(true);
    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect(refundSpy.mock.calls[0][1]).toBe(2300);
    expect(order.paymentStatus).toBe('refunded');
  });

  it('settles one the seller had refused, too', async () => {
    const order = disputed({ returnStage: 'rejected', returnNote: 'Box was empty' });

    const result = await receiveReturn(order, {
      by: 'admin',
      actorId: ADMIN,
      parcels: order.fulfilments,
      restock: true,
    });

    expect(result.ok).toBe(true);
    expect(refundSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves stock alone when the parcel was simply lost', async () => {
    const order = disputed();

    await receiveReturn(order, {
      by: 'admin',
      actorId: ADMIN,
      parcels: order.fulfilments,
      restock: false,
    });

    // Counting a lost parcel back in sells an item that is not on the shelf,
    // and disappoints a second customer to tidy up after the first.
    expect(stockSpy).not.toHaveBeenCalled();
  });

  it('puts stock back when the seller does have the item', async () => {
    const order = disputed({ returnStage: 'rejected' });

    await receiveReturn(order, {
      by: 'admin',
      actorId: ADMIN,
      parcels: order.fulfilments,
      restock: true,
    });

    expect(stockSpy).toHaveBeenCalledTimes(1);
    expect(stockSpy.mock.calls[0][0]).toMatchObject({ type: 'return' });
  });
});

describe('a return on an order that was paid in cash', () => {
  it('says the money still has to be sent, instead of claiming it was', async () => {
    const order = orderWith({
      paymentMethod: 'cod',
      paymentStatus: 'paid',
      razorpayPaymentId: null,
    });

    const result = await receiveReturn(order, {
      by: 'seller',
      actorId: SELLER,
      sellerId: SELLER,
    });

    // There is no card to send it back down. The returns page promises a bank
    // transfer, and somebody has to make it - saying "the refund has been
    // raised" told a seller the matter was closed while the customer was still
    // owed every rupee.
    expect(result.ok).toBe(true);
    expect(result.refundRaised).toBe(false);
    expect(result.message).toMatch(/by hand|bank account/i);
    expect(result.message).toContain('2300');
    expect(refundSpy).not.toHaveBeenCalled();
  });
});
