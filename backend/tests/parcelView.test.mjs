/**
 * What a customer is allowed to see of a parcel.
 *
 * WHY THIS EXISTS
 *   `getOrderDetails` and `getMyOrders` sent the whole Order document, so every
 *   field on a fulfilment reached the buyer - including the SELLER's written
 *   defence in a dispute (`disputeSellerNote`, `disputeSellerEvidence`), the
 *   decision agent's recommendation to the admin (`disputeBrief`), the seller's
 *   pack photo, the seller's return-receipt check and the penalty that seller
 *   was charged for cancelling. A buyer arguing a dispute could read the other
 *   side's case and the advice the admin had been given, before the admin had
 *   decided. That is OWASP API3, and on a marketplace it is also simply unfair.
 *
 *   The fix is an allowlist, not a denylist: a field added to the schema later
 *   must stay private until somebody decides otherwise, rather than leak on the
 *   day it is added.
 *
 * WHAT IS DELIBERATELY STILL SENT
 *   Everything that is the buyer's own business - where the parcel is, what the
 *   courier said, their own return and their own dispute - plus `podUrl`, the
 *   courier's delivery photo, which the seller and the admin could already see
 *   and the buyer could not.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const { parcelForCustomer, ordersForCustomer, CUSTOMER_FIELDS } = require('../utils/parcelView');

const id = () => new mongoose.Types.ObjectId();

/** A parcel carrying one of everything, including what must never travel. */
const loaded = () => ({
  _id: id(),
  sellerId: id(),
  status: 'delivered',
  shippedAt: new Date('2026-09-20'),
  deliveredAt: new Date('2026-09-23'),
  deliveryConfirmedBy: 'courier',
  awb: 'DLV123',
  courierName: 'Delhivery Surface',
  courierStatus: 'Delivered',
  trackingUrl: 'https://track/DLV123',
  expectedDeliveryAt: new Date('2026-09-23'),
  scans: [{ at: new Date('2026-09-23'), activity: 'Delivered', location: 'Jaipur' }],
  podUrl: 'https://res.cloudinary.com/x/pod.jpg',

  // The buyer's own business.
  returnStage: 'requested',
  returnReason: 'Too small',
  returnKind: 'wrong',
  returnEvidence: ['https://res.cloudinary.com/x/buyer.jpg'],
  disputeStatus: 'open',
  disputeReason: 'Box was empty',
  disputeRaisedBy: 'customer',

  // None of this is.
  packProof: { url: 'https://res.cloudinary.com/x/pack.jpg', publicId: 'pack', at: new Date() },
  cancelPenalty: 50,
  disputeSellerNote: 'I packed it myself and have the photo.',
  disputeSellerEvidence: ['https://res.cloudinary.com/x/seller.jpg'],
  disputeSellerRespondedAt: new Date(),
  disputeBrief: { text: 'Buyer has form.', recommendation: 'seller', confidence: 0.8, model: 'x', at: new Date() },
  receiptCheck: { ok: false, photos: ['https://res.cloudinary.com/x/receipt.jpg'], note: 'Not the same item', at: new Date() },
  textFlags: ['abusive'],
  shipmentId: 'SR-INTERNAL-1',
  shippingOrderId: 'SR-INTERNAL-2',
  returnOrderId: 'SR-INTERNAL-3',
  returnShipmentId: 'SR-INTERNAL-4',
  bookingFailedKind: 'wallet',
  bookingAttempts: 3,
});

const SELLER_ONLY = [
  'packProof',
  'cancelPenalty',
  'disputeSellerNote',
  'disputeSellerEvidence',
  'disputeSellerRespondedAt',
  'disputeBrief',
  'receiptCheck',
  'textFlags',
];

describe('parcelForCustomer', () => {
  it("never sends the seller's side of a dispute, nor the brief written for the admin", () => {
    const seen = parcelForCustomer(loaded());
    for (const field of SELLER_ONLY) {
      expect(seen, `${field} must not reach the buyer`).not.toHaveProperty(field);
    }
  });

  it('does not leak the courier account ids we book with', () => {
    const seen = parcelForCustomer(loaded());
    for (const field of ['shipmentId', 'shippingOrderId', 'returnOrderId', 'returnShipmentId', 'bookingFailedKind', 'bookingAttempts']) {
      expect(seen, `${field} is ours, not theirs`).not.toHaveProperty(field);
    }
  });

  it("sends the courier's delivery photo, which only the seller and admin could see before", () => {
    expect(parcelForCustomer(loaded()).podUrl).toBe('https://res.cloudinary.com/x/pod.jpg');
  });

  /*
   * Asserted against the allowlist itself rather than against the fixture: the
   * question is "may the page read this", and a field the sample parcel happens
   * not to carry would otherwise look forbidden. These are the names grepped
   * out of web/src/components/orders on 2 Oct 2026.
   */
  it('allows every field the order page actually draws with', () => {
    for (const field of [
      'status', 'sellerId', 'shippedAt', 'deliveredAt', 'deliveryConfirmedBy',
      'awb', 'courierName', 'trackingUrl', 'expectedDeliveryAt', 'scans',
      'dispatchBy', 'returnStage', 'returnResolution', 'returnAwb',
      'disputeStatus', 'disputeRaisedAt', 'lostAt', 'rtoAt', 'rtoReason',
      'ndrAt', 'ndrReason', 'ndrAttempts', 'replacementStage',
    ]) {
      expect(CUSTOMER_FIELDS, `the page reads ${field}`).toContain(field);
    }
  });

  it('sends the ones the sample parcel carries', () => {
    const seen = parcelForCustomer(loaded());
    for (const field of ['status', 'awb', 'courierName', 'scans', 'deliveredAt', 'returnStage', 'disputeStatus']) {
      expect(seen, `the page reads ${field}`).toHaveProperty(field);
    }
  });

  it("keeps the buyer's own return and dispute, which are theirs to read", () => {
    const seen = parcelForCustomer(loaded());
    expect(seen.returnReason).toBe('Too small');
    expect(seen.returnEvidence).toEqual(['https://res.cloudinary.com/x/buyer.jpg']);
    expect(seen.disputeReason).toBe('Box was empty');
  });

  it('is an allowlist, so a field invented tomorrow stays private until somebody decides', () => {
    const seen = parcelForCustomer({ ...loaded(), sellerSecretAddedLater: 'oops' });
    expect(seen).not.toHaveProperty('sellerSecretAddedLater');
  });

  it('strips the internal ids off earlier parcels too', () => {
    const seen = parcelForCustomer({
      ...loaded(),
      previousParcels: [{ awb: 'OLD1', courierName: 'Bluedart', shipmentId: 'SR-9', shippingOrderId: 'SR-10', trackingUrl: 'https://t/OLD1', replacedBecause: 'lost' }],
    });
    expect(seen.previousParcels).toEqual([
      { awb: 'OLD1', courierName: 'Bluedart', trackingUrl: 'https://t/OLD1', deliveredAt: undefined, replacedBecause: 'lost' },
    ]);
  });

  it('copes with a parcel that has almost nothing on it yet', () => {
    expect(() => parcelForCustomer({ status: 'pending' })).not.toThrow();
    expect(parcelForCustomer({ status: 'pending' }).status).toBe('pending');
    expect(parcelForCustomer(null)).toEqual(null);
  });
});

describe('ordersForCustomer', () => {
  it('shapes every parcel of every order, leaving the rest of the order alone', () => {
    const order = {
      _id: id(),
      totalAmount: 1200,
      fulfilments: [loaded(), loaded()],
      toObject() { return { ...this, fulfilments: this.fulfilments }; },
    };
    const [seen] = ordersForCustomer([order]);
    expect(seen.totalAmount).toBe(1200);
    expect(seen.fulfilments).toHaveLength(2);
    for (const parcel of seen.fulfilments) {
      expect(parcel).not.toHaveProperty('disputeSellerNote');
      expect(parcel.podUrl).toBe('https://res.cloudinary.com/x/pod.jpg');
    }
  });

  it('leaves an order with no parcels alone rather than inventing an array', () => {
    const order = { _id: id(), toObject() { return { _id: this._id }; } };
    expect(ordersForCustomer([order])[0].fulfilments).toBeUndefined();
  });
});
