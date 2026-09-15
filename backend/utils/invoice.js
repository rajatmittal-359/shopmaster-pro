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
 *   same second cannot share a number. Issued once, AFTER the order's
 *   transaction has committed - COD at placement, prepaid when the payment
 *   lands - never inside it: a $inc on the same Seller from two checkouts a
 *   second apart is a WriteConflict, and a conflict inside the transaction
 *   would abort the sale to protect a serial (the first review of this file
 *   caught exactly that). Outside it, a failed issue is logged and the
 *   customer's first open of the Invoice page issues instead. An abandoned
 *   Razorpay attempt never reaches issue, so it burns nothing. A cancelled
 *   order keeps its number (a gap in the series is normal; the credit note
 *   is in the ledger for the day a registered seller needs one).
 *
 * THE SPLIT
 *   Indian consumer prices are quoted tax-INCLUSIVE (Legal Metrology MRP,
 *   every marketplace), so the taxable value is price ÷ (1 + rate) and the
 *   tax is what is left - never added on top of what the customer saw.
 *   Place of supply for goods to a consumer is the delivery address; the
 *   seller's state is the one in their GSTIN's first two digits. The split
 *   is computed HERE, once, and sent to the page - never re-derived in the
 *   browser - so the customer's copy and the seller's figures are one.
 */
const Seller = require('../models/Seller');
const Order = require('../models/Order');
const { STATES, pinMatchesState } = require('./kyc');

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

/**
 * Tax facts as a registered seller must give them, as a plain error or null.
 * `registered` is the seller's standing; an unregistered shop is never asked.
 */
const taxFactsError = ({ hsn, gstRate }, registered) => {
  if (hsn !== undefined && hsn !== null && String(hsn).trim() !== '' && !cleanHsn(hsn)) return 'HSN must be 4, 6 or 8 digits.';
  if (gstRate !== undefined && gstRate !== null && gstRate !== '' && cleanGstRate(gstRate) === null) return `GST rate must be one of ${GST_RATES.join(', ')}%.`;
  if (registered && (!cleanHsn(hsn) || cleanGstRate(gstRate) === null)) return 'Your shop is GST-registered: every product needs its HSN code and GST rate, so the tax invoice we print in your name is right.';
  return null;
};

/** Indian financial year of an instant, in IST as invoices are dated: "26-27". */
const financialYear = (d = new Date()) => {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const y = ist.getUTCFullYear() % 100;
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
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
const nextInvoiceNumber = async (sellerUserId, { at = new Date() } = {}) => {
  const s = await Seller.findOneAndUpdate({ userId: sellerUserId }, { $inc: { invoiceSeq: 1 } }, { returnDocument: 'after' }).select('invoiceSeq invoicePrefix businessName');
  if (!s) throw new Error(`no Seller document for user ${sellerUserId}`);
  let prefix = s.invoicePrefix;
  if (!prefix) {
    prefix = prefixFor(s.businessName);
    await Seller.updateOne({ _id: s._id, invoicePrefix: { $in: ['', null] } }, { $set: { invoicePrefix: prefix } });
  }
  return formatNumber(prefix, s.invoiceSeq, at);
};

/**
 * Give every seller on a confirmed order their invoice number. Idempotent
 * and race-safe: an order that already has numbers is left alone; the write
 * is guarded on the order having none, and when the guard loses (two opens
 * of the same page at once) the numbers THIS call drew are reported as
 * burned and the stored set is returned - so nobody is ever shown a number
 * the database does not hold. Every seller is checked to exist before any
 * number is drawn, so a missing document cannot burn the others' serials.
 */
const assignInvoiceNumbers = async (order) => {
  if (Array.isArray(order.invoices) && order.invoices.length) return order.invoices;
  const sellerIds = [...new Set((order.items || []).filter((i) => i.status !== 'cancelled').map((i) => String(i.sellerId)))];
  if (!sellerIds.length) return [];
  const present = new Set((await Seller.find({ userId: { $in: sellerIds } }).select('userId').lean()).map((s) => String(s.userId)));
  const missing = sellerIds.filter((id) => !present.has(id));
  if (missing.length) throw new Error(`no Seller document for user ${missing.join(', ')}`);

  const issuedAt = new Date();
  const invoices = [];
  for (const sellerId of sellerIds) {
    invoices.push({ sellerId, number: await nextInvoiceNumber(sellerId, { at: issuedAt }), issuedAt });
  }
  const r = await Order.updateOne({ _id: order._id, 'invoices.0': { $exists: false } }, { $set: { invoices } });
  if (!r.matchedCount) {
    const stored = (await Order.findById(order._id).select('invoices').lean())?.invoices || [];
    console.warn('invoice numbers drawn twice for order', String(order._id), '- burned:', invoices.map((x) => x.number).join(', '), '- kept:', stored.map((x) => x.number).join(', '));
    order.invoices = stored;
    return stored;
  }
  order.invoices = invoices;
  return invoices;
};

const ALIASES = { orissa: 'odisha', newdelhi: 'delhi', nctofdelhi: 'delhi', delhincr: 'delhi', pondicherry: 'puducherry', uttaranchal: 'uttarakhand', bengaluru: 'karnataka', bangalore: 'karnataka', jk: 'jammuandkashmir' };
const norm = (s) => {
  const n = String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
  return ALIASES[n] || n;
};

/**
 * Home or away: 'cgst_sgst' when the delivery is in the seller's GSTIN state,
 * 'igst' when it is not, null when that cannot be told. The state NAME on
 * the address is free text ("Rajsthan", "Jaipur"), so the PIN code is read
 * first: a PIN outside the seller's state's ranges is a certain 'igst'; a
 * PIN inside them plus a matching name is 'cgst_sgst'; a PIN inside them
 * with a name that does not match is left null rather than guessed - the
 * page says so, and no split is printed on a document that would be wrong.
 */
const taxScheme = (gstin, delivery) => {
  const code = String(gstin || '').slice(0, 2);
  const sellerState = STATES[code];
  if (!sellerState) return null;
  const d = typeof delivery === 'string' ? { state: delivery } : delivery || {};
  const nameMatch = d.state ? norm(sellerState) === norm(d.state) : null;
  const pinMatch = pinMatchesState(d.pincode, code);
  if (pinMatch === false) return 'igst';
  if (nameMatch === true) return 'cgst_sgst';
  if (nameMatch === false && pinMatch === null) return 'igst';
  return null;
};

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Split a tax-inclusive line amount. Returns rupees to the paisa; the sum of
 * the parts is the amount charged, always. A line with no rate set returns
 * null - "no tax" is never assumed on a tax invoice.
 */
const taxSplit = (amount, rate, scheme) => {
  if (rate === null || rate === undefined || rate === '' || !scheme) return null;
  const pct = Number(rate) || 0;
  const taxable = r2(amount / (1 + pct / 100));
  const tax = r2(amount - taxable);
  if (scheme === 'igst') return { taxable, cgst: 0, sgst: 0, igst: tax, tax };
  const half = r2(tax / 2);
  // Any rounding paisa goes to SGST so cgst + sgst === tax.
  return { taxable, cgst: half, sgst: r2(tax - half), igst: 0, tax };
};

/**
 * The tax picture of one seller's lines on an order, ready to print:
 * scheme, per-line splits keyed by line id (null where the rate is not set),
 * totals, and the number of lines that could not be split. Only for a
 * registered seller; the unregistered get null and no tax column.
 */
const taxFor = (gstin, delivery, items) => {
  if (!gstin) return null;
  const scheme = taxScheme(gstin, delivery);
  const lines = {};
  let unsplit = 0;
  const totals = { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0 };
  for (const i of items) {
    const amount = r2(i.price * i.quantity - (i.discountAmount || 0));
    const s = taxSplit(amount, i.gstRate, scheme);
    lines[String(i._id)] = s;
    if (!s) unsplit += 1;
    else for (const k of Object.keys(totals)) totals[k] = r2(totals[k] + s[k]);
  }
  return { scheme, lines, totals, unsplit };
};

module.exports = { GST_RATES, cleanHsn, cleanGstRate, taxFactsError, financialYear, prefixFor, formatNumber, nextInvoiceNumber, assignInvoiceNumbers, taxScheme, taxSplit, taxFor };
