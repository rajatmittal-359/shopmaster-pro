// backend/models/Address.js
const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    label: {
      type: String,
      default: 'Home',
    },
      phoneNumber: {
    type: String,
    required: [true, 'Phone number required for delivery'],
    trim: true,
    validate: {
      validator: function(v) {
        return /^[6-9]\d{9}$/.test(v); // 10 digit Indian mobile
      },
      message: 'Enter valid 10-digit mobile number'
    }
  },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: {
      type: String,
      required: [true, 'PIN code is required'],
      trim: true,
      validate: {
        // Six digits, never starting at zero - no Indian PIN code does.
        // Unchecked, a wrong PIN is not a typo the customer notices: the
        // courier quote is computed for the wrong place, or refused outright,
        // and the parcel goes nowhere.
        validator: (v) => /^[1-9]\d{5}$/.test(v),
        message: 'Enter a valid 6-digit PIN code',
      },
    },
    country: { type: String, default: 'India' },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Address', addressSchema);
