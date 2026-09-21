/**
 * TOTP (RFC 6238) on Node's own crypto - the admin's second factor
 * (22 Sep 2026). No package: HMAC-SHA1 over a 30-second counter, six digits,
 * base32 secrets that Google Authenticator, Authy and 1Password accept by
 * hand ("enter a setup key") or through the otpauth:// URI.
 *
 * WHY
 *   Shopify lets every staff account turn two-step on and makes owners on
 *   Plus require it; ours is mandatory for the admin (money, every seller's
 *   data) and optional for sellers. The password + emailed code on a new
 *   device stays as it is; this is the step for every admin sign-in.
 *
 * WHAT IS CHECKED
 *   The current 30 s window and one either side (clock drift on a phone).
 *   Constant-time comparison. Replays inside a window are the caller's job
 *   (authController remembers the last counter used).
 */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const base32Encode = (buf) => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
};

const base32Decode = (str) => {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

/** 20 random bytes → 32 base32 characters (the length every app expects). */
const generateSecret = () => base32Encode(crypto.randomBytes(20));

const hotp = (secretBase32, counter, digits) => {
  const key = base32Decode(secretBase32);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | ((h[offset + 1] & 0xff) << 16) | ((h[offset + 2] & 0xff) << 8) | (h[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
};

/** The code for a moment (`time` in seconds; now by default). */
const totp = (secretBase32, { time = Date.now() / 1000, step = 30, digits = 6 } = {}) => hotp(secretBase32, Math.floor(time / step), digits);

/** True when `code` is this window's or a neighbour's. Returns the matched counter via `out.counter` when given. */
const verifyTotp = (secretBase32, code, { time = Date.now() / 1000, step = 30, digits = 6, window = 1, out = null } = {}) => {
  const given = String(code || '').replace(/\s+/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(given)) return false;
  const counter = Math.floor(time / step);
  for (let d = -window; d <= window; d += 1) {
    const expected = hotp(secretBase32, counter + d, digits);
    if (expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
      if (out) out.counter = counter + d;
      return true;
    }
  }
  return false;
};

/** The URI a phone app scans or reads. */
const otpauthUri = ({ secret, account, issuer = 'ShopMaster Pro' }) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/*
 * The secret at rest: AES-256-GCM under a key derived from JWT_SECRET. A
 * database read alone must not yield working authenticator secrets.
 */
const boxKey = () => crypto.createHash('sha256').update(`totp:${process.env.JWT_SECRET || ''}`).digest();
const sealSecret = (secret) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', boxKey(), iv);
  const enc = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
};
const openSecret = (sealed) => {
  const [iv, tag, enc] = String(sealed || '').split('.').map((x) => Buffer.from(x, 'base64'));
  if (!iv || !tag || !enc) return null;
  const d = crypto.createDecipheriv('aes-256-gcm', boxKey(), iv);
  d.setAuthTag(tag);
  try { return Buffer.concat([d.update(enc), d.final()]).toString('utf8'); } catch { return null; }
};

module.exports = { generateSecret, totp, verifyTotp, otpauthUri, base32Encode, base32Decode, sealSecret, openSecret };
