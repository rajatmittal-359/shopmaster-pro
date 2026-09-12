const mongoose = require('mongoose');

/**
 * Money a seller owes the platform, one row per event.
 *
 * Its own collection because it grows for as long as the shop trades - never
 * an array on Seller. `payoutId: null` means "not yet taken"; the payout that
 * nets it off stamps its id here, so a charge is taken exactly once and a
 * seller can see, per payout, what was deducted and for which order.
 *
 * Only one kind today (a seller-caused cancellation beyond the monthly
 * allowance - see config/sellerRules.js). A late-dispatch charge would be a
 * second `kind`, not a second collection.
 */
const sellerChargeSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    orderNumber: { type: String, default: null },
    kind: { type: String, enum: ['seller_cancel'], required: true },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: null },
    payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null },
    claimedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The payout's question: what does this seller still owe?
sellerChargeSchema.index({ sellerId: 1, payoutId: 1 });

module.exports = mongoose.model('SellerCharge', sellerChargeSchema);
