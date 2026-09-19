const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { cookies, COOKIE } = require('../utils/auth/session');

/**
 * Who is asking (19 Sep 2026 - sessions, utils/auth/session).
 *
 * The access token comes from the `smp_at` cookie (the Next app; httpOnly,
 * so no script can read it) or from `Authorization: Bearer` (the old React
 * app until it is deleted, the tests, curl). Then three checks the token
 * alone cannot make: the account still exists and is verified, it is not
 * blocked, and its tokenVersion still matches - a bumped version is how
 * "log out everywhere" and a password change end every session at once.
 *
 * CSRF, for the cookie path only: a browser sends cookies with any
 * cross-site form POST, so a state-changing request authenticated by cookie
 * must also carry the `X-Requested-With` header, which a cross-site form
 * cannot set. SameSite=Lax already blocks most of it; this is the second
 * lock. Header-token requests need nothing - a header is not sent by forms.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const bearer = req.header('Authorization')?.replace('Bearer ', '');
    const fromCookie = !bearer ? cookies(req)[COOKIE.access] : null;
    const token = bearer || fromCookie;

    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied', code: 'no_session' });
    }

    if (fromCookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.header('X-Requested-With') !== 'fetch') {
      return res.status(403).json({ message: 'Request refused (missing request header).', code: 'csrf' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: 'User not found', code: 'no_session' });
    }

    // A token from before the bump, or from before tokens carried a version
    // at all (the old app's seven-day tokens, until they run out), is refused
    // once the version has moved - the person asked for that by logging out
    // everywhere or changing the password.
    if ((user.tokenVersion || 0) !== (decoded.tv || 0)) {
      return res.status(401).json({ message: 'This session has ended. Please sign in again.', code: 'session_ended' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ message: 'Email not verified', code: 'unverified' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: 'This account has been blocked. Write to us if you think that is a mistake.' });
    }

    req.user = user;
    req.auth = { sid: decoded.sid || null, viaCookie: Boolean(fromCookie), tv: decoded.tv || 0 };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token', code: 'no_session' });
    }

    if (error.name === 'TokenExpiredError') {
      // The page refreshes on this code and retries; the old app signs in again.
      return res.status(401).json({ message: 'Token expired', code: 'expired' });
    }

    console.error('Auth Middleware Error:', error.message);
    return res.status(500).json({ message: 'Server error' });
  }
};

module.exports = authMiddleware;
