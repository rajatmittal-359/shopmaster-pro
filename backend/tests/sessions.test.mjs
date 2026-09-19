/**
 * Sessions (19 Sep 2026): one-hour access tokens in httpOnly cookies, thirty-day
 * refresh tokens stored only as hashes and rotated on use, reuse ends the
 * family, "log out everywhere" ends every token at once, and money routes ask
 * for the password again.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');
const User = require('../models/User');
const AuthEvent = require('../models/AuthEvent');
const sessions = require('../utils/auth/session');
const authMiddleware = require('../middlewares/authMiddleware');
const requireRecentAuth = require('../middlewares/requireRecentAuth');

const user = { _id: 'u1', role: 'seller', tokenVersion: 0, isVerified: true, isBlocked: false };
const fakeReq = (over = {}) => ({ headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36', ...(over.headers || {}) }, ip: '10.0.0.1', method: 'GET', header(name) { return this.headers[name.toLowerCase()] ?? this.headers[name]; }, ...over });
const fakeRes = () => {
  const r = { statusCode: 200, body: null, cookies: {}, cleared: [] };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (p) => { r.body = p; return r; };
  r.cookie = (name, value, opts) => { r.cookies[name] = { value, opts }; return r; };
  r.clearCookie = (name) => { r.cleared.push(name); return r; };
  return r;
};

describe('issue', () => {
  afterEach(() => vi.restoreAllMocks());

  it('stores only the hash, sets two httpOnly cookies with the right paths, and signs a one-hour access token carrying tv and sid', async () => {
    const create = vi.spyOn(Session, 'create').mockImplementation(async (doc) => ({ _id: 'sid1', ...doc }));
    vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
    const res = fakeRes();
    const out = await sessions.issue(user, fakeReq(), res);
    const refresh = res.cookies.smp_rt.value;
    expect(refresh).toHaveLength(43);
    expect(create.mock.calls[0][0].tokenHash).toBe(sessions.sha(refresh));
    expect(create.mock.calls[0][0].tokenHash).not.toContain(refresh);
    expect(res.cookies.smp_at.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 * 1000 });
    expect(res.cookies.smp_rt.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/auth' });
    const decoded = jwt.verify(out.token, process.env.JWT_SECRET);
    expect(decoded).toMatchObject({ userId: 'u1', role: 'seller', tv: 0, sid: 'sid1' });
    expect(decoded.exp - decoded.iat).toBe(3600);
  });
});

describe('rotate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a live refresh token gives a new pair in the same family and revokes the old row pointing at the new one', async () => {
    const old = { _id: 'old', userId: 'u1', family: 'fam', revokedAt: null, expiresAt: new Date(Date.now() + 1e6), save: vi.fn(async function s() { return this; }) };
    vi.spyOn(Session, 'findOne').mockResolvedValue(old);
    vi.spyOn(Session, 'create').mockImplementation(async (doc) => ({ _id: 'new', ...doc }));
    vi.spyOn(User, 'findById').mockResolvedValue(user);
    const res = fakeRes();
    const r = await sessions.rotate(fakeReq({ headers: { cookie: 'smp_rt=abc' } }), res);
    expect(r.ok).toBe(true);
    expect(Session.create.mock.calls[0][0].family).toBe('fam');
    expect(old.revokedAt).toBeInstanceOf(Date);
    expect(old.replacedBy).toBe('new');
    expect(res.cookies.smp_rt.value).not.toBe('abc');
    expect(jwt.verify(r.token, process.env.JWT_SECRET).sid).toBe('new');
  });

  it('a revoked token presented again ends the whole family and says so - somebody has a copy', async () => {
    vi.spyOn(Session, 'findOne').mockResolvedValue({ _id: 'old', userId: 'u1', family: 'fam', revokedAt: new Date(), expiresAt: new Date(Date.now() + 1e6) });
    const many = vi.spyOn(Session, 'updateMany').mockResolvedValue({});
    vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
    const r = await sessions.rotate(fakeReq({ headers: { cookie: 'smp_rt=abc' } }), fakeRes());
    expect(r).toMatchObject({ ok: false, reuse: true });
    expect(many).toHaveBeenCalledWith({ family: 'fam', revokedAt: null }, { $set: { revokedAt: expect.any(Date) } });
  });

  it('no cookie, unknown or expired token: a plain refusal', async () => {
    expect(await sessions.rotate(fakeReq(), fakeRes())).toMatchObject({ ok: false });
    vi.spyOn(Session, 'findOne').mockResolvedValue(null);
    expect(await sessions.rotate(fakeReq({ headers: { cookie: 'smp_rt=x' } }), fakeRes())).toMatchObject({ ok: false, reason: 'Session not found' });
    vi.spyOn(Session, 'findOne').mockResolvedValue({ revokedAt: null, expiresAt: new Date(Date.now() - 1) });
    expect(await sessions.rotate(fakeReq({ headers: { cookie: 'smp_rt=x' } }), fakeRes())).toMatchObject({ ok: false, reason: 'Session expired' });
  });
});

describe('revokeAll + the middleware', () => {
  afterEach(() => vi.restoreAllMocks());

  it('bumps tokenVersion so every access token - cookie or header - is refused afterwards', async () => {
    vi.spyOn(Session, 'updateMany').mockResolvedValue({});
    vi.spyOn(User, 'updateOne').mockResolvedValue({});
    vi.spyOn(AuthEvent, 'create').mockResolvedValue({});
    const u = { ...user };
    const token = jwt.sign({ userId: 'u1', role: 'seller', tv: 0, sid: 's' }, process.env.JWT_SECRET);
    await sessions.revokeAll(u, fakeReq());
    expect(u.tokenVersion).toBe(1);
    vi.spyOn(User, 'findById').mockResolvedValue(u);
    const res = fakeRes();
    const next = vi.fn();
    await authMiddleware(fakeReq({ headers: { authorization: `Bearer ${token}` } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('session_ended');
  });

  it('reads the access cookie; a state-changing cookie request without X-Requested-With is refused (CSRF); a header token needs nothing', async () => {
    vi.spyOn(User, 'findById').mockResolvedValue(user);
    const token = jwt.sign({ userId: 'u1', role: 'seller', tv: 0, sid: 's' }, process.env.JWT_SECRET);
    let res = fakeRes();
    let next = vi.fn();
    await authMiddleware(fakeReq({ method: 'POST', headers: { cookie: `smp_at=${token}` } }), res, next);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('csrf');
    expect(next).not.toHaveBeenCalled();

    res = fakeRes();
    next = vi.fn();
    const req = fakeReq({ method: 'POST', headers: { cookie: `smp_at=${token}`, 'x-requested-with': 'fetch' } });
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.auth).toMatchObject({ sid: 's', viaCookie: true });

    res = fakeRes();
    next = vi.fn();
    await authMiddleware(fakeReq({ method: 'POST', headers: { authorization: `Bearer ${token}` } }), res, next);
    expect(next).toHaveBeenCalled();
  });

  it('an old-app token without a version still works while the version is 0; an expired one says so with a code the page refreshes on', async () => {
    vi.spyOn(User, 'findById').mockResolvedValue(user);
    const legacy = jwt.sign({ userId: 'u1', role: 'seller' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    let next = vi.fn();
    await authMiddleware(fakeReq({ headers: { authorization: `Bearer ${legacy}` } }), fakeRes(), next);
    expect(next).toHaveBeenCalled();
    const expired = jwt.sign({ userId: 'u1', role: 'seller', tv: 0 }, process.env.JWT_SECRET, { expiresIn: -10 });
    const res = fakeRes();
    next = vi.fn();
    await authMiddleware(fakeReq({ headers: { authorization: `Bearer ${expired}` } }), res, next);
    expect(res.body.code).toBe('expired');
  });
});

describe('step-up', () => {
  it('without the ten-minute proof a money route answers 401 reauth; with it (cookie or header) it passes; another user\'s proof does not', () => {
    const res = fakeRes();
    const grant = sessions.grantReauth(res, user, 's');
    expect(res.cookies.smp_su.opts).toMatchObject({ httpOnly: true, maxAge: 600 * 1000 });

    let out = fakeRes();
    let next = vi.fn();
    requireRecentAuth({ user, headers: {}, header: () => undefined }, out, next);
    expect(out.statusCode).toBe(401);
    expect(out.body.code).toBe('reauth');

    out = fakeRes();
    next = vi.fn();
    requireRecentAuth(fakeReq({ user, headers: { cookie: `smp_su=${grant}` } }), out, next);
    expect(next).toHaveBeenCalled();

    out = fakeRes();
    next = vi.fn();
    requireRecentAuth(fakeReq({ user, headers: { 'x-reauth': grant } }), out, next);
    expect(next).toHaveBeenCalled();

    out = fakeRes();
    next = vi.fn();
    requireRecentAuth(fakeReq({ user: { _id: 'someone-else' }, headers: { cookie: `smp_su=${grant}` } }), out, next);
    expect(out.statusCode).toBe(401);
  });
});

describe('devices', () => {
  afterEach(() => vi.restoreAllMocks());
  it('lists live devices with a readable name and marks the current one', async () => {
    vi.spyOn(Session, 'find').mockImplementation(() => ({ sort: () => ({ lean: async () => [
      { _id: 'a', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36', ip: '1.1.1.1', createdAt: new Date(), lastUsedAt: new Date() },
      { _id: 'b', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1', ip: '2.2.2.2', createdAt: new Date(), lastUsedAt: new Date() },
    ] }) }));
    const out = await sessions.list('u1', 'b');
    expect(out.map((d) => `${d.device}${d.current ? ' *' : ''}`)).toEqual(['Chrome on Windows', 'Safari on iPhone *']);
  });
});
