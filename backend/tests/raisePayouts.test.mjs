/**
 * The weekly sweep that raises payouts, and the refusals it has to carry.
 *
 *   Amazon settles every seven days, Flipkart on fixed weekdays, Meesho on the
 *   seventh day from delivery - none of them wait for someone to remember. This
 *   job is our half of that: it raises the payout, and a person still makes the
 *   transfer, because Razorpay Route is behind the RBI's ₹40 lakh turnover floor
 *   and RazorpayX needs a current account.
 *
 *   What is worth defending here is not the happy path but the refusals. A
 *   seller with no bank details must come back with the sentence that names
 *   them, not vanish from the report, because the admin's next move is to ask
 *   them for the details.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const User = require('../models/User');
const payout = require('../utils/payout');
const notify = require('../utils/notify');
const { raisePayouts } = require('../jobs/raisePayouts');

const ADMIN = '6a93cf88fbb4f39f4a6d5600';
const originals = {};

beforeEach(() => {
  originals.findOne = User.findOne;
  originals.summary = payout.getPayableSummary;
  originals.create = payout.createPayoutForSeller;
  originals.notifyAdmins = notify.notifyAdmins;

  User.findOne = vi.fn(() => ({ select: () => ({ lean: async () => ({ _id: ADMIN }) }) }));
  notify.notifyAdmins = vi.fn(async () => []);
});

afterEach(() => {
  User.findOne = originals.findOne;
  payout.getPayableSummary = originals.summary;
  payout.createPayoutForSeller = originals.create;
  notify.notifyAdmins = originals.notifyAdmins;
});

describe('the weekly sweep', () => {
  it('raises one payout per seller who is owed, and totals them', async () => {
    payout.getPayableSummary = vi.fn(async () => [
      { sellerId: 's1', businessName: 'Iyer Silks' },
      { sellerId: 's2', businessName: 'Rahul Traders' },
    ]);
    payout.createPayoutForSeller = vi.fn(async (sellerId) => ({
      ok: true,
      payout: { payoutNumber: `PO-${sellerId}`, netPayable: sellerId === 's1' ? 4968 : 1200 },
    }));

    const out = await raisePayouts();

    expect(out.ok).toBe(true);
    expect(out.raised).toHaveLength(2);
    expect(out.total).toBe(6168);
  });

  it('carries a refusal back in the seller\'s own words instead of dropping them', async () => {
    payout.getPayableSummary = vi.fn(async () => [
      { sellerId: 's1', businessName: 'Iyer Silks' },
      { sellerId: 's2', businessName: 'Nova Electronics' },
    ]);
    payout.createPayoutForSeller = vi.fn(async (sellerId) =>
      sellerId === 's1'
        ? { ok: true, payout: { payoutNumber: 'PO-1', netPayable: 4968 } }
        : { ok: false, reason: 'Nova Electronics has not provided bank details yet, so they cannot be paid' });

    const out = await raisePayouts();

    expect(out.raised).toHaveLength(1);
    expect(out.skipped).toEqual([
      { businessName: 'Nova Electronics', reason: expect.stringContaining('has not provided bank details') },
    ]);
  });

  it('tells the admin once, with the money, because nothing moves by itself', async () => {
    payout.getPayableSummary = vi.fn(async () => [{ sellerId: 's1', businessName: 'Iyer Silks' }]);
    payout.createPayoutForSeller = vi.fn(async () => ({ ok: true, payout: { payoutNumber: 'PO-1', netPayable: 4968 } }));

    await raisePayouts();

    expect(notify.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notify.notifyAdmins.mock.calls[0][0]).toMatchObject({
      category: 'payouts',
      title: '₹4,968 ready to transfer',
      url: '/admin/payouts',
    });
  });

  it('says nothing in a week where nobody is owed', async () => {
    payout.getPayableSummary = vi.fn(async () => []);
    payout.createPayoutForSeller = vi.fn();

    const out = await raisePayouts();

    expect(out.raised).toEqual([]);
    expect(notify.notifyAdmins).not.toHaveBeenCalled();
    expect(payout.createPayoutForSeller).not.toHaveBeenCalled();
  });

  it('refuses rather than failing per row when there is no admin to attribute to', async () => {
    // `createdBy` is required on the Payout model, so this would otherwise be a
    // validation error repeated once per seller.
    User.findOne = vi.fn(() => ({ select: () => ({ lean: async () => null }) }));
    payout.getPayableSummary = vi.fn();

    const out = await raisePayouts();

    expect(out.ok).toBe(false);
    expect(out.reason).toContain('No admin account');
    expect(payout.getPayableSummary).not.toHaveBeenCalled();
  });
});
