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
// Register user (customer or seller)
router.post('/register', register);

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
router.post('/become-seller', authMiddleware, require('../controllers/authController').becomeSeller);
module.exports = router;