/**
 * The seller is given a bill for the commission (19 Oct 2026, plan 2.85).
 *
 * Amazon, Flipkart and Meesho issue each seller a monthly invoice for the
 * fees they charged - the document a seller files and their accountant asks
 * for. Ours showed "Commission charged" as a figure and issued nothing.
 *
 * The figures already exist: every paid payout carries the commission it
 * kept and the charges it deducted. The statement is those payouts, grouped
 * by the IST month they were paid in, numbered once and never re-issued.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { monthsFromPayouts, buildStatement, isClosedMonth, formatCommissionNumber } = require('../utils/commissionInvoice');

// 31 Oct 2026 20:00 UTC is 1 Nov 01:30 in Jaipur: an October payout by the
// box's clock, a November one by the seller's.
const payouts = [
  { _id: 'p1', payoutNumber: 'PO-1', paidAt: new Date('2026-10-05T06:00:00Z'), periodFrom: new Date('2026-09-20'), periodTo: new Date('2026-09-30'), grossSales: 1000, commission: 80, deductions: 0, netPayable: 920 },
  { _id: 'p2', payoutNumber: 'PO-2', paidAt: new Date('2026-10-20T06:00:00Z'), periodFrom: new Date('2026-10-01'), periodTo: new Date('2026-10-12'), grossSales: 2500, commission: 200, deductions: 50, netPayable: 2250 },
  { _id: 'p3', payoutNumber: 'PO-3', paidAt: new Date('2026-10-31T20:00:00Z'), periodFrom: new Date('2026-10-13'), periodTo: new Date('2026-10-25'), grossSales: 500, commission: 40, deductions: 0, netPayable: 460 },
  { _id: 'p4', payoutNumber: 'PO-4', paidAt: new Date('2026-09-10T06:00:00Z'), grossSales: 300, commission: 0, deductions: 0, netPayable: 300 },
];

describe('months come from when the money was settled, in Jaipur time', () => {
  it('groups paid payouts by IST month and skips a month that charged nothing', () => {
    const months = monthsFromPayouts(payouts);

    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-10']);
    expect(months.find((m) => m.month === '2026-10')).toMatchObject({ commission: 280, charges: 50, total: 330, payouts: 2 });
  });
});

describe('one month, one statement', () => {
  it('lists every payout of the month and adds them up', () => {
    const s = buildStatement(payouts, '2026-10');

    expect(s.lines.map((l) => l.payoutNumber)).toEqual(['PO-1', 'PO-2']);
    expect(s).toMatchObject({ grossSales: 3500, commission: 280, charges: 50, total: 330 });
  });

  it('is issued only for a month that is over, in IST', () => {
    const now = new Date('2026-11-01T00:30:00Z'); // 1 Nov 06:00 IST
    expect(isClosedMonth('2026-10', now)).toBe(true);
    expect(isClosedMonth('2026-11', now)).toBe(false);
    expect(isClosedMonth('2026-13', now)).toBe(false);
    expect(isClosedMonth('nonsense', now)).toBe(false);
  });

  it('is numbered in the financial year of the month it covers', () => {
    expect(formatCommissionNumber(7, '2026-10')).toBe('SMP/COM/26-27/00007');
    expect(formatCommissionNumber(12, '2027-03')).toBe('SMP/COM/26-27/00012');
    expect(formatCommissionNumber(13, '2027-04')).toBe('SMP/COM/27-28/00013');
  });
});
