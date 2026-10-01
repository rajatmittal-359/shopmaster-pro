/**
 * The account number the admin has to type, and the rules around showing it.
 *
 * WHY IT IS GUARDED THE WAY IT IS
 *   `getMyPayoutDetails` masks the number even for the seller who owns it, with
 *   the comment "never echo a full account number back over the wire". That is
 *   right for anything that renders on every page load. But money cannot move
 *   unless somebody can read the number, and before this the only way to read
 *   it was to open the database by hand - unlogged, unguarded, and the whole
 *   collection at once.
 *
 *   So the number is reachable, once, per payout, deliberately: behind the same
 *   step-up password that already guards marking a payout paid, and written to
 *   the audit trail. These tests defend exactly that, because the shape of the
 *   guard is the whole point of the endpoint.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);

const Payout = require('../models/Payout');
const Seller = require('../models/Seller');
const session = require('../utils/auth/session');
const { getPayoutBankDetails } = require('../controllers/payoutController');

const ADMIN = '6a93cf88fbb4f39f4a6d5600';
const SELLER = '6a93cf88fbb4f39f4a6d5618';
const PAYOUT = '6a93cf88fbb4f39f4a6d5699';

const BANK = {
  accountNumber: '50100123456789',
  ifscCode: 'HDFC0000123',
  accountHolderName: 'Abha Mittal',
  bankName: 'HDFC Bank',
  branch: 'Gopalpura',
};

const app = express();
app.use((req, _res, next) => { req.user = { _id: ADMIN }; next(); });
app.get('/payouts/:payoutId/bank', getPayoutBankDetails);

const originals = {};

const seed = ({ payout = { _id: PAYOUT, sellerId: SELLER, businessName: 'Charming Jewels', netPayable: 2450 }, bank = BANK } = {}) => {
  Payout.findById = vi.fn(() => ({ select: () => ({ lean: async () => payout }) }));
  Seller.findOne = vi.fn(() => ({ select: () => ({ lean: async () => (bank ? { bankDetails: bank } : null) }) }));
};

beforeEach(() => {
  originals.findById = Payout.findById;
  originals.findOne = Seller.findOne;
  originals.record = session.record;
  session.record = vi.fn();
  seed();
});

afterEach(() => {
  Payout.findById = originals.findById;
  Seller.findOne = originals.findOne;
  session.record = originals.record;
});

describe('the number the admin needs', () => {
  it('gives it in full, because a masked number cannot be typed into a bank', async () => {
    const res = await request(app).get(`/payouts/${PAYOUT}/bank`);

    expect(res.status).toBe(200);
    expect(res.body.bank.accountNumber).toBe('50100123456789');
    expect(res.body.bank.ifscCode).toBe('HDFC0000123');
    expect(res.body.amount).toBe(2450);
  });

  it('writes down who looked, with the payout and the seller', async () => {
    await request(app).get(`/payouts/${PAYOUT}/bank`);

    expect(session.record).toHaveBeenCalledWith(
      'bank_details_viewed',
      ADMIN,
      expect.anything(),
      { payoutId: PAYOUT, sellerId: SELLER },
    );
  });

  it('says what to do when the seller never entered one, rather than failing blankly', async () => {
    seed({ bank: null });

    const res = await request(app).get(`/payouts/${PAYOUT}/bank`);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('has not entered bank details');
    expect(session.record).not.toHaveBeenCalled();
  });

  it('records nothing for a payout that does not exist', async () => {
    seed({ payout: null });

    const res = await request(app).get(`/payouts/${PAYOUT}/bank`);

    expect(res.status).toBe(404);
    expect(session.record).not.toHaveBeenCalled();
  });
});

describe('and where it must never appear', () => {
  it('is not on the route that lists payouts', async () => {
    // The guard is the route table: only the /bank route carries
    // requireRecentAuth, and only it reads bankDetails at all.
    const routes = require('fs').readFileSync(new URL('../routes/adminRoutes.js', import.meta.url), 'utf8');
    const bankLine = routes.split('\n').find((l) => l.includes("/payouts/:payoutId/bank"));

    expect(bankLine).toContain('requireRecentAuth');
    expect(routes).not.toMatch(/router\.get\('\/payouts',\s*[^)]*bank/i);
  });
});
