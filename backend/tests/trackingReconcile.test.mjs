/**
 * The net under the webhook.
 *
 * THE BUG THIS DEFENDS AGAINST
 *   Tracking was listen-only: Shiprocket posts an event, we write it down, and
 *   that was the whole mechanism. It assumes every post arrives. A webhook is a
 *   single delivery attempt to a server that sleeps on a free Render plan, so
 *   that assumption is wrong about as often as the server is cold.
 *
 *   Miss the one event that says "delivered" and nothing else ever notices. The
 *   parcel stays 'shipped', deliveredAt is never set, the return window never
 *   opens, and that seller is never paid - with nothing on any screen to
 *   explain it, because from the inside it looks like nothing happened rather
 *   than like something broke.
 *
 * The rules being defended:
 *   1. a delivery the webhook missed is still found, and still pays the seller
 *   2. the reconciler and the webhook decide identically - one set of rules
 *   3. a parcel never walks backwards, whichever source spoke last
 *   4. a failed AWB costs only its own parcel, not the whole pass
 *   5. nothing is asked about twice in a row for no reason
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const Order = require('../models/Order');
const shiprocket = require('../utils/shiprocketBooking');
const { reconcileOnce, STALE_HOURS } = require('../jobs/trackingReconcile');

const SELLER = new mongoose.Types.ObjectId();
const AWB = '14112365899385';

const originals = {};
let orders;
let saved;

const hoursAgo = (n) => new Date(Date.now() - n * 3600 * 1000);

const shippedOrder = (over = {}) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    orderNumber: 'SMP-TEST-RECON',
    paymentMethod: 'razorpay',
    paymentStatus: 'paid',
    status: 'shipped',
    items: [{ sellerId: SELLER, status: 'active', quantity: 1, price: 100 }],
    fulfilments: [
      {
        sellerId: SELLER,
        status: 'shipped',
        awb: AWB,
        shippedAt: hoursAgo(72),
        deliveredAt: null,
        returnedAt: null,
        courierStatus: 'Pickup Generated',
        courierStatusAt: hoursAgo(STALE_HOURS + 2),
        deliveryConfirmedBy: null,
        ndrReason: null,
        ndrAt: null,
        ndrAttempts: 0,
        nprReason: null,
        podUrl: null,
        scans: [],
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

/**
 * The real response shape, read off our own live AWB rather than invented -
 * `delivered_date` and `pod` live on shipment_track[0], the activities come
 * newest first, and ndr/npr are their own objects.
 */
const trackingSays = (over = {}) => ({
  ok: true,
  status: 'Delivered',
  statusId: 7,
  courierName: 'Xpressbees Surface',
  deliveredDate: '2026-09-08 16:41:00',
  etd: '2026-09-14 00:00:00',
  at: '2026-09-08 16:41:00',
  pod: null,
  ndrReason: null,
  ndrAttempts: 0,
  nprReason: null,
  nprAttempts: 0,
  scans: [
    {
      at: new Date('2026-09-08T16:41:00'),
      activity: 'SHIPMENT DELIVERED',
      location: 'JAIPUR',
    },
  ],
  ...over,
});

beforeEach(() => {
  saved = null;
  orders = [shippedOrder()];

  originals.find = Order.find;
  originals.trackByAwb = shiprocket.trackByAwb;

  // The query builder the job uses: .sort().limit() then awaited.
  Order.find = vi.fn(() => ({
    sort: () => ({ limit: async () => orders }),
  }));
  shiprocket.trackByAwb = vi.fn(async () => trackingSays());
});

afterEach(() => {
  Order.find = originals.find;
  shiprocket.trackByAwb = originals.trackByAwb;
});

describe('a delivery the webhook never told us about', () => {
  it('is found, and sets the date that starts the return window', async () => {
    const { moved } = await reconcileOnce();

    expect(moved).toBe(1);
    expect(saved.fulfilments[0].status).toBe('delivered');
    expect(saved.fulfilments[0].deliveredAt).toBeInstanceOf(Date);
  });

  /**
   * Same answer as the webhook, because both go through applyCourierUpdate.
   * The day these two disagree is the day one of them pays a seller the other
   * would not have.
   */
  it('records the courier as the source, exactly as the webhook does', async () => {
    await reconcileOnce();
    expect(saved.fulfilments[0].deliveryConfirmedBy).toBe('courier');
  });

  it('uses the courier’s delivered date, not the moment we happened to ask', async () => {
    await reconcileOnce();

    const at = saved.fulfilments[0].deliveredAt;
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(8); // September
    expect(at.getDate()).toBe(8);
  });

  it('settles COD from the courier’s scan, since they took the cash', async () => {
    orders = [shippedOrder({ paymentMethod: 'cod', paymentStatus: 'pending' })];

    await reconcileOnce();

    expect(saved.paymentStatus).toBe('paid');
  });
});

describe('what it will not do', () => {
  it('never walks a delivered parcel backwards', async () => {
    orders[0].fulfilments[0].status = 'delivered';
    orders[0].fulfilments[0].deliveredAt = new Date('2026-09-07');
    shiprocket.trackByAwb = vi.fn(async () => trackingSays({ status: 'In Transit', statusId: 6 }));

    await reconcileOnce();

    // It is not even asked about - only 'shipped' parcels are open - but if it
    // were, the shared rules would refuse the move.
    expect(orders[0].fulfilments[0].status).toBe('delivered');
  });

  /**
   * One bad AWB must not cost every later parcel in the pass its check. That is
   * how a single broken shipment stops a hundred sellers being paid.
   */
  it('carries on past a parcel the courier cannot find', async () => {
    orders = [shippedOrder(), shippedOrder({ orderNumber: 'SMP-TEST-TWO' })];
    shiprocket.trackByAwb = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'Invalid AWB' })
      .mockResolvedValueOnce(trackingSays());

    const { asked, moved } = await reconcileOnce();

    expect(asked).toBe(2);
    expect(moved).toBe(1);
  });

  it('leaves a parcel alone when the courier has nothing new', async () => {
    shiprocket.trackByAwb = vi.fn(async () =>
      trackingSays({ status: 'Pickup Generated', statusId: 3, deliveredDate: null })
    );

    const { moved } = await reconcileOnce();

    expect(moved).toBe(0);
    expect(saved.fulfilments[0].status).toBe('shipped');
    // But it does say it looked, or this parcel is re-asked every single pass.
    expect(saved.fulfilments[0].courierStatusAt.getTime()).toBeGreaterThan(
      hoursAgo(1).getTime()
    );
  });

  it('only asks about parcels the webhook has gone quiet on', async () => {
    await reconcileOnce();

    const filter = Order.find.mock.calls[0][0];
    const match = filter.fulfilments.$elemMatch;

    expect(match.status.$in).toContain('shipped');
    expect(match.awb).toEqual({ $ne: null });
    // Recently-updated parcels are excluded: asking about one touched ten
    // minutes ago spends a call to learn nothing.
    expect(match.$or).toBeTruthy();
  });
});

describe('what only tracking carries', () => {
  /**
   * Proof of delivery. This is the evidence an admin needs to settle "the
   * tracking says delivered but nothing came" - without it a dispute is one
   * person's word against another's.
   */
  it('keeps the POD when the courier finally has one', async () => {
    shiprocket.trackByAwb = vi.fn(async () =>
      trackingSays({ pod: 'https://pod.example/14112365899385.jpg' })
    );

    await reconcileOnce();

    expect(saved.fulfilments[0].podUrl).toMatch(/pod\.example/);
  });

  /**
   * A second failed attempt is news even though the parcel has not moved, so
   * this is recorded whether or not the status changed.
   */
  it('records a failed delivery attempt and how many there have been', async () => {
    shiprocket.trackByAwb = vi.fn(async () =>
      trackingSays({
        status: 'Undelivered',
        statusId: 9,
        deliveredDate: null,
        ndrReason: 'Customer not available',
        ndrAttempts: 2,
      })
    );

    await reconcileOnce();

    expect(saved.fulfilments[0].ndrReason).toMatch(/not available/i);
    expect(saved.fulfilments[0].ndrAttempts).toBe(2);
    // Still shipped: the courier will try again, and losing where it is would
    // be worse than not recording the attempt.
    expect(saved.fulfilments[0].status).toBe('shipped');
  });

  /**
   * Never COLLECTED - a different failure from a failed delivery, and one
   * nothing was watching for. The seller thinks it has gone, the customer is
   * waiting, and the parcel is on a shelf.
   */
  it('catches a parcel the courier never picked up', async () => {
    shiprocket.trackByAwb = vi.fn(async () =>
      trackingSays({
        status: 'Pickup Generated',
        statusId: 3,
        deliveredDate: null,
        nprReason: 'Seller not available',
      })
    );

    await reconcileOnce();

    expect(saved.fulfilments[0].nprReason).toMatch(/not available/i);
  });
});

/**
 * Found by running the reconciler against a real parcel, not by reading code.
 *
 * Shiprocket said "Pickup Generated" - a status we have no rule for - and sent
 * an ETD of 14 September and a first scan alongside it. The old code bailed the
 * moment the status came back unmapped and threw the whole update away, so the
 * customer's page showed no arrival date and an empty timeline while the
 * courier had already told us both.
 *
 * A status word is a judgement about where a parcel is. Scans and an ETD are
 * observations, and an observation we cannot classify is still true.
 */
describe('a status we have no rule for', () => {
  const unknown = () =>
    trackingSays({
      status: 'Pickup Generated',
      statusId: 3,
      deliveredDate: null,
      etd: '2026-09-14 00:00:00',
      scans: [
        {
          at: new Date('2026-09-06T13:52:00'),
          activity: 'Data Received',
          location: 'PCK/JA1, Jaipur, RAJASTHAN',
        },
      ],
    });

  it('still records the arrival date the courier gave us', async () => {
    shiprocket.trackByAwb = vi.fn(async () => unknown());

    await reconcileOnce();

    expect(saved.fulfilments[0].expectedDeliveryAt).toBeInstanceOf(Date);
    expect(saved.fulfilments[0].expectedDeliveryAt.getDate()).toBe(14);
  });

  it('still records the scans the timeline is drawn from', async () => {
    shiprocket.trackByAwb = vi.fn(async () => unknown());

    await reconcileOnce();

    expect(saved.fulfilments[0].scans).toHaveLength(1);
    expect(saved.fulfilments[0].scans[0].activity).toBe('Data Received');
  });

  it('but forms no opinion about where the parcel has got to', async () => {
    shiprocket.trackByAwb = vi.fn(async () => unknown());

    const { moved } = await reconcileOnce();

    expect(moved).toBe(0);
    expect(saved.fulfilments[0].status).toBe('shipped');
  });
});
