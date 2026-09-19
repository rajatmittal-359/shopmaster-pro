const rules = require('../config/sellerRules');
const { addWorkingDays } = require('./deliveryEstimate');

/**
 * How long a seller has to hand a parcel to the courier (19 Sep 2026).
 *
 * WHY PER PRODUCT
 *   The rulebook says "dispatch within 2 working days" for everyone. A
 *   name pendant, a ring made to size, a hand-block-printed set are made
 *   AFTER the order - five to ten days. Until now such a seller either ate
 *   the late-dispatch mark or did not list the product. Etsy calls this
 *   "processing time" and shows it on the listing; Amazon calls it
 *   "handling time" per SKU and counts its late-shipment rate against it;
 *   Flipkart and Meesho stamp a "dispatch by" date on every order. All
 *   three agree on the shape: the seller states it per item, the customer
 *   sees it before paying, the clock is set from it.
 *
 * WHAT IS STORED WHERE
 *   Product.processingDays  null = the rulebook's number; 1-30 when the
 *                           seller said so. Shown on the product page.
 *   Order line .processingDays  the product's number AT ORDER TIME - the
 *                           promise the customer saw, frozen (a seller
 *                           editing the product later cannot move a
 *                           deadline already given).
 *   Fulfilment .dispatchBy  the date itself: order time + the longest
 *                           processing time among that seller's lines, in
 *                           working days (Sundays skipped, as the estimate
 *                           does). The seller's queue shows it; the
 *                           performance card grades against it.
 */
const MAX_DAYS = 30;

/** The rulebook's number right now (the admin can change it; live object). */
const defaultDays = () => Number(rules.dispatchDays) || 2;

/** What the seller typed, or null for "the default"; a string with a reason when it is not usable. */
const cleanProcessingDays = (raw) => {
  if (raw === undefined || raw === null || raw === '' || raw === 'default') return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_DAYS) return { error: `Ready-to-ship days must be a whole number from 1 to ${MAX_DAYS}` };
  return { value: n };
};

/** The product's own number, else the rulebook's. */
const processingDaysOf = (product) => (Number.isInteger(product?.processingDays) && product.processingDays > 0 ? product.processingDays : defaultDays());

/** True when the seller has said this takes longer than the rulebook - the page says "made to order". */
const isMadeToOrder = (product) => Number.isInteger(product?.processingDays) && product.processingDays > defaultDays();

/** The longest processing time in a set of lines (order lines or cart lines with productId populated). */
const leadDaysOf = (lines = []) =>
  lines.reduce((max, l) => {
    const p = l?.productId && typeof l.productId === 'object' ? l.productId : l;
    const days = Number.isInteger(l?.processingDays) && l.processingDays > 0 ? l.processingDays : processingDaysOf(p);
    return Math.max(max, days);
  }, 0) || defaultDays();

/** The date a seller's parcel must be with the courier by, for their lines of one order. */
const dispatchByFor = (lines, placedAt = new Date()) => addWorkingDays(new Date(placedAt), leadDaysOf(lines));

module.exports = { MAX_DAYS, defaultDays, cleanProcessingDays, processingDaysOf, isMadeToOrder, leadDaysOf, dispatchByFor };
