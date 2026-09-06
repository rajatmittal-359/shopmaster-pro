/**
 * Booking a courier to collect goods FROM the customer.
 *
 * THE MISTAKE THIS EXISTS TO CATCH
 *   Shiprocket keeps the same field NAMES for a return and reverses what they
 *   mean: pickup_* is the CUSTOMER and shipping_* is US. Fill them in the
 *   forward sense and a rider is sent to our own door to collect a parcel
 *   sitting in somebody's house - and the fee is spent either way.
 *
 *   It is a mistake that reads as correct in every code review, because every
 *   field name looks familiar. So it is pinned here instead.
 *
 * The rest of the payload rules being defended:
 *   1. payment_method is ALWAYS Prepaid, even returning a COD order
 *   2. the reference is suffixed, or Shiprocket hands back the outbound shipment
 *   3. QC is only claimed for items that have the image it requires
 *   4. a booking failure changes nothing
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const axios = require('axios');
const mongoose = require('mongoose');

const shiprocket = require('../utils/shiprocketBooking');
const { bookReturnPickup, splitName } = require('../utils/shiprocketReturn');
const { BUSINESS } = require('../config/business');

const originals = {};
let posted;

const CUSTOMER_ADDRESS = {
  street: '323-A, Vidyut Nagar-A, Govind Marg, Ajmer Road',
  city: 'Jaipur',
  state: 'Rajasthan',
  zipCode: '302021',
  country: 'India',
  phoneNumber: '8769766908',
};

const ORDER = { orderNumber: 'SMP-260906-858D34', paymentMethod: 'razorpay' };
const FULFILMENT = { sellerId: new mongoose.Types.ObjectId(), returnStage: 'requested' };

const ITEMS = [
  {
    name: 'TEST Rupee One Nose Pin',
    productId: new mongoose.Types.ObjectId(),
    quantity: 1,
    price: 1,
    image: null,
  },
];

const book = (opts = {}) =>
  bookReturnPickup(ORDER, FULFILMENT, CUSTOMER_ADDRESS, {
    customerName: 'Abha Mittal',
    customerEmail: 'mittalabha70@gmail.com',
    weightKg: 0.5,
    items: ITEMS,
    ...opts,
  });

beforeEach(() => {
  posted = null;
  originals.post = axios.post;
  originals.getToken = shiprocket.getToken;

  shiprocket.getToken = vi.fn(async () => 'test-token');
  axios.post = vi.fn(async (url, payload) => {
    posted = { url, payload };
    return {
      data: {
        order_id: 170872392,
        shipment_id: 170411259,
        status: 'RETURN PENDING',
        status_code: 21,
      },
    };
  });
});

afterEach(() => {
  axios.post = originals.post;
  shiprocket.getToken = originals.getToken;
});

describe('which end is which', () => {
  it('collects FROM the customer', async () => {
    await book();

    expect(posted.payload.pickup_address).toContain('Vidyut Nagar');
    expect(posted.payload.pickup_pincode).toBe(302021);
    expect(posted.payload.pickup_customer_name).toBe('Abha');
    expect(posted.payload.pickup_last_name).toBe('Mittal');
    expect(posted.payload.pickup_phone).toBe('8769766908');
  });

  it('delivers back TO the shop', async () => {
    await book();

    expect(posted.payload.shipping_address).toBe(BUSINESS.address1);
    expect(posted.payload.shipping_pincode).toBe(Number(BUSINESS.pincode));
    expect(posted.payload.shipping_city).toBe(BUSINESS.city);
  });

  /**
   * The one that would cost money silently: the two ends being the same, or
   * swapped, still books and still charges.
   */
  it('never sends the rider to the same place it is delivering to', async () => {
    await book();

    expect(posted.payload.pickup_pincode).not.toBe(posted.payload.shipping_pincode);
    expect(posted.payload.pickup_address).not.toBe(posted.payload.shipping_address);
  });

  it('hits the return endpoint, not the forward one', async () => {
    await book();
    expect(posted.url).toContain('/orders/create/return');
  });
});

describe('the rest of the payload', () => {
  /**
   * Shiprocket treats order_id as the key. Reusing the forward number would
   * find the outbound shipment and hand it back instead of creating a return.
   */
  it('uses a reference that cannot collide with the outbound order', async () => {
    await book();

    expect(posted.payload.order_id).toBe('SMP-260906-858D34-RET');
    expect(posted.payload.order_id).not.toBe(ORDER.orderNumber);
  });

  /**
   * Their docs: "This should always be prepaid." It is not a statement about
   * how the customer originally paid - nobody collects cash on a return.
   */
  it('is Prepaid even when the original order was COD', async () => {
    await bookReturnPickup(
      { ...ORDER, paymentMethod: 'cod' },
      FULFILMENT,
      CUSTOMER_ADDRESS,
      { customerName: 'Abha Mittal', items: ITEMS }
    );

    expect(posted.payload.payment_method).toBe('Prepaid');
  });

  it('totals only the items actually coming back', async () => {
    await book({
      items: [
        { name: 'A', productId: 'p1', quantity: 2, price: 100, image: null },
        { name: 'B', productId: 'p2', quantity: 1, price: 50, image: null },
      ],
    });

    expect(posted.payload.sub_total).toBe(250);
    expect(posted.payload.order_items).toHaveLength(2);
  });

  /**
   * qc_product_image is required once qc_enable is true, and a booking missing
   * it fails outright - so QC is claimed only where there is a picture to send.
   */
  it('asks for a quality check only when it can supply the image', async () => {
    await book({
      items: [
        { name: 'With picture', productId: 'p1', quantity: 1, price: 10, image: 'https://img/1.jpg' },
        { name: 'Without', productId: 'p2', quantity: 1, price: 10, image: null },
      ],
    });

    const [withImage, without] = posted.payload.order_items;

    expect(withImage.qc_enable).toBe(true);
    expect(withImage.qc_product_image).toBe('https://img/1.jpg');
    expect(without.qc_enable).toBe(false);
    expect(without.qc_product_image).toBeUndefined();
  });

  it('never sends a zero weight, which Shiprocket rejects', async () => {
    await book({ weightKg: 0 });
    expect(posted.payload.weight).toBeGreaterThan(0);
  });
});

describe('when it cannot book', () => {
  it('refuses without an address to collect from', async () => {
    const result = await bookReturnPickup(ORDER, FULFILMENT, {}, { items: ITEMS });

    expect(result.ok).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refuses a return with nothing on it', async () => {
    const result = await book({ items: [] });

    expect(result.ok).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('reports their validation errors rather than a blank failure', async () => {
    axios.post = vi.fn(async () => {
      const err = new Error('Request failed');
      err.response = { data: { errors: { pickup_pincode: ['is not serviceable'] } } };
      throw err;
    });

    const result = await book();

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not serviceable/);
  });

  it('treats a response with no order id as a failure', async () => {
    axios.post = vi.fn(async () => ({ data: { message: 'Something went wrong' } }));

    const result = await book();

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/something went wrong/i);
  });

  it('hands back what it booked so the ids can be stored', async () => {
    const result = await book();

    expect(result).toMatchObject({
      ok: true,
      orderId: '170872392',
      shipmentId: '170411259',
      status: 'RETURN PENDING',
    });
  });
});

describe('splitting a name into their two fields', () => {
  it.each([
    ['Abha Mittal', 'Abha', 'Mittal'],
    ['Rajat Kumar Mittal', 'Rajat', 'Kumar Mittal'],
    ['Prashant', 'Prashant', ''],
    ['', 'Customer', ''],
  ])('%s -> %s / %s', (full, first, last) => {
    expect(splitName(full)).toEqual({ first, last });
  });
});
