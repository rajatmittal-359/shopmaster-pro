const express = require('express');
const router = express.Router();
const { register, verifyOtp, login } = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
// Register user (customer or seller)
router.post('/register', register);

// Verify OTP
router.post('/verify-otp', verifyOtp);

// Login
router.post('/login', login);
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    message: 'Protected route accessed',
    user: req.user
  });
});
module.exports = router;