/**
 * Two-step sign-in with an authenticator app (22 Sep 2026): setup → verify
 * (recovery codes once) → the password earns a pending token, the code earns
 * the session; replays, wrong codes (the lock), recovery codes, and the admin
 * who may not turn it off.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Session = require('../models/Session');
const AuthEvent = require('../models/AuthEvent');
const notifier = require('../utils/notify');
const { totp } = require('../utils/auth/totp');

const ID = '507f1f77bcf86cd799439011';
const bearer = (doc) => `Bearer ${jwt.sign({ userId: ID, role: doc.role, tv: 0, sid: 's1' }, process.env.JWT_SECRET)}`;
const reauth = () => jwt.sign({ userId: ID, sid: 's1', purpose: 'reauth' }, process.env.JWT_SECRET);
const login = (password = 'right') => request(app).post('/api/auth/login').send({ email: 'a@b.c', password });

describe('two-step sign-in', () => {
  let doc;
  beforeEach(() => {
    doc = { _id: ID, email: 'a@b.c', role: 'seller', password: 'hash', isVerified: true, isBlocked: false, failedLogins: 0, lockUntil: null, tokenVersion: 0, totp: { enabled: false, secretEnc: '', pendingEnc: '', lastCounter: 0, recovery: [] }, comparePassword: vi.fn(async (p) => p === 'right') };
    vi.spyOn(User, 'findOne').mockImplementation(() => chainableQuery(doc));
    vi.spyOn(User, 'findById').mockImplementation(() => chainableQuery(doc));
    vi.spyOn(User, 'updateOne').mockImplementation(async (q, u) => {
      for (const [k, v] of Object.entries(u.$set || {})) {
        if (k.startsWith('totp.')) doc.totp[k.slice(5)] = v; else doc[k] = v;
      }
      if (u.$pull?.['totp.recovery']) doc.totp.recovery = doc.totp.recovery.filter((h) => h !== u.$pull['totp.recovery']);
      return { modifiedCount: 1 };
    });
    vi.spyOn(Session, 'create').mockImplementation(async (d) => ({ _id: 'sid', ...d }));
    vi.spyOn(Session, 'countDocuments').mockResolvedValue(0);
    vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
    vi.spyOn(notifier, 'notify').mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  const enrol = async () => {
    const setup = await request(app).post('/api/auth/2fa/setup').set('Authorization', bearer(doc)).set('X-Reauth', reauth()).send({});
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.body.otpauth).toMatch(/^otpauth:\/\/totp\/ShopMaster%20Pro:a%40b\.c\?secret=/);
    expect(doc.totp.pendingEnc).not.toBe('');
    expect(doc.totp.enabled).toBe(false);
    const verify = await request(app).post('/api/auth/2fa/verify').set('Authorization', bearer(doc)).send({ code: totp(setup.body.secret) });
    expect(verify.status).toBe(200);
    expect(verify.body.recoveryCodes).toHaveLength(8);
    expect(verify.body.recoveryCodes[0]).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(doc.totp.enabled).toBe(true);
    expect(doc.totp.pendingEnc).toBe('');
    return { secret: setup.body.secret, recoveryCodes: verify.body.recoveryCodes };
  };

  it('setup needs step-up; a wrong first code does not turn it on; the right one does and mails the owner', async () => {
    const cold = await request(app).post('/api/auth/2fa/setup').set('Authorization', bearer(doc)).send({});
    expect(cold.status).toBe(401);
    expect(cold.body.code).toBe('reauth');
    const setup = await request(app).post('/api/auth/2fa/setup').set('Authorization', bearer(doc)).set('X-Reauth', reauth()).send({});
    const wrong = await request(app).post('/api/auth/2fa/verify').set('Authorization', bearer(doc)).send({ code: '000000' });
    expect(wrong.status).toBe(400);
    expect(doc.totp.enabled).toBe(false);
    const ok = await request(app).post('/api/auth/2fa/verify').set('Authorization', bearer(doc)).send({ code: totp(setup.body.secret) });
    expect(ok.status).toBe(200);
    expect(notifier.notify.mock.calls.at(-1)[0].title).toBe('Two-step sign-in is on');
  });

  it('after enrolment the password earns a pending token (202), the code earns the session, and the same code cannot sign in twice', async () => {
    const { secret } = await enrol();
    const first = await login();
    expect(first.status).toBe(202);
    expect(first.body.code).toBe('totp_required');
    expect(first.body.token).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined();

    // The enrolment code's window is spent (lastCounter); the next window's code is what a person would type.
    const code = totp(secret, { time: Date.now() / 1000 + 30 });
    const bad = await request(app).post('/api/auth/login/totp').send({ pending: first.body.pending, code: '123456' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('totp_failed');
    expect(doc.failedLogins).toBe(1);

    const done = await request(app).post('/api/auth/login/totp').send({ pending: first.body.pending, code });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ role: 'seller', user: { email: 'a@b.c' } });
    expect(done.headers['set-cookie'].join('\n')).toMatch(/smp_at=/);
    expect(doc.failedLogins).toBe(0);

    const replay = await request(app).post('/api/auth/login/totp').send({ pending: first.body.pending, code });
    expect(replay.status).toBe(400);
  });

  it('an expired or foreign pending token is refused; the emailed new-device step is skipped for these accounts', async () => {
    await enrol();
    Session.countDocuments.mockResolvedValue(5); // a history that would trigger the emailed code otherwise
    const first = await login();
    expect(first.status).toBe(202);
    expect(first.body.code).toBe('totp_required');
    const stale = jwt.sign({ userId: ID, tv: 0, purpose: 'totp' }, process.env.JWT_SECRET, { expiresIn: -1 });
    expect((await request(app).post('/api/auth/login/totp').send({ pending: stale, code: '123456' })).body.code).toBe('totp_expired');
    const notTotp = jwt.sign({ userId: ID, tv: 0, purpose: 'reauth' }, process.env.JWT_SECRET);
    expect((await request(app).post('/api/auth/login/totp').send({ pending: notTotp, code: '123456' })).body.code).toBe('totp_expired');
  });

  it('ten wrong codes lock the account like ten wrong passwords', async () => {
    await enrol();
    const { body } = await login();
    for (let i = 0; i < 10; i += 1) await request(app).post('/api/auth/login/totp').send({ pending: body.pending, code: '000000' });
    expect(doc.lockUntil).toBeInstanceOf(Date);
    const locked = await request(app).post('/api/auth/login/totp').send({ pending: body.pending, code: '000000' });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('locked');
  });

  it('a recovery code signs in once, is spent, and the owner is told how many are left', async () => {
    const { recoveryCodes } = await enrol();
    const { body } = await login();
    const one = await request(app).post('/api/auth/login/totp').send({ pending: body.pending, code: recoveryCodes[2].toLowerCase() });
    expect(one.status).toBe(200);
    expect(doc.totp.recovery).toHaveLength(7);
    await new Promise((r) => setImmediate(r));
    expect(notifier.notify.mock.calls.some((c) => /7 recovery codes left/.test(c[0].body))).toBe(true);
    const again = await login();
    const twice = await request(app).post('/api/auth/login/totp').send({ pending: again.body.pending, code: recoveryCodes[2] });
    expect(twice.status).toBe(400);
  });

  it('a seller turns it off with a current code behind step-up; an admin is refused; new recovery codes replace the old', async () => {
    const { secret, recoveryCodes } = await enrol();
    const fresh = await request(app).post('/api/auth/2fa/recovery-codes').set('Authorization', bearer(doc)).set('X-Reauth', reauth()).send({});
    expect(fresh.status).toBe(200);
    expect(fresh.body.recoveryCodes).toHaveLength(8);
    expect(fresh.body.recoveryCodes).not.toEqual(recoveryCodes);

    const wrong = await request(app).post('/api/auth/2fa/disable').set('Authorization', bearer(doc)).set('X-Reauth', reauth()).send({ code: '000000' });
    expect(wrong.status).toBe(400);
    expect(doc.totp.enabled).toBe(true);

    doc.role = 'admin';
    const admin = await request(app).post('/api/auth/2fa/disable').set('Authorization', bearer(doc)).set('X-Reauth', reauth()).send({ code: totp(secret) });
    expect(admin.status).toBe(403);
    expect(admin.body.code).toBe('totp_required_role');
    expect(doc.totp.enabled).toBe(true);

    doc.role = 'seller';
    const off = await request(app).post('/api/auth/2fa/disable').set('Authorization', bearer(doc)).set('X-Reauth', reauth()).send({ code: totp(secret) });
    expect(off.status).toBe(200);
    expect(doc.totp).toMatchObject({ enabled: false, secretEnc: '', recovery: [] });
    expect((await login()).status).toBe(200);
  });
});
