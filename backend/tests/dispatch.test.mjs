/**
 * Ready-to-ship days per product (19 Sep 2026): the rulebook's number unless
 * the seller said otherwise; the promise is frozen on the order line; the
 * seller's dispatch-by date is the longest of their lines in working days;
 * the checkout's standard ETA stretches with it and same-day disappears;
 * the late clock grades against the order's own date.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const rules = require('../config/sellerRules');
const dispatch = require('../utils/dispatch');
const { estimateDelivery, _clearCache } = require('../utils/deliveryEstimate');
const shiprocket = require('../utils/shiprocketService');
const { computePerformance: sellerPerformance } = require('../utils/performance');

afterEach(() => vi.restoreAllMocks());

describe('the number', () => {
  it('cleans what the seller typed: empty/default → null, 1-30 whole days, anything else refused', () => {
    expect(dispatch.cleanProcessingDays('')).toEqual({ value: null });
    expect(dispatch.cleanProcessingDays('default')).toEqual({ value: null });
    expect(dispatch.cleanProcessingDays(7)).toEqual({ value: 7 });
    expect(dispatch.cleanProcessingDays('10')).toEqual({ value: 10 });
    expect(dispatch.cleanProcessingDays(0).error).toMatch(/1 to 30/);
    expect(dispatch.cleanProcessingDays(31).error).toMatch(/1 to 30/);
    expect(dispatch.cleanProcessingDays(2.5).error).toMatch(/whole number/);
  });
  it('a product without one uses the rulebook; made-to-order means longer than the rulebook', () => {
    expect(dispatch.processingDaysOf({})).toBe(rules.dispatchDays);
    expect(dispatch.processingDaysOf({ processingDays: 7 })).toBe(7);
    expect(dispatch.isMadeToOrder({ processingDays: 7 })).toBe(true);
    expect(dispatch.isMadeToOrder({ processingDays: rules.dispatchDays })).toBe(false);
    expect(dispatch.isMadeToOrder({})).toBe(false);
  });
});

describe('the date', () => {
  it('is the longest line, in working days from the order, Sundays skipped', () => {
    // Friday 20 Nov 2026 + 7 working days → Sunday 22 and Sunday 29 skipped → Sat 28 Nov
    const placed = new Date('2026-11-20T10:00:00Z');
    const lines = [{ processingDays: null, productId: {} }, { processingDays: 7 }, { productId: { processingDays: 3 } }];
    expect(dispatch.leadDaysOf(lines)).toBe(7);
    expect(dispatch.dispatchByFor(lines, placed).toISOString().slice(0, 10)).toBe('2026-11-28');
    // Nothing said anywhere: the rulebook's 2 working days.
    expect(dispatch.dispatchByFor([{ productId: {} }], placed).toISOString().slice(0, 10)).toBe('2026-11-23');
  });
});

describe('the product page estimate', () => {
  it('adds the product\'s own days to the courier\'s transit', async () => {
    _clearCache();
    vi.spyOn(shiprocket, 'getShippingRate').mockResolvedValue({ data: { available_courier_companies: [{ courier_name: 'X', rate: 60, estimated_delivery_days: '2' }] } });
    vi.spyOn(shiprocket, 'pickBestCourier').mockReturnValue({ courier_name: 'X', rate: 60, estimated_delivery_days: '2' });
    const now = new Date('2026-11-20T10:00:00Z'); // Friday
    const plain = await estimateDelivery('302001', { now });
    const made = await estimateDelivery('302001', { now, dispatchDays: 7 });
    expect(plain).toMatchObject({ serviceable: true, dispatchDays: 2, deliveryBy: '2026-11-25' });
    expect(made).toMatchObject({ serviceable: true, dispatchDays: 7, deliveryBy: '2026-12-01' });
    _clearCache();
  });
});

describe('the late clock', () => {
  it('grades a shipment against the order\'s own dispatch-by date when it has one', () => {
    const sellerId = 's1';
    const day = 86400 * 1000;
    const t0 = new Date('2026-11-01T00:00:00Z');
    const order = (n, shippedAfterDays, dispatchByDays) => ({
      _id: `o${n}`, createdAt: t0, paymentMethod: 'cod', paymentStatus: 'pending', cancelledBy: null,
      items: [{ sellerId, status: 'shipped' }],
      fulfilments: [{ sellerId, status: 'shipped', shippedAt: new Date(t0.getTime() + shippedAfterDays * day), dispatchBy: dispatchByDays ? new Date(t0.getTime() + dispatchByDays * day) : null }],
    });
    // 5 days to ship: late by the rulebook (2), on time against a 7-day made-to-order date.
    const r = sellerPerformance({ sellerId, orders: [order(1, 5, null), order(2, 5, 7)], products: [], now: new Date(t0.getTime() + 10 * day) });
    expect(r.lateDispatch.value).toBe(50);
  });
});
