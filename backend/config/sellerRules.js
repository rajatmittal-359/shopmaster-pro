/**
 * The seller rulebook, as numbers. ONE source: the agreement page, the
 * penalty code, the payout code and the dashboard all read from here, so the
 * page can never promise one thing while the code does another.
 *
 * WHERE THE NUMBERS COME FROM (12 Sep 2026)
 *   Amazon.in: pre-fulfilment cancel rate above 2.5% risks deactivation; since
 *   Aug 2026 a seller-caused cancellation costs 10% of the order (+GST) below
 *   INR 10,000. Flipkart (Aug 2026): flat INR 30 for a missed dispatch, INR 60
 *   for a seller cancellation, INR 90 for both. Meesho: INR 25 per seller
 *   cancellation, INR 50 per late dispatch.
 *
 *   Ours sits between Meesho and Flipkart, flat so a seller can predict it,
 *   with two free a month because everyone runs out of something once. It is
 *   charged only when the SELLER cancels an order they had accepted - never
 *   when the customer asks, never when the platform cancels. Neither the
 *   platform nor the shop is GST-registered, so nothing here carries GST; the
 *   number on the page is the number that is charged.
 *
 * VERSION
 *   Bumping `version` makes every seller read and accept the agreement again
 *   before they can act in the panel. Change the number when a rule changes,
 *   not when the wording is tidied.
 */
/*
 * LIVE FROM 13 Sep 2026
 *   The numbers below are the DEFAULTS. The admin edits them on the Settings
 *   page (models/PlatformSettings); `loadRules()` copies the saved values
 *   onto this same object at startup and after every save, so every caller
 *   that holds a reference keeps reading the current rulebook. Not frozen any
 *   more for that reason - and nothing but loadRules() may write to it.
 */
const RULES = {
  version: '1.0',
  effectiveFrom: '2026-09-12',

  /** Seller-caused cancellations that cost nothing, per rolling 30 days. */
  cancelFreePer30Days: 2,
  /** Charged on each seller-caused cancellation beyond the free ones, in INR. */
  cancelPenalty: 50,
  /** Above this share of orders cancelled by the seller in 30 days, the account is reviewed. */
  cancelRateReviewPct: 5,

  /** Business days to hand a paid order to the courier. */
  dispatchDays: 2,
  /** Days after delivery in which a customer may ask for a return or exchange. */
  returnWindowDays: 7,
  /** Days after delivery when the payout is released (the return window has to close). */
  payoutAfterDeliveryDays: 7,
  /** Hours a seller has to answer a dispute before the platform decides without them. */
  disputeResponseHours: 72,
  /** The platform's share of each sale, unless an admin set a different rate for the shop. */
  defaultCommissionPct: 8,

  /*
   * Fair Returns (plan §4.39, 13 Sep 2026). The numbers both sides are held to.
   */
  /** Hours after delivery in which "damaged / wrong / defective" may be claimed, with photos. */
  damagedClaimHours: 48,
  /** Hours the seller has, after a return arrives, to mark it OK or not-OK with photos. */
  receiptCheckHours: 48,
  /** Below this amount, a return with no evidence either way is refunded as goodwill - once per customer per 90 days. */
  goodwillCapRupees: 500,
  /**
   * High-value line (20 Sep 2026, after reading Shiprocket's docs): there is
   * NO doorstep-OTP switch on a Shiprocket account - their "Order Verification"
   * is a pre-ship tag, and delivery OTP exists only on a few couriers' own
   * services. So at or above this value the platform asks for what CAN be
   * had: the courier's proof of delivery is required before a "not received"
   * claim is decided, the admin reviews every dispute, and the seller is told
   * to photograph the pack. The number stays configurable.
   */
  otpDeliveryAbove: 2000,
  /** At or above this amount an unboxing video is required for a wrong / missing item claim. */
  unboxingVideoAbove: 2000,
  /** At or above this amount every return and dispute goes to the admin, whatever the evidence. */
  adminReviewAbove: 5000,
};

const DEFAULTS = Object.freeze({ ...RULES });

/** Copy the admin's saved rulebook onto the live object. Safe to call often. */
RULES.loadRules = async () => {
  try {
    const PlatformSettings = require('../models/PlatformSettings');
    if (PlatformSettings.db.readyState !== 1) return RULES;
    const doc = await PlatformSettings.findById('platform').lean();
    if (!doc?.rules) return RULES;
    for (const key of Object.keys(DEFAULTS)) {
      if (doc.rules[key] !== undefined && doc.rules[key] !== null) RULES[key] = doc.rules[key];
    }
  } catch {
    // No database yet (tests, first boot): the defaults stand.
  }
  return RULES;
};
RULES.defaults = DEFAULTS;

module.exports = RULES;
