/**
 * TOTP (RFC 6238) in Node's own crypto - the admin's second factor (22 Sep
 * 2026). Vectors from RFC 6238 Appendix B (SHA-1, 8 digits) prove the
 * arithmetic; the rest is our policy: 6 digits, 30 s step, ±1 step drift,
 * base32 secrets a phone app accepts by hand.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { generateSecret, totp, verifyTotp, otpauthUri, base32Encode, sealSecret, openSecret } = require('../utils/auth/totp');

describe('totp', () => {
  // RFC 6238 test secret "12345678901234567890" (ASCII) -> base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
  const SECRET = base32Encode(Buffer.from('12345678901234567890', 'ascii'));
  it('matches the RFC 6238 SHA-1 vectors', () => {
    expect(totp(SECRET, { time: 59, digits: 8 })).toBe('94287082');
    expect(totp(SECRET, { time: 1111111109, digits: 8 })).toBe('07081804');
    expect(totp(SECRET, { time: 1234567890, digits: 8 })).toBe('89005924');
  });
  it('verifies the current code and one step either side, nothing further', () => {
    const now = 1_700_000_000;
    expect(verifyTotp(SECRET, totp(SECRET, { time: now }), { time: now })).toBe(true);
    expect(verifyTotp(SECRET, totp(SECRET, { time: now - 30 }), { time: now })).toBe(true);
    expect(verifyTotp(SECRET, totp(SECRET, { time: now + 30 }), { time: now })).toBe(true);
    expect(verifyTotp(SECRET, totp(SECRET, { time: now - 90 }), { time: now })).toBe(false);
    expect(verifyTotp(SECRET, '000000', { time: now })).toBe(false);
    expect(verifyTotp(SECRET, 'abc', { time: now })).toBe(false);
  });
  it('makes a 32-character base32 secret and an otpauth uri a phone app reads', () => {
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    const uri = otpauthUri({ secret: s, account: 'admin@example.com', issuer: 'ShopMaster Pro' });
    expect(uri.startsWith('otpauth://totp/ShopMaster%20Pro:admin%40example.com?')).toBe(true);
    expect(uri).toContain(`secret=${s}`);
    expect(uri).toContain('issuer=ShopMaster%20Pro');
  });
});

describe('the secret at rest', () => {
  it('round-trips through AES-GCM and refuses a tampered box', () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const s = generateSecret();
    const sealed = sealSecret(s);
    expect(sealed).not.toContain(s);
    expect(openSecret(sealed)).toBe(s);
    expect(openSecret(sealed.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')))).toBeNull();
    expect(openSecret('garbage')).toBeNull();
  });
});
