const User = require('../models/User');
const Seller = require('../models/Seller');
const { generateToken } = require('../utils/tokenUtils');
const sendEmail = require('../utils/sendEmail');

// Register
// Register
exports.register = async (req, res) => {
  try {
    const { name, email, password, role, businessName } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const user = new User({
      name,
      email,
      password,
      role: role === 'seller' ? 'seller' : 'customer',
    });

    const otp = user.generateOTP();
    await user.save();

    if (user.role === 'seller') {
      if (!businessName) {
        return res.status(400).json({ message: 'Business name required for seller' });
      }
      await Seller.create({ userId: user._id, businessName });
    }

    await sendEmail({
      to: email,
      subject: 'ShopMaster Pro - Verify your email',
      text: `Your OTP is ${otp}`,
      html: `<p>Your OTP is <strong>${otp}</strong></p>`,
    });

    res.status(201).json({
      message: 'Registration successful. Please check your email for the OTP.',
      userId: user._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// Verify OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP required' });
    }

    const user = await User.findOne({ email }).select('+otp +otpExpiry');

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (!user.verifyOTP(otp)) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    const token = generateToken(user._id, user.role);

    res.json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Login
// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials ! Please Signup first....' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ message: 'Please verify your email first' });
    }

    const token = generateToken(user._id, user.role);

    res.json({
      message: 'Login successful',
      token,
      role: user.role,                 // ← IMPORTANT
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

