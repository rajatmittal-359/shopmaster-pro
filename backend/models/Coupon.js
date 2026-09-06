const mongoose = require('mongoose');

/**
 * A code that takes money off a basket.
 *
 * WHY `fundedBy` IS THE MOST IMPORTANT FIELD HERE
 *   A discount is somebody paying part of the customer's bill. If the order
 *   does not record who, the payout is wrong - and wrong quietly, surfacing
 *   weeks later as a seller asking why they were paid less than they sold for.
 *   Commission taught that lesson already; this field is the same lesson
 *   applied to the other direction.
 *
 *     platform  the platform buys the sale out of its own commission. The
 *               seller sells at their price and is paid on their price.
 *     seller    the seller buys the sale. Their gross falls and commission
 *               falls with it.
 *
 *   An admin may create either. A seller may only ever create a seller-funded
 *   one - otherwise a seller could spend the platform's money, which is not a
 *   thing anybody should have to notice later.
 *
 * WHY LIMITS ARE NOT OPTIONAL EXTRAS
 *   A code with no ceiling is a hole in the till. `usageLimit` caps the whole
 *   campaign, `perCustomerLimit` stops one person draining it, `maxDiscount`
 *   stops a percentage becoming enormous on a large basket, and `validUntil`
 *   means a forgotten code stops working by itself. Every one of those exists
 *   because the alternative is finding out from the bank.
 */
const couponSchema = new mongoose.Schema(
  {
    /**
     * What the customer types. Stored uppercase and matched uppercase, because
     * nobody types a coupon the way it was written.
     */
    code: {
      type: String,
      required: [true, 'A coupon needs a code'],
      trim: true,
      uppercase: true,
      unique: true,
      minlength: [3, 'A code needs at least 3 characters'],
      maxlength: [24, 'A code longer than 24 characters will not be typed correctly'],
      match: [/^[A-Z0-9]+$/, 'Use only letters and numbers - no spaces or symbols'],
    },

    /** Shown to the customer when the code is applied, and on the order. */
    description: { type: String, trim: true, maxlength: 120 },

    type: {
      type: String,
      enum: ['percent', 'flat'],
      required: true,
    },

    /** Percent (1-100) or rupees, depending on `type`. */
    value: {
      type: Number,
      required: true,
      min: [0, 'A discount cannot be negative'],
    },

    /**
     * The ceiling on a percentage. 20% off is fine on a RS 500 order and
     * ruinous on a RS 50,000 one; without this the code's cost is unbounded.
     * Ignored for flat coupons, which are already their own ceiling.
     */
    maxDiscount: { type: Number, default: null, min: 0 },

    /** The basket has to be worth at least this before the code applies. */
    minOrderValue: { type: Number, default: 0, min: 0 },

    /** Who pays for it. See the note above - this is the field that matters. */
    fundedBy: {
      type: String,
      enum: ['platform', 'seller'],
      required: true,
    },

    /**
     * A seller-funded coupon belongs to exactly one seller and only ever
     * discounts their own lines. Required when fundedBy is 'seller', and
     * meaningless otherwise.
     */
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },

    validFrom: { type: Date, default: Date.now },

    /**
     * Null means it runs until somebody turns it off - allowed, but the reason
     * dates exist is that a forgotten code should stop working by itself.
     */
    validUntil: { type: Date, default: null },

    /** Times this code may be used in total. Null is deliberate and unlimited. */
    usageLimit: { type: Number, default: null, min: 1 },

    /** Times one customer may use it. Defaults to once, which is the usual intent. */
    perCustomerLimit: { type: Number, default: 1, min: 1 },

    /**
     * Incremented only when an order is actually PAID FOR, never when a code is
     * checked or a basket is abandoned - otherwise a campaign runs out because
     * people looked at it.
     */
    usedCount: { type: Number, default: 0, min: 0 },

    /**
     * Who has used it, and how often. Kept here rather than derived from orders
     * so the per-customer limit can be enforced without scanning every order
     * ever placed.
     */
    usedBy: [
      {
        _id: false,
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 1 },
      },
    ],

    /** Turned off by hand, without deleting the record the orders point at. */
    isActive: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/**
 * A seller-funded coupon with no seller would discount everybody's lines and
 * charge it to nobody. Caught here rather than at the point it pays out wrong.
 */
// Async and throwing, not next() - Mongoose gives async middleware no `next`,
// and a hook written the other way fails on EVERY save with "next is not a
// function". The same mistake was made on Product; a test now constructs a real
// document so it cannot be made a third time silently.
couponSchema.pre('validate', async function ensureFunderIsReal() {
  if (this.fundedBy === 'seller' && !this.sellerId) {
    throw new Error('A seller-funded coupon has to belong to a seller');
  }
  if (this.type === 'percent' && this.value > 100) {
    throw new Error('A percentage discount cannot be more than 100%');
  }
  if (this.validUntil && this.validFrom && this.validUntil <= this.validFrom) {
    throw new Error('The end date has to be after the start date');
  }
});

module.exports = mongoose.model('Coupon', couponSchema);
