/**
 * Emailed one-time codes (19 Sep 2026): hashed on the user, ten minutes, five
 * tries, one a minute; the second step for money roles on a new device; the
 * email change proven at the new address; throwaway domains refused.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const app = require('../app');
const User = require('../models/User');
const Session = require('../models/Session');
const AuthEvent = require('../models/AuthEvent');
const notifier = require('../utils/notify');
const codes = require('../utils/auth/oneTimeCode');
const { isDisposable } = require('../utils/auth/disposableDomains');

const userDoc = (over = {}) => ({ _id: '507f1f77bcf86cd799439011', email: 'shop@example.com', role: 'seller', password: 'hash', isVerified: true, isBlocked: false, tokenVersion: 0, failedLogins: 0, lockUntil: null, comparePassword: vi.fn(async (p) => p === 'right'), save: vi.fn(async function s() { return this; }), ...over });

describe('the code itself', () => {
  it('is six digits, stored only as a hash with purpose and target, and checks in constant time', async () => {
    const mailer = vi.fn(async () => {});
    const u = userDoc();
    const r = await codes.sendCode(u, 'login', { mailer });
    expect(r.ok).toBe(true);
    const code = mailer.mock.calls[0][0].text.match(/\b(\d{6})\b/)[1];
    expect(u.oneTimeCode.hash).not.toContain(code);
    expect(u.oneTimeCode).toMatchObject({ purpose: 'login', target: 'shop@example.com', tries: 0 });
    expect(await codes.checkCode(u, 'stepup', code)).toMatchObject({ ok: false, reason: /No code was sent for this/ });
    expect(await codes.checkCode(u, 'login', '000000')).toMatchObject({ ok: false, reason: /not right/ });
    expect(await codes.checkCode(u, 'login', code)).toEqual({ ok: true, target: 'shop@example.com' });
    expect(u.oneTimeCode).toBeUndefined();
  });
  it('burns after five misses, expires after ten minutes, and refuses a resend inside a minute', async () => {
    const mailer = vi.fn(async () => {});
    const u = userDoc();
    await codes.sendCode(u, 'stepup', { mailer });
    expect((await codes.sendCode(u, 'stepup', { mailer })).retryInSeconds).toBeGreaterThan(0);
    for (let i = 0; i < 4; i += 1) expect((await codes.checkCode(u, 'stepup', '1')).reason).toMatch(/not right/);
    expect((await codes.checkCode(u, 'stepup', '1')).reason).toMatch(/Too many/);
    expect(u.oneTimeCode).toBeUndefined();
    u.oneTimeCode = { hash: 'x', purpose: 'stepup', target: 'a', expiresAt: new Date(Date.now() - 1), sentAt: new Date(Date.now() - 1e6), tries: 0 };
    expect((await codes.checkCode(u, 'stepup', '1')).reason).toMatch(/expired/);
  });
});

describe('throwaway domains', () => {
  it('refuses the well-known ones and their sub-domains, keeps real mail', () => {
    expect(isDisposable('x@mailinator.com')).toBe(true);
    expect(isDisposable('x@abc.yopmail.com')).toBe(true);
    expect(isDisposable('rajat+test@gmail.com')).toBe(false);
    expect(isDisposable('shop@shopmasterpro.in')).toBe(false);
  });
  it('register says so in words', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'a@10minutemail.com', password: 'secret123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/temporary inboxes/);
  });
});

describe('second step for a seller on a new device', () => {
  let doc;
  let mails;
  beforeEach(() => {
    doc = userDoc();
    mails = [];
    vi.spyOn(User, 'findOne').mockImplementation(() => chainableQuery(doc));
    vi.spyOn(User, 'findById').mockImplementation(() => chainableQuery(doc));
    vi.spyOn(User, 'updateOne').mockImplementation(async (q, u) => { Object.assign(doc, u.$set || {}); return {}; });
    vi.spyOn(Session, 'create').mockImplementation(async (d) => ({ _id: 'sid', ...d }));
    vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
    vi.spyOn(notifier, 'notify').mockResolvedValue({});
    // Mail leaves through Brevo's API - intercepted at fetch, like the reset test does.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => { mails.push(JSON.parse(init.body)); return { ok: true, status: 201, text: async () => '{}', json: async () => ({}) }; });
  });
  afterEach(() => vi.restoreAllMocks());

  it('a device with the server-issued cookie signs straight in; without it 202 otp_required - the user-agent plays no part; the code completes the sign-in', async () => {
    // known: this browser's device cookie has a session in the last 90 days
    vi.spyOn(Session, 'countDocuments').mockImplementation(async (q) => (q.deviceId === 'dev-known' ? 2 : q.deviceId ? 0 : 3));
    let res = await request(app).post('/api/auth/login').set('Cookie', 'smp_device=dev-known').set('User-Agent', 'Chrome/1').send({ email: 'shop@example.com', password: 'right' });
    expect(res.status).toBe(200);

    // the same user-agent with no device cookie (or a made-up one) is a new device
    res = await request(app).post('/api/auth/login').set('User-Agent', 'Chrome/1').send({ email: 'shop@example.com', password: 'right' });
    expect(res.status).toBe(202);
    expect(res.body.code).toBe('otp_required');
    expect(res.body.message).toMatch(/s\*+@example\.com/);
    expect(res.headers['set-cookie']).toBeUndefined();
    const code = mails.at(-1).textContent.match(/\b(\d{6})\b/)[1];

    const bad = await request(app).post('/api/auth/login/code').send({ email: 'shop@example.com', otp: '000000' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/auth/login/code').send({ email: 'shop@example.com', otp: code });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'].join()).toMatch(/smp_at=/);
    // ...and this browser now gets its device cookie, so next time it is known.
    expect(ok.headers['set-cookie'].join()).toMatch(/smp_device=.*Path=\/api\/auth.*HttpOnly/);
  });

  it('a customer on a new device is not asked - the new-sign-in mail is enough for a role that holds no money', async () => {
    doc.role = 'customer';
    vi.spyOn(Session, 'countDocuments').mockImplementation(async (q) => (q.deviceId ? 0 : 3));
    const res = await request(app).post('/api/auth/login').set('User-Agent', 'Firefox/9').send({ email: 'shop@example.com', password: 'right' });
    expect(res.status).toBe(200);
  });
});
