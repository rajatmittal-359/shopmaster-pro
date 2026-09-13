/**
 * Fair Returns - the rules, in one place (plan §4.39, 13 Sep 2026).
 *
 * Rajat: "saman bahut tarah ka, nuksaan bahut tarah se; seller bhi jhooth
 * bol sakta hai; dono ka dhyan". So every decision here is written against
 * two things: what kind of item it is (the mode) and what kind of claim it
 * is (the kind). The numbers come from the live rulebook (config/sellerRules,
 * editable in /admin/settings). Pure functions: the page, the API and the
 * decision agent all read the same answer.
 *
 * MODES (what the item promises)         KINDS (what went wrong)
 *   R  return / refund or exchange         damaged           in transit
 *   X  exchange only                       wrong             different / missing / empty box
 *   N  no return (hygiene, custom…)        defective         does not work
 *                                          not_as_described  listing lied
 *   Whatever the mode, the first four      change_of_mind    nothing wrong
 *   kinds are ALWAYS returnable - law.     size              fit
 */
const RULES = require('../config/sellerRules');

const MODES = ['R', 'X', 'N'];
const KINDS = ['damaged', 'wrong', 'defective', 'not_as_described', 'change_of_mind', 'size'];

/** The kinds the law keeps open whatever the seller set. */
const FAULT_KINDS = new Set(['damaged', 'wrong', 'defective', 'not_as_described']);
/** The kinds that must be raised quickly, with photos - the parcel is fresh evidence. */
const FRESH_KINDS = new Set(['damaged', 'wrong', 'defective']);

const MODE_LABEL = {
  R: { en: '7-day return or exchange', hi: '7 दिन में वापसी या बदली', hg: '7 din me return ya exchange' },
  X: { en: 'Exchange only, 7 days', hi: 'सिर्फ़ बदली, 7 दिन', hg: 'Sirf exchange, 7 din' },
  N: { en: 'No return (hygiene / custom) - wrong or damaged is always covered', hi: 'वापसी नहीं (स्वच्छता/कस्टम) - गलत या टूटा हमेशा कवर', hg: 'Return nahi (hygiene/custom) - galat ya toota hamesha cover' },
};

const KIND_LABEL = {
  damaged: 'Arrived damaged',
  wrong: 'Wrong, missing or empty',
  defective: 'Does not work / faulty',
  not_as_described: 'Not as described',
  change_of_mind: 'Changed my mind',
  size: 'Size does not fit',
};

/** The product's promise: its own pick if valid for the category, else the category's default. */
const effectiveReturnMode = (product, category) => {
  const allowed = category?.returnModesAllowed?.length ? category.returnModesAllowed : MODES;
  if (product?.returnMode && allowed.includes(product.returnMode)) return product.returnMode;
  if (category?.returnMode && allowed.includes(category.returnMode)) return category.returnMode;
  return allowed.includes('R') ? 'R' : allowed[0];
};

/** Category defaults from the taxonomy name - what a new category gets before the admin touches it. */
const defaultModeForCategoryName = (name = '') => {
  const n = String(name).toLowerCase();
  if (/earring|jhumka|\bstuds?\b|nose ?pin|\bnath\b|body jewel|piercing|innerwear|lingerie|brief|\bbras?\b|bralette|socks|cosmetic|makeup|lipstick|perfume|fragrance|personal care|hygiene|custom|engrav|personali[sz]ed|made to order|perishable|food|sweet|grocery/.test(n)) return 'N';
  if (/saree|kurt|dress|shirt|jean|trouser|footwear|shoe|sandal|slipper|heel/.test(n)) return 'R';
  return 'R';
};

const hoursSince = (date, now = new Date()) => (date ? (now - new Date(date)) / 3600000 : Infinity);

/**
 * May this return be requested, and on what terms?
 *
 * @param {object} p
 * @param {'R'|'X'|'N'} p.mode           effectiveReturnMode(product, category)
 * @param {string} p.kind                one of KINDS
 * @param {'refund'|'replacement'} p.resolution  what the customer asked for
 * @param {Date} p.deliveredAt
 * @param {number} p.amount              the line's value in rupees
 * @param {number} p.evidenceCount       photos/videos attached
 * @param {boolean} p.tagIntact          the customer's confirmation (change_of_mind / size)
 * @param {'none'|'warn'|'prepaid_only'|'returns_approval'} [p.riskLevel]
 * @param {Date} [p.now]
 * @returns {{ok:boolean, message?:string, resolution?:string, needsApproval?:boolean, customerPaysCourier?:boolean, adminReview?:boolean}}
 */
const evaluateReturnRequest = ({ mode = 'R', kind, resolution = 'refund', deliveredAt, amount = 0, evidenceCount = 0, tagIntact = false, riskLevel = 'none', now = new Date() }) => {
  if (!KINDS.includes(kind)) return { ok: false, message: 'Say what is wrong: damaged, wrong item, faulty, not as described, size, or changed your mind.' };
  const fault = FAULT_KINDS.has(kind);

  // The window: the rulebook's days for everything; the fresh kinds also
  // inside damagedClaimHours - a parcel that "arrived broken" five days on is
  // a different claim from one reported the same evening.
  const hours = hoursSince(deliveredAt, now);
  if (hours > RULES.returnWindowDays * 24) return { ok: false, message: `The ${RULES.returnWindowDays}-day return window for this parcel has closed.` };
  if (FRESH_KINDS.has(kind) && hours > RULES.damagedClaimHours) {
    return { ok: false, message: `"${KIND_LABEL[kind]}" has to be reported within ${RULES.damagedClaimHours} hours of delivery, with photos. It is past that now - if the item does not match its listing you can still return it as "Not as described".` };
  }

  // Evidence: a fault claim needs photos; a wrong / missing / empty-box claim
  // above the threshold needs the unboxing video.
  if (fault && evidenceCount < 1) return { ok: false, message: 'Add at least one photo of what arrived (the item and the box). It goes to the seller and the admin.' };
  if (kind === 'wrong' && amount >= RULES.unboxingVideoAbove && evidenceCount < 1) {
    return { ok: false, message: `For an item of ₹${amount.toLocaleString('en-IN')} or more, a video of the box being opened is needed for a wrong or missing item claim.` };
  }

  // The mode - only for non-fault kinds; faults are always open.
  if (!fault) {
    if (mode === 'N') return { ok: false, message: 'This item cannot be returned for a change of mind or size (hygiene / custom). A wrong, damaged or faulty item is always covered - choose that reason if it applies.' };
    if (!tagIntact) return { ok: false, message: 'Confirm the tag / seal is still on and the item is unused. Without the tag a change-of-mind return is refused at pickup.' };
  }

  // What the customer gets back: mode X turns a refund into an exchange for
  // non-fault kinds; a fault is the customer's choice.
  let finalResolution = resolution === 'replacement' ? 'replacement' : 'refund';
  if (!fault && mode === 'X') finalResolution = 'replacement';

  return {
    ok: true,
    resolution: finalResolution,
    customerPaysCourier: !fault,
    needsApproval: riskLevel === 'returns_approval' || amount >= RULES.adminReviewAbove,
    adminReview: amount >= RULES.adminReviewAbove,
  };
};

/**
 * The item came back. Given both sides' evidence, what does the rulebook say?
 * Used by the seller's receipt check and by the decision agent's brief.
 */
const receiptVerdict = ({ sellerOk, sellerPhotos = 0, customerEvidence = 0, packProof = false, amount = 0, goodwillUsedRecently = false }) => {
  if (sellerOk) return { outcome: 'refund', reason: 'The seller confirmed the item came back as sent.' };
  if (!sellerPhotos) return { outcome: 'refund', reason: `The seller refused without photos; a refusal needs photos within ${RULES.receiptCheckHours} hours.` };
  if (packProof && sellerPhotos) return { outcome: 'dispute', reason: 'The seller has pack proof and return photos; the admin compares them with the pickup and the customer\'s photos.' };
  if (amount <= RULES.goodwillCapRupees && !goodwillUsedRecently) return { outcome: 'goodwill', reason: `No pack proof either way and the amount is under ₹${RULES.goodwillCapRupees}: refunded as goodwill, once per customer per 90 days.` };
  return { outcome: 'dispute', reason: 'Evidence on both sides is thin; the admin decides for the side that has shown more.' };
};

module.exports = { MODES, KINDS, FAULT_KINDS, FRESH_KINDS, MODE_LABEL, KIND_LABEL, effectiveReturnMode, defaultModeForCategoryName, evaluateReturnRequest, receiptVerdict };
