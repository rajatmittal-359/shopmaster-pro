/**
 * Forgotten passwords.
 *
 * There was no way to reset one. Anyone who forgot theirs was locked out for
 * good: they could not sign in, and registering again is refused because the
 * address is already taken. That is a dead end for a customer and a dead shop
 * for a seller.
 *
 * The two properties worth holding here are security ones, and neither is
 * visible by using the feature:
 *
 *   The reply NEVER says whether an address has an account. A different answer
 *   for a real one turns this into a way to enumerate every registered email on
 *   the platform, one address at a time.
 *
 *   Only the HASH of the token is stored. The token itself lives in the email
 *   and nowhere else, so a dump of the users collection cannot reset anybody's
 *   password.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = require('../app');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

const REAL_EMAIL = 'real@test.local';
const UNKNOWN_EMAIL = 'nobody@test.local';

const originals = {};
let stored; // the fake row, standing in for the database
let sent; // emails the controller tried to send

/** A user document with just enough behaviour for the controller. */
const makeUser = () => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    name: 'Real Person',
    email: REAL_EMAIL,
    password: 'old-password-hash',
    isVerified: false,
    resetTokenHash: undefined,
    resetTokenExpiry: undefined,
    resetLastSentAt: undefined,
    generateResetToken: User.schema.methods.generateResetToken,
    save: vi.fn(async function saveDoc() {
      stored = this;
      return this;
    }),
  };
  return doc;
};

beforeEach(() => {
  originals.findOne = User.findOne;
  originals.send = sendEmail.send;

  stored = makeUser();
  sent = [];

  // Stand in for both shapes the controller queries with: by email, and by
  // token hash + unexpired.
  User.findOne = vi.fn((filter) => {
    const q = {
      select: () => q,
      then: (resolve) => resolve(match(filter)),
    };
    return q;
  });

  const match = (filter) => {
    if (filter.email) return filter.email === REAL_EMAIL ? stored : null;
    if (filter.resetTokenHash) {
      const live =
        stored.resetTokenHash === filter.resetTokenHash &&
        stored.resetTokenExpiry &&
        stored.resetTokenExpiry > new Date();
      return live ? stored : null;
    }
    return null;
  };

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, status: 201, text: async () => '{}' };
  });
});

afterEach(() => {
  User.findOne = originals.findOne;
  vi.restoreAllMocks();
});

const forgot = (email) =>
  request(app).post('/api/auth/forgot-password').send({ email });

const reset = (token, password) =>
  request(app).post('/api/auth/reset-password').send({ token, password });

/** Pull the reset token out of the link in the email that was sent. */
const tokenFromEmail = () => {
  const body = JSON.stringify(sent.at(-1));
  const m = body.match(/reset-password\?token=([a-f0-9]{64})/);
  return m && m[1];
};

describe('asking for a reset link', () => {
  it('gives the SAME answer for an address with no account', async () => {
    const real = await forgot(REAL_EMAIL);
    const unknown = await forgot(UNKNOWN_EMAIL);

    expect(real.status).toBe(200);
    expect(unknown.status).toBe(200);
    // Byte for byte. Any difference at all is the leak.
    expect(unknown.body.message).toBe(real.body.message);
  });

  it('never says whether the address exists', async () => {
    const res = await forgot(REAL_EMAIL);
    expect(res.body.message).toMatch(/if there is an account/i);
  });

  it('mails a link to a real address', async () => {
    await forgot(REAL_EMAIL);

    expect(sent).toHaveLength(1);
    expect(tokenFromEmail()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('mails nothing to an address with no account', async () => {
    await forgot(UNKNOWN_EMAIL);
    expect(sent).toHaveLength(0);
  });

  it('stores only the HASH, never the token itself', async () => {
    await forgot(REAL_EMAIL);
    const raw = tokenFromEmail();

    expect(stored.resetTokenHash).toBe(
      crypto.createHash('sha256').update(raw).digest('hex')
    );
    // The token must not be recoverable from the row under any field.
    expect(JSON.stringify(stored)).not.toContain(raw);
  });

  /**
   * A 429 that only ever appears for real accounts is the same leak by another
   * route, so the throttle answers exactly like everything else.
   */
  it('throttles quietly, without changing the answer', async () => {
    const first = await forgot(REAL_EMAIL);
    const second = await forgot(REAL_EMAIL);

    expect(second.status).toBe(200);
    expect(second.body.message).toBe(first.body.message);
    expect(sent).toHaveLength(1);
  });
});

describe('using the reset link', () => {
  it('sets the new password', async () => {
    await forgot(REAL_EMAIL);
    const res = await reset(tokenFromEmail(), 'brand-new-password');

    expect(res.status).toBe(200);
    expect(stored.password).toBe('brand-new-password');
  });

  it('works once, and never again', async () => {
    await forgot(REAL_EMAIL);
    const token = tokenFromEmail();

    expect((await reset(token, 'first-password')).status).toBe(200);

    const again = await reset(token, 'second-password');
    expect(again.status).toBe(400);
    expect(again.body.message).toMatch(/expired or has already been used/i);
    // The second attempt must not have taken effect.
    expect(stored.password).toBe('first-password');
  });

  it('refuses a token that has expired', async () => {
    await forgot(REAL_EMAIL);
    const token = tokenFromEmail();
    stored.resetTokenExpiry = new Date(Date.now() - 1000);

    const res = await reset(token, 'new-password');
    expect(res.status).toBe(400);
  });

  it('refuses a made-up token', async () => {
    await forgot(REAL_EMAIL);

    const res = await reset('f'.repeat(64), 'new-password');
    expect(res.status).toBe(400);
    expect(stored.password).toBe('old-password-hash');
  });

  it('refuses a password too short to be worth setting', async () => {
    await forgot(REAL_EMAIL);

    const res = await reset(tokenFromEmail(), 'abc');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least/i);
    expect(stored.password).toBe('old-password-hash');
  });

  /**
   * Resetting a password proves the person reads the inbox, which is the same
   * thing the OTP asks for - so an unverified account should not be left
   * unverified and unable to sign in with its brand new password.
   */
  it('verifies an account that had never verified', async () => {
    await forgot(REAL_EMAIL);
    await reset(tokenFromEmail(), 'brand-new-password');

    expect(stored.isVerified).toBe(true);
  });
});
