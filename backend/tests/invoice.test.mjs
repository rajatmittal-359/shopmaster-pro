/**
 * The seller's invoice number and the GST split (WHAT-IS-LEFT §3, 15 Sep 2026):
 * a Rule 46 serial per seller, issued once per confirmed order and never
 * shown unless stored; tax taken OUT of the inclusive price, CGST+SGST at
 * home and IGST across a border, and nothing guessed when the place of
 * supply is unclear.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const inv = require('../utils/invoice');

const q = (result) => ({ select: () => ({ lean: async () => result, then: (r) => Promise.resolve(result).then(r) }), lean: async () => result });

describe('the number', () => {
  it('reads <prefix>/<FY>/<sequence>, 16 characters or fewer, from letters, digits, - and /', () => {
    const n = inv.formatNumber('MJ', 42, new Date('2026-09-15'));
    expect(n).toBe('MJ/26-27/00042');
    expect(n.length).toBeLessThanOrEqual(16);
    expect(inv.formatNumber('SMP', 99999, new Date('2027-03-31'))).toMatch(/^[A-Z0-9/-]{1,16}$/);
  });
  it('knows the Indian financial year turns on 1 April - in IST, whatever the server clock', () => {
    expect(inv.financialYear(new Date('2026-03-31T12:00:00Z'))).toBe('25-26');
    expect(inv.financialYear(new Date('2026-04-01T00:00:00+05:30'))).toBe('26-27');
    // 31 March 23:00 UTC is already 1 April in Jaipur.
    expect(inv.financialYear(new Date('2026-03-31T23:00:00Z'))).toBe('26-27');
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
  it('a typo is an error the seller sees, not a blank saved quietly; a registered shop must give both; an unregistered one is never asked', () => {
    expect(inv.taxFactsError({ hsn: '71131' }, false)).toMatch(/4, 6 or 8 digits/);
    expect(inv.taxFactsError({ gstRate: 7 }, false)).toMatch(/GST rate must be/);
    expect(inv.taxFactsError({ hsn: '', gstRate: null }, false)).toBeNull();
    expect(inv.taxFactsError({ hsn: '7117', gstRate: null }, true)).toMatch(/GST-registered/);
    expect(inv.taxFactsError({ hsn: '7117', gstRate: 3 }, true)).toBeNull();
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
  it('never assumes "no tax": no rate or no scheme is null, not zero', () => {
    expect(inv.taxSplit(1000, null, 'cgst_sgst')).toBeNull();
    expect(inv.taxSplit(1000, 3, null)).toBeNull();
    expect(inv.taxSplit(1000, 0, 'igst')).toEqual({ taxable: 1000, cgst: 0, sgst: 0, igst: 0, tax: 0 });
  });
  it('decides home or away from the PIN code first, the typed state second, and says "unclear" rather than guess', () => {
    const raj = '08AAGFF2194N1Z1';
    expect(inv.taxScheme(raj, { state: 'Rajasthan', pincode: '302019' })).toBe('cgst_sgst');
    expect(inv.taxScheme(raj, { state: 'Delhi', pincode: '110001' })).toBe('igst');
    // A Rajasthan PIN with a typed state that does not match: not decided.
    expect(inv.taxScheme(raj, { state: 'Jaipur', pincode: '302019' })).toBeNull();
    // A PIN outside Rajasthan is a certain border, whatever was typed.
    expect(inv.taxScheme(raj, { state: 'Rajasthan', pincode: '400001' })).toBe('igst');
    expect(inv.taxScheme('07AAGFF2194N1Z1', { state: 'New Delhi', pincode: '110001' })).toBe('cgst_sgst');
    expect(inv.taxScheme('', { state: 'Delhi', pincode: '110001' })).toBeNull();
  });
  it('taxFor gives the page the whole picture, computed once: scheme, lines, totals, and how many lines could not be split', () => {
    const t = inv.taxFor('08AAGFF2194N1Z1', { state: 'Rajasthan', pincode: '302019' }, [
      { _id: 'a', price: 515, quantity: 2, gstRate: 3 },
      { _id: 'b', price: 200, quantity: 1, gstRate: null },
    ]);
    expect(t.scheme).toBe('cgst_sgst');
    expect(t.lines.a).toEqual({ taxable: 1000, cgst: 15, sgst: 15, igst: 0, tax: 30 });
    expect(t.lines.b).toBeNull();
    expect(t.unsplit).toBe(1);
    expect(t.totals.taxable).toBe(1000);
    expect(inv.taxFor('', {}, [])).toBeNull();
  });
});

describe('issuing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('gives each seller on the order one number, counts on the Seller, and writes once', async () => {
    let seq = 7;
    vi.spyOn(Seller, 'find').mockImplementation(() => q([{ userId: 'a' }, { userId: 'b' }]));
    vi.spyOn(Seller, 'findOneAndUpdate').mockImplementation(() => ({ select: async () => ({ _id: 'sel', invoiceSeq: ++seq, invoicePrefix: 'MJ', businessName: 'Meera Jewels' }) }));
    const upd = vi.spyOn(Order, 'updateOne').mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    const order = { _id: 'o1', items: [{ sellerId: 'a', status: 'active' }, { sellerId: 'a', status: 'active' }, { sellerId: 'b', status: 'active' }, { sellerId: 'c', status: 'cancelled' }] };
    const out = await inv.assignInvoiceNumbers(order);
    expect(out.map((x) => x.sellerId)).toEqual(['a', 'b']);
    expect(out[0].number).toMatch(/^MJ\/\d\d-\d\d\/00008$/);
    expect(out[1].number).toMatch(/\/00009$/);
    expect(upd).toHaveBeenCalledWith({ _id: 'o1', 'invoices.0': { $exists: false } }, { $set: { invoices: out } });
    expect(order.invoices).toBe(out);
  });
  it('does nothing to an order that already has its numbers - a replayed webhook issues no second set', async () => {
    const f = vi.spyOn(Seller, 'findOneAndUpdate');
    const out = await inv.assignInvoiceNumbers({ _id: 'o1', invoices: [{ sellerId: 'a', number: 'MJ/26-27/00001' }], items: [{ sellerId: 'a' }] });
    expect(out).toHaveLength(1);
    expect(f).not.toHaveBeenCalled();
  });
  it('when two opens race, the loser shows the STORED numbers and says which it burned - never a number the database lacks', async () => {
    vi.spyOn(Seller, 'find').mockImplementation(() => q([{ userId: 'a' }]));
    vi.spyOn(Seller, 'findOneAndUpdate').mockImplementation(() => ({ select: async () => ({ _id: 'sel', invoiceSeq: 43, invoicePrefix: 'MJ', businessName: 'Meera Jewels' }) }));
    vi.spyOn(Order, 'updateOne').mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
    vi.spyOn(Order, 'findById').mockImplementation(() => q({ invoices: [{ sellerId: 'a', number: 'MJ/26-27/00042' }] }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const order = { _id: 'o1', items: [{ sellerId: 'a', status: 'active' }] };
    const out = await inv.assignInvoiceNumbers(order);
    expect(out[0].number).toBe('MJ/26-27/00042');
    expect(order.invoices[0].number).toBe('MJ/26-27/00042');
    expect(warn.mock.calls[0].join(' ')).toMatch(/burned: MJ\/\d\d-\d\d\/00043/);
  });
  it('a missing Seller document stops the issue BEFORE any number is drawn, so no other seller\'s series gets a hole', async () => {
    vi.spyOn(Seller, 'find').mockImplementation(() => q([{ userId: 'a' }]));
    const inc = vi.spyOn(Seller, 'findOneAndUpdate');
    await expect(inv.assignInvoiceNumbers({ _id: 'o1', items: [{ sellerId: 'a' }, { sellerId: 'ghost' }] })).rejects.toThrow(/no Seller document for user ghost/);
    expect(inc).not.toHaveBeenCalled();
  });
  it('fixes the prefix from the shop name the first time and keeps it', async () => {
    vi.spyOn(Seller, 'findOneAndUpdate').mockImplementation(() => ({ select: async () => ({ _id: 'sel', invoiceSeq: 1, invoicePrefix: '', businessName: 'Shree Radhe Krishna Sarees' }) }));
    const set = vi.spyOn(Seller, 'updateOne').mockResolvedValue({});
    const n = await inv.nextInvoiceNumber('u1', { at: new Date('2026-09-15') });
    expect(n).toBe('SRK/26-27/00001');
    expect(set).toHaveBeenCalledWith({ _id: 'sel', invoicePrefix: { $in: ['', null] } }, { $set: { invoicePrefix: 'SRK' } });
  });
});
