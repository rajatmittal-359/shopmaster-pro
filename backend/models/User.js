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
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
        },
        role: {
        type: String,
        enum: ['admin', 'seller', 'customer'],
        default: 'customer'
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


    const User = mongoose.model('User', userSchema);

    module.exports = User;
