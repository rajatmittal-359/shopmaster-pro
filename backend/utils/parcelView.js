/**
 * What a customer may see of a parcel.
 *
 * WHY THIS EXISTS
 *   `getMyOrders` and `getOrderDetails` replied with the whole Order document,
 *   so every field on a fulfilment reached the buyer. Most of it is theirs -
 *   where the parcel is, what the courier said, their own return. Some of it is
 *   emphatically not:
 *
 *     disputeSellerNote / disputeSellerEvidence  the SELLER's written defence
 *     disputeBrief                               the decision agent's advice
 *                                                to the ADMIN, with its
 *                                                recommendation and confidence
 *     packProof                                  the seller's pack photo
 *     receiptCheck                               the seller's check of a return
 *     cancelPenalty                              what that seller was charged
 *     textFlags                                  moderation flags on their words
 *
 *   A buyer arguing "the box was empty" could read the seller's answer and the
 *   recommendation the admin had been given, before the admin had decided.
 *   OWASP calls this API3, Broken Object Property Level Authorization; on a
 *   marketplace that promises both sides the same rules, it is also just unfair.
 *
 * WHY AN ALLOWLIST AND NOT A DENYLIST
 *   A denylist leaks every field added after it was written, on the day it is
 *   added, silently. The schema has grown fast - replacements, NDR, pack proof,
 *   the dispute brief - and it will grow again. So: name what goes out, and let
 *   anything new stay private until somebody decides otherwise.
 *
 * WHAT THIS DELIBERATELY ADDS
 *   `podUrl`, the courier's delivery photo. It was already captured on every
 *   tracking sweep and already shown to the seller and the admin; the buyer -
 *   the one person who might be wondering where their parcel went - was the
 *   only one who could not see it. Amazon shows it, and it settles the honest
 *   half of "it never arrived" before it becomes a dispute.
 */

/** Everything the buyer's order page and bill are allowed to read. */
const CUSTOMER_FIELDS = [
  '_id',
  'sellerId',
  'status',

  // The journey.
  'shippedAt',
  'dispatchBy',
  'deliveredAt',
  'deliveryConfirmedBy',
  'expectedDeliveryAt',
  'scans',

  // When it went wrong, in words the buyer is owed.
  'rtoAt',
  'rtoReason',
  'lostAt',
  'lostReason',
  'ndrAt',
  'ndrReason',
  'ndrAttempts',
  'nprReason',
  'pickupIssue',
  'pickupIssueAt',
  'bookingFailedReason',

  // The courier, and its proof of delivery.
  'shippingProvider',
  'awb',
  'courierName',
  'courierStatus',
  'courierStatusAt',
  'trackingUrl',
  'podUrl',

  // Their own return.
  'returnStage',
  'returnRequestedAt',
  'returnReason',
  'returnNote',
  'returnKind',
  'returnEvidence',
  'returnTagIntact',
  'returnNeedsApproval',
  'returnApprovedAt',
  'returnResolution',
  'returnAwb',
  'returnBookedAt',
  'returnedAt',

  // Their own replacement.
  'replacementStage',
  'replacementDueAt',
  'replacementBookedAt',
  'replacementDeliveredAt',

  // Their own dispute, and how it ended - but never the other side's case.
  'disputeStatus',
  'disputeReason',
  'disputeRaisedAt',
  'disputeRaisedBy',
  'disputeResolvedAt',
  'disputeResolution',
];

/**
 * An earlier parcel for the same order, as the buyer may see it.
 *
 * `shipmentId` and `shippingOrderId` are our account's ids at the courier, not
 * anything a buyer can use - the AWB and the tracking URL are what they track
 * with.
 */
const previousParcelForCustomer = (parcel) => ({
  awb: parcel?.awb,
  courierName: parcel?.courierName,
  trackingUrl: parcel?.trackingUrl,
  deliveredAt: parcel?.deliveredAt,
  replacedBecause: parcel?.replacedBecause,
});

/**
 * One parcel, reduced to what its buyer may read.
 *
 * Mongoose subdocuments are not plain objects, so this reads through
 * `toObject()` where it exists. A field the parcel does not carry is left off
 * entirely rather than sent as null: the page already treats both the same, and
 * an absent key says "nothing happened" more honestly than an empty one.
 */
const parcelForCustomer = (parcel) => {
  if (!parcel) return parcel;
  const source = typeof parcel.toObject === 'function' ? parcel.toObject() : parcel;

  const seen = {};
  for (const field of CUSTOMER_FIELDS) {
    if (source[field] !== undefined) seen[field] = source[field];
  }

  if (Array.isArray(source.previousParcels)) {
    seen.previousParcels = source.previousParcels.map(previousParcelForCustomer);
  }

  return seen;
};

/**
 * One order, with every parcel on it shaped. The rest of the order - items,
 * address, money, invoice numbers - is untouched; this is about the fulfilment
 * subdocument only, which is where the two sides' private working lives.
 */
const orderForCustomer = (order) => {
  if (!order) return order;
  const plain = typeof order.toObject === 'function' ? order.toObject() : { ...order };
  if (!Array.isArray(plain.fulfilments)) return plain;
  return { ...plain, fulfilments: plain.fulfilments.map(parcelForCustomer) };
};

const ordersForCustomer = (orders) => (orders || []).map(orderForCustomer);

module.exports = { parcelForCustomer, orderForCustomer, ordersForCustomer, CUSTOMER_FIELDS };
