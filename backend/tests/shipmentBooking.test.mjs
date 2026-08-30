/**
 * Booking a courier.
 *
 * Every successful booking here spends real money and sends a real person to
 * collect a real parcel, so the rules that matter are the ones that stop it
 * happening when it should not:
 *
 *   1. an order is never booked twice
 *   2. a cancelled order is never booked
 *   3. the courier booked is the one the customer paid for
 *   4. a failed booking leaves the order alone - except for ids a half-finished
 *      booking left at the courier, which must not become invisible
 *   5. cancelling only moves the order back if the courier actually agreed
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const borzo = require('../utils/borzo');
const shiprocket = require('../utils/shiprocketBooking');
const { bookForOrder, cancelForOrder, isBooked, parcelWeight } = require('../utils/shipmentBooking');

const ADDRESS = {
  label: 'Home',
  street: '12 Katewa Nagar',
  city: 'Jaipur',
  state: 'Rajasthan',
  zipCode: '302019',
  phoneNumber: '+919829012345',
};

const orderWith = (overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  orderNumber: 'SMP-260830-ABCDEF',
  createdAt: new Date(),
  status: 'processing',
  paymentMethod: 'razorpay',
  paymentStatus: 'paid',
  deliveryOption: 'standard',
  shippingCharges: 71,
  shippingAwb: null,
  shippingOrderId: null,
  items: [
    {
      productId: { _id: new mongoose.Types.ObjectId(), weight: 0.2, sku: 'CJ-RING-001' },
      name: 'Rose Gold Ring',
      quantity: 2,
      price: 1600,
      status: 'active',
    },
  ],
  ...overrides,
});

let originals;

beforeEach(() => {
  originals = {
    bookSameDay: borzo.bookSameDay,
    cancelSameDay: borzo.cancelSameDay,
    bookShipment: shiprocket.bookShipment,
    cancelShipment: shiprocket.cancelShipment,
  };

  borzo.bookSameDay = vi.fn(async () => ({
    ok: true,
    provider: 'borzo',
    courierName: 'Borzo',
    externalOrderId: '900900',
    trackingNumber: 'BZ-900900',
    trackingUrl: 'https://borzo/track/900900',
  }));

  shiprocket.bookShipment = vi.fn(async () => ({
    ok: true,
    provider: 'shiprocket',
    courierName: 'Xpressbees',
    externalOrderId: '16161616',
    shipmentId: '15151515',
    trackingNumber: 'AWB123456789',
    trackingUrl: 'https://shiprocket.co/tracking/AWB123456789',
    pickupScheduled: true,
  }));

  borzo.cancelSameDay = vi.fn(async () => ({ ok: true }));
  shiprocket.cancelShipment = vi.fn(async () => ({ ok: true, message: 'Cancelled' }));
});

afterEach(() => {
  borzo.bookSameDay = originals.bookSameDay;
  borzo.cancelSameDay = originals.cancelSameDay;
  shiprocket.bookShipment = originals.bookShipment;
  shiprocket.cancelShipment = originals.cancelShipment;
});

describe('the courier booked is the one the customer paid for', () => {
  it('sends a standard order to the courier network', async () => {
    const result = await bookForOrder(orderWith(), ADDRESS);

    expect(result.ok).toBe(true);
    expect(shiprocket.bookShipment).toHaveBeenCalledTimes(1);
    expect(borzo.bookSameDay).not.toHaveBeenCalled();
    expect(result.update.shippingProvider).toBe('shiprocket');
  });

  it('sends a same-day order to the hyperlocal rider', async () => {
    const result = await bookForOrder(orderWith({ deliveryOption: 'same_day' }), ADDRESS);

    expect(result.ok).toBe(true);
    expect(borzo.bookSameDay).toHaveBeenCalledTimes(1);
    expect(shiprocket.bookShipment).not.toHaveBeenCalled();
    expect(result.update.shippingProvider).toBe('borzo');
  });

  it('records the tracking details and marks the order shipped', async () => {
    const { update } = await bookForOrder(orderWith(), ADDRESS);

    expect(update.status).toBe('shipped');
    expect(update.shippingAwb).toBe('AWB123456789');
    expect(update.shippingCourierName).toBe('Xpressbees');
    expect(update.trackingInfo.trackingNumber).toBe('AWB123456789');
    expect(update.trackingInfo.shippedDate).toBeInstanceOf(Date);
  });

  it('sends the real parcel weight', async () => {
    await bookForOrder(orderWith(), ADDRESS);

    // 0.2 kg x 2 units.
    expect(shiprocket.bookShipment.mock.calls[0][2]).toBeCloseTo(0.4, 5);
  });

  it('ignores cancelled lines when weighing the parcel', () => {
    const order = orderWith();
    order.items.push({
      productId: { weight: 5 },
      name: 'Heavy thing',
      quantity: 1,
      price: 100,
      status: 'cancelled',
    });

    // Weighing a parcel that includes goods nobody is shipping means paying
    // the courier for air.
    expect(parcelWeight(order)).toBeCloseTo(0.4, 5);
  });
});

describe('a courier is never booked twice', () => {
  it('refuses an order that already has an AWB', async () => {
    const result = await bookForOrder(orderWith({ shippingAwb: 'AWB999' }), ADDRESS);

    // A second booking would create a second shipment, spend the money again,
    // and send a rider for a parcel that has already gone.
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/already booked/i);
    expect(shiprocket.bookShipment).not.toHaveBeenCalled();
  });

  it('refuses an order that already has a courier order id', async () => {
    const result = await bookForOrder(orderWith({ shippingOrderId: '16161616' }), ADDRESS);

    expect(result.ok).toBe(false);
    expect(shiprocket.bookShipment).not.toHaveBeenCalled();
  });

  it('refuses a cancelled order', async () => {
    const result = await bookForOrder(orderWith({ status: 'cancelled' }), ADDRESS);

    expect(result.ok).toBe(false);
    expect(shiprocket.bookShipment).not.toHaveBeenCalled();
  });

  it('reports whether an order is booked', () => {
    expect(isBooked(orderWith())).toBe(false);
    expect(isBooked(orderWith({ shippingAwb: 'AWB1' }))).toBe(true);
    expect(isBooked(orderWith({ shippingOrderId: '123' }))).toBe(true);
  });
});

describe('a failed booking', () => {
  it('leaves the order untouched when nothing was created', async () => {
    shiprocket.bookShipment = vi.fn(async () => ({ ok: false, reason: 'Wallet empty' }));

    const result = await bookForOrder(orderWith(), ADDRESS);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Wallet empty');
    expect(result.update).toBeNull();
  });

  it('still records ids when a shipment was created but got no AWB', async () => {
    shiprocket.bookShipment = vi.fn(async () => ({
      ok: false,
      reason: 'No AWB issued',
      externalOrderId: '16161616',
      shipmentId: '15151515',
    }));

    const result = await bookForOrder(orderWith(), ADDRESS);

    // A shipment that exists at the courier but is unknown here is one nobody
    // can find to cancel, and it keeps costing.
    expect(result.ok).toBe(false);
    expect(result.update).toEqual({
      shippingOrderId: '16161616',
      shippingShipmentId: '15151515',
    });
    // It is NOT marked shipped.
    expect(result.update.status).toBeUndefined();
  });

  it('says so when the pickup could not be scheduled', async () => {
    shiprocket.bookShipment = vi.fn(async () => ({
      ok: true,
      provider: 'shiprocket',
      courierName: 'Xpressbees',
      externalOrderId: '1',
      shipmentId: '2',
      trackingNumber: 'AWB1',
      pickupScheduled: false,
    }));

    const result = await bookForOrder(orderWith(), ADDRESS);

    expect(result.ok).toBe(true);
    expect(result.pickupScheduled).toBe(false);
  });
});

describe('cancelling a shipment', () => {
  const booked = (provider) =>
    orderWith({
      status: 'shipped',
      shippingProvider: provider,
      shippingOrderId: '900900',
      shippingAwb: 'AWB1',
      deliveryOption: provider === 'borzo' ? 'same_day' : 'standard',
    });

  it('calls off the courier that was actually booked', async () => {
    await cancelForOrder(booked('borzo'));
    expect(borzo.cancelSameDay).toHaveBeenCalledWith('900900');
    expect(shiprocket.cancelShipment).not.toHaveBeenCalled();
  });

  it('puts the order back to processing and clears the tracking', async () => {
    const { update } = await cancelForOrder(booked('shiprocket'));

    expect(update.status).toBe('processing');
    expect(update.shippingAwb).toBeNull();
    expect(update.shippingOrderId).toBeNull();
    expect(update.trackingInfo.trackingNumber).toBeNull();
  });

  it('does NOT move the order when the courier refuses', async () => {
    borzo.cancelSameDay = vi.fn(async () => ({
      ok: false,
      reason: 'The rider has already collected this parcel',
    }));

    const result = await cancelForOrder(booked('borzo'));

    // Saying the parcel is still here while a rider carries it away would be a
    // lie the seller acts on.
    expect(result.ok).toBe(false);
    expect(result.update).toBeUndefined();
  });

  it('refuses when nothing was booked', async () => {
    const result = await cancelForOrder(orderWith());

    expect(result.ok).toBe(false);
    expect(borzo.cancelSameDay).not.toHaveBeenCalled();
    expect(shiprocket.cancelShipment).not.toHaveBeenCalled();
  });
});
