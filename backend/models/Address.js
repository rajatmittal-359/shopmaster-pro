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
    // "Near Hawa Mahal gate" - what a Jaipur courier actually navigates by (Amazon India's optional line). Never required.
    landmark: { type: String, trim: true, maxlength: 80, default: '' },
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

    /*
     * RETIRED, NOT DELETED (28 Sep 2026)
     *
     *   An order keeps only `shippingAddressId` - there is no copy of the
     *   address on the order itself. The invoice reads it for place of
     *   supply, the courier booking reads it to collect the parcel, and
     *   `sellerController` refuses to ship at all with "Delivery address is
     *   missing" when it cannot be found.
     *
     *   So a customer tidying up their address book could make their own
     *   pending order unshippable, and the dialog told them it was safe:
     *   "orders already sent to it keep their own copy" - which was simply
     *   not true.
     *
     *   An address no order points at is still deleted outright. One that
     *   an order points at is retired: gone from the address book and from
     *   every checkout, kept for the order that needs it. The same rule
     *   `deleteMe` already followed, and the same rule Shopify states for
     *   anything money has touched.
     */
    retiredAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Address', addressSchema);
