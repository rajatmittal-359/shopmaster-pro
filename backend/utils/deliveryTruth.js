/**
 * Who is allowed to say a parcel arrived, and whose money that moves.
 *
 * THE PROBLEM
 *   Every party in an order has a reason to lie about delivery. A seller is
 *   paid once a parcel is delivered and the return window shuts, so "delivered"
 *   is worth money to them. A customer who says a parcel never came keeps the
 *   goods and gets a refund. Both claims were accepted at face value:
 *
 *     - a seller pressed "Mark as delivered" and that set deliveredAt, which
 *       started the return window, which released their own payout. They were
 *       marking their own homework.
 *     - on COD the same button flipped paymentStatus to 'paid' - the seller
 *       declaring that money they collect had been collected.
 *     - a customer pressed Return and was refunded instantly, before anything
 *       was picked up, and the stock was counted back in as sellable.
 *     - the courier webhook refuses to move a parcel backwards, so a seller who
 *       declared delivery early made a claim the real courier could no longer
 *       correct. The lie became permanent.
 *
 * THE RULE
 *   The party with money at stake does not record the fact. It comes from
 *   whoever has no stake in the answer - which for a delivery is the courier.
 *   This is what Amazon and Flipkart do: an Amazon self-ship seller confirms a
 *   SHIPMENT (carrier and tracking number) and never a delivery, and Flipkart
 *   refunds "once the returned product has been received by the seller", not
 *   when it is asked for.
 *
 *   Where there is genuinely no third party - a parcel handed over by hand in
 *   the same city - the seller's word is accepted but recorded AS the seller's
 *   word, and the customer is asked. Silence confirms it after
 *   SELF_DELIVERY_CONFIRM_DAYS, because otherwise nothing ever completes.
 */

/** Days a customer has to object to a delivery only the seller has claimed. */
const SELF_DELIVERY_CONFIRM_DAYS = 3;

/** A courier is carrying this parcel, so the courier is the one who knows. */
const hasCourier = (order, fulfilment) =>
  Boolean(
    fulfilment?.awb ||
      fulfilment?.shippingOrderId ||
      order?.shippingAwb ||
      order?.shippingOrderId
  );

/**
 * May this seller declare their own parcel delivered?
 *
 * Only when nobody better can answer. With a courier booked the tracking feed
 * is the answer and the seller pressing a button ahead of it is either a
 * mistake or a lie - and because the webhook will not walk a parcel backwards,
 * it is one nothing can undo.
 *
 * @returns {{allowed: boolean, reason?: string}}
 */
const sellerMayDeclareDelivered = (order, fulfilment) => {
  if (hasCourier(order, fulfilment)) {
    return {
      allowed: false,
      reason:
        'A courier is carrying this parcel, so the delivery is confirmed by their tracking, not here. It updates on its own.',
    };
  }
  return { allowed: true };
};

/**
 * Is a delivery only the seller has claimed still waiting on the customer?
 *
 * True while the customer could still object. The parcel counts as delivered
 * for everything the customer sees - it is their goods - but the seller's money
 * stays put until this is over.
 */
const awaitingCustomerConfirmation = (fulfilment, now = new Date()) => {
  if (!fulfilment || fulfilment.status !== 'delivered') return false;
  if (fulfilment.deliveryConfirmedBy !== 'seller') return false;
  if (!fulfilment.deliveredAt) return false;

  const closesAt = new Date(
    new Date(fulfilment.deliveredAt).getTime() +
      SELF_DELIVERY_CONFIRM_DAYS * 24 * 60 * 60 * 1000
  );
  return now < closesAt;
};

/**
 * Whether COD money may be treated as collected.
 *
 * Only the party who took the cash can say it was taken. With a courier that is
 * the courier's delivery scan; by hand it is the seller, who did take it.
 * A seller marking a courier parcel "delivered" was declaring cash collected
 * for money that had not reached them either.
 */
const codMayBeMarkedPaid = (order, fulfilment, confirmedBy) =>
  order?.paymentMethod === 'cod' &&
  (confirmedBy === 'courier' ||
    (confirmedBy === 'seller' && !hasCourier(order, fulfilment)));

/**
 * Why this seller's money is not moving yet, if it is not.
 *
 * Payouts are irreversible in practice - once a seller has been paid, getting
 * it back means taking it off a future payout they may never earn. So anything
 * unresolved holds the money rather than chasing it afterwards.
 *
 * @returns {string|null} a reason, or null when nothing is blocking
 */
const payoutBlockedReason = (fulfilment, now = new Date()) => {
  if (!fulfilment) return null;

  if (fulfilment.disputeStatus === 'open') {
    return 'A dispute on this order is open.';
  }
  // A return in flight, or waiting to be looked at. 'rejected' is settled, and
  // 'received' has already been refunded, so neither holds anything.
  if (['requested', 'picked'].includes(fulfilment.returnStage)) {
    return 'The customer has started a return.';
  }
  if (awaitingCustomerConfirmation(fulfilment, now)) {
    return 'Waiting for the customer to confirm they received it.';
  }
  return null;
};

module.exports = {
  SELF_DELIVERY_CONFIRM_DAYS,
  hasCourier,
  sellerMayDeclareDelivered,
  awaitingCustomerConfirmation,
  codMayBeMarkedPaid,
  payoutBlockedReason,
};
