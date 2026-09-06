const mongoose = require('mongoose');
// Safe to require here: commission.js only requires this model lazily, inside a
// function, so there is no circular dependency at load time.
const { DEFAULT_COMMISSION_RATE } = require('../utils/commission');

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
    /**
     * Platform commission taken from this seller's sales, as a percentage of
     * the item value (shipping is never commissioned).
     *
     * It lives per seller so a rate can be negotiated individually - the
     * platform's own store is set to 0 here, while every other seller uses
     * DEFAULT_COMMISSION_RATE from utils/commission.js unless changed by admin.
     *
     * Changing this NEVER alters past orders: the rate in force is copied onto
     * each order item at the moment the order is placed. See utils/commission.js.
     */
    commissionRate: {
      type: Number,
      default: DEFAULT_COMMISSION_RATE,
      min: [0, 'Commission rate cannot be negative'],
      max: [100, 'Commission rate cannot exceed 100%']
    },

    /**
     * This shop belongs to the platform itself.
     *
     * All customer money already lands in the platform's own gateway account,
     * so there is nobody to transfer it to - its sales are revenue, not a
     * liability. Marked explicitly rather than inferred from a 0% commission,
     * because a negotiated 0% partner would still need paying.
     */
    /**
     * Where this seller's parcels are collected from, and returned to.
     *
     * WHY IT HAS TO BE PER SELLER
     *   Shipping read one address out of the environment - the platform shop's -
     *   and used it for everybody. On a marketplace that is three wrong things
     *   at once, and all of them cost money without anybody making a mistake:
     *
     *     a courier is sent to the PLATFORM's door to collect a parcel sitting
     *     in another seller's shop;
     *     a return of that seller's goods is delivered to the platform's door
     *     rather than theirs;
     *     and freight is quoted from the platform's pincode, so a seller in
     *     Mumbai has their customer charged Jaipur rates.
     *
     *   Harmless while Charming Jewels is the only seller. The first real
     *   third-party seller is when it starts costing.
     *
     * `shiprocketNickname` is the name the address is saved under in the
     * Shiprocket panel; bookings send that rather than the address itself,
     * which is how their pickup API works.
     */
    pickupAddress: {
      contactName: { type: String, trim: true },
      address1: { type: String, trim: true },
      address2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: {
        type: String,
        trim: true,
        match: [/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'],
      },
      phone: { type: String, trim: true },
      shiprocketNickname: { type: String, trim: true },
    },

    /**
     * This seller pays the delivery, on everything they sell.
     *
     * A per-PRODUCT `freeShipping` flag already existed, which is right for a
     * heavy item a seller wants to price differently - but a seller who has
     * decided their whole shop absorbs delivery had to remember to tick every
     * product, and every new one forever. This is that decision said once.
     *
     * The two are an OR, not a replacement: a product marked free stays free
     * whatever this says. Turning this off therefore never silently starts
     * charging for something a seller had deliberately made free.
     */
    offersFreeShipping: {
      type: Boolean,
      default: false
    },

    isPlatformOwned: {
      type: Boolean,
      default: false
    },

    isApproved: {
      type: Boolean,
      default: false
    },
    kycStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active',
  },
  suspensionReason: {
    type: String,
    default: '',
  },
  },
  {
    timestamps: true
  }
);



const Seller = mongoose.model('Seller', sellerSchema);

module.exports = Seller;
