/**
 * The seller's monthly commission bill (19 Oct 2026, plan 2.85).
 *
 * WHY
 *   Amazon, Flipkart and Meesho each issue their sellers a monthly invoice for
 *   the fees they charged; it is what the seller files and what their
 *   accountant asks for. We showed "Commission charged" as a number and issued
 *   nothing - no date, no serial, nothing to download.
 *
 * WHAT IT COUNTS
 *   Only money that has actually been kept: PAID payouts, by the IST month
 *   they were paid in (a payout made at 01:30 on 1 Nov in Jaipur is a November
 *   one, whatever the UTC box thinks). Each payout already carries what it
 *   kept - `commission` and `deductions` (cancellation charges, utils/
 *   sellerCharges) - so this is a grouping, not a new calculation.
 *
 * WHAT IT IS NOT
 *   A tax invoice. ShopMaster Pro has no GSTIN, so it cannot charge GST on its
 *   commission and the document says so in words. The day it registers, the
 *   tax lines go here and the seller can claim them as input credit.
 *
 * ONCE ISSUED, FIXED
 *   Only for a month that is over, numbered from one running platform serial
 *   per financial year of the month covered, written once (unique per seller
 *   and month) - a second request returns the same document, never a new one.
 */
const ist = require('./ist');
const { BUSINESS } = require('../config/business');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const monthOf = (d) => ist.istDayKey(d).slice(0, 7);

const monthsFromPayouts = (payouts) => {
  const by = new Map();
  for (const p of payouts) {
    if (!p.paidAt) continue;
    const m = monthOf(p.paidAt);
    const row = by.get(m) || { month: m, commission: 0, charges: 0, payouts: 0 };
    row.commission += p.commission || 0;
    row.charges += p.deductions || 0;
    row.payouts += 1;
    by.set(m, row);
  }
  return [...by.values()]
    .map((r) => ({ ...r, commission: round2(r.commission), charges: round2(r.charges), total: round2(r.commission + r.charges) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.month.localeCompare(a.month));
};

const buildStatement = (payouts, month) => {
  const lines = payouts
    .filter((p) => p.paidAt && monthOf(p.paidAt) === month)
    .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt))
    .map((p) => ({
      payoutNumber: p.payoutNumber,
      paidAt: p.paidAt,
      periodFrom: p.periodFrom || null,
      periodTo: p.periodTo || null,
      grossSales: round2(p.grossSales),
      commission: round2(p.commission),
      charges: round2(p.deductions),
    }));
  const sum = (k) => round2(lines.reduce((s, l) => s + l[k], 0));
  const commission = sum('commission');
  const charges = sum('charges');
  return { lines, grossSales: sum('grossSales'), commission, charges, total: round2(commission + charges) };
};

const isClosedMonth = (month, now = new Date()) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return false;
  return month < monthOf(now);
};

/** Financial year of the month covered: Apr 2026 - Mar 2027 is "26-27". */
const formatCommissionNumber = (seq, month) => {
  const [y, m] = month.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  const fy = `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
  return `SMP/COM/${fy}/${String(seq).padStart(5, '0')}`;
};

const nextSeq = async () => {
  const mongoose = require('mongoose');
  const doc = await mongoose.connection
    .collection('counters')
    .findOneAndUpdate({ _id: 'commission-invoice' }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return (doc && (doc.seq ?? doc.value?.seq)) || 1;
};

const partyFromSeller = (s) => {
  const a = s?.pickupAddress || {};
  return {
    name: s?.businessName || '',
    legalName: s?.application?.legalName || s?.businessName || '',
    address: [a.address1, a.address2, a.city, a.state, a.pincode].filter(Boolean).join(', '),
    gstin: s?.application?.gstMode === 'gstin' ? s.application.gstin || '' : '',
  };
};

const platformParty = () => ({
  name: 'ShopMaster Pro',
  legalName: BUSINESS.legalName,
  address: [BUSINESS.address1, BUSINESS.address2, BUSINESS.city, BUSINESS.state, BUSINESS.pincode].filter(Boolean).join(', '),
  gstin: '',
});

const paidPayouts = (sellerId) =>
  require('../models/Payout').find({ sellerId, status: 'paid', paidAt: { $ne: null } }).sort({ paidAt: 1 }).lean();

/** Months this seller has a bill for, newest first, with the number once issued. */
const listFor = async (sellerId) => {
  const CommissionInvoice = require('../models/CommissionInvoice');
  const now = new Date();
  const months = monthsFromPayouts(await paidPayouts(sellerId)).filter((m) => isClosedMonth(m.month, now));
  const issued = await CommissionInvoice.find({ sellerId }).select('month number').lean();
  const numbers = new Map(issued.map((i) => [i.month, i.number]));
  return months.map((m) => ({ ...m, number: numbers.get(m.month) || null }));
};

/** The bill for one month: the stored one, or issued now. null when there is nothing to bill. */
const issueFor = async (sellerId, month, now = new Date()) => {
  const CommissionInvoice = require('../models/CommissionInvoice');
  if (!isClosedMonth(month, now)) return null;
  const existing = await CommissionInvoice.findOne({ sellerId, month }).lean();
  if (existing) return existing;

  const statement = buildStatement(await paidPayouts(sellerId), month);
  if (statement.total <= 0) return null;

  const seller = await require('../models/Seller').findOne({ userId: sellerId }).lean();
  try {
    const doc = await CommissionInvoice.create({
      sellerId,
      month,
      number: formatCommissionNumber(await nextSeq(), month),
      issuedAt: now,
      from: platformParty(),
      to: partyFromSeller(seller),
      ...statement,
    });
    return doc.toObject();
  } catch (err) {
    // Two tabs asked at once: the other one issued it. Return that, never a second number.
    if (err?.code === 11000) return CommissionInvoice.findOne({ sellerId, month }).lean();
    throw err;
  }
};

module.exports = { monthsFromPayouts, buildStatement, isClosedMonth, formatCommissionNumber, listFor, issueFor };
