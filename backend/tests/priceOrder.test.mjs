/**
 * What an order costs, and who ends up with what.
 *
 * WHY THIS IS ONE MODULE AND NOT TWO
 *   Two checkouts write orders - COD and prepaid - and each used to stamp
 *   commission itself. Adding coupons to both would have meant two copies of
 *   "who funded this discount": the kind of duplication that agrees on the day
 *   it is written and disagrees six months later, in a payout, in somebody's
 *   favour.
 *
 * The rules being defended:
 *   1. a platform coupon leaves the seller's earning untouched
 *   2. a seller coupon reduces it, and the commission with it
 *   3. pricing NEVER spends a coupon use - only paying does
 *   4. a refused code stops the checkout rather than charging full price
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const Coupon = require('../models/Coupon');
const Seller = require('../models/Seller');
const { priceOrder } = require('../utils/priceOrder');

const SELLER = new mongoose.Types.ObjectId();
const CUSTOMER = new mongoose.Types.ObjectId();

const originals = {};

/** The query shapes these two call sites use: .select().session().lean(). */
const chainable = (result) => ({
  select: () => chainable(result),
  session: () => chainable(result),
  lean: () => Promise.resolve(result),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});

const cartLine = (price, quantity = 1) => ({
  quantity,
  price,
  productId: {
    _id: new mongoose.Types.ObjectId(),
    name: 'Kundan Choker',
    sellerId: SELLER,
  },
});

const couponDoc = (over = {}) => ({
  code: 'FESTIVE20',
  type: 'percent',
  value: 20,
  maxDiscount: null,
  minOrderValue: 0,
  fundedBy: 'platform',
  sellerId: null,
  validFrom: new Date(Date.now() - 86400000),
  validUntil: new Date(Date.now() + 86400000),
  usageLimit: null,
  perCustomerLimit: 1,
  usedCount: 0,
  usedBy: [],
  isActive: true,
  ...over,
});

beforeEach(() => {
  originals.sellerFind = Seller.find;
  originals.couponFindOne = Coupon.findOne;

  // Every seller on 10%, so the arithmetic below is readable.
  Seller.find = vi.fn(() => chainable([{ userId: SELLER, commissionRate: 10 }]));
  Coupon.findOne = vi.fn(() => chainable(null));
});

afterEach(() => {
  Seller.find = originals.sellerFind;
  Coupon.findOne = originals.couponFindOne;
});

describe('an order with no coupon', () => {
  it('prices exactly as it always did', async () => {
    const r = await priceOrder({ items: [cartLine(1000)], customerId: CUSTOMER });

    expect(r.itemsTotal).toBe(1000);
    expect(r.discountTotal).toBe(0);
    expect(r.orderItems[0]).toMatchObject({
      commissionRate: 10,
      commissionAmount: 100,
      sellerEarning: 900,
      discountAmount: 0,
      discountFundedBy: null,
    });
  });
});

describe('a platform-funded coupon', () => {
  beforeEach(() => {
    Coupon.findOne = vi.fn(() => chainable(couponDoc()));
  });

  it('takes money off the customer', async () => {
    const r = await priceOrder({
      items: [cartLine(1000)],
      couponCode: 'festive20',
      customerId: CUSTOMER,
    });

    expect(r.discountTotal).toBe(200);
    expect(r.coupon).toMatchObject({ code: 'FESTIVE20', fundedBy: 'platform' });
  });

  /**
   * The case that silently underpays sellers if it is got wrong. They did not
   * agree to sell for less and must not be paid as though they had.
   */
  it('leaves the seller’s earning untouched', async () => {
    const r = await priceOrder({
      items: [cartLine(1000)],
      couponCode: 'FESTIVE20',
      customerId: CUSTOMER,
    });

    expect(r.orderItems[0].sellerEarning).toBe(900); // as if no coupon existed
    expect(r.orderItems[0].commissionAmount).toBe(100);
    expect(r.orderItems[0].discountFundedBy).toBe('platform');
  });

  it('matches a code however the customer typed it', async () => {
    const r = await priceOrder({
      items: [cartLine(1000)],
      couponCode: '  festive20  ',
      customerId: CUSTOMER,
    });

    expect(r.coupon.code).toBe('FESTIVE20');
  });
});

describe('a seller-funded coupon', () => {
  it('reduces the seller’s gross and the commission with it', async () => {
    Coupon.findOne = vi.fn(() =>
      chainable(couponDoc({ fundedBy: 'seller', sellerId: SELLER, type: 'flat', value: 200 }))
    );

    const r = await priceOrder({
      items: [cartLine(1000)],
      couponCode: 'FESTIVE20',
      customerId: CUSTOMER,
    });

    expect(r.orderItems[0].commissionAmount).toBe(80); // 10% of 800
    expect(r.orderItems[0].sellerEarning).toBe(720);
    expect(r.orderItems[0].discountFundedBy).toBe('seller');
  });
});

describe('a code that will not apply', () => {
  /**
   * Handed back rather than swallowed. The checkouts stop on it: taking
   * somebody's money at full price after they typed a code, and letting them
   * find out on the receipt, is the silence this codebase keeps removing.
   */
  it('reports why, and discounts nothing', async () => {
    Coupon.findOne = vi.fn(() =>
      chainable(couponDoc({ validUntil: new Date(Date.now() - 86400000) }))
    );

    const r = await priceOrder({
      items: [cartLine(1000)],
      couponCode: 'FESTIVE20',
      customerId: CUSTOMER,
    });

    expect(r.couponError).toMatch(/expired/i);
    expect(r.discountTotal).toBe(0);
    expect(r.coupon).toBeNull();
  });

  it('reports a code nobody has ever heard of', async () => {
    const r = await priceOrder({
      items: [cartLine(1000)],
      couponCode: 'NOPE',
      customerId: CUSTOMER,
    });

    expect(r.couponError).toMatch(/do not have a code/i);
  });
});

describe('what pricing never does', () => {
  /**
   * A basket that is priced and abandoned must not burn a use, or a campaign
   * runs out on people who never bought anything.
   */
  it('does not spend a coupon use', async () => {
    const doc = couponDoc({ usageLimit: 10, usedCount: 4 });
    Coupon.findOne = vi.fn(() => chainable(doc));

    await priceOrder({
      items: [cartLine(1000)],
      couponCode: 'FESTIVE20',
      customerId: CUSTOMER,
    });

    expect(doc.usedCount).toBe(4);
    expect(doc.usedBy).toHaveLength(0);
  });
});
