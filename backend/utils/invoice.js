/**
 * invoice.js - the seller's invoice number and the GST split on a line.
 *
 * WHY (15 Sep 2026, WHAT-IS-LEFT §3 "GST-registered seller's tax invoice")
 *   On a marketplace the SELLER is the supplier, and the platform prints the
 *   customer's copy on the seller's behalf. For a seller registered under GST
 *   that document is a TAX INVOICE and CGST Rule 46 says what it must carry:
 *   a consecutive serial number unique to the financial year (≤16 characters,
 *   letters, digits, "-" and "/" only), the HSN of each line, the taxable
 *   value and the tax split - CGST + SGST when the seller and the place of
 *   supply are in the same state, IGST otherwise. Rule 46 does not bind an
 *   unregistered seller, but a numbered invoice is what any shop hands over
 *   and what a customer's card dispute or a consumer forum asks for, so every
 *   seller gets a series; only the tax columns depend on registration.
 *
 * THE NUMBER
 *   <prefix>/<FY>/<sequence>  e.g. MJ/26-27/00042  (14 characters)
 *   One series per seller (each seller is their own supplier), counted on
 *   the Seller document with an atomic $inc, so two orders placed in the
 *   same second cannot share a number. Issued once, at the moment the order
 *   is confirmed - COD at placement, prepaid when the payment lands - so an
 *   abandoned Razorpay attempt never burns a number. A cancelled order keeps
 *   its number (a gap in the series is normal; the credit note is the
 *   seller's own affair, and a GST seller's credit note is noted in the
 *   ledger for the day one is needed).
 *
 * THE SPLIT
 *   Indian consumer prices are quoted tax-INCLUSIVE (Legal Metrology MRP,
 *   every marketplace), so the taxable value is price ÷ (1 + rate) and the
 *   tax is what is left - never added on top of what the customer saw.
 *   Place of supply for goods to a consumer is the delivery address; the
 *   seller's state is the one in their GSTIN's first two digits.
 */
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const { STATES } = require('./kyc');

/** GST rate slabs a product may carry (per cent). 0.25 is rough diamonds, 1.5 cut ones, 3 is gold/silver jewellery. */
const GST_RATES = [0, 0.25, 1.5, 3, 5, 12, 18, 28];

/** HSN as the seller types it: 4, 6 or 8 digits, or nothing. */
const cleanHsn = (v) => {
  const s = String(v ?? '').replace(/\D/g, '');
  return [4, 6, 8].includes(s.length) ? s : '';
};

/** A rate is one of the slabs; anything else is "not set". */
const cleanGstRate = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return GST_RATES.includes(n) ? n : null;
};

/** Indian financial year of a date, as it is written on invoices: "26-27". */
const financialYear = (d = new Date()) => {
  const y = d.getFullYear() % 100;
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${String(start).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
};

/** Up to three initials of the shop name, letters only - "Meera Jewels" → "MJ"; nothing usable → "SMP". */
const prefixFor = (businessName) => {
  const words = String(businessName || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter(Boolean);
  const p = words.length >= 2 ? words.slice(0, 3).map((w) => w[0]).join('') : words[0] ? words[0].slice(0, 3) : '';
  return p || 'SMP';
};

const formatNumber = (prefix, seq, at) => `${prefix}/${financialYear(at)}/${String(seq).padStart(5, '0')}`;

/**
 * The next number in this seller's series - one atomic increment. The prefix
 * is fixed the first time it is needed and never changes afterwards, so a
 * renamed shop keeps one continuous series.
 */
const nextInvoiceNumber = async (sellerUserId, { session, at = new Date() } = {}) => {
  const s = await Seller.findOneAndUpdate({ userId: sellerUserId }, { $inc: { invoiceSeq: 1 } }, { returnDocument: 'after', session: session || null }).select('invoiceSeq invoicePrefix businessName');
  if (!s) throw new Error(`no Seller document for user ${sellerUserId}`);
  let prefix = s.invoicePrefix;
  if (!prefix) {
    prefix = prefixFor(s.businessName);
    await Seller.updateOne({ _id: s._id, invoicePrefix: { $in: ['', null] } }, { $set: { invoicePrefix: prefix } }, { session: session || null });
  }
  return formatNumber(prefix, s.invoiceSeq, at);
};

/**
 * Give every seller on a confirmed order their invoice number. Idempotent:
 * an order that already has numbers is left alone, and the write is guarded
 * so a replayed payment webhook cannot issue a second set.
 */
const assignInvoiceNumbers = async (order, { session } = {}) => {
  if (Array.isArray(order.invoices) && order.invoices.length) return order.invoices;
  const sellerIds = [...new Set((order.items || []).filter((i) => i.status !== 'cancelled').map((i) => String(i.sellerId)))];
  const issuedAt = new Date();
  const invoices = [];
  for (const sellerId of sellerIds) {
    invoices.push({ sellerId, number: await nextInvoiceNumber(sellerId, { session, at: issuedAt }), issuedAt });
  }
  await Order.updateOne({ _id: order._id, 'invoices.0': { $exists: false } }, { $set: { invoices } }, { session: session || null });
  order.invoices = invoices;
  return invoices;
};

const norm = (s) => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

/** Whether a delivery to `addressState` from a seller holding `gstin` is intra-state (CGST+SGST) or inter-state (IGST). */
const taxScheme = (gstin, addressState) => {
  const sellerState = STATES[String(gstin || '').slice(0, 2)];
  if (!sellerState) return null;
  return norm(sellerState) === norm(addressState) ? 'cgst_sgst' : 'igst';
};

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Split a tax-inclusive line amount. Returns rupees to the paisa; the sum of
 * the parts is the amount charged, always.
 */
const taxSplit = (amount, rate, scheme) => {
  const pct = Number(rate) || 0;
  const taxable = r2(amount / (1 + pct / 100));
  const tax = r2(amount - taxable);
  if (scheme === 'igst') return { taxable, cgst: 0, sgst: 0, igst: tax, tax };
  const half = r2(tax / 2);
  // Any rounding paisa goes to SGST so cgst + sgst === tax.
  return { taxable, cgst: half, sgst: r2(tax - half), igst: 0, tax };
};

module.exports = { GST_RATES, cleanHsn, cleanGstRate, financialYear, prefixFor, formatNumber, nextInvoiceNumber, assignInvoiceNumbers, taxScheme, taxSplit };
