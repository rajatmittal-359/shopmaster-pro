/**
 * Seller settlements.
 *
 * The money rules being defended:
 *
 *   1. grossSales = commission + netPayable, always
 *   2. a sale is payable only after delivery AND after the return window
 *   3. a line can be claimed by exactly ONE payout - never paid twice
 *   4. cancelled lines are never paid
 *   5. the platform's own shop is not paid out to itself
 *   6. a failed transfer releases its lines back into the payable pool
 *   7. a payout cannot be marked paid twice
 *
 * Totals are only ever summed from the snapshots already on the order lines;
 * nothing here recalculates commission.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { InMemoryCollection, attach } from './helpers/inMemoryStore.mjs';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const Order = require('../models/Order');
const Seller = require('../models/Seller');
const Payout = require('../models/Payout');
const {
  getPayableSummary,
  createPayoutForSeller,
  markPayoutPaid,
  markPayoutFailed,
  returnWindowFor,
  sellerPayoutStateFor,
  isPayableLine,
  RETURN_WINDOW_DAYS,
} = require('../utils/payout');

const PARTNER = new mongoose.Types.ObjectId();
const HOUSE = new mongoose.Types.ObjectId();
const ADMIN = new mongoose.Types.ObjectId();

const daysAgo = (n) => new Date(Date.now() - n * 86400000);

/** Older than the return window, so it is genuinely settled. */
const SETTLED = daysAgo(RETURN_WINDOW_DAYS + 3);
/** Delivered, but the customer can still send it back. */
const STILL_RETURNABLE = daysAgo(1);

let orders;
let sellers;
let payouts;
let detach;

const line = (sellerId, price, quantity, overrides = {}) => ({
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
  ...overrides,
});

/**
 * An order, with one fulfilment per seller built from its lines - which is what
 * the real model does in its pre-validate hook.
 *
 * `status` and `deliveredAt` overrides apply to every seller's fulfilment, so
 * the single-seller cases below read exactly as they did before. A split order
 * where the sellers are at DIFFERENT stages passes `fulfilments` explicitly.
 */
const order = (items, overrides = {}) => {
  const { status = 'delivered', deliveredAt = SETTLED, fulfilments, ...rest } = overrides;

  const bySeller = new Map();
  items.forEach((i) => bySeller.set(String(i.sellerId), i.sellerId));

  return {
    _id: new mongoose.Types.ObjectId(),
    customerId: new mongoose.Types.ObjectId(),
    items,
    paymentStatus: 'paid',
    status,
    deliveredAt,
    fulfilments:
      fulfilments ||
      [...bySeller.values()].map((sellerId) => ({ sellerId, status, deliveredAt })),
    ...rest,
  };
};

beforeEach(() => {
  orders = new InMemoryCollection([]);
  sellers = new InMemoryCollection([
    {
      _id: new mongoose.Types.ObjectId(),
      userId: PARTNER,
      businessName: 'Iyer Silks',
      isPlatformOwned: false,
      // A payout needs somewhere to send the money.
      bankDetails: {
        accountNumber: '0000TESTACCOUNT0',
        ifscCode: 'HDFC0001234',
        accountHolderName: 'Meera Iyer',
      },
    },
    { _id: new mongoose.Types.ObjectId(), userId: HOUSE, businessName: 'Charming Jewels', isPlatformOwned: true },
  ]);
  payouts = new InMemoryCollection([]);

  const d1 = attach(Order, orders, ['find', 'findOne', 'updateMany', 'updateOne', 'create']);
  const d2 = attach(Seller, sellers, ['find', 'findOne']);
  const d3 = attach(Payout, payouts, ['find', 'findById', 'updateOne', 'deleteOne']);

  // Payout.create must run the model's pre-validate hook (it builds the
  // readable payout number), so it is wrapped rather than replaced.
  const originalCreate = Payout.create;
  Payout.create = vi.fn(async (docs) => {
    const raw = Array.isArray(docs) ? docs[0] : docs;
    const doc = new Payout(raw);
    await doc.validate();
    const stored = doc.toObject();
    await payouts.create(stored);
    // Give the caller something that behaves like a document.
    doc.save = async () => {
      const row = payouts.raw(doc._id);
      Object.assign(row, doc.toObject());
      return doc;
    };
    return [doc];
  });

  detach = () => {
    d1();
    d2();
    d3();
    Payout.create = originalCreate;
  };
});

afterEach(() => detach());

// -------------------------------------------------------------- what is owed
describe('what a seller is owed', () => {
  it('counts a delivered sale once its return window has closed', async () => {
    await orders.create(order([line(PARTNER, 1000, 2)]));

    const [row] = await getPayableSummary();

    expect(row.itemCount).toBe(1);
    expect(row.grossSales).toBe(2000);
    expect(row.commission).toBe(160);
    expect(row.netPayable).toBe(1840);
  });

  it('always reconciles: gross = commission + net', async () => {
    await orders.create(order([line(PARTNER, 333, 7), line(PARTNER, 1499, 1)]));

    const [row] = await getPayableSummary();

    expect(Math.round((row.commission + row.netPayable) * 100) / 100).toBe(row.grossSales);
  });

  it('ignores a sale still inside the return window', async () => {
    await orders.create(order([line(PARTNER, 1000, 1)], { deliveredAt: STILL_RETURNABLE }));

    // Paying before the customer can no longer return it means clawing the
    // money back off the next payout.
    expect(await getPayableSummary()).toHaveLength(0);
  });

  it('ignores an order that has not been delivered', async () => {
    await orders.create(order([line(PARTNER, 1000, 1)], { status: 'shipped', deliveredAt: null }));
    expect(await getPayableSummary()).toHaveLength(0);
  });

  it('ignores an unpaid order', async () => {
    await orders.create(order([line(PARTNER, 1000, 1)], { paymentStatus: 'pending' }));
    expect(await getPayableSummary()).toHaveLength(0);
  });

  it('never pays a cancelled line', async () => {
    await orders.create(
      order([line(PARTNER, 1000, 1, { status: 'cancelled' }), line(PARTNER, 500, 1)])
    );

    const [row] = await getPayableSummary();

    expect(row.itemCount).toBe(1);
    expect(row.grossSales).toBe(500);
  });

  it('excludes the platform\'s own shop', async () => {
    await orders.create(order([line(HOUSE, 5000, 1)]));

    // Its takings are already in the platform's account; there is nobody to
    // transfer them to.
    expect(await getPayableSummary()).toHaveLength(0);
  });

  it('splits a mixed order between its sellers', async () => {
    await orders.create(order([line(PARTNER, 1000, 1), line(HOUSE, 5000, 1)]));

    const rows = await getPayableSummary();

    expect(rows).toHaveLength(1);
    expect(String(rows[0].sellerId)).toBe(String(PARTNER));
    expect(rows[0].grossSales).toBe(1000);
  });
});

// ------------------------------------------------------------- creating one
describe('creating a payout', () => {
  it('records totals matching what was owed', async () => {
    await orders.create(order([line(PARTNER, 1000, 2)]));

    const result = await createPayoutForSeller(PARTNER, ADMIN);

    expect(result.ok).toBe(true);
    expect(result.payout.itemCount).toBe(1);
    expect(result.payout.grossSales).toBe(2000);
    expect(result.payout.netPayable).toBe(1840);
    expect(result.payout.status).toBe('pending');
    expect(result.payout.payoutNumber).toMatch(/^PO-\d{6}-[0-9A-F]{6}$/);
  });

  it('stamps its id onto the lines it claimed', async () => {
    const o = order([line(PARTNER, 1000, 1)]);
    await orders.create(o);

    const result = await createPayoutForSeller(PARTNER, ADMIN);

    const stored = orders.raw(o._id);
    expect(String(stored.items[0].payoutId)).toBe(String(result.payout._id));
  });

  it('leaves nothing payable afterwards', async () => {
    await orders.create(order([line(PARTNER, 1000, 1)]));
    await createPayoutForSeller(PARTNER, ADMIN);

    expect(await getPayableSummary()).toHaveLength(0);
  });

  it('refuses when there is nothing to pay', async () => {
    const result = await createPayoutForSeller(PARTNER, ADMIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/nothing is payable/i);
  });

  it('refuses to pay the platform\'s own shop', async () => {
    await orders.create(order([line(HOUSE, 5000, 1)]));

    const result = await createPayoutForSeller(HOUSE, ADMIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/platform/i);
  });

  it('refuses a seller who has given no bank details', async () => {
    // The account number field existed on the model from the start but had no
    // endpoint writing to it, so every seller was in this state. Creating a
    // payout nobody can settle just strands the sales.
    const row = sellers.docs.find((x) => String(x.userId) === String(PARTNER));
    delete row.bankDetails;
    await orders.create(order([line(PARTNER, 1000, 1)]));

    const result = await createPayoutForSeller(PARTNER, ADMIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/bank details/i);
    // The sales stay payable rather than being claimed by a dead payout.
    expect(await getPayableSummary()).toHaveLength(1);
  });

  it('refuses when only part of the bank details are present', async () => {
    const row = sellers.docs.find((x) => String(x.userId) === String(PARTNER));
    row.bankDetails = { accountNumber: '0000TESTACCOUNT0' }; // no IFSC, no holder
    await orders.create(order([line(PARTNER, 1000, 1)]));

    expect((await createPayoutForSeller(PARTNER, ADMIN)).ok).toBe(false);
  });

  it('does not touch another seller\'s lines', async () => {
    const o = order([line(PARTNER, 1000, 1), line(HOUSE, 5000, 1)]);
    await orders.create(o);

    await createPayoutForSeller(PARTNER, ADMIN);

    const stored = orders.raw(o._id);
    expect(stored.items[0].payoutId).not.toBeNull();
    expect(stored.items[1].payoutId).toBeNull();
  });
});

// ------------------------------------------------------- no double payment
describe('a sale can only be paid once', () => {
  it('a second payout run finds nothing left', async () => {
    await orders.create(order([line(PARTNER, 1000, 1)]));

    const first = await createPayoutForSeller(PARTNER, ADMIN);
    const second = await createPayoutForSeller(PARTNER, ADMIN);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });

  it('two concurrent runs never pay the same money twice', async () => {
    await orders.create(order([line(PARTNER, 1000, 1)]));
    await orders.create(order([line(PARTNER, 2000, 1)]));

    const results = await Promise.all([
      createPayoutForSeller(PARTNER, ADMIN),
      createPayoutForSeller(PARTNER, ADMIN),
    ]);

    const paid = results
      .filter((r) => r.ok)
      .reduce((n, r) => n + r.payout.netPayable, 0);

    // Whether the lines end up in one payout or split across two, the total
    // handed over must equal what was owed - never double.
    expect(Math.round(paid * 100) / 100).toBe(2760);
  });

  it('does not re-claim a paid line sitting beside an unpaid one', async () => {
    // The order-level filter cannot protect this case: the order still matches
    // because its OTHER line is unpaid. Only the per-line condition stops the
    // already-settled line being stamped again and paid a second time.
    const alreadyPaid = new mongoose.Types.ObjectId();
    const o = order([
      line(PARTNER, 1000, 1, { payoutId: alreadyPaid }),
      line(PARTNER, 500, 1),
    ]);
    await orders.create(o);

    const result = await createPayoutForSeller(PARTNER, ADMIN);

    expect(result.ok).toBe(true);
    // Only the unpaid line may be settled.
    expect(result.payout.itemCount).toBe(1);
    expect(result.payout.grossSales).toBe(500);

    const stored = orders.raw(o._id);
    expect(String(stored.items[0].payoutId)).toBe(String(alreadyPaid));
    expect(String(stored.items[1].payoutId)).toBe(String(result.payout._id));
  });

  it('never pays more in total than was ever owed', async () => {
    const alreadyPaid = new mongoose.Types.ObjectId();
    await orders.create(
      order([line(PARTNER, 1000, 1, { payoutId: alreadyPaid }), line(PARTNER, 500, 1)])
    );

    const result = await createPayoutForSeller(PARTNER, ADMIN);

    // 500 * 0.92 = 460. Re-claiming the settled line would make this 1380.
    expect(result.payout.netPayable).toBe(460);
  });

  it('a line already claimed is never re-claimed', async () => {
    const o = order([line(PARTNER, 1000, 1)]);
    await orders.create(o);

    const first = await createPayoutForSeller(PARTNER, ADMIN);
    await createPayoutForSeller(PARTNER, ADMIN);

    const stored = orders.raw(o._id);
    expect(String(stored.items[0].payoutId)).toBe(String(first.payout._id));
  });
});

// --------------------------------------------------------------- settling
describe('settling a payout', () => {
  const makeOne = async () => {
    await orders.create(order([line(PARTNER, 1000, 1)]));
    const { payout } = await createPayoutForSeller(PARTNER, ADMIN);
    return payout;
  };

  it('records the transfer with its reference', async () => {
    const payout = await makeOne();

    const result = await markPayoutPaid(payout._id, { reference: 'UTR123456', adminId: ADMIN });

    expect(result.ok).toBe(true);
    expect(payouts.raw(payout._id).status).toBe('paid');
    expect(payouts.raw(payout._id).reference).toBe('UTR123456');
  });

  it('cannot be marked paid twice', async () => {
    const payout = await makeOne();

    const first = await markPayoutPaid(payout._id, { reference: 'UTR1', adminId: ADMIN });
    const second = await markPayoutPaid(payout._id, { reference: 'UTR2', adminId: ADMIN });

    expect(first.ok).toBe(true);
    // Two admins clicking at once must produce one settlement, not two.
    expect(second.ok).toBe(false);
    expect(payouts.raw(payout._id).reference).toBe('UTR1');
  });

  it('a failed transfer puts the money back in the payable pool', async () => {
    const payout = await makeOne();
    expect(await getPayableSummary()).toHaveLength(0);

    const result = await markPayoutFailed(payout._id, { reason: 'Bad IFSC', adminId: ADMIN });

    expect(result.ok).toBe(true);
    // Otherwise the seller's money is stranded on a payout that never paid.
    const [again] = await getPayableSummary();
    expect(again.netPayable).toBe(920);
  });

  it('a failed payout cannot then be marked paid', async () => {
    const payout = await makeOne();
    await markPayoutFailed(payout._id, { reason: 'Bad IFSC', adminId: ADMIN });

    const result = await markPayoutPaid(payout._id, { reference: 'UTR9', adminId: ADMIN });

    expect(result.ok).toBe(false);
  });
});

/**
 * The customer-facing half of the same window.
 *
 * The order page decides whether to offer a Return from this, and returnOrder
 * enforces it from this. When they were separate the button appeared on orders
 * the API would refuse, and the customer saw only an error toast.
 */
describe('whether a customer can still return an order', () => {
  it('says yes inside the window', () => {
    const r = returnWindowFor({ status: 'delivered', deliveredAt: daysAgo(1) });
    expect(r.canReturn).toBe(true);
    expect(r.returnWindowDays).toBe(RETURN_WINDOW_DAYS);
  });

  it('says no once the window has closed', () => {
    const r = returnWindowFor({
      status: 'delivered',
      deliveredAt: daysAgo(RETURN_WINDOW_DAYS + 1),
    });
    expect(r.canReturn).toBe(false);
    expect(r.returnWindowClosesAt).toBeInstanceOf(Date);
  });

  it('closes the window exactly RETURN_WINDOW_DAYS after delivery', () => {
    const deliveredAt = daysAgo(2);
    const { returnWindowClosesAt } = returnWindowFor({ status: 'delivered', deliveredAt });
    const expected = new Date(deliveredAt.getTime() + RETURN_WINDOW_DAYS * 86400000);
    expect(returnWindowClosesAt.getTime()).toBe(expected.getTime());
  });

  it('says no for an order that has not been delivered', () => {
    for (const status of ['pending', 'processing', 'shipped', 'cancelled', 'returned']) {
      expect(returnWindowFor({ status, deliveredAt: daysAgo(1) }).canReturn).toBe(false);
    }
  });

  /**
   * The payable side must never open while the customer side is still open,
   * or a seller is paid for goods that can still come back.
   */
  it('never overlaps with the moment a seller becomes payable', () => {
    const justSettled = daysAgo(RETURN_WINDOW_DAYS + 0.01);
    expect(returnWindowFor({ status: 'delivered', deliveredAt: justSettled }).canReturn).toBe(false);

    const stillReturnable = daysAgo(RETURN_WINDOW_DAYS - 0.01);
    expect(returnWindowFor({ status: 'delivered', deliveredAt: stillReturnable }).canReturn).toBe(true);
  });
});

/**
 * What a seller is TOLD about their money.
 *
 * The seller's order page showed "You earn RS X" beside a green tick reading
 * "Payment received". Both described the customer's payment; neither described
 * the seller's. A seller reading it believed the money was theirs when it is
 * held until the parcel arrives and the return window shuts.
 *
 * These states drive that line, so they must agree with the rules a payout run
 * actually applies - a page that promises a settlement the payout would refuse
 * is the same bug wearing a different sentence.
 */
describe('what a seller is told about when they are paid', () => {
  const build = ({
    paymentStatus = 'paid',
    fulStatus = 'delivered',
    deliveredAt = SETTLED,
    payoutId = null,
    itemStatus = 'active',
  } = {}) => ({
    paymentStatus,
    items: [
      { sellerId: PARTNER, status: itemStatus, sellerEarning: 900, payoutId },
    ],
    fulfilments: [{ sellerId: PARTNER, status: fulStatus, deliveredAt }],
  });

  it('says the money is waiting on the customer when the order is unpaid', () => {
    const { state } = sellerPayoutStateFor(build({ paymentStatus: 'pending' }), PARTNER);
    expect(state).toBe('unpaid_order');
  });

  /**
   * A dispute can be raised on a parcel still in transit - "the tracking says
   * delivered but nothing came" is exactly that. Telling the seller "released 7
   * days after delivery" there is true and useless: it hides the one fact that
   * matters, which is that they are expected to answer somebody.
   */
  it('says a dispute is open even before the parcel has arrived', () => {
    const order = build({ fulStatus: 'shipped', deliveredAt: null });
    order.fulfilments[0].disputeStatus = 'open';

    const { state, blockedReason } = sellerPayoutStateFor(order, PARTNER);
    expect(state).toBe('blocked');
    expect(blockedReason).toMatch(/dispute/i);
  });

  it('says it is waiting on delivery before the parcel arrives', () => {
    const { state } = sellerPayoutStateFor(
      build({ fulStatus: 'shipped', deliveredAt: null }),
      PARTNER
    );
    expect(state).toBe('awaiting_delivery');
  });

  it('holds the money while the customer can still return it, and names the date', () => {
    const order = build({ deliveredAt: STILL_RETURNABLE });
    const { state, releasesAt } = sellerPayoutStateFor(order, PARTNER);

    expect(state).toBe('holding');
    // Exactly the window the customer was promised, from THIS delivery.
    expect(releasesAt.getTime()).toBe(
      STILL_RETURNABLE.getTime() + RETURN_WINDOW_DAYS * 86400000
    );
    expect(releasesAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('clears it once the window has shut', () => {
    expect(sellerPayoutStateFor(build(), PARTNER).state).toBe('ready');
  });

  it('says paid once a payout has claimed the lines', () => {
    const claimed = new mongoose.Types.ObjectId();
    expect(sellerPayoutStateFor(build({ payoutId: claimed }), PARTNER).state).toBe('paid');
  });

  /**
   * The bug this whole per-seller design exists to prevent. Reading delivery
   * from the ORDER would tell a seller who has not shipped that their money is
   * on its way, because the other seller's parcel arrived.
   */
  it("reads delivery from this seller's parcel, not the order", () => {
    const order = {
      paymentStatus: 'paid',
      status: 'delivered',
      items: [{ sellerId: PARTNER, status: 'active', sellerEarning: 900, payoutId: null }],
      fulfilments: [
        { sellerId: PARTNER, status: 'processing', deliveredAt: null },
        { sellerId: HOUSE, status: 'delivered', deliveredAt: SETTLED },
      ],
    };

    expect(sellerPayoutStateFor(order, PARTNER).state).toBe('awaiting_delivery');
  });

  /**
   * A cancelled line is never paid, so "every line is paid" must not be true
   * of a seller whose only line was cancelled - that would report `paid` for
   * money that will never move.
   */
  it('does not call a cancelled-only order paid', () => {
    const order = build({ itemStatus: 'cancelled' });
    expect(sellerPayoutStateFor(order, PARTNER).state).not.toBe('paid');
  });
});

/**
 * What an unresolved argument does to a payout.
 *
 * The return window closing used to be the whole test, on the reasoning that a
 * delivery older than the window can no longer come back. That is only true
 * when nothing is already in progress: a return asked for on day 6, or a
 * dispute raised on day 5, is still open on day 8 - and the old rule paid the
 * seller anyway, on the day the argument was still going on.
 *
 * Paying is effectively irreversible. Getting money back from a seller means
 * taking it off a future payout they may never earn, so an unresolved case has
 * to hold it rather than chase it afterwards. That is also the only thing that
 * makes an admin's decision worth anything: the money is still here when it is
 * made.
 */
describe('money held while something is still being argued about', () => {
  const settledOrder = (fulfilmentOver = {}) => ({
    paymentStatus: 'paid',
    items: [
      { sellerId: PARTNER, status: 'active', sellerEarning: 900, payoutId: null },
    ],
    fulfilments: [
      {
        sellerId: PARTNER,
        status: 'delivered',
        deliveredAt: SETTLED,
        deliveryConfirmedBy: 'courier',
        returnStage: null,
        disputeStatus: null,
        ...fulfilmentOver,
      },
    ],
  });

  const payable = (order) =>
    isPayableLine(order.items[0], PARTNER, order.fulfilments);

  it('pays a clean delivery whose window has closed', () => {
    expect(payable(settledOrder())).toBe(true);
  });

  it('holds it while a return is open, even past the window', () => {
    expect(payable(settledOrder({ returnStage: 'requested' }))).toBe(false);
    expect(payable(settledOrder({ returnStage: 'picked' }))).toBe(false);
  });

  it('holds it while a dispute is open', () => {
    expect(payable(settledOrder({ disputeStatus: 'open' }))).toBe(false);
  });

  /**
   * A refused return is settled - the sale stands - and a received one has
   * already been refunded, so the line is not payable for other reasons.
   * Neither should go on holding money by itself.
   */
  it('releases it again once the argument is over', () => {
    expect(payable(settledOrder({ returnStage: 'rejected' }))).toBe(true);
    expect(payable(settledOrder({ disputeStatus: 'resolved_seller' }))).toBe(true);
  });

  /**
   * Handed over by hand: there was no courier to ask, so the seller's word
   * alone does not release their own money until the customer has had a chance
   * to disagree.
   */
  it('holds a delivery only the seller claimed, until the customer has had their say', () => {
    const justNow = new Date();
    const claimed = settledOrder({
      deliveryConfirmedBy: 'seller',
      deliveredAt: justNow,
    });
    // Force the window itself open so only the confirmation rule is under test.
    claimed.fulfilments[0].deliveredAt = SETTLED;
    expect(payable(claimed)).toBe(true); // SETTLED is older than the 3-day wait

    claimed.fulfilments[0].deliveredAt = justNow;
    expect(payable(claimed)).toBe(false);
  });
});
