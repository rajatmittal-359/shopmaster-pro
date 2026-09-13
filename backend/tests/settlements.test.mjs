/** Money in vs money out - the digest's one honest line (plan 2.24). */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { weekSettlement, settlementLine } = require('../utils/settlements');
const Payout = require('../models/Payout');
const Order = require('../models/Order');

const stub = () => {
  const o = { pf: Payout.find, of: Order.find };
  Payout.find = vi.fn(() => ({ select: () => ({ lean: async () => [{ netPayable: 4000 }, { netPayable: 2500 }] }) }));
  Order.find = vi.fn(() => ({ select: () => ({ lean: async () => [{ totalAmount: 5000, paymentMethod: 'razorpay' }, { totalAmount: 1200, paymentMethod: 'cod' }] }) }));
  return () => { Payout.find = o.pf; Order.find = o.of; };
};

describe('weekSettlement', () => {
  it('compares what Razorpay settled with what was paid out, in rupees', async () => {
    const restore = stub();
    try {
      const s = await weekSettlement({ fetchSettlements: async () => [{ amount: 480000 }, { amount: 20000 }] });
      expect(s).toMatchObject({ settled: 5000, settledCount: 2, paidOut: 6500, paidOutCount: 2, collectedOnline: 5000, cod: 1200, note: null });
      expect(settlementLine(s)).toMatch(/₹1,500 paid out beyond what settled - check/);
    } finally {
      restore();
    }
  });
  it('says plainly when settlements cannot be read - no zero that looks like a fact', async () => {
    const restore = stub();
    try {
      const s = await weekSettlement({ fetchSettlements: async () => { throw new Error('no Razorpay key'); } });
      expect(s.settled).toBeNull();
      expect(settlementLine(s)).toMatch(/could not be read \(no Razorpay key\)/);
      expect(settlementLine(s)).toMatch(/Paid out to sellers ₹6,500/);
    } finally {
      restore();
    }
  });
});
