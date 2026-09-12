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
module.exports = Object.freeze({
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
});
