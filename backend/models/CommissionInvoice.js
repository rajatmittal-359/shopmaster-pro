const mongoose = require('mongoose');

/**
 * The platform's monthly bill to one seller for the commission and charges it
 * kept (plan 2.85). Issued once per seller per month and never edited: every
 * figure and both parties' names are copied in at issue, so a later rename,
 * a new address or a changed rate cannot rewrite a document already filed.
 */
const lineSchema = new mongoose.Schema(
  {
    payoutNumber: String,
    paidAt: Date,
    periodFrom: Date,
    periodTo: Date,
    grossSales: Number,
    commission: Number,
    charges: Number,
  },
  { _id: false }
);

const partySchema = new mongoose.Schema(
  { name: String, legalName: String, address: String, gstin: String },
  { _id: false }
);

const commissionInvoiceSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    number: { type: String, required: true, unique: true },
    issuedAt: { type: Date, required: true },
    from: partySchema,
    to: partySchema,
    lines: [lineSchema],
    grossSales: Number,
    commission: Number,
    charges: Number,
    total: Number,
  },
  { timestamps: true }
);

commissionInvoiceSchema.index({ sellerId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('CommissionInvoice', commissionInvoiceSchema);
