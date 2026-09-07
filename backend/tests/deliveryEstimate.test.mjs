/**
 * "Get it by Friday" - and whether we can keep that promise.
 *
 * THE RULE BEING DEFENDED
 *   We book the CHEAPEST courier at dispatch. So the date on the product page
 *   has to come from the cheapest courier too. Quoting the fastest one's ETA
 *   and then booking a slower one breaks the promise on every single order,
 *   and it would never show up as a bug - only as customers who do not return.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const shiprocket = require('../utils/shiprocketService');
const {
  estimateDelivery,
  isValidPincode,
  addWorkingDays,
  _clearCache,
  DISPATCH_DAYS,
} = require('../utils/deliveryEstimate');

/** Shiprocket's shape: a list of couriers, each with a rate and an ETA. */
const serviceability = (companies) => ({
  data: { available_courier_companies: companies },
});

const CHEAP_AND_SLOW = { courier_name: 'Cheap', rate: 45, estimated_delivery_days: '6' };
const DEAR_AND_FAST = { courier_name: 'Fast', rate: 130, estimated_delivery_days: '2' };

let originalRate;

beforeEach(() => {
  originalRate = shiprocket.getShippingRate;
  _clearCache();
});

afterEach(() => {
  shiprocket.getShippingRate = originalRate;
  _clearCache();
});

describe('the date comes from the courier we will actually book', () => {
  it('uses the cheapest courier, not the fastest', async () => {
    shiprocket.getShippingRate = vi.fn(async () =>
      serviceability([DEAR_AND_FAST, CHEAP_AND_SLOW])
    );

    const out = await estimateDelivery('302019', { now: new Date('2026-09-07T10:00:00Z') });

    // 6 days, not 2. Booking Cheap and promising Fast's date is the bug.
    expect(out.transitDays).toBe(6);
    expect(out.serviceable).toBe(true);
  });

  it('adds the dispatch window the shipping policy promises', async () => {
    shiprocket.getShippingRate = vi.fn(async () => serviceability([CHEAP_AND_SLOW]));

    // Monday 7 Sep 2026. 2 dispatch + 6 transit = 8 working days, and the two
    // Sundays in between are skipped: 8, 9, 10, 11, 12, (13 Sun), 14, 15, 16.
    const out = await estimateDelivery('302019', { now: new Date('2026-09-07T10:00:00Z') });

    expect(out.dispatchDays).toBe(DISPATCH_DAYS);
    expect(out.deliveryBy).toBe('2026-09-16');
  });

  it('counts Saturday as a working day and skips only Sunday', () => {
    // Friday 11 Sep 2026 + 2 working days = Monday 14th, because Saturday
    // counts (Indian couriers deliver on it) and Sunday does not.
    const out = addWorkingDays(new Date('2026-09-11T10:00:00Z'), 2);
    expect(out.toISOString().slice(0, 10)).toBe('2026-09-14');
  });
});

describe('when there is no answer to give', () => {
  it('says a pincode is not serviceable instead of inventing a date', async () => {
    shiprocket.getShippingRate = vi.fn(async () => serviceability([]));

    const out = await estimateDelivery('797001');

    expect(out.serviceable).toBe(false);
    expect(out.deliveryBy).toBeUndefined();
  });

  it('says nothing rather than guess when the courier gives no ETA', async () => {
    shiprocket.getShippingRate = vi.fn(async () =>
      serviceability([{ courier_name: 'Vague', rate: 40, estimated_delivery_days: null }])
    );

    const out = await estimateDelivery('302019');

    expect(out.serviceable).toBe(false);
  });

  it('lets a courier API failure through, so the route can answer 503', async () => {
    shiprocket.getShippingRate = vi.fn(async () => {
      throw new Error('Shiprocket API credentials not configured');
    });

    await expect(estimateDelivery('302019')).rejects.toThrow();
  });
});

describe('the cache, which is what keeps this endpoint affordable', () => {
  it('asks the courier once per pincode', async () => {
    const call = vi.fn(async () => serviceability([CHEAP_AND_SLOW]));
    shiprocket.getShippingRate = call;

    await estimateDelivery('302019');
    await estimateDelivery('302019');

    expect(call).toHaveBeenCalledTimes(1);
  });

  it('recomputes the DATE on a cache hit, so it cannot go stale overnight', async () => {
    shiprocket.getShippingRate = vi.fn(async () => serviceability([CHEAP_AND_SLOW]));

    const monday = await estimateDelivery('302019', { now: new Date('2026-09-07T10:00:00Z') });
    const tuesday = await estimateDelivery('302019', { now: new Date('2026-09-08T10:00:00Z') });

    expect(tuesday.deliveryBy).not.toBe(monday.deliveryBy);
  });

  it('keeps pincodes apart', async () => {
    shiprocket.getShippingRate = vi.fn(async (code) =>
      serviceability([code === '302019' ? CHEAP_AND_SLOW : DEAR_AND_FAST])
    );

    const jaipur = await estimateDelivery('302019');
    const mumbai = await estimateDelivery('400001');

    expect(jaipur.transitDays).toBe(6);
    expect(mumbai.transitDays).toBe(2);
  });
});

describe('what counts as a PIN code', () => {
  it('takes six digits', () => {
    expect(isValidPincode('302019')).toBe(true);
  });

  it('refuses five digits, seven digits, letters and a leading zero', () => {
    for (const bad of ['30201', '3020199', '30201a', '012345', '', null, undefined]) {
      expect(isValidPincode(bad)).toBe(false);
    }
  });
});
