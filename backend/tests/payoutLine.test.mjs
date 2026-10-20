/**
 * The payout line on a seller's order must say what the payout will DO (20 Oct 2026).
 *
 * Found while recording the launch film: a return came back empty, the seller
 * refused it, a dispute opened - and the same card read "Your payout for these
 * items is held" above "Payout released on 24 Oct 2026". The backend was right
 * (sellerPayoutStateFor -> state 'blocked'); the page printed any releasesAt as
 * "released", in the past tense, even for a date still to come.
 */
import { describe, it, expect } from 'vitest';

const load = () => import('../../web/src/lib/payoutLine.js');
const t = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k]);
const when = (d) => new Date(d).toISOString().slice(0, 10);

describe('payoutLine', () => {
  it('a blocked payout says it is on hold and why, not "released"', async () => {
    const { payoutLine } = await load();
    const line = payoutLine({ state: 'blocked', releasesAt: '2026-10-24T00:00:00Z', blockedReason: 'A dispute on this order is open.' }, t, when);
    expect(line).toBe('Payout on hold - A dispute on this order is open.');
  });

  it('a payout still in the return window says when it releases, in the future tense', async () => {
    const { payoutLine } = await load();
    expect(payoutLine({ state: 'holding', releasesAt: '2026-10-24T00:00:00Z' }, t, when)).toBe('Payout releases on 2026-10-24');
  });

  it('a cleared payout says it goes in the next run', async () => {
    const { payoutLine } = await load();
    expect(payoutLine({ state: 'ready', releasesAt: '2026-10-10T00:00:00Z' }, t, when)).toBe('Payout cleared on 2026-10-10 - it goes in the next payout');
  });

  it('awaiting delivery explains the window; paid and nothing owed say so', async () => {
    const { payoutLine } = await load();
    expect(payoutLine({ state: 'awaiting_delivery', returnWindowDays: 7 }, t, when)).toBe('Paid out 7 days after delivery - the return window has to close first');
    expect(payoutLine({ state: 'paid' }, t, when)).toBe('Paid out');
    expect(payoutLine({ state: 'nothing_owed' }, t, when)).toBe(null);
  });
});
