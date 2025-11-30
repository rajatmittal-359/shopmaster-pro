const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true // One seller profile per user
    },
    businessName: {
      type: String,
      required: [true, 'Business name is required'],
      trim: true,
      minlength: [3, 'Business name must be at least 3 characters'],
      maxlength: [100, 'Business name cannot exceed 100 characters']
    },
    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      match: [
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        'Please provide a valid GST number'
      ]
    },
    bankDetails: {
      accountNumber: {
        type: String,
        trim: true
      },
      ifscCode: {
        type: String,
        trim: true,
        uppercase: true,
        match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Please provide a valid IFSC code']
      },
      accountHolderName: {
        type: String,
        trim: true
      }
    },
    isApproved: {
      type: Boolean,
      default: false
    },
    kycStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);



const Seller = mongoose.model('Seller', sellerSchema);

module.exports = Seller;
