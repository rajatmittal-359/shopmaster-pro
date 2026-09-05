/**
 * Signing up when the email will not send.
 *
 * This was live on the real shop. The mail provider's plan had run out of
 * credit, so every send came back 401 "Maximum credits exceeded" - and
 * registration did this:
 *
 *   1. user.save()   succeeds, the account now exists
 *   2. sendEmail()   throws
 *   3. catch         answers 500 "Server error"
 *
 * The customer reads "Server error", assumes nothing happened, and signs up
 * again - and is told the email is already taken. Registered, unverified, no
 * code ever delivered, unable to log in and unable to try again. There was no
 * resend route either, so there was no way out at all.
 *
 * An account that has been created must never be reported as a failure, and
 * there must always be a way to ask for another code.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../app');
const User = require('../models/User');
const Seller = require('../models/Seller');

// Stubbed at the real boundary - the network call itself - rather than at our
// own wrapper, so the wrapper's own behaviour is exercised too. Since the move
// to Brevo that boundary is `fetch`, not a provider SDK.

/** Exactly what the provider returned while the plan was out of credit. */
const OUT_OF_CREDIT = {
  ok: false,
  status: 401,
  text: async () => '{"errors":[{"message":"Maximum credits exceeded"}]}',
};

const ACCEPTED = { ok: true, status: 201, text: async () => '{"messageId":"<t@brevo>"}' };

const originals = {};
let saved;
let existing;

const NEW_ACCOUNT = {
  name: 'Rajat',
  email: 'buyer@example.com',
  password: 'secret123',
  role: 'customer',
};

beforeEach(async () => {
  originals.fetch = global.fetch;
  originals.findOne = User.findOne;
  originals.save = User.prototype.save;
  originals.sellerCreate = Seller.create;

  saved = [];
  existing = null;

  User.findOne = vi.fn(() => ({
    select: () => Promise.resolve(existing),
    then: (resolve) => resolve(existing),
  }));
  User.prototype.save = vi.fn(async function save() {
    this._id = this._id || new mongoose.Types.ObjectId();
    saved.push(this);
    return this;
  });
  Seller.create = vi.fn(async (doc) => doc);
});

afterEach(() => {
  // fetch is replaced outright rather than spied on, so restoreAllMocks does
  // not put it back - it has to be restored by hand.
  global.fetch = originals.fetch;
  User.findOne = originals.findOne;
  User.prototype.save = originals.save;
  Seller.create = originals.sellerCreate;
  vi.restoreAllMocks();
});

const whenMailerFails = () => (global.fetch = vi.fn(async () => OUT_OF_CREDIT));
const whenMailerWorks = () => (global.fetch = vi.fn(async () => ACCEPTED));

describe('the mail provider is out of credit', () => {
  it('still reports the account as created', async () => {
    whenMailerFails();

    const res = await request(app).post('/api/auth/register').send(NEW_ACCOUNT);

    // Not 500. The account exists; calling that a server error is what sent
    // people back to register a second time.
    expect(res.status).toBe(201);
    expect(res.status).not.toBe(500);
  });

  it('says the code did not go, rather than telling them to check their inbox', async () => {
    whenMailerFails();

    const res = await request(app).post('/api/auth/register').send(NEW_ACCOUNT);

    expect(res.body.emailSent).toBe(false);
    expect(res.body.message).toMatch(/could not be sent/i);
    // Sending someone to wait for a message that was never accepted is worse
    // than saying nothing.
    expect(res.body.message).not.toMatch(/check your email/i);
  });

  it('keeps the account, so the code can be re-sent to it', async () => {
    whenMailerFails();

    await request(app).post('/api/auth/register').send(NEW_ACCOUNT);

    expect(saved).toHaveLength(1);
    expect(saved[0].email).toBe(NEW_ACCOUNT.email);
  });
});

describe('when the mail does go', () => {
  it('says so', async () => {
    whenMailerWorks();

    const res = await request(app).post('/api/auth/register').send(NEW_ACCOUNT);

    expect(res.status).toBe(201);
    expect(res.body.emailSent).toBe(true);
    expect(res.body.message).toMatch(/check your email/i);
  });

  it('records when the code was sent, so a resend can be paced', async () => {
    whenMailerWorks();

    await request(app).post('/api/auth/register').send(NEW_ACCOUNT);

    expect(saved[saved.length - 1].otpLastSentAt).toBeInstanceOf(Date);
  });
});

describe('asking for a new code', () => {
  const unverified = (over = {}) => {
    const user = new User({
      name: 'Rajat',
      email: NEW_ACCOUNT.email,
      password: 'secret123',
      role: 'customer',
      ...over,
    });
    user._id = new mongoose.Types.ObjectId();
    user.isVerified = over.isVerified ?? false;
    return user;
  };

  const resend = () =>
    request(app).post('/api/auth/resend-otp').send({ email: NEW_ACCOUNT.email });

  it('sends one', async () => {
    existing = unverified();
    whenMailerWorks();

    const res = await resend();

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends a code that is genuinely new', async () => {
    existing = unverified();
    existing.otp = '111111';
    whenMailerWorks();

    await resend();

    // Re-sending the old one is no use to someone whose code has expired.
    expect(existing.otp).not.toBe('111111');
    expect(existing.otp).toMatch(/^\d{6}$/);
  });

  it('refuses a second one straight away', async () => {
    existing = unverified();
    existing.otpLastSentAt = new Date();
    whenMailerWorks();

    const res = await resend();

    // Otherwise this is a button that mails anyone, as fast as it is pressed,
    // from an address the shop pays for.
    expect(res.status).toBe(429);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('allows one again after the wait', async () => {
    existing = unverified();
    existing.otpLastSentAt = new Date(Date.now() - 61 * 1000);
    whenMailerWorks();

    expect((await resend()).status).toBe(200);
  });

  it('says plainly when it could not be sent', async () => {
    existing = unverified();
    whenMailerFails();

    const res = await resend();

    expect(res.status).toBe(502);
    expect(res.body.message).toMatch(/could not send/i);
  });

  it('sends nothing to an address that is already verified', async () => {
    existing = unverified({ isVerified: true });
    whenMailerWorks();

    const res = await resend();

    expect(res.status).toBe(200);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('answers an unknown address exactly the same way', async () => {
    existing = null;
    whenMailerWorks();

    const unknown = await resend();

    existing = unverified({ isVerified: true });
    const verified = await resend();

    // The two must be indistinguishable, or this endpoint becomes a way to
    // ask which email addresses have accounts here.
    expect(unknown.status).toBe(verified.status);
    expect(unknown.body).toEqual(verified.body);
  });

  it('needs an email address', async () => {
    const res = await request(app).post('/api/auth/resend-otp').send({});
    expect(res.status).toBe(400);
  });
});
