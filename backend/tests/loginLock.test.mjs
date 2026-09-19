/**
 * The per-account sign-in lock (19 Sep 2026): ten wrong passwords lock the
 * account for fifteen minutes from any address; the right password after a
 * miss resets the count, sets the session cookies and returns the old app's
 * body shape too.
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

const login = (password, ip = '203.0.113.7') => request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email: 'a@b.c', password });

describe('login lock', () => {
  let doc;
  beforeEach(() => {
    doc = { _id: '507f1f77bcf86cd799439011', email: 'a@b.c', role: 'customer', password: 'hash', isVerified: true, isBlocked: false, failedLogins: 0, lockUntil: null, tokenVersion: 0, comparePassword: vi.fn(async (p) => p === 'right') };
    vi.spyOn(User, 'findOne').mockImplementation(() => chainableQuery(doc));
    vi.spyOn(User, 'updateOne').mockImplementation(async (q, u) => { Object.assign(doc, u.$set || {}); return { modifiedCount: 1 }; });
    vi.spyOn(Session, 'create').mockImplementation(async (d) => ({ _id: 'sid', ...d }));
    vi.spyOn(Session, 'countDocuments').mockResolvedValue(5);
    vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
    vi.spyOn(notifier, 'notify').mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  it('counts misses, locks on the tenth from a different address, and the owner is told', async () => {
    for (let i = 0; i < 9; i += 1) expect((await login('wrong', `198.51.100.${i}`)).status).toBe(400);
    expect(doc.failedLogins).toBe(9);
    const tenth = await login('wrong', '198.51.100.99');
    expect(tenth.status).toBe(400);
    expect(doc.lockUntil).toBeInstanceOf(Date);
    expect(notifier.notify.mock.calls[0][0].title).toMatch(/locked/);
    const eleventh = await login('right', '198.51.100.100');
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.code).toBe('locked');
    expect(eleventh.body.message).toMatch(/minute/);
  });

  it('the right password after a miss signs in, sets the two cookies, resets the count, and still returns token + role + user for the old app', async () => {
    await login('wrong');
    expect(doc.failedLogins).toBe(1);
    const res = await login('right');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'customer', user: { email: 'a@b.c' } });
    expect(typeof res.body.token).toBe('string');
    const cookies = res.headers['set-cookie'].join('\n');
    expect(cookies).toMatch(/smp_at=.*HttpOnly/);
    expect(cookies).toMatch(/smp_rt=.*Path=\/api\/auth.*HttpOnly/);
    expect(doc.failedLogins).toBe(0);
    expect(doc.lockUntil).toBeNull();
  });
});
