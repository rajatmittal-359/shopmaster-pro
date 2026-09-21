const express = require('express');
const router = express.Router();
const {
  register,
  verifyOtp,
  login,
  resendOtp,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
// The bot check on the two doors bots try (plan 2.28); off without TURNSTILE_SECRET.
const { requireTurnstile } = require('../middlewares/turnstile');
// Register user (customer or seller)
router.post('/register', requireTurnstile, register);

// Verify OTP
router.post('/verify-otp', verifyOtp);

// Ask for a new verification code
router.post('/resend-otp', resendOtp);

// Login
router.post('/login', login);

/**
 * Google sign-in. Public, and rate-limited by nothing here on purpose: the
 * expensive check is Google's own signature verification, which fails fast on
 * anything that is not a real token.
 */
router.post('/google', require('../controllers/authController').googleSignIn);

// Ask for a reset link, and use it. Both are public by definition - the whole
// point is that the caller cannot sign in.
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
/**
 * Who is signed in, and what this account can do.
 *
 * The capabilities are read from the database on every call rather than taken
 * from the token: an admin can suspend a shop at any moment, and a page drawing
 * seller navigation from a stale token would be offering buttons the API has
 * already started refusing.
 */
const account = require('../controllers/authController');
router.patch('/me', authMiddleware, account.updateMe);
router.post('/change-password', authMiddleware, account.changePassword);
router.delete('/me', authMiddleware, require('../middlewares/requireRecentAuth'), account.deleteMe);

router.get('/me', authMiddleware, async (req, res) => {
  const { capabilitiesFor } = require('../utils/capabilities');

  res.json({
    message: 'Protected route accessed',
    user: req.user,
    capabilities: await capabilitiesFor(req.user),
  });
});

/**
 * Add selling to an account that already exists.
 *
 * Authenticated, and nothing more: the applicant is whoever is signed in, so
 * there is no userId in the body for anybody to tamper with.
 */
router.post('/become-seller', authMiddleware, requireTurnstile, require('../controllers/authController').becomeSeller);
// Sessions (19 Sep 2026): the refresh cookie travels only to /api/auth (its
// path), so refresh sits here; the rest need the access token.
const auth = require('../controllers/authController');
router.post('/refresh', auth.refresh);
router.post('/logout', authMiddleware, auth.logout);
router.post('/logout-all', authMiddleware, auth.logoutAll);
router.get('/sessions', authMiddleware, auth.listSessions);
router.delete('/sessions/:id', authMiddleware, auth.deleteSession);
router.post('/reauth', authMiddleware, auth.reauth);
router.post('/reauth/code', authMiddleware, auth.reauthCode);
// The second step after a correct password on a device the account has not used (seller/admin).
router.post('/login/code', auth.loginWithCode);
router.post('/login/code/resend', auth.resendLoginCode);
// Two-step sign-in with an authenticator app (22 Sep 2026): the code after the password.
router.post('/login/totp', auth.loginWithTotp);
const recent = require('../middlewares/requireRecentAuth');
router.post('/2fa/setup', authMiddleware, recent, auth.totpSetup);
router.post('/2fa/verify', authMiddleware, auth.totpVerify);
router.post('/2fa/disable', authMiddleware, recent, auth.totpDisable);
router.post('/2fa/recovery-codes', authMiddleware, recent, auth.totpRecoveryCodes);
// Changing the sign-in email: step-up first, then a code to the new address.
router.post('/email/request', authMiddleware, require('../middlewares/requireRecentAuth'), auth.requestEmailChange);
router.post('/email/confirm', authMiddleware, auth.confirmEmailChange);


module.exports = router;