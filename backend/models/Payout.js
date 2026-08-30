const mongoose = require('mongoose');

/**
 * One transfer of money from the platform to a seller.
 *
 * WHY THIS EXISTS
 *   Every customer payment lands in the platform's own gateway account,
 *   whichever seller made the sale. Commission is already snapshotted per order
 *   line, so what each seller is owed is known - but there was no record of
 *   what had actually been PAID to them. This is that record.
 *
 * HOW DOUBLE-PAYMENT IS PREVENTED
 *   A payout does not describe a date range. It CLAIMS specific order lines by
 *   stamping its own id onto `Order.items[].payoutId`, and only ever claims
 *   lines where that field is still null. Two payout runs therefore cannot
 *   include the same sale, no matter how their periods overlap.
 *
 *   The totals below are computed from the lines actually claimed, never from
 *   what was expected to be claimed.
 *
 * WHAT THIS DELIBERATELY IS NOT
 *   It does not move money. Marking a payout `paid` records that a transfer
 *   happened out of band, with its bank reference. Automating the transfer is
 *   a separate concern (Razorpay Route) with its own compliance requirements.
 */
const payoutSchema = new mongoose.Schema(
  {
    /** The seller's user account. Product.sellerId points at the same thing. */
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /** Business name at the time of payout, so a later rename cannot rewrite history. */
    businessName: {
      type: String,
      required: true,
    },

    /** Human-readable reference, e.g. PO-260830-A3F19C. Set in pre-validate. */
    payoutNumber: {
      type: String,
      unique: true,
      index: true,
    },

    /** Delivery dates of the earliest and latest sale in this payout. */
    periodFrom: { type: Date, default: null },
    periodTo: { type: Date, default: null },

    /** How many order lines this payout settles. */
    itemCount: {
      type: Number,
      required: true,
      min: 0,
    },

    /**
     * The money, all derived from the claimed lines:
     *
     *     grossSales = commission + netPayable
     *
     * grossSales is what customers paid for the goods (never shipping).
     * commission is the platform's cut. netPayable is what the seller receives.
     */
    grossSales: { type: Number, required: true, min: 0 },
    commission: { type: Number, required: true, min: 0 },
    netPayable: { type: Number, required: true, min: 0 },

    status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
      index: true,
    },

    /** Bank/UPI reference for the transfer that actually happened. */
    reference: { type: String, default: null, trim: true },

    /** Why a transfer failed, so it can be retried knowingly. */
    failureReason: { type: String, default: null, trim: true },

    paidAt: { type: Date, default: null },

    /** Admin who generated it, and the admin who settled it. */
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    settledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    notes: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

/**
 * Readable reference, built before validation so `unique` has a value.
 * Derived from _id, so it inherits its uniqueness and needs no counter.
 */
payoutSchema.pre('validate', function () {
  if (this.payoutNumber) return;

  const d = this.createdAt ? new Date(this.createdAt) : new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');

  this.payoutNumber = `PO-${yy}${mm}${dd}-${String(this._id).slice(-6).toUpperCase()}`;
});

payoutSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model('Payout', payoutSchema);
