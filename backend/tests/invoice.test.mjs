/**
 * The seller's invoice number and the GST split (WHAT-IS-LEFT §3, 15 Sep 2026):
 * a Rule 46 serial per seller, issued once per confirmed order; tax taken OUT
 * of the inclusive price, CGST+SGST at home and IGST across a border.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const inv = require('../utils/invoice');

describe('the number', () => {
  it('reads <prefix>/<FY>/<sequence>, 16 characters or fewer, from letters, digits, - and /', () => {
    const n = inv.formatNumber('MJ', 42, new Date('2026-09-15'));
    expect(n).toBe('MJ/26-27/00042');
    expect(n.length).toBeLessThanOrEqual(16);
    expect(inv.formatNumber('SMP', 99999, new Date('2027-03-31'))).toMatch(/^[A-Z0-9/-]{1,16}$/);
  });
  it('knows the Indian financial year turns on 1 April', () => {
    expect(inv.financialYear(new Date('2026-03-31'))).toBe('25-26');
    expect(inv.financialYear(new Date('2026-04-01'))).toBe('26-27');
    expect(inv.financialYear(new Date('2027-01-10'))).toBe('26-27');
  });
  it('takes the prefix from the shop name and never leaves it empty', () => {
    expect(inv.prefixFor('Meera Jewels')).toBe('MJ');
    expect(inv.prefixFor('Shree Radhe Krishna Sarees')).toBe('SRK');
    expect(inv.prefixFor('Zara')).toBe('ZAR');
    expect(inv.prefixFor('मीरा ज्वेलर्स')).toBe('SMP');
    expect(inv.prefixFor('')).toBe('SMP');
  });
});

describe('HSN and rate as typed', () => {
  it('keeps a 4, 6 or 8 digit HSN and drops anything else', () => {
    expect(inv.cleanHsn('7113')).toBe('7113');
    expect(inv.cleanHsn('7113 19 10')).toBe('71131910');
    expect(inv.cleanHsn('711')).toBe('');
    expect(inv.cleanHsn('71131')).toBe('');
  });
  it('accepts only the slabs', () => {
    expect(inv.cleanGstRate('3')).toBe(3);
    expect(inv.cleanGstRate(0)).toBe(0);
    expect(inv.cleanGstRate('')).toBeNull();
    expect(inv.cleanGstRate(7)).toBeNull();
  });
});

describe('the split', () => {
  it('takes the tax out of the inclusive price - the customer pays what they saw', () => {
    const s = inv.taxSplit(1030, 3, 'cgst_sgst');
    expect(s).toEqual({ taxable: 1000, cgst: 15, sgst: 15, igst: 0, tax: 30 });
    expect(s.taxable + s.cgst + s.sgst).toBe(1030);
  });
  it('is IGST in one line across a state border, and the parts always add up to the paisa', () => {
    const s = inv.taxSplit(999, 18, 'igst');
    expect(s.igst).toBe(s.tax);
    expect(s.cgst + s.sgst).toBe(0);
    expect(Math.round((s.taxable + s.igst) * 100)).toBe(99900);
    const odd = inv.taxSplit(101, 5, 'cgst_sgst');
    expect(Math.round((odd.cgst + odd.sgst) * 100)).toBe(Math.round(odd.tax * 100));
  });
  it('decides home or away from the GSTIN state code against the delivery state', () => {
    expect(inv.taxScheme('08AAGFF2194N1Z1', 'Rajasthan')).toBe('cgst_sgst');
    expect(inv.taxScheme('08AAGFF2194N1Z1', 'Delhi')).toBe('igst');
    expect(inv.taxScheme('07AAGFF2194N1Z1', 'delhi ')).toBe('cgst_sgst');
    expect(inv.taxScheme('', 'Delhi')).toBeNull();
  });
});

describe('issuing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives each seller on the order one number, counts on the Seller, and writes once', async () => {
    let seq = 7;
    vi.spyOn(Seller, 'findOneAndUpdate').mockImplementation(() => ({ select: async () => ({ _id: 'sel', invoiceSeq: ++seq, invoicePrefix: 'MJ', businessName: 'Meera Jewels' }) }));
    const upd = vi.spyOn(Order, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    const order = { _id: 'o1', items: [{ sellerId: 'a', status: 'active' }, { sellerId: 'a', status: 'active' }, { sellerId: 'b', status: 'active' }, { sellerId: 'c', status: 'cancelled' }] };
    const out = await inv.assignInvoiceNumbers(order);
    expect(out.map((x) => x.sellerId)).toEqual(['a', 'b']);
    expect(out[0].number).toMatch(/^MJ\/\d\d-\d\d\/00008$/);
    expect(out[1].number).toMatch(/\/00009$/);
    expect(upd).toHaveBeenCalledWith({ _id: 'o1', 'invoices.0': { $exists: false } }, { $set: { invoices: out } }, { session: null });
    expect(order.invoices).toBe(out);
  });
  it('does nothing to an order that already has its numbers - a replayed webhook issues no second set', async () => {
    const f = vi.spyOn(Seller, 'findOneAndUpdate');
    const out = await inv.assignInvoiceNumbers({ _id: 'o1', invoices: [{ sellerId: 'a', number: 'MJ/26-27/00001' }], items: [{ sellerId: 'a' }] });
    expect(out).toHaveLength(1);
    expect(f).not.toHaveBeenCalled();
  });
  it('fixes the prefix from the shop name the first time and keeps it', async () => {
    vi.spyOn(Seller, 'findOneAndUpdate').mockImplementation(() => ({ select: async () => ({ _id: 'sel', invoiceSeq: 1, invoicePrefix: '', businessName: 'Shree Radhe Krishna Sarees' }) }));
    const set = vi.spyOn(Seller, 'updateOne').mockResolvedValue({});
    const n = await inv.nextInvoiceNumber('u1', { at: new Date('2026-09-15') });
    expect(n).toBe('SRK/26-27/00001');
    expect(set).toHaveBeenCalledWith({ _id: 'sel', invoicePrefix: { $in: ['', null] } }, { $set: { invoicePrefix: 'SRK' } }, { session: null });
  });
});
