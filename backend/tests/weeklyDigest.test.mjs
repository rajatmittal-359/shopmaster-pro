/**
 * The admin's weekly nudge, and the number it has to get right.
 *
 * WHY THIS FILE EXISTS
 *   The digest had a line reading "N payouts to release" whose number came from
 *   `Payout.countDocuments({ status: 'pending' })` - payouts already CREATED
 *   and not yet marked paid. That is a different question from the one the
 *   heading asks. Money that had cleared the return window and had no payout
 *   yet - the thing the admin actually has to act on - was counted nowhere, so
 *   a week in which nobody pressed the button reported a cheerful zero and the
 *   sellers simply waited.
 *
 *   Both numbers are worth knowing, so the digest now carries both and says
 *   which is which.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { render } = require('../jobs/weeklyDigest');

const digest = (over = {}) => ({
  since: new Date('2026-09-24'),
  orders: 0, sales: 0, take: 0, cancelledBySeller: 0, cancelledByCustomer: 0,
  returns: 0, disputesOpen: 0, pendingSellers: 0,
  payableSellers: 0, payableTotal: 0, payoutsUnpaid: 0,
  lowStock: 0, weak: 0, products: 0, newReviews: 0, newCustomers: 0,
  google: null,
  ...over,
});

describe('what the admin is told about money waiting', () => {
  it('names the rupees and the sellers, not a count of paperwork', () => {
    const { html } = render(digest({ payableSellers: 2, payableTotal: 12450 }));

    expect(html).toContain('₹12,450 ready for 2 sellers');
  });

  it('says "seller" and not "sellers" when there is one', () => {
    const { html } = render(digest({ payableSellers: 1, payableTotal: 900 }));

    expect(html).toContain('₹900 ready for 1 seller');
  });

  it('keeps the other question too, in words that cannot be confused with it', () => {
    // A payout created and never marked paid is a real thing to chase - it just
    // is not "money waiting", which is what the old heading implied.
    const { html } = render(digest({ payoutsUnpaid: 3 }));

    expect(html).toContain('3 payouts created but not marked paid');
  });

  it('says nothing about payouts in a week where nothing is owed', () => {
    const { html } = render(digest());

    expect(html).not.toContain('ready for');
    expect(html).not.toContain('not marked paid');
  });
});
