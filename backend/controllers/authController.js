const User = require('../models/User');
const sellerRules = require('../config/sellerRules');

/**
 * Nobody sells here without reading the rules first - Amazon, Flipkart and
 * Meesho all put the agreement before the first listing, and so do we. The
 * page sends `acceptedSellerAgreement: true` with the version it showed; the
 * version has to be the current one, so a stale tab cannot accept last
 * year's terms.
 */
const agreementRefusal = (body = {}) => {
  const ok = body.acceptedSellerAgreement === true && String(body.agreementVersion || '') === sellerRules.version;
  return ok
    ? null
    : {
        message: 'Please read and agree to the Seller Agreement to sell on ShopMaster Pro.',
        agreementVersion: sellerRules.version,
      };
};
const acceptedNow = () => ({ version: sellerRules.version, acceptedAt: new Date() });
const Seller = require('../models/Seller');
const { generateToken } = require('../utils/tokenUtils');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');
const { passwordResetEmail } = require('../utils/emailTemplates');

// Register
// Register
/** How long a caller must wait before another code can be sent. */
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** Same idea for reset links, which cost the same sending reputation. */
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;

/** The shortest password that will be accepted when one is being replaced. */
const MIN_PASSWORD_LENGTH = 6;

/**
 * Where the reset link points. The API and the site are different origins in
 * every environment this runs in, so the backend cannot build this from the
 * request - a link to the API host would 404 in the person's browser.
 */
const frontendUrl = () =>
  (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

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
    if (isSeller) {
      const refused = agreementRefusal(req.body);
      if (refused) return res.status(400).json(refused);
    }
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
      await Seller.create({ userId: user._id, businessName, agreement: acceptedNow() });
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


/**
 * Adding "seller" to an account that already exists.
 *
 * WHY THIS EXISTS
 *   Selling used to be chosen at sign-up, and it set `role` - so a customer who
 *   decided to sell had to register again with a different email and ended up
 *   with two accounts, two order histories and two passwords for one person.
 *   Etsy's own words are the test: "You'll use this account to run your shop
 *   and to buy from other makers on Etsy."
 *
 * WHAT IT DOES NOT DO
 *   It does not approve anybody. It creates the Seller record - which IS the
 *   application - and an admin approves it exactly as before. Nothing of theirs
 *   is public until then.
 *
 *   It also does not touch `role`. Authorisation reads capabilities from the
 *   database now, so a shopper who starts selling keeps every customer route
 *   they had - including their cart and their old orders.
 */
exports.becomeSeller = async (req, res) => {
  try {
    const businessName = String(req.body?.businessName || '').trim();

    if (businessName.length < 2) {
      return res.status(400).json({ message: 'What is the shop called?' });
    }

    const refused = agreementRefusal(req.body);
    if (refused) return res.status(400).json(refused);

    const existing = await Seller.findOne({ userId: req.user._id }).select('isApproved status');

    if (existing) {
      // Not an error worth a 400 in the usual sense - they are simply already
      // in the queue, and the useful answer is where they are in it.
      return res.status(409).json({
        message: existing.isApproved
          ? 'This account already sells on ShopMaster Pro.'
          : 'Your application is already with us - an admin is reviewing it.',
        isApproved: existing.isApproved,
        status: existing.status,
      });
    }

    const seller = await Seller.create({ userId: req.user._id, businessName, agreement: acceptedNow() });

    return res.status(201).json({
      message: 'Thank you. An admin will review your shop before it goes live.',
      seller: { businessName: seller.businessName, isApproved: seller.isApproved },
    });
  } catch (error) {
    console.error('BECOME SELLER ERROR:', error.message);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Signing in with Google.
 *
 * THE FLOW
 *   The browser gets an ID token from Google and posts it here. We verify it,
 *   then issue OUR OWN session token - the same one the password path issues.
 *   Google proves who somebody is; it does not become a second source of truth
 *   for sessions, and every authorisation check in this codebase keeps reading
 *   the one token it already understands.
 *
 * THREE CASES, AND THE ORDER MATTERS
 *   1. We have seen this Google account before -> sign them in. Matched on
 *      `sub`, never on email.
 *   2. The verified email belongs to an existing account -> LINK it. Somebody
 *      who registered with a password and later presses "Continue with Google"
 *      expects their orders to still be there, not a second empty account. This
 *      is only safe because Google has told us the address is verified.
 *   3. Nobody -> create a customer. No password: they never typed one, and an
 *      invented one is a credential nobody knows and everybody has to store.
 *
 * WHAT IT DOES NOT DO
 *   It does not make anybody a seller or an admin, whatever Google says. Role
 *   comes from our own records, and a new account is a customer like any other.
 */
exports.googleSignIn = async (req, res) => {
  try {
    const { verifyGoogleCredential } = require('../utils/googleIdentity');

    let identity;
    try {
      identity = await verifyGoogleCredential(req.body?.credential);
    } catch (err) {
      // 401, not 500: nothing is broken here, the credential simply did not
      // check out - and the message is written to be shown to a person.
      return res.status(401).json({ message: err.message });
    }

    let user = await User.findOne({ googleId: identity.googleId });

    if (!user) {
      user = await User.findOne({ email: identity.email });

      if (user) {
        user.googleId = identity.googleId;
        /*
         * Google has verified the address, which is exactly what our own OTP
         * proves. Somebody who signed up, never opened the email, and then came
         * back through Google should not be told to go and find that code.
         */
        user.isVerified = true;
        await user.save();
      } else {
        user = await User.create({
          name: identity.name,
          email: identity.email,
          googleId: identity.googleId,
          isVerified: true,
          role: 'customer',
        });
      }
    }

    const token = generateToken(user._id, user.role);

    return res.json({
      message: 'Signed in with Google',
      token,
      role: user.role,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('GOOGLE SIGN-IN ERROR:', error.message);
    return res.status(500).json({ message: 'Could not sign you in just now' });
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


/**
 * "I forgot my password."
 *
 * There was no way to do this at all. Anyone who forgot their password was
 * locked out permanently - they could not log in, and registering again is
 * refused because the address is taken.
 *
 * THE ANSWER IS ALWAYS THE SAME, whether or not the address has an account.
 * A different reply for a real address turns this into a way to test which
 * emails are registered on the platform, one address at a time. Every seller's
 * and customer's address is worth something to a spammer, so the endpoint
 * refuses to confirm anything.
 */
exports.forgotPassword = async (req, res) => {
  // Said once and reused, so the two paths cannot drift apart and start
  // telling a caller which one they took.
  const neutral = {
    message:
      'If there is an account for that address, a reset link is on its way.',
  };

  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const user = await User.findOne({ email }).select(
      '+resetTokenHash +resetTokenExpiry +resetLastSentAt'
    );

    if (!user) return res.json(neutral);

    const since = user.resetLastSentAt
      ? Date.now() - user.resetLastSentAt.getTime()
      : Infinity;
    // Silently satisfied rather than a 429: a rate-limit reply that only ever
    // appears for real accounts is the same leak by another route.
    if (since < RESET_RESEND_COOLDOWN_MS) return res.json(neutral);

    const rawToken = user.generateResetToken();
    user.resetLastSentAt = new Date();
    await user.save();

    const link = `${frontendUrl()}/reset-password?token=${rawToken}`;
    const mail = passwordResetEmail(user, link);

    try {
      await sendEmail({ to: user.email, ...mail });
    } catch (err) {
      // Loud in the log because this is the shop's own problem to fix, and no
      // one locked out can report it. The caller still gets the neutral reply:
      // a delivery failure must not become a way to probe for real addresses.
      console.error(
        'Could not send the reset link to',
        user.email,
        '-',
        err.message
      );
    }

    return res.json(neutral);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Sets the new password, given the token from the email.
 *
 * The token is hashed before it is looked up, because only the hash was ever
 * stored - see the User model. Expiry is checked in the query itself, so an
 * expired token cannot be matched at all rather than being matched and then
 * rejected.
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ message: 'Reset link and new password are both required' });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(String(token))
      .digest('hex');

    const user = await User.findOne({
      resetTokenHash: tokenHash,
      resetTokenExpiry: { $gt: new Date() },
    }).select('+resetTokenHash +resetTokenExpiry');

    if (!user) {
      return res.status(400).json({
        message: 'That reset link has expired or has already been used.',
      });
    }

    // The pre('save') hook hashes it; assigning the plain value here is
    // correct and matches how registration sets one.
    user.password = password;

    // Cleared in the same save, which is what makes the link single-use. Left
    // in place, one intercepted email would stay a working key for an hour.
    user.resetTokenHash = undefined;
    user.resetTokenExpiry = undefined;

    // Someone who resets a password they never set has proved they own the
    // inbox, which is exactly what verification asks for.
    if (!user.isVerified) user.isVerified = true;

    await user.save();

    return res.json({
      message: 'Your password has been changed. You can sign in with it now.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};
