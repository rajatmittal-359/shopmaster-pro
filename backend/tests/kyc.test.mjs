/**
 * Seller identity checks (plan 2.40, 15 Sep 2026) - free, offline, facts not verdicts.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const kyc = require('../utils/kyc');

describe('PAN', () => {
  it('accepts a well-formed PAN and names the holder type from the fourth letter', () => {
    expect(kyc.checkPan('abcpd1234e')).toMatchObject({ ok: true, value: 'ABCPD1234E', type: 'individual' });
    expect(kyc.checkPan('AAGFF2194N').type).toBe('partnership firm');
    expect(kyc.checkPan('AABCU9603R').type).toBe('company');
  });
  it('rejects the wrong length or shape with a reason a person can act on', () => {
    expect(kyc.checkPan('ABCD12345').ok).toBe(false);
    expect(kyc.checkPan('1BCPD1234E').reason).toMatch(/shape/);
    expect(kyc.checkPan('').reason).toMatch(/empty/);
  });
});

describe('GSTIN', () => {
  it('passes two published, real GSTINs (checksum, state, embedded PAN)', () => {
    expect(kyc.checkGstin('27AAPFU0939F1ZV')).toMatchObject({ ok: true, pan: 'AAPFU0939F', stateCode: '27', state: 'Maharashtra' });
    expect(kyc.checkGstin(' 07aagff2194n1z1 ')).toMatchObject({ ok: true, pan: 'AAGFF2194N', state: 'Delhi' });
  });
  it('catches a single mistyped character through the check digit', () => {
    expect(kyc.checkGstin('27AAPFU0939F1ZW')).toMatchObject({ ok: false });
    expect(kyc.checkGstin('27AAPFU0939F1ZW').reason).toMatch(/check digit/);
    expect(kyc.checkGstin('27AAPFU0938F1ZV').ok).toBe(false);
  });
  it('refuses a state code that does not exist and the wrong length', () => {
    expect(kyc.checkGstin('99AAPFU0939F1ZV').reason).toMatch(/state/);
    expect(kyc.checkGstin('27AAPFU0939F1Z').reason).toMatch(/15/);
  });
});

describe('Enrolment number (no GSTIN)', () => {
  it('reads the state and the PAN inside', () => {
    expect(kyc.checkEnrolment('08ABCPD1234E1ZX')).toMatchObject({ ok: true, pan: 'ABCPD1234E', state: 'Rajasthan' });
    expect(kyc.checkEnrolment('08ABC123').ok).toBe(false);
  });
});

describe('IFSC', () => {
  it('checks the shape offline', () => {
    expect(kyc.checkIfsc('hdfc0001234')).toMatchObject({ ok: true, value: 'HDFC0001234' });
    expect(kyc.checkIfsc('HDFC1001234').ok).toBe(false);
  });
  it('looks a branch up on Razorpay\'s dataset and never throws', async () => {
    const fetchImpl = vi.fn(async (url) => (url.endsWith('HDFC0003550') ? { ok: true, status: 200, json: async () => ({ BANK: 'HDFC Bank', BRANCH: 'VAISHALI NAGAR JAIPUR', CITY: 'JAIPUR', STATE: 'RAJASTHAN', UPI: true }) } : { ok: false, status: 404 }));
    expect(await kyc.lookupIfsc('HDFC0003550', { fetchImpl })).toMatchObject({ ok: true, bank: 'HDFC Bank', branch: 'VAISHALI NAGAR JAIPUR', upi: true });
    expect(await kyc.lookupIfsc('HDFC0009999', { fetchImpl })).toMatchObject({ ok: false, reason: 'No bank branch has this IFSC' });
    const down = vi.fn(async () => { throw new Error('ECONNRESET'); });
    expect((await kyc.lookupIfsc('HDFC0003550', { fetchImpl: down })).ok).toBe(false);
  });
});

describe('PIN ↔ state and names', () => {
  it('knows Jaipur is in Rajasthan and Bengaluru is not', () => {
    expect(kyc.pinMatchesState('302019', '08')).toBe(true);
    expect(kyc.pinMatchesState('560038', '08')).toBe(false);
    expect(kyc.pinMatchesState('30201', '08')).toBeNull();
  });
  it('reads names the way a person does', () => {
    expect(kyc.namesAgree('Meera Jewels', 'ABHA MITTAL (MEERA JEWELS)')).toBe(true);
    expect(kyc.namesAgree('Meera Jewels Pvt Ltd', 'meera jewels')).toBe(true);
    expect(kyc.namesAgree('Rajat Mittal', 'Meera Jewels')).toBe(false);
    expect(kyc.namesAgree('', 'x')).toBeNull();
  });
});

describe('applicationChecks - the admin\'s list', () => {
  it('ticks a consistent Jaipur GST seller and flags a mismatch', () => {
    const good = kyc.applicationChecks({
      businessName: 'Meera Jewels',
      application: { pan: 'AAGFF2194N', gstMode: 'gstin', gstin: '07AAGFF2194N1Z1', shopPhoto: 'https://x/y.jpg' },
      pickupAddress: { pincode: '110001' },
      bankDetails: { accountNumber: '1', ifscCode: 'HDFC0003550', accountHolderName: 'Meera Jewels', bankName: 'HDFC Bank', branch: 'Jaipur' },
    });
    const byKey = Object.fromEntries(good.map((c) => [c.key, c.ok]));
    expect(byKey).toMatchObject({ pan: true, gstin: true, 'gst-pan': true, 'gst-state': true, ifsc: true, 'bank-name': true, photo: true });

    const bad = kyc.applicationChecks({
      businessName: 'Meera Jewels',
      application: { pan: 'ABCPD1234E', gstMode: 'gstin', gstin: '07AAGFF2194N1Z1' },
      pickupAddress: { pincode: '302019' },
      bankDetails: { accountNumber: '1', ifscCode: 'HDFC0003550', accountHolderName: 'Rajat Mittal' },
    });
    const b = Object.fromEntries(bad.map((c) => [c.key, c]));
    expect(b['gst-pan'].ok).toBe(false);
    expect(b['gst-pan'].label).toContain('AAGFF2194N');
    expect(b['gst-state'].ok).toBe(false);
    expect(b['bank-name'].ok).toBe(false);
    expect(b.ifsc.ok).toBeNull();
    expect(b.photo.ok).toBeNull();
  });

  it('an application with nothing is dashes, and says what the no-GST route allows', () => {
    const c = kyc.applicationChecks({ businessName: 'New shop' });
    expect(c.every((x) => x.ok === null)).toBe(true);
    expect(c.find((x) => x.key === 'gst').label).toMatch(/Rajasthan only/);
  });

  it('an enrolled (no-GSTIN) seller shipping from another state is flagged', () => {
    const c = kyc.applicationChecks({ application: { pan: 'ABCPD1234E', gstMode: 'enrolment', enrolmentNumber: '08ABCPD1234E1ZX' }, pickupAddress: { pincode: '400001' } });
    expect(c.find((x) => x.key === 'enrolment').ok).toBe(true);
    expect(c.find((x) => x.key === 'enrol-state').ok).toBe(false);
  });
});
