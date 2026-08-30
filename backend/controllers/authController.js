const User = require('../models/User');
const Seller = require('../models/Seller');
const { generateToken } = require('../utils/tokenUtils');
const sendEmail = require('../utils/sendEmail');

// Register
// Register
/** How long a caller must wait before another code can be sent. */
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Sends a verification code and records when.
 *
 * Never throws. Whether the mail went is information the caller needs, not a
 * reason to undo work that already succeeded - the account is saved either
 * way, and a code can always be asked for again.
 *
 * @returns {Promise<boolean>} true when the mail was accepted for delivery
 */
const deliverOtp = async (user, otp) => {
  try {
    await sendEmail({
      to: user.email,
      subject: 'ShopMaster Pro - Verify your email',
      text: `Your OTP is ${otp}`,
      html: `<p>Your OTP is <strong>${otp}</strong></p>`,
    });

    user.otpLastSentAt = new Date();
    await user.save();
    return true;
  } catch (err) {
    // Loud in the log, because this is the shop's own problem to fix - an
    // expired plan, a revoked key - and no customer can tell us about it.
    console.error('Could not send the verification code to', user.email, '-', err.message);
    return false;
  }
};

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

    // Validate BEFORE the user row exists. The check used to run after
    // user.save(), so a seller who forgot their business name was left as a
    // saved account with the seller role and no seller profile - unable to
    // sell, and unable to register again with that email.
    const isSeller = role === 'seller';
    if (isSeller && !businessName) {
      return res.status(400).json({ message: 'Business name required for seller' });
    }

    const user = new User({
      name,
      email,
      password,
      role: isSeller ? 'seller' : 'customer',
    });

    const otp = user.generateOTP();
    await user.save();

    if (isSeller) {
      await Seller.create({ userId: user._id, businessName });
    }

    // The account already exists by this point, so a mail that will not send
    // must NOT fail the request. It used to: the caller saw "Server error",
    // assumed nothing had happened, and tried again - only to be told the
    // email was taken. An account with no way in and no way to make another.
    const sent = await deliverOtp(user, otp);

    res.status(201).json({
      message: sent
        ? 'Registration successful. Please check your email for the OTP.'
        : 'Account created, but the verification code could not be sent right now. Please ask for a new code.',
      emailSent: sent,
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
      // Names the way forward, since the code may never have arrived.
      return res.status(401).json({
        message: 'Please verify your email first. You can ask for a new code.',
        needsVerification: true,
        email: user.email,
      });
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

/**
 * Sends a fresh verification code.
 *
 * There was no way to do this at all. Anyone whose code never arrived - a mail
 * that bounced, a plan out of credit, an inbox that ate it - was simply stuck:
 * registered, unverified, unable to log in and unable to register again.
 */
exports.resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const user = await User.findOne({ email }).select('+otp +otpExpiry +otpLastSentAt');

    // Deliberately the same answer for an address that has no account. The
    // register route already reveals which emails are taken, so this is not
    // secrecy - it is just refusing to hand out a second way to check.
    if (!user || user.isVerified) {
      return res.json({ message: 'If that address still needs verifying, a new code is on its way.' });
    }

    const since = user.otpLastSentAt ? Date.now() - user.otpLastSentAt.getTime() : Infinity;
    if (since < OTP_RESEND_COOLDOWN_MS) {
      return res.status(429).json({
        message: 'A code was just sent. Please wait a minute before asking for another.',
        retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - since) / 1000),
      });
    }

    const otp = user.generateOTP();
    const sent = await deliverOtp(user, otp);

    if (!sent) {
      // Said plainly. Telling someone to "check their email" for a message
      // that was never accepted sends them to wait for nothing.
      return res.status(502).json({
        message: 'We could not send the code right now. Please try again in a few minutes.',
      });
    }

    return res.json({ message: 'A new code is on its way.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
