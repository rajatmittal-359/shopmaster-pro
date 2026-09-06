/**
 * Money when something sells for less than its usual price.
 *
 * THE QUESTION THESE DEFEND
 *   A discount is somebody paying part of the bill for the customer, and the
 *   whole design turns on WHO. Get it wrong and the payout is wrong - quietly,
 *   and only discovered when a seller says they were paid less than they
 *   expected. Commission already taught this lesson once: money rules that are
 *   re-derived later drift, so they are snapshotted at the sale.
 *
 * The rules being defended:
 *   1. a PLATFORM coupon never reduces what the seller is paid
 *   2. a SELLER coupon does, and commission follows it down
 *   3. the platform's own net is allowed to go NEGATIVE, and must
 *   4. every split adds back up - the customer's payment is fully accounted for
 *   5. an order-level coupon is apportioned BY VALUE, or small sellers fund it
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  splitDiscountedLine,
  apportionDiscount,
  effectivePrice,
} = require('../utils/discount');

describe('a line with no discount at all', () => {
  it('behaves exactly as commission always has', () => {
    const r = splitDiscountedLine({ price: 1000, quantity: 1, rate: 8 });

    expect(r.customerPays).toBe(1000);
    expect(r.commissionAmount).toBe(80);
    expect(r.sellerEarning).toBe(920);
    expect(r.platformNet).toBe(80);
    expect(r.discountFundedBy).toBeNull();
  });
});

describe('a discount the SELLER is funding', () => {
  /**
   * The seller chose to sell for less, so they sell for less. Commission is
   * charged on what they actually got, not on a price nobody paid.
   */
  it('reduces the seller’s gross, and the commission with it', () => {
    const r = splitDiscountedLine({
      price: 1000,
      quantity: 1,
      rate: 8,
      discount: 200,
      fundedBy: 'seller',
    });

    expect(r.customerPays).toBe(800);
    expect(r.commissionAmount).toBe(64); // 8% of 800, not of 1000
    expect(r.sellerEarning).toBe(736);
    expect(r.platformNet).toBe(64);
  });
});

describe('a discount the PLATFORM is funding', () => {
  /**
   * The platform is buying the sale. The seller did not agree to sell for less
   * and must not be paid as though they had - this is the case that silently
   * underpays sellers if it is got wrong.
   */
  it('never reduces what the seller is paid', () => {
    const full = splitDiscountedLine({ price: 1000, quantity: 1, rate: 8 });
    const couponed = splitDiscountedLine({
      price: 1000,
      quantity: 1,
      rate: 8,
      discount: 200,
      fundedBy: 'platform',
    });

    expect(couponed.customerPays).toBe(800);
    expect(couponed.sellerEarning).toBe(full.sellerEarning); // still 920
    expect(couponed.commissionAmount).toBe(80); // still on the full price
  });

  it('comes out of the platform’s own margin', () => {
    const r = splitDiscountedLine({
      price: 1000,
      quantity: 1,
      rate: 8,
      discount: 200,
      fundedBy: 'platform',
    });

    // 80 earned, 200 given away.
    expect(r.platformNet).toBe(-120);
  });

  /**
   * A coupon worth more than the commission it earns IS a loss on that line.
   * A number floored at zero would hide precisely the spend worth watching.
   */
  it('is allowed to leave the platform out of pocket', () => {
    const r = splitDiscountedLine({
      price: 100,
      quantity: 1,
      rate: 8,
      discount: 50,
      fundedBy: 'platform',
    });

    expect(r.platformNet).toBeLessThan(0);
    expect(r.sellerEarning).toBe(92);
  });
});

describe('the arithmetic always closing', () => {
  /**
   * The customer's payment has to be fully accounted for: whatever they paid is
   * the seller's earning plus the platform's net, to the paisa. If this ever
   * fails, somebody is short and the books cannot say who.
   */
  it.each([
    [1000, 1, 8, 0, null],
    [1000, 1, 8, 200, 'seller'],
    [1000, 1, 8, 200, 'platform'],
    [999.99, 3, 12.5, 333.33, 'seller'],
    [999.99, 3, 12.5, 333.33, 'platform'],
    [49.5, 7, 0, 100, 'platform'],
    [2300, 1, 33.33, 1, 'seller'],
  ])('closes for %s x%s at %s%% less %s (%s)', (price, quantity, rate, discount, fundedBy) => {
    const r = splitDiscountedLine({ price, quantity, rate, discount, fundedBy });

    expect(Math.round((r.sellerEarning + r.platformNet) * 100) / 100).toBe(
      r.customerPays
    );
  });

  it('never lets a discount exceed the line, or the customer is paid to shop', () => {
    const r = splitDiscountedLine({
      price: 100,
      quantity: 1,
      rate: 8,
      discount: 500,
      fundedBy: 'platform',
    });

    expect(r.customerPays).toBe(0);
    expect(r.discountAmount).toBe(100);
  });

  it('ignores a negative discount rather than treating it as a surcharge', () => {
    const r = splitDiscountedLine({ price: 100, quantity: 1, rate: 8, discount: -50 });
    expect(r.customerPays).toBe(100);
  });
});

describe('spreading one coupon across a basket', () => {
  /**
   * The apportioned amount decides how much commission each seller is charged
   * and how much each is paid. Split equally, a RS 100 coupon across a RS 2,000
   * necklace and a RS 50 nose pin takes RS 50 off a RS 50 line - the small
   * seller funds almost all of it, having never agreed to any of it.
   */
  it('splits by value, not equally', () => {
    const shares = apportionDiscount(
      [
        { price: 2000, quantity: 1 },
        { price: 50, quantity: 1 },
      ],
      100
    );

    expect(shares[0]).toBeGreaterThan(shares[1]);
    expect(shares[1]).toBeLessThan(50);
  });

  it('always adds back to exactly the coupon', () => {
    const lines = [
      { price: 333.33, quantity: 1 },
      { price: 666.67, quantity: 1 },
      { price: 1, quantity: 3 },
    ];
    const shares = apportionDiscount(lines, 100);

    expect(Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100).toBe(100);
  });

  it('cannot give away more than the basket is worth', () => {
    const shares = apportionDiscount([{ price: 100, quantity: 1 }], 500);
    expect(shares[0]).toBe(100);
  });

  it('does nothing to an empty or free basket', () => {
    expect(apportionDiscount([], 100)).toEqual([]);
    expect(apportionDiscount([{ price: 0, quantity: 1 }], 100)).toEqual([0]);
  });
});

describe('a sale price that ends by itself', () => {
  const day = 86400000;
  const now = new Date('2026-09-07T12:00:00Z');

  const product = (over = {}) => ({ price: 1000, salePrice: 800, ...over });

  it('applies inside its window', () => {
    const r = effectivePrice(
      product({
        saleStartsAt: new Date(now - day),
        saleEndsAt: new Date(+now + day),
      }),
      now
    );

    expect(r).toEqual({ price: 800, onSale: true, was: 1000 });
  });

  /**
   * The point of the dates: a sale stops because time passed, not because
   * somebody remembered to switch it off.
   */
  it('has stopped once the window has closed', () => {
    const r = effectivePrice(
      product({ saleEndsAt: new Date(now - day) }),
      now
    );

    expect(r.onSale).toBe(false);
    expect(r.price).toBe(1000);
  });

  it('has not started before its window opens', () => {
    const r = effectivePrice(product({ saleStartsAt: new Date(+now + day) }), now);

    expect(r.onSale).toBe(false);
    expect(r.price).toBe(1000);
  });

  it('runs indefinitely when no dates are set', () => {
    expect(effectivePrice(product(), now).onSale).toBe(true);
  });

  /**
   * A "sale price" at or above the normal price is not a sale, and showing one
   * as though it were is the anchor trick the CCPA guidelines call out.
   */
  it('refuses a sale price that is not actually lower', () => {
    expect(effectivePrice({ price: 1000, salePrice: 1000 }, now).onSale).toBe(false);
    expect(effectivePrice({ price: 1000, salePrice: 1200 }, now).onSale).toBe(false);
  });

  it('is quiet when there is no sale price at all', () => {
    expect(effectivePrice({ price: 1000 }, now)).toEqual({
      price: 1000,
      onSale: false,
      was: null,
    });
  });
});
