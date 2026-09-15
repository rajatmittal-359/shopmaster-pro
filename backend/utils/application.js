const Seller = require('../models/Seller');
const { checkPan, checkGstin, checkEnrolment } = require('./kyc');

/**
 * The seller application - reading it from a request, and what surrounds
 * it (plan 2.40, 15 Sep 2026).
 *
 * `fieldsFrom(body)` returns the validated application fields or the first
 * error a person can act on ("GSTIN: the check digit does not match"). The
 * old React app still posts a business name alone; that stays valid until
 * the cutover makes PAN required (WHAT-IS-LEFT §1).
 *
 * `duplicates(seller)` is the fraud check the big marketplaces run with
 * models and we run with a query: the same PAN, GSTIN, phone or bank
 * account on another seller - especially one turned down or suspended.
 * Plain facts for the admin's list; a match is a reason to ask, not a block.
 */
const trim = (v, n = 120) => String(v ?? '').trim().slice(0, n);

const fieldsFrom = (body = {}) => {
  const out = {};
  const legalName = trim(body.legalName);
  if (legalName) out.legalName = legalName;
  if (body.pan !== undefined && body.pan !== '') {
    const p = checkPan(body.pan);
    if (!p.ok) return { error: `PAN: ${p.reason}` };
    out.pan = p.value;
  }
  const mode = trim(body.gstMode, 12);
  if (mode && !['gstin', 'enrolment', 'none'].includes(mode)) return { error: 'gstMode must be gstin, enrolment or none' };
  if (mode) out.gstMode = mode;
  if (mode === 'gstin' || (body.gstin && !mode)) {
    const g = checkGstin(body.gstin);
    if (!g.ok) return { error: `GSTIN: ${g.reason}` };
    if (out.pan && g.pan !== out.pan) return { error: `This GSTIN is registered to PAN ${g.pan}, not ${out.pan}. Type the PAN the GST was taken on.` };
    out.gstin = g.value;
    out.gstMode = 'gstin';
    if (!out.pan) out.pan = g.pan;
  }
  if (mode === 'enrolment') {
    const e = checkEnrolment(body.enrolmentNumber);
    if (!e.ok) return { error: `Enrolment number: ${e.reason}` };
    if (out.pan && e.pan !== out.pan) return { error: `This enrolment number carries PAN ${e.pan}, not ${out.pan}.` };
    out.enrolmentNumber = e.value;
    if (!out.pan) out.pan = e.pan;
  }
  const phone = String(body.phone || '').replace(/[^\d+]/g, '');
  if (phone) {
    if (!/^(\+91)?[6-9]\d{9}$/.test(phone)) return { error: 'Phone: a 10-digit Indian mobile number' };
    out.phone = phone.replace(/^\+91/, '');
  }
  const pincode = String(body.pincode || '').replace(/\D/g, '');
  if (pincode) {
    if (pincode.length !== 6) return { error: 'PIN code: 6 digits' };
    out.pincode = pincode;
  }
  const city = trim(body.city, 60);
  if (city) out.city = city;
  const sells = trim(body.sells);
  if (sells) out.sells = sells;
  return { fields: out };
};

/** Other sellers sharing an identifier with this one. */
const duplicates = async (seller) => {
  const app = seller.application || {};
  const or = [];
  if (app.pan) or.push({ 'application.pan': app.pan });
  if (app.gstin) or.push({ 'application.gstin': app.gstin }, { gstNumber: app.gstin });
  if (seller.gstNumber) or.push({ 'application.gstin': seller.gstNumber }, { gstNumber: seller.gstNumber });
  if (app.phone) or.push({ 'application.phone': app.phone }, { 'pickupAddress.phone': app.phone });
  if (seller.bankDetails?.accountNumber) or.push({ 'bankDetails.accountNumber': seller.bankDetails.accountNumber });
  if (!or.length) return [];
  const others = await Seller.find({ _id: { $ne: seller._id }, $or: or }).select('businessName isApproved kycStatus status application.pan application.gstin application.phone bankDetails.accountNumber gstNumber pickupAddress.phone').lean();
  return others.map((o) => {
    const shared = [];
    if (app.pan && o.application?.pan === app.pan) shared.push('PAN');
    if ((app.gstin || seller.gstNumber) && [o.application?.gstin, o.gstNumber].includes(app.gstin || seller.gstNumber)) shared.push('GSTIN');
    if (app.phone && [o.application?.phone, o.pickupAddress?.phone].includes(app.phone)) shared.push('phone');
    if (seller.bankDetails?.accountNumber && o.bankDetails?.accountNumber === seller.bankDetails.accountNumber) shared.push('bank account');
    const state = o.status === 'suspended' ? 'suspended' : o.kycStatus === 'rejected' ? 'turned down' : o.isApproved ? 'selling' : 'pending';
    return { sellerId: o._id, businessName: o.businessName, state, shared };
  });
};

module.exports = { fieldsFrom, duplicates };
