/**
 * Who is believed about a delivery, and whose money that moves.
 *
 * THE PROBLEM THESE DEFEND AGAINST
 *   Everyone in an order has a reason to lie about delivery, and every claim
 *   was being taken at face value:
 *
 *     - a seller pressed "Mark as delivered", which set deliveredAt, which
 *       started the return window, which released THEIR OWN payout
 *     - on COD the same button declared cash collected that nobody had collected
 *     - the courier webhook will not walk a parcel backwards, so a delivery
 *       claimed early could never afterwards be corrected by the real courier
 *     - a customer pressed Return and was refunded before anything was picked up
 *
 *   The rule these encode: the party with money at stake does not record the
 *   fact. It comes from whoever has no stake in the answer.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const {
  sellerMayDeclareDelivered,
  awaitingCustomerConfirmation,
  codMayBeMarkedPaid,
  payoutBlockedReason,
  hasCourier,
  SELF_DELIVERY_CONFIRM_DAYS,
} = require('../utils/deliveryTruth');

const SELLER = new mongoose.Types.ObjectId();
const hoursAgo = (n) => new Date(Date.now() - n * 3600000);

const parcel = (over = {}) => ({
  sellerId: SELLER,
  status: 'delivered',
  deliveredAt: new Date(),
  deliveryConfirmedBy: null,
  returnStage: null,
  disputeStatus: null,
  awb: null,
  ...over,
});

describe('a seller declaring their own parcel delivered', () => {
  /**
   * The one that mattered. deliveredAt starts the return window and the window
   * closing releases this seller's money, so the button was the seller choosing
   * when to pay themselves.
   */
  it('is refused while a courier is carrying it', () => {
    const verdict = sellerMayDeclareDelivered(
      { shippingAwb: '14112365899385' },
      parcel({ status: 'shipped' })
    );

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/courier/i);
  });

  it('is refused on the fulfilment\u2019s own AWB in a split order', () => {
    // The order-level field belongs to a single-seller order; a split order
    // carries the AWB per parcel, and reading only the order would let the
    // second seller declare their own delivery.
    const verdict = sellerMayDeclareDelivered({}, parcel({ awb: '999' }));
    expect(verdict.allowed).toBe(false);
  });

  /**
   * Handed over by hand in the same city. There is no third party to ask, so
   * the seller's word is taken - and recorded AS the seller's word.
   */
  it('is allowed when no courier was ever booked', () => {
    expect(sellerMayDeclareDelivered({}, parcel({ status: 'shipped' })).allowed).toBe(true);
  });

  it('reads a booking from either the order or the parcel', () => {
    expect(hasCourier({ shippingOrderId: '900900' }, parcel())).toBe(true);
    expect(hasCourier({}, parcel({ shippingOrderId: '900900' }))).toBe(true);
    expect(hasCourier({}, parcel())).toBe(false);
  });
});

describe('COD, where the cash is the whole question', () => {
  it('is settled by the courier who took it at the door', () => {
    const order = { paymentMethod: 'cod', shippingAwb: '111' };
    expect(codMayBeMarkedPaid(order, parcel({ awb: '111' }), 'courier')).toBe(true);
  });

  /**
   * A seller pressing a button used to declare cash collected for money that
   * had not reached anybody - theirs or ours.
   */
  it('is NOT settled by a seller whose parcel a courier is carrying', () => {
    const order = { paymentMethod: 'cod', shippingAwb: '111' };
    expect(codMayBeMarkedPaid(order, parcel({ awb: '111' }), 'seller')).toBe(false);
  });

  it('IS settled by a seller who handed it over and took the cash themselves', () => {
    expect(codMayBeMarkedPaid({ paymentMethod: 'cod' }, parcel(), 'seller')).toBe(true);
  });

  it('says nothing about a prepaid order', () => {
    expect(codMayBeMarkedPaid({ paymentMethod: 'razorpay' }, parcel(), 'courier')).toBe(false);
  });
});

describe('a delivery only the seller has claimed', () => {
  it('waits for the customer while they could still object', () => {
    const f = parcel({ deliveryConfirmedBy: 'seller', deliveredAt: hoursAgo(1) });
    expect(awaitingCustomerConfirmation(f)).toBe(true);
    expect(payoutBlockedReason(f)).toMatch(/confirm/i);
  });

  /**
   * Silence has to release it eventually. A claim nobody ever answers cannot
   * hold a shop's earnings forever.
   */
  it('stops waiting once the window has passed', () => {
    const f = parcel({
      deliveryConfirmedBy: 'seller',
      deliveredAt: hoursAgo(SELF_DELIVERY_CONFIRM_DAYS * 24 + 1),
    });
    expect(awaitingCustomerConfirmation(f)).toBe(false);
    expect(payoutBlockedReason(f)).toBeNull();
  });

  it('does not wait at all when the courier said so', () => {
    const f = parcel({ deliveryConfirmedBy: 'courier', deliveredAt: hoursAgo(1) });
    expect(awaitingCustomerConfirmation(f)).toBe(false);
    expect(payoutBlockedReason(f)).toBeNull();
  });

  it('stops waiting the moment the customer confirms', () => {
    const f = parcel({ deliveryConfirmedBy: 'customer', deliveredAt: hoursAgo(1) });
    expect(payoutBlockedReason(f)).toBeNull();
  });
});

describe('what holds a seller\u2019s money', () => {
  /**
   * Paying is effectively irreversible: getting it back means taking it off a
   * future payout the seller may never earn. So an unresolved case holds the
   * money rather than chasing it afterwards.
   */
  it('an open dispute', () => {
    expect(payoutBlockedReason(parcel({ disputeStatus: 'open' }))).toMatch(/dispute/i);
  });

  it('a return that has been asked for but not settled', () => {
    expect(payoutBlockedReason(parcel({ returnStage: 'requested' }))).toMatch(/return/i);
    expect(payoutBlockedReason(parcel({ returnStage: 'picked' }))).toMatch(/return/i);
  });

  /**
   * A refused return is settled - the sale stands - and a received one has
   * already been refunded. Neither should go on holding anything.
   */
  it('but not a return that is already finished either way', () => {
    expect(payoutBlockedReason(parcel({ returnStage: 'rejected' }))).toBeNull();
    expect(payoutBlockedReason(parcel({ returnStage: 'received' }))).toBeNull();
  });

  it('and not a dispute somebody has already decided', () => {
    expect(payoutBlockedReason(parcel({ disputeStatus: 'resolved_seller' }))).toBeNull();
    expect(payoutBlockedReason(parcel({ disputeStatus: 'resolved_customer' }))).toBeNull();
  });

  it('nothing at all on an ordinary courier delivery', () => {
    expect(payoutBlockedReason(parcel({ deliveryConfirmedBy: 'courier' }))).toBeNull();
  });
});
