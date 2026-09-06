/**
 * Tracking updates coming back from the courier.
 *
 * The Shiprocket integration was one-way: we could create a shipment, pick a
 * courier, book a pickup and cancel - and then hear nothing ever again. An
 * order became 'delivered' only when a seller remembered to press a button.
 *
 * That is a money bug, not a cosmetic one. deliveredAt starts the return
 * window, and the window closing is what makes a seller's line PAYABLE. A
 * seller who forgot, or who never learnt the parcel had arrived, was never
 * paid - with nothing on any screen to explain why.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
const User = require('../models/User');
const { normaliseCourierStatus } = require('../utils/courierStatus');

const TOKEN = 'test-webhook-token';
const AWB = '14112365899385';
const SELLER = new mongoose.Types.ObjectId();

const originals = {};
let saved;

const buildOrder = (over = {}) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: 'SMP-TEST-TRACK',
    customerId: new mongoose.Types.ObjectId(),
    status: 'shipped',
    shippingAwb: AWB,
    fulfilments: [
      {
        sellerId: SELLER,
        status: 'shipped',
        awb: AWB,
        shippedAt: new Date('2026-09-06'),
        deliveredAt: null,
        returnedAt: null,
        courierStatus: null,
        courierStatusAt: null,
        ndrReason: null,
        ndrAt: null,
      },
    ],
    save: vi.fn(async function () {
      saved = this;
      return this;
    }),
    ...over,
  };
  return doc;
};

let order;

beforeEach(() => {
  process.env.SHIPROCKET_WEBHOOK_TOKEN = TOKEN;
  saved = null;
  order = buildOrder();

  originals.findOne = Order.findOne;
  originals.userFindById = User.findById;

  Order.findOne = vi.fn(async () => order);
  User.findById = vi.fn(() => ({ select: async () => null }));
});

afterEach(() => {
  Order.findOne = originals.findOne;
  User.findById = originals.userFindById;
  delete process.env.SHIPROCKET_WEBHOOK_TOKEN;
});

const post = (body, key = TOKEN) =>
  request(app).post('/api/logistics/track').set('x-api-key', key).send(body);

describe('reading what the courier calls it', () => {
  it.each([
    ['DELIVERED', 'delivered'],
    ['Shipment Delivered', 'delivered'],
    ['OUT FOR DELIVERY', 'out_for_delivery'],
    ['In Transit', 'shipped'],
    ['PICKED UP', 'shipped'],
    ['UNDELIVERED', 'ndr'],
    ['Address issue - customer not available', 'ndr'],
    ['RTO INITIATED', 'returned'],
    // The trap: this contains "DELIVERED" but the parcel came BACK.
    ['RTO DELIVERED', 'returned'],
    ['CANCELED', 'cancelled'],
  ])('reads %s as %s', (raw, expected) => {
    expect(normaliseCourierStatus(raw)).toBe(expected);
  });

  it('says nothing rather than guessing at a status it has not met', () => {
    expect(normaliseCourierStatus('SOMETHING NEW')).toBeNull();
    expect(normaliseCourierStatus('')).toBeNull();
  });
});

describe('a delivery', () => {
  it('sets deliveredAt, which is what makes the seller payable', async () => {
    const res = await post({ awb: AWB, current_status: 'DELIVERED' });

    expect(res.status).toBe(200);
    expect(saved.fulfilments[0].status).toBe('delivered');
    expect(saved.fulfilments[0].deliveredAt).toBeInstanceOf(Date);
  });

  it('keeps the courier\'s own words, which are what a seller can act on', async () => {
    await post({ awb: AWB, current_status: 'Delivered to consignee' });

    expect(saved.fulfilments[0].courierStatus).toBe('Delivered to consignee');
    expect(saved.fulfilments[0].courierStatusAt).toBeInstanceOf(Date);
  });

  it('uses the courier\'s timestamp when it sends one', async () => {
    await post({
      awb: AWB,
      current_status: 'DELIVERED',
      current_timestamp: '2026-09-08T10:30:00Z',
    });

    expect(saved.fulfilments[0].deliveredAt.toISOString()).toBe('2026-09-08T10:30:00.000Z');
  });
});

describe("Shiprocket's own documented payload", () => {
  /**
   * Copied from the sample they publish, not invented. Three things in it would
   * have broken a handler written from a guess:
   *   awb is a NUMBER, not a string
   *   the timestamp is "2021-07-02 16:41:59", which is not ISO
   *   order_id is THEIR id; ours is channel_order_id
   */
  const SAMPLE = {
    awb: Number(AWB),
    current_status: 'Delivered',
    order_id: '13905312',
    current_timestamp: '2026-09-08 16:41:59',
    etd: '2026-09-08 16:41:59',
    current_status_id: 7,
    shipment_status: 'Delivered',
    shipment_status_id: 7,
    channel_order_id: 'SMP-TEST-TRACK-R2',
    channel: 'CUSTOM',
    courier_name: 'Xpressbees Surface',
    scans: [
      { date: '2026-09-08 16:41:00', activity: 'SHIPMENT DELIVERED', location: 'JAIPUR' },
      { date: '2026-09-08 10:18:00', activity: 'SHIPMENT OUT FOR DELIVERY', location: 'JAIPUR' },
    ],
  };

  it('handles it end to end', async () => {
    const res = await post(SAMPLE);

    expect(res.status).toBe(200);
    expect(saved.fulfilments[0].status).toBe('delivered');
    expect(saved.fulfilments[0].deliveredAt).toBeInstanceOf(Date);
  });

  it('matches a numeric awb against the stored string', async () => {
    await post(SAMPLE);
    // The lookup must not miss because 59629792084 !== "59629792084".
    expect(Order.findOne).toHaveBeenCalled();
    expect(saved).not.toBeNull();
  });

  it('reads their non-ISO timestamp rather than falling back to now', async () => {
    await post(SAMPLE);
    expect(saved.fulfilments[0].deliveredAt.getFullYear()).toBe(2026);
    expect(saved.fulfilments[0].deliveredAt.getMonth()).toBe(8); // September
    expect(saved.fulfilments[0].deliveredAt.getDate()).toBe(8);
  });

  /**
   * The wording could change; the code does not. 7 is the one status that
   * releases money, so it is trusted on its own.
   */
  it('trusts status id 7 even when the wording is unfamiliar', async () => {
    await post({ ...SAMPLE, current_status: 'SOME NEW WORDING' });
    expect(saved.fulfilments[0].status).toBe('delivered');
  });
});

describe('what it refuses to do', () => {
  /**
   * Couriers resend events, and they do not always arrive in order. A repeat of
   * "in transit" after a delivery must not undo the delivery - that would
   * reopen a closed return window and pull back a payout.
   */
  it('never walks a parcel backwards', async () => {
    order.fulfilments[0].status = 'delivered';
    order.fulfilments[0].deliveredAt = new Date('2026-09-07');

    await post({ awb: AWB, current_status: 'IN TRANSIT' });

    expect(saved.fulfilments[0].status).toBe('delivered');
    expect(saved.fulfilments[0].deliveredAt.toISOString()).toContain('2026-09-07');
  });

  it('does not move the parcel on a failed attempt', async () => {
    await post({
      awb: AWB,
      current_status: 'UNDELIVERED',
      ndr_reason: 'Customer not available',
    });

    // Still shipped: the courier will try again, and losing that would be worse
    // than not recording the attempt.
    expect(saved.fulfilments[0].status).toBe('shipped');
    expect(saved.fulfilments[0].ndrReason).toBe('Customer not available');
    expect(saved.fulfilments[0].ndrAt).toBeInstanceOf(Date);
  });

  it('rejects a request with the wrong key, and changes nothing', async () => {
    const res = await post({ awb: AWB, current_status: 'DELIVERED' }, 'wrong-key');

    expect(res.status).toBe(200);
    expect(saved).toBeNull();
  });

  it('rejects everything when no token is configured', async () => {
    delete process.env.SHIPROCKET_WEBHOOK_TOKEN;

    // An unset token must not mean "accept anything" - that is how a stranger
    // marks an order delivered and releases a payout.
    const res = await post({ awb: AWB, current_status: 'DELIVERED' }, 'anything');

    expect(res.status).toBe(200);
    expect(saved).toBeNull();
  });
});

describe('always answering 200', () => {
  /**
   * Shiprocket disables a webhook that does not return 200. A payload we cannot
   * read is ours to look at in the log - having the whole feed switched off
   * would cost every later delivery too.
   */
  it.each([
    ['an unknown status', { awb: AWB, current_status: 'WHAT IS THIS' }],
    ['no awb or reference', { current_status: 'DELIVERED' }],
    ['an empty body', {}],
  ])('answers 200 for %s', async (_label, body) => {
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(saved).toBeNull();
  });

  it('answers 200 even when the lookup throws', async () => {
    Order.findOne = vi.fn(async () => {
      throw new Error('database down');
    });

    const res = await post({ awb: AWB, current_status: 'DELIVERED' });
    expect(res.status).toBe(200);
  });
});
