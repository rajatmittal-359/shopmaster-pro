/**
 * What a seller can decide about their own shop, and what only an admin can.
 *
 * TWO THINGS A SELLER COULD NOT CHANGE
 *   Free shipping was a flag on each PRODUCT and nowhere else, so a seller who
 *   had decided their shop absorbs delivery had to tick every item they owned
 *   and every new one forever - or ask a developer.
 *
 *   The pickup address did not exist at all: shipping read one address out of
 *   the environment and used it for everybody, which for any seller but the
 *   platform's own shop means a courier sent to the wrong door.
 *
 * AND ONE THING THEY MUST NOT
 *   The commission rate. A seller who could set their own would set it to zero.
 *
 * The money rule underneath all of it: a commission rate is COPIED onto every
 * order line when the order is placed. Changing it later must not rewrite what
 * a seller was already owed, or a payout run over old orders would produce a
 * different answer this month than it did last month.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { splitLine } = require('../utils/commission');

describe('changing a commission rate', () => {
  /**
   * The whole reason rates are snapshotted. If this ever stops being true,
   * every past payout silently becomes wrong.
   */
  it('cannot change what an order already recorded', () => {
    const soldAt8 = splitLine(1000, 1, 8);
    expect(soldAt8).toMatchObject({
      commissionRate: 8,
      commissionAmount: 80,
      sellerEarning: 920,
    });

    // The seller is later made commission-free. The line above is untouched -
    // it holds its own numbers and nothing recomputes them.
    const soldAt0 = splitLine(1000, 1, 0);
    expect(soldAt0).toMatchObject({
      commissionRate: 0,
      commissionAmount: 0,
      sellerEarning: 1000,
    });
    expect(soldAt8.sellerEarning).toBe(920);
  });

  it('gives the whole sale to a commission-free seller', () => {
    const { commissionAmount, sellerEarning } = splitLine(2300, 1, 0);

    expect(commissionAmount).toBe(0);
    expect(sellerEarning).toBe(2300);
  });

  /**
   * The two halves must always add back to the line total, whatever the rate
   * and however the rounding fell - otherwise the platform's books and the
   * seller's disagree by a rupee somewhere.
   */
  it.each([0, 2.5, 8, 15, 33.33, 100])('adds back up at %s%%', (rate) => {
    const { commissionAmount, sellerEarning } = splitLine(999.99, 3, rate);
    const lineTotal = Math.round(999.99 * 3 * 100) / 100;

    expect(Math.round((commissionAmount + sellerEarning) * 100) / 100).toBe(lineTotal);
  });

  it('refuses to read a nonsense rate as free', () => {
    // A missing or broken rate falls back to the default, never to zero: a bad
    // read must not cost the platform its commission.
    expect(splitLine(100, 1, undefined).commissionRate).toBe(8);
    expect(splitLine(100, 1, NaN).commissionRate).toBe(8);
  });

  it('clamps a rate that is out of range rather than trusting it', () => {
    expect(splitLine(100, 1, -5).commissionRate).toBe(0);
    expect(splitLine(100, 1, 150).commissionRate).toBe(100);
  });
});
