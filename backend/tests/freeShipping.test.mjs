/**
 * Free delivery per product.
 *
 * A product flagged `freeShipping` means the SELLER absorbs the courier cost.
 * The rules that have to hold:
 *
 *   1. a basket of only free-shipping items is delivered for zero, and the
 *      courier API is not called at all
 *   2. in a mixed basket, the free item's weight is excluded from the quote -
 *      it rides along at the seller's expense rather than inflating the rest
 *   3. an ordinary basket is quoted exactly as before
 *   4. the courier being down never blocks a checkout
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const shiprocket = require('../utils/shiprocketService');
const { calculateShipping, FALLBACK_SHIPPING } = require('../utils/shipping');

const ADDRESS = { zipCode: '560038' };

/** A cart line, shaped the way checkout passes it (productId populated). */
const line = (weight, quantity, freeShipping = false) => ({
  quantity,
  productId: { weight, freeShipping },
});

let rateCalls;
let originalGetShippingRate;

beforeEach(() => {
  originalGetShippingRate = shiprocket.getShippingRate;
  rateCalls = [];

  // Rate rises with weight, so an excluded item is visible in the price.
  shiprocket.getShippingRate = vi.fn(async (pincode, weightKg, isCod) => {
    rateCalls.push({ pincode, weightKg, isCod });
    return {
      data: {
        available_courier_companies: [
          { courier_name: 'Cheap Co', freight_charge: 100 + Math.round(weightKg * 100), cod_charges: 30 },
          { courier_name: 'Pricey Co', freight_charge: 400, cod_charges: 10 },
        ],
      },
    };
  });
});

afterEach(() => {
  shiprocket.getShippingRate = originalGetShippingRate;
});

describe('a basket of only free-shipping items', () => {
  it('costs nothing to deliver', async () => {
    const result = await calculateShipping([line(0.002, 1, true)], ADDRESS, false);

    expect(result.shippingCharges).toBe(0);
    expect(result.freeShipping).toBe(true);
  });

  it('does not call the courier at all', async () => {
    await calculateShipping([line(0.002, 1, true), line(0.5, 2, true)], ADDRESS, false);

    // No quote is needed to charge zero, and the call costs latency on every
    // checkout, so it must be skipped rather than made and discarded.
    expect(rateCalls).toHaveLength(0);
  });

  it('is still free when paid by cash on delivery', async () => {
    const result = await calculateShipping([line(0.002, 1, true)], ADDRESS, true);
    expect(result.shippingCharges).toBe(0);
  });
});

describe('a mixed basket', () => {
  it('quotes only the weight of the items that are not free', async () => {
    const items = [
      line(1.0, 1, true), // free - must not be counted
      line(0.5, 1, false), // billable
    ];

    await calculateShipping(items, ADDRESS, false);

    expect(rateCalls).toHaveLength(1);
    expect(rateCalls[0].weightKg).toBe(0.5);
  });

  it('is cheaper than the same basket with nothing free', async () => {
    const withFree = await calculateShipping(
      [line(1.0, 1, true), line(0.5, 1, false)],
      ADDRESS,
      false
    );
    const withoutFree = await calculateShipping(
      [line(1.0, 1, false), line(0.5, 1, false)],
      ADDRESS,
      false
    );

    expect(withFree.shippingCharges).toBeLessThan(withoutFree.shippingCharges);
  });

  it('still reports itself as a paid delivery', async () => {
    const result = await calculateShipping(
      [line(1.0, 1, true), line(0.5, 1, false)],
      ADDRESS,
      false
    );

    expect(result.freeShipping).toBe(false);
    expect(result.shippingCharges).toBeGreaterThan(0);
  });
});

describe('an ordinary basket is unaffected', () => {
  it('picks the cheapest courier', async () => {
    const result = await calculateShipping([line(0.5, 1)], ADDRESS, false);

    expect(result.shippingCourier).toBe('Cheap Co');
    expect(result.shippingCharges).toBe(150); // 100 + 0.5*100
  });

  it('adds the cash-handling fee only for COD', async () => {
    const prepaid = await calculateShipping([line(0.5, 1)], ADDRESS, false);
    const cod = await calculateShipping([line(0.5, 1)], ADDRESS, true);

    expect(cod.shippingCharges).toBe(prepaid.shippingCharges + 30);
  });

  it('counts quantity towards the weight', async () => {
    await calculateShipping([line(0.5, 3)], ADDRESS, false);
    expect(rateCalls[0].weightKg).toBe(1.5);
  });

  it('assumes a default weight when a product has none', async () => {
    await calculateShipping([{ quantity: 1, productId: {} }], ADDRESS, false);
    expect(rateCalls[0].weightKg).toBe(0.5);
  });
});

describe('the courier being unavailable never blocks checkout', () => {
  it('falls back to a flat rate when the API throws', async () => {
    shiprocket.getShippingRate = vi.fn(async () => {
      throw new Error('shiprocket down');
    });

    const result = await calculateShipping([line(0.5, 1)], ADDRESS, false);
    expect(result.shippingCharges).toBe(FALLBACK_SHIPPING);
  });

  it('falls back when no courier serves the pincode', async () => {
    shiprocket.getShippingRate = vi.fn(async () => ({
      data: { available_courier_companies: [] },
    }));

    const result = await calculateShipping([line(0.5, 1)], ADDRESS, false);
    expect(result.shippingCharges).toBe(FALLBACK_SHIPPING);
  });

  it('still delivers a free basket for zero even if the courier is down', async () => {
    shiprocket.getShippingRate = vi.fn(async () => {
      throw new Error('shiprocket down');
    });

    // The fallback must never turn a promised free delivery into a charge.
    const result = await calculateShipping([line(0.5, 1, true)], ADDRESS, false);
    expect(result.shippingCharges).toBe(0);
  });
});
