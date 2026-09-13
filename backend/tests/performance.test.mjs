/**
 * Account health for a seller: the rulebook's lines, applied to their last
 * 30 days, and graded so the seller sees trouble before the admin does.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computePerformance, median } = require('../utils/performance');

const now = new Date('2026-09-13T00:00:00Z');
const daysAgo = (n, h = 0) => new Date(now.getTime() - n * 86400000 - h * 3600000);
const S = 'seller1';
const order = (createdAt, f, extra = {}) => ({ createdAt, paymentMethod: 'cod', paymentStatus: 'pending', fulfilments: [{ sellerId: S, ...f }], ...extra });

describe('computePerformance', () => {
  it('cancel rate, median dispatch, NDR, RTO, rating and listing quality - each graded', () => {
    const orders = [
      order(daysAgo(20), { status: 'delivered', shippedAt: daysAgo(20, -20) }), // shipped after 20h
      order(daysAgo(15), { status: 'delivered', shippedAt: daysAgo(15, -30) }), // 30h
      order(daysAgo(10), { status: 'shipped', shippedAt: daysAgo(10, -60), ndrAttempts: 2 }), // 60h, NDR
      order(daysAgo(5), { status: 'cancelled' }, { cancelledBy: 'seller' }),
      order(daysAgo(3), { status: 'returned' }), // RTO: returned with no return request
      order(daysAgo(40), { status: 'cancelled' }, { cancelledBy: 'seller' }), // outside the window
      order(daysAgo(2), { status: 'pending' }, { paymentMethod: 'razorpay', paymentStatus: 'pending' }), // abandoned prepaid
    ];
    const products = [
      { avgRating: 5, totalReviews: 2, score: 90 },
      { avgRating: 3, totalReviews: 2, score: 50 },
      { avgRating: 0, totalReviews: 0, score: 70 },
    ];
    const p = computePerformance({ orders, sellerId: S, products, now });
    expect(p.orders).toBe(5);
    expect(p.cancelRate).toMatchObject({ value: 20, count: 1, status: 'review', threshold: 5 });
    expect(p.dispatchHours).toMatchObject({ value: 30, status: 'watch', threshold: 48, shipped: 3 });
    expect(p.lateDispatch.value).toBeCloseTo(33.3, 0);
    expect(p.ndr).toMatchObject({ value: 1, status: 'watch' });
    expect(p.rto).toMatchObject({ value: 1, status: 'watch' });
    expect(p.rating).toMatchObject({ value: 4, count: 4, status: 'watch' });
    expect(p.listingQuality).toMatchObject({ value: 70, products: 3, status: 'watch' });
  });

  it('says "none", not zero, for a seller with nothing yet', () => {
    const p = computePerformance({ orders: [], sellerId: S, products: [], now });
    expect(p.cancelRate.value).toBe(null);
    expect(p.cancelRate.status).toBe('none');
    expect(p.rating.status).toBe('none');
  });

  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(null);
  });
});
