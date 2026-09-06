/**
 * Whether a code applies, and what it is worth.
 *
 * WHY EVERY REFUSAL IS TESTED SEPARATELY
 *   "Invalid coupon" is the worst message in retail: it means seven different
 *   things and the customer cannot tell which, so they either give up or write
 *   in. A customer who is RS 200 short of the minimum will happily add RS 200 of
 *   jewellery - but only if somebody tells them that is the problem.
 *
 * The money rules being defended:
 *   1. a seller-funded code only ever touches that seller's lines
 *   2. its minimum is measured against ITS lines, or somebody else's goods
 *      unlock a discount the seller has to fund
 *   3. a percentage without a ceiling is an unbounded cost
 *   4. nothing is ever worth more than the goods it applies to
 *   5. evaluating never spends a use - only paying does
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const { evaluateCoupon } = require('../utils/applyCoupon');

const SELLER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
const CUSTOMER = new mongoose.Types.ObjectId();

const NOW = new Date('2026-09-07T12:00:00Z');
const day = 86400000;

const coupon = (over = {}) => ({
  code: 'FESTIVE20',
  type: 'percent',
  value: 20,
  maxDiscount: null,
  minOrderValue: 0,
  fundedBy: 'platform',
  sellerId: null,
  validFrom: new Date(+NOW - day),
  validUntil: new Date(+NOW + day),
  usageLimit: null,
  perCustomerLimit: 1,
  usedCount: 0,
  usedBy: [],
  isActive: true,
  ...over,
});

const basket = (lines) => ({ lines, customerId: CUSTOMER, now: NOW });

const ONE_LINE = [{ sellerId: SELLER, price: 1000, quantity: 1 }];

describe('what it is worth', () => {
  it('takes a percentage off', () => {
    const r = evaluateCoupon(coupon(), basket(ONE_LINE));

    expect(r.ok).toBe(true);
    expect(r.discount).toBe(200);
    expect(r.fundedBy).toBe('platform');
  });

  it('takes a flat amount off', () => {
    const r = evaluateCoupon(
      coupon({ type: 'flat', value: 150 }),
      basket(ONE_LINE)
    );

    expect(r.discount).toBe(150);
  });

  /**
   * 20% is fine on a RS 500 order and ruinous on a RS 50,000 one. Without a
   * ceiling the cost of a percentage code is unbounded.
   */
  it('respects the ceiling on a percentage', () => {
    const r = evaluateCoupon(
      coupon({ value: 20, maxDiscount: 100 }),
      basket([{ sellerId: SELLER, price: 5000, quantity: 1 }])
    );

    expect(r.discount).toBe(100); // not 1000
  });

  it('is never worth more than the goods', () => {
    const r = evaluateCoupon(
      coupon({ type: 'flat', value: 5000 }),
      basket([{ sellerId: SELLER, price: 100, quantity: 1 }])
    );

    expect(r.discount).toBe(100);
  });
});

describe('a seller-funded code', () => {
  const sellerCoupon = (over = {}) =>
    coupon({ fundedBy: 'seller', sellerId: SELLER, ...over });

  /**
   * The seller is paying for this. Discounting another seller's goods with it
   * would charge one shop for another shop's sale.
   */
  it('only ever touches that seller’s lines', () => {
    const r = evaluateCoupon(
      sellerCoupon({ type: 'flat', value: 100 }),
      basket([
        { sellerId: SELLER, price: 1000, quantity: 1 },
        { sellerId: OTHER, price: 1000, quantity: 1 },
      ])
    );

    expect(r.ok).toBe(true);
    expect(r.perLine[0]).toBe(100);
    expect(r.perLine[1]).toBe(0);
  });

  /**
   * The trap: a RS 500-minimum seller code unlocked by buying RS 500 of
   * SOMEBODY ELSE's goods. The seller would fund a discount on a basket that
   * never met their condition.
   */
  it('measures its minimum against its own lines only', () => {
    const r = evaluateCoupon(
      sellerCoupon({ minOrderValue: 500 }),
      basket([
        { sellerId: SELLER, price: 100, quantity: 1 },
        { sellerId: OTHER, price: 900, quantity: 1 },
      ])
    );

    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/short/i);
  });

  it('refuses when the seller has nothing in the basket', () => {
    const r = evaluateCoupon(
      sellerCoupon(),
      basket([{ sellerId: OTHER, price: 1000, quantity: 1 }])
    );

    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not apply to anything in your basket/i);
  });
});

describe('the reasons it says no', () => {
  /**
   * Each of these is a different problem with a different fix. Collapsing them
   * into "invalid coupon" is what makes a customer give up.
   */
  it('has not started yet', () => {
    const r = evaluateCoupon(
      coupon({ validFrom: new Date(+NOW + day) }),
      basket(ONE_LINE)
    );

    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/starts on/i);
  });

  it('has expired', () => {
    const r = evaluateCoupon(
      coupon({ validUntil: new Date(+NOW - day) }),
      basket(ONE_LINE)
    );

    expect(r.reason).toMatch(/expired/i);
  });

  it('has been turned off', () => {
    expect(evaluateCoupon(coupon({ isActive: false }), basket(ONE_LINE)).reason).toMatch(
      /no longer being offered/i
    );
  });

  it('has been fully claimed', () => {
    const r = evaluateCoupon(
      coupon({ usageLimit: 100, usedCount: 100 }),
      basket(ONE_LINE)
    );

    expect(r.reason).toMatch(/fully claimed/i);
  });

  it('has already been used by this customer', () => {
    const r = evaluateCoupon(
      coupon({ usedBy: [{ customerId: CUSTOMER, count: 1 }] }),
      basket(ONE_LINE)
    );

    expect(r.reason).toMatch(/you have already used/i);
  });

  it('counts another customer’s use against them, not this one', () => {
    const r = evaluateCoupon(
      coupon({ usedBy: [{ customerId: OTHER, count: 1 }] }),
      basket(ONE_LINE)
    );

    expect(r.ok).toBe(true);
  });

  /**
   * The number is the point. "Minimum order not met" is a dead end; "you are
   * RS 200 short" is an invitation.
   */
  it('says how far short the basket is', () => {
    const r = evaluateCoupon(
      coupon({ minOrderValue: 1200 }),
      basket(ONE_LINE)
    );

    expect(r.ok).toBe(false);
    expect(r.reason).toContain('200');
  });

  it('does not pretend a code we have never heard of is expired', () => {
    const r = evaluateCoupon(null, basket(ONE_LINE));
    expect(r.reason).toMatch(/do not have a code by that name/i);
  });
});

describe('what evaluating does NOT do', () => {
  /**
   * Only paying spends a use. Counting here means a campaign runs out because
   * people looked at it, and an abandoned basket costs a real customer their
   * discount.
   */
  it('never spends a use', () => {
    const c = coupon({ usageLimit: 10, usedCount: 3 });

    evaluateCoupon(c, basket(ONE_LINE));
    evaluateCoupon(c, basket(ONE_LINE));

    expect(c.usedCount).toBe(3);
    expect(c.usedBy).toHaveLength(0);
  });
});
