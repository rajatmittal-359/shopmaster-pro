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
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
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
