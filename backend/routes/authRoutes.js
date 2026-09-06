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

// Ask for a reset link, and use it. Both are public by definition - the whole
// point is that the caller cannot sign in.
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    message: 'Protected route accessed',
    user: req.user
  });
});
module.exports = router;