/**
 * "Aapko kitna milega" - what a shop that joins today takes home (19 Oct 2026).
 *
 * Every big seller programme answers this before the seller signs up:
 * Amazon's revenue calculator, Flipkart's fee calculator, Meesho's "0%
 * commission". /sell said "your earning, less commission" and gave no number.
 *
 * The one rule: the page may never disagree with the payout. So the quote is
 * made by the SAME `splitLine` an order is split with, at the SAME platform
 * rate a new seller gets - a calculator that said ₹460 and a payout of ₹440
 * would cost more trust than having no calculator at all.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const settings = require('../utils/liveSettings');
const { splitLine } = require('../utils/commission');

let saved;
beforeEach(() => {
  saved = settings.liveSettings;
});
afterEach(() => {
  settings.liveSettings = saved;
});

describe('GET /api/public/seller-earnings', () => {
  it('splits the price exactly as an order would, at the platform rate', async () => {
    settings.liveSettings = vi.fn(async () => ({ rules: { defaultCommissionPct: 8, payoutAfterDeliveryDays: 7 } }));

    const res = await request(app).get('/api/public/seller-earnings?price=499');

    expect(res.status).toBe(200);
    const order = splitLine(499, 1, 8);
    expect(res.body).toMatchObject({ price: 499, commissionRate: 8, commission: order.commissionAmount, youGet: order.sellerEarning, paidDaysAfterDelivery: 7 });
  });

  it('follows the admin\'s default when it changes', async () => {
    settings.liveSettings = vi.fn(async () => ({ rules: { defaultCommissionPct: 5 } }));

    const res = await request(app).get('/api/public/seller-earnings?price=1000');

    expect(res.body).toMatchObject({ commissionRate: 5, commission: 50, youGet: 950 });
  });

  it('refuses a price that is not a price', async () => {
    for (const bad of ['', 'abc', '0', '-5', '10000001']) {
      const res = await request(app).get(`/api/public/seller-earnings?price=${bad}`);
      expect(res.status).toBe(400);
    }
  });
});
