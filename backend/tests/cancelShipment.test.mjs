/**
 * Calling off a courier that has already been booked.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   The endpoint wrote `status: 'processing'` straight onto the order with an
 *   updateOne and left the seller's fulfilment saying 'shipped', with a
 *   shippedAt and an AWB still on it.
 *
 *   order.status is DERIVED from the fulfilments by a pre-validate hook. So the
 *   next save of any kind - a courier webhook, a seller status change - re-read
 *   those untouched fulfilments and put the order straight back to 'shipped'.
 *   The cancellation undid itself, silently, at a moment nobody was watching.
 *
 *   And until then the customer's page, which reads the fulfilment directly,
 *   went on showing a courier, an AWB and a timeline for a booking that had
 *   already been called off.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const Order = require('../models/Order');
const shipment = require('../utils/shipmentBooking');
const { cancelShipment } = require('../controllers/sellerController');

const SELLER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();

const originals = {};
let order;
let saved;

/** The shape cancelForOrder returns when the courier agreed. */
const CLEARED = {
  ok: true,
  update: {
    status: 'processing',
    shippingAwb: null,
    shippingOrderId: null,
    shippingShipmentId: null,
    shippingTrackingUrl: null,
    trackingInfo: { courierName: null, trackingNumber: null, shippedDate: null },
  },
};

const shippedFulfilment = (sellerId) => ({
  sellerId,
  status: 'shipped',
  shippedAt: new Date('2026-09-06'),
  deliveredAt: null,
  awb: '14112365899385',
  courierName: 'Xpressbees Surface',
  shippingProvider: 'shiprocket',
  courierStatus: 'Pickup Generated',
  courierStatusAt: new Date('2026-09-06'),
  expectedDeliveryAt: new Date('2026-09-14'),
  scans: [{ at: new Date('2026-09-06'), activity: 'PICKUP GENERATED', location: 'JAIPUR' }],
});

const call = async () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  await cancelShipment({ params: { orderId: ORDER_ID.toString() }, user: { _id: SELLER } }, res);
  return res;
};

beforeEach(() => {
  saved = null;

  order = {
    _id: ORDER_ID,
    status: 'shipped',
    shippingAwb: '14112365899385',
    shippingOrderId: '900900',
    shippingProvider: 'shiprocket',
    fulfilments: [shippedFulfilment(SELLER)],
    save: vi.fn(async function () {
      saved = this;
      return this;
    }),
  };

  originals.findOne = Order.findOne;
  originals.updateOne = Order.updateOne;
  originals.cancelForOrder = shipment.cancelForOrder;

  Order.findOne = vi.fn(async () => order);
  Order.updateOne = vi.fn(async () => ({ modifiedCount: 1 }));
  shipment.cancelForOrder = vi.fn(async () => CLEARED);
});

afterEach(() => {
  Order.findOne = originals.findOne;
  Order.updateOne = originals.updateOne;
  shipment.cancelForOrder = originals.cancelForOrder;
});

describe('a seller calling off a booked courier', () => {
  it('brings the fulfilment back to processing, not just the order', async () => {
    const res = await call();

    expect(res.statusCode).toBe(200);
    expect(saved).not.toBeNull();
    expect(saved.fulfilments[0].status).toBe('processing');
  });

  /**
   * The one that actually bit. With shippedAt and 'shipped' left in place, the
   * hook re-derives the order as shipped on the very next write.
   */
  it('leaves nothing behind for deriveStatus to read as shipped', async () => {
    await call();

    expect(Order.deriveStatus(saved.fulfilments)).toBe('processing');
    expect(saved.fulfilments[0].shippedAt).toBeNull();
  });

  it('clears the courier details the customer was still being shown', async () => {
    await call();
    const f = saved.fulfilments[0];

    expect(f.awb).toBeNull();
    expect(f.courierName).toBeNull();
    expect(f.shippingProvider).toBe('none');
    expect(f.courierStatus).toBeNull();
    expect(f.expectedDeliveryAt).toBeNull();
    expect(f.scans).toEqual([]);
  });

  it('saves rather than updating, so the hook runs at all', async () => {
    await call();

    expect(order.save).toHaveBeenCalled();
    // updateOne skips pre-validate, which is where status is derived.
    expect(Order.updateOne).not.toHaveBeenCalled();
  });

  /**
   * In a split order the other seller's parcel is still genuinely in transit.
   * Calling off one booking must not touch it.
   */
  it('touches only this seller\u2019s parcel', async () => {
    order.fulfilments.push(shippedFulfilment(OTHER));

    await call();

    const theirs = saved.fulfilments.find((f) => String(f.sellerId) === String(OTHER));
    expect(theirs.status).toBe('shipped');
    expect(theirs.awb).toBe('14112365899385');
  });

  it('changes nothing when the courier refuses the cancellation', async () => {
    shipment.cancelForOrder = vi.fn(async () => ({
      ok: false,
      reason: 'Shipment already picked up',
    }));

    const res = await call();

    expect(res.statusCode).toBe(409);
    expect(saved).toBeNull();
    expect(order.fulfilments[0].status).toBe('shipped');
  });
});
