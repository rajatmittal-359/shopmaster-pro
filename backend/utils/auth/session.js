/**
 * Sessions - how a sign-in lives, moves and ends (19 Sep 2026).
 *
 * THE SHAPE (OWASP Session Management; what Amazon/Flipkart/Shopify do)
 *   access token   a JWT good for ONE HOUR: { userId, role, tv, sid }.
 *                  tv is the user's tokenVersion - bump it and every token
 *                  dies; sid names the device row below.
 *   refresh token  32 random bytes, good for 30 days, stored only as its
 *                  SHA-256 in models/Session. ROTATED on every use: the old
 *                  row is revoked and points at the new one. A revoked token
 *                  presented again means it was copied - the whole family is
 *                  ended and the owner is told.
 *   cookies        both httpOnly + Secure + SameSite=Lax, set by the API and
 *                  first-party because the site proxies /api to it. The
 *                  refresh cookie's path is /api/auth so it travels only to
 *                  the auth routes. JavaScript never sees either - which is
 *                  the whole point: an XSS on the page cannot lift a session.
 *   header         `Authorization: Bearer` is still accepted, for the old
 *                  React app until it is deleted and for the tests.
 *
 * WHY NOT JUST A LONGER JWT
 *   A token that cannot be revoked is a promise the server cannot take back.
 *   Before this, "log out" deleted the token from the browser and nothing
 *   else - it stayed valid for seven days, password change or not.
 *
 * STEP-UP
 *   Money and identity actions (bank details, paying a payout, resolving a
 *   dispute, a commission change) ask for the password again and get a
 *   ten-minute `smp_su` cookie - Amazon's "re-enter your password" before
 *   a payment method changes. middlewares/requireRecentAuth reads it.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Session = require('../../models/Session');
const User = require('../../models/User');
const AuthEvent = require('../../models/AuthEvent');

const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_DAYS = 30;
const REAUTH_TTL_SECONDS = 10 * 60;
const DEVICE_DAYS = 365;
const COOKIE = { access: 'smp_at', refresh: 'smp_rt', reauth: 'smp_su', device: 'smp_device' };

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const secure = () => process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';

/** The cookie header, parsed - six lines instead of a dependency. */
const cookies = (req) => {
  const out = {};
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
};

const base = () => ({ httpOnly: true, secure: secure(), sameSite: 'lax' });

const setAuthCookies = (res, { access, refresh }) => {
  res.cookie(COOKIE.access, access, { ...base(), path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
  if (refresh) res.cookie(COOKIE.refresh, refresh, { ...base(), path: '/api/auth', maxAge: REFRESH_DAYS * 24 * 3600 * 1000 });
};

const clearAuthCookies = (res) => {
  res.clearCookie(COOKIE.access, { ...base(), path: '/' });
  res.clearCookie(COOKIE.refresh, { ...base(), path: '/api/auth' });
  res.clearCookie(COOKIE.reauth, { ...base(), path: '/' });
};

const signAccess = (user, sid) => jwt.sign({ userId: String(user._id), role: user.role, tv: user.tokenVersion || 0, sid }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL_SECONDS });

const deviceOf = (req) => ({ ua: String(req.headers?.['user-agent'] || '').slice(0, 200), ip: String(req.ip || '') });

/*
 * WHICH DEVICE IS THIS (security review, 19 Sep 2026)
 *   The user-agent is a header anyone can type; a stolen password plus a
 *   common Chrome string would have skipped the new-device step. So a
 *   device is known by `smp_device`: 32 random bytes the server set in an
 *   httpOnly cookie the first time it signed in here (a year, path
 *   /api/auth so it travels only to sign-in). No cookie = new device,
 *   whatever the header says.
 */
const deviceIdOf = (req) => cookies(req)[COOKIE.device] || '';
const ensureDevice = (req, res) => {
  let id = deviceIdOf(req);
  if (!id) {
    id = crypto.randomBytes(32).toString('base64url');
    res.cookie(COOKIE.device, id, { ...base(), path: '/api/auth', maxAge: DEVICE_DAYS * 24 * 3600 * 1000 });
  }
  return id;
};

const record = (type, userId, req, meta) =>
  AuthEvent.create({ userId, type, ...deviceOf(req), ...(meta ? { meta } : {}) }).catch((err) => console.error('auth event not recorded:', type, err.message));

/**
 * Start a session: one Session row, cookies on the response, and the body
 * shape the old app expects (token + role + user). `family` is passed on a
 * rotation so the chain stays one device.
 */
const issue = async (user, req, res, { family, event = 'login' } = {}) => {
  const refresh = crypto.randomBytes(32).toString('base64url');
  const fam = family || crypto.randomUUID();
  const deviceId = ensureDevice(req, res);
  const row = await Session.create({ userId: user._id, tokenHash: sha(refresh), family: fam, deviceId, ...deviceOf(req), expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 3600 * 1000) });
  const access = signAccess(user, String(row._id));
  setAuthCookies(res, { access, refresh });
  if (event) record(event, user._id, req);
  return { token: access, expiresIn: ACCESS_TTL_SECONDS, sid: String(row._id) };
};

/**
 * Rotate: the refresh cookie in, a fresh pair out. Reuse of a revoked token
 * ends the family - somebody else has a copy.
 * @returns {Promise<{ok:true,user:object,token:string}|{ok:false,reason:string,reuse?:boolean}>}
 */
const rotate = async (req, res) => {
  const raw = cookies(req)[COOKIE.refresh] || req.body?.refreshToken;
  if (!raw) return { ok: false, reason: 'No session to refresh' };
  const row = await Session.findOne({ tokenHash: sha(raw) });
  if (!row) return { ok: false, reason: 'Session not found' };
  if (row.revokedAt) {
    await Session.updateMany({ family: row.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    record('refresh_reuse', row.userId, req, { family: row.family });
    return { ok: false, reason: 'This session was used from two places and has been ended. Sign in again.', reuse: true };
  }
  if (row.expiresAt < new Date()) return { ok: false, reason: 'Session expired' };
  const user = await User.findById(row.userId);
  if (!user || user.isBlocked) return { ok: false, reason: 'Account unavailable' };
  const next = await issue(user, req, res, { family: row.family, event: null });
  row.revokedAt = new Date();
  row.replacedBy = next.sid;
  row.lastUsedAt = new Date();
  await row.save();
  return { ok: true, user, token: next.token, expiresIn: next.expiresIn };
};

/** End one device. */
const revoke = async (sid, userId) => Session.updateOne({ _id: sid, userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

/** End every device and kill every access token at once. */
const revokeAll = async (user, req, reason = 'logout_all') => {
  await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await User.updateOne({ _id: user._id }, { $set: { tokenVersion: user.tokenVersion } });
  if (req) record(reason, user._id, req);
};

/** The devices a person is signed in on, newest first; `current` marks this one. */
const list = async (userId, currentSid) => {
  const rows = await Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastUsedAt: -1 }).lean();
  return rows.map((r) => ({ id: String(r._id), device: describe(r.ua), ip: r.ip, since: r.createdAt, lastUsedAt: r.lastUsedAt, current: String(r._id) === String(currentSid) }));
};

/** "Chrome on Android" from a user-agent string - enough to recognise a device. */
const describe = (ua = '') => {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} on ${os}`;
};

/**
 * Whether this device (its cookie) has signed this account in within 90
 * days. Decides the new-device mail and, for the money roles, the second
 * step. `excludeSid` leaves out the row a sign-in just created.
 */
const knownDevice = async (userId, req, { excludeSid } = {}) => {
  const deviceId = deviceIdOf(req);
  if (!deviceId) return false;
  const q = { userId, deviceId, createdAt: { $gt: new Date(Date.now() - 90 * 24 * 3600 * 1000) } };
  if (excludeSid) q._id = { $ne: excludeSid };
  return (await Session.countDocuments(q)) > 0;
};
const seenBefore = (userId, req, opts) => knownDevice(userId, req, opts);

/** Step-up: a ten-minute proof that the password was just typed. */
const grantReauth = (res, user, sid) => {
  const token = jwt.sign({ userId: String(user._id), sid, purpose: 'reauth' }, process.env.JWT_SECRET, { expiresIn: REAUTH_TTL_SECONDS });
  res.cookie(COOKIE.reauth, token, { ...base(), path: '/', maxAge: REAUTH_TTL_SECONDS * 1000 });
  return token;
};

const hasRecentAuth = (req) => {
  const raw = cookies(req)[COOKIE.reauth] || req.header?.('X-Reauth');
  if (!raw) return false;
  try {
    const d = jwt.verify(raw, process.env.JWT_SECRET);
    return d.purpose === 'reauth' && String(d.userId) === String(req.user?._id);
  } catch {
    return false;
  }
};

module.exports = { ACCESS_TTL_SECONDS, REFRESH_DAYS, REAUTH_TTL_SECONDS, COOKIE, cookies, issue, rotate, revoke, revokeAll, list, describe, seenBefore, knownDevice, deviceIdOf, grantReauth, hasRecentAuth, clearAuthCookies, record, sha };
