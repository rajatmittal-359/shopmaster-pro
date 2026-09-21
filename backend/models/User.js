    const mongoose = require('mongoose');
    const bcrypt = require('bcryptjs');

    const userSchema = new mongoose.Schema(
    {
        name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters']
        },
        email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        // The previous pattern ended in (\.\w{2,3})+ which caps the TLD at three
        // characters, so real addresses on .store, .online and .jewelry were
        // rejected at signup. This accepts any sane TLD length instead.
        match: [
            /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/,
            'Please provide a valid email'
        ]
        },
        password: {
        type: String,
        /*
         * Required unless the account came from Google.
         *
         * Somebody who signed in with Google has no password here and never
         * typed one - demanding a stored password would mean inventing one,
         * and an invented password is a credential nobody knows and everybody
         * has to store.
         *
         * They can still set one later through the forgot-password flow, which
         * is the honest way to add a second way in: it proves they own the
         * mailbox first.
         */
        required: [
            function () {
            return !this.googleId;
            },
            'Password is required',
        ],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
        },

        /**
         * Google's own permanent id for this person - the `sub` claim.
         *
         * KEYED ON `sub`, NEVER ON EMAIL. An email address can change, and a
         * Workspace admin can hand a departed employee's address to somebody
         * new; matching on email is how one person ends up inside another's
         * account. `sub` never changes and never moves.
         *
         * `sparse` because almost nobody has one: a unique index without it
         * would treat every password account's missing googleId as a duplicate
         * null and refuse the second signup.
         */
        googleId: {
        type: String,
        // No default: `default: null` STORED a null, and a sparse unique index
        // still indexes a stored null - so the second password account on a
        // fresh database was "a duplicate googleId" (found by the e2e seed on
        // a throwaway Mongo, 22 Sep 2026; the dev and prod databases predate
        // the index and never hit it). Absent field + the partial index below.
        select: false
        },
        role: {
        type: String,
        enum: ['admin', 'seller', 'customer'],
        default: 'customer'
        },

        /**
         * An account that is EXEMPT from the AI caps (the admin, and the
         * platform's own shop) can switch the caps back on for itself - to feel
         * what a seller feels, or once its own catalogue is done and the free
         * allowances should be left for everyone else. Off means unlimited;
         * on means "treat me like any seller". Meaningless on accounts that
         * were never exempt.
         */
        /**
         * Fair Returns (plan §4.39): a customer's standing, set by an admin from
         * the computed risk (return %, refused returns, lost disputes, RTO):
         *   none | warn | prepaid_only (COD refused) | returns_approval (every
         *   return waits for an admin). Blocking is isBlocked below. The reason is
         *   shown to the customer - a consequence with no reason is a grievance.
         */
        risk: {
          level: { type: String, enum: ['none', 'warn', 'prepaid_only', 'returns_approval'], default: 'none' },
          reason: { type: String, default: null },
          setAt: { type: Date, default: null },
          setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        },

        /**
         * Set by an admin from Customers. A blocked account cannot sign in
         * or order; nothing is deleted, so the order history stays readable.
         */
        isBlocked: { type: Boolean, default: false },
        blockedReason: { type: String, default: null },
        /*
         * Delete my account (DPDP, 22 Sep 2026): the person's own fields go at
         * once; the order, invoice and payout records they appear in are kept
         * one year (DPDP Rules 2025: erase when the purpose is served, and the
         * commerce/tax records stay a year), then jobs/retention scrubs the
         * name, phone and street off those records too. `scrubbedAt` marks
         * that second step.
         */
        deletedAt: { type: Date, default: null },
        scrubbedAt: { type: Date, default: null },

        /*
         * Sessions (utils/auth/session, 19 Sep 2026). tokenVersion is stamped
         * into every access token; bumping it ends every session at once
         * ("log out everywhere", password change, reset). failedLogins and
         * lockUntil are the per-account lock: ten wrong passwords lock the
         * account for fifteen minutes whatever address they came from - the
         * per-IP limiter alone does not stop a botnet trying one account.
         */
        tokenVersion: { type: Number, default: 0 },
        failedLogins: { type: Number, default: 0 },
        lockUntil: { type: Date, default: null },
        lastLoginAt: { type: Date, default: null },
        /*
         * The one-time code in flight, if any (utils/auth/oneTimeCode): its
         * hash, what it is for (login on a new device / step-up / email
         * change), where it went, when it dies. Never selected by default.
         */
        oneTimeCode: {
          type: { hash: String, purpose: String, target: String, expiresAt: Date, sentAt: Date, tries: Number },
          default: undefined,
          select: false,
        },

        /**
         * Where each notification category also goes (plan 2.30). The bell
         * always gets it; these only ever switch a channel OFF. Missing = on,
         * so a new category needs no migration. Keys: utils/notify CATEGORIES.
         */
        notificationPrefs: {
          push: { type: Map, of: Boolean, default: undefined },
          email: { type: Map, of: Boolean, default: undefined },
        },

        aiLimitsLikeSeller: {
        type: Boolean,
        default: false
        },
        /*
         * Two-step sign-in with an authenticator app (utils/auth/totp, 22 Sep
         * 2026). The secret is stored encrypted (AES-256-GCM, key derived from
         * JWT_SECRET) and never selected by default; `lastCounter` refuses a
         * replay of the same 30 s code; `enabled` false = enrolment started
         * but not proven with a first code. Mandatory for admins, optional for
         * sellers.
         */
        totp: {
        enabled: { type: Boolean, default: false },
        secretEnc: { type: String, default: '', select: false },
        // The secret of an enrolment that has not shown its first code yet.
        pendingEnc: { type: String, default: '', select: false },
        lastCounter: { type: Number, default: 0, select: false },
        // Eight one-use recovery codes, SHA-256 hashed - the way back in when the phone is lost.
        recovery: { type: [String], default: [], select: false },
        enabledAt: { type: Date, default: null },
        },
        isVerified: {
        type: Boolean,
        default: false
        },
        otp: {
        type: String,
        select: false
        },
        otpExpiry: {
        type: Date,
        select: false
        },
        // When the last verification code went out. Without this, "send me
        // another code" is a button that mails anyone, as fast as it is
        // pressed, from an address the shop pays for.
        otpLastSentAt: {
        type: Date,
        select: false
        },

        /**
         * Password reset.
         *
         * What is stored is the SHA-256 of the token, never the token itself.
         * The token only ever exists in the email and in the link the person
         * clicks - so a dump of this collection cannot be used to reset
         * anybody's password, which is exactly what storing it plainly would
         * allow. It is the same reasoning as hashing the password.
         *
         * SHA-256 rather than bcrypt here on purpose: this is a 256-bit random
         * value, not a human-chosen secret, so there is nothing to brute-force
         * and no need for a slow hash on a path that runs on every attempt.
         */
        resetTokenHash: {
        type: String,
        select: false
        },
        resetTokenExpiry: {
        type: Date,
        select: false
        },
        // Same job as otpLastSentAt: without it, "email me a reset link" is a
        // button that mails any address, as fast as it is pressed, from a
        // sending reputation the shop has to keep.
        resetLastSentAt: {
        type: Date,
        select: false
        }
    },
    {
        timestamps: true
    }
    );

    // Hash password before saving - NO NEXT PARAMETER
    userSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    });

    // Compare password method
    userSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
    };

    /**
     * Starts a password reset and returns the RAW token, once.
     *
     * The caller puts it in the email and then forgets it; only the hash is
     * kept. It cannot be read back out of the database afterwards, which is
     * the point.
     */
    userSchema.methods.generateResetToken = function () {
    const crypto = require('crypto');
    const raw = crypto.randomBytes(32).toString('hex');

    this.resetTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    // An hour. Long enough to find the mail, short enough that a link left in
    // an inbox is not a standing key to the account.
    this.resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

    return raw;
    };

    // Generate OTP method
    userSchema.methods.generateOTP = function () {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    this.otp = otp;
    this.otpExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
    return otp;
    };

    // Verify OTP method
    userSchema.methods.verifyOTP = function (enteredOTP) {
    return this.otp === enteredOTP && this.otpExpiry > Date.now();
    };


    // Unique only where a Google id exists (see the field's note above).
    // Its own name: the dev and prod databases already carry the old sparse
    // `googleId_1`, and an index of the same name with other options would
    // fail to build at boot. The old one stays; with no default it never sees
    // a null again, so the two agree.
    userSchema.index({ googleId: 1 }, { name: 'googleId_present_unique', unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

    const User = mongoose.model('User', userSchema);

    module.exports = User;
