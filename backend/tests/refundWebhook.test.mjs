/**
 * What happens to a refund after it is started.
 *
 * THE GAP THIS CLOSES
 *   Three places raise refunds - a cancellation, a received return, an admin
 *   settling a dispute - and all three set refundStatus to 'processing' and
 *   stop. Nothing in the codebase ever set it to anything else. The enum has
 *   carried 'completed' and 'failed' since the field was written and neither
 *   was ever reached.
 *
 *   So a customer's order page read "refund processing" for ever, long after
 *   the money had arrived. And when a refund FAILED at Razorpay - a closed
 *   account, a bank rejection - nobody found out. The customer's money was
 *   stuck and the only record we had said it was on its way.
 *
 *   Razorpay's refund.processed / refund.failed webhook is the only signal
 *   that exists. These tests are for acting on it.
 *
 * AND THE SCHEMA HOLE UNDERNEATH IT
 *   Cancelling one line of a multi-item order raises a PARTIAL refund, and
 *   customerController wrote `item.refundId` for it. But orderItemSchema had
 *   no such path, and Mongoose drops writes to unknown paths in strict mode -
 *   silently. The refund id went on the floor, so a refund.failed webhook for
 *   a partial refund had nothing to match against at all.
 *
 * The rules being defended:
 *   1. refund.processed marks the refund completed and stamps the date
 *   2. refund.failed marks it failed and says so loudly - it is money owed
 *   3. a PARTIAL refund is matched on the item, not just the order
 *   4. an unknown refund id is answered 200, never a 5xx
 *   5. an unsigned or wrongly signed request is refused
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'crypto';

import { fakeOrderDoc } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');

const WEBHOOK_PATH = '/api/customer/razorpay/webhook';
const REFUND_ID = 'rfnd_WHOLEORDER1';
const ITEM_REFUND_ID = 'rfnd_ONELINE222';

/** Razorpay signs the raw request bytes, so the test signs the same bytes. */
const signRaw = (raw) =>
  crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(raw)
    .digest('hex');

const refundEvent = (event, id, amount = 230000) =>
  JSON.stringify({
    event,
    payload: { refund: { entity: { id, amount, status: event.split('.')[1] } } },
  });

const send = (raw, signature = signRaw(raw)) =>
  request(app)
    .post(WEBHOOK_PATH)
    .set('Content-Type', 'application/json')
    .set(signature === null ? {} : { 'x-razorpay-signature': signature })
    .send(raw);

const originals = {};
let orderDoc;

const makeOrder = () =>
  fakeOrderDoc({
    _id: new mongoose.Types.ObjectId(),
    orderNumber: 'SMP-REFUND-1',
    refundId: REFUND_ID,
    refundStatus: 'processing',
    refundedAt: null,
    items: [
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Kundan choker',
        status: 'cancelled',
        refundId: ITEM_REFUND_ID,
        refundStatus: 'processing',
        refundedAt: null,
      },
      { _id: new mongoose.Types.ObjectId(), name: 'Pearl studs', status: 'active' },
    ],
  });

beforeEach(() => {
  originals.orderFindOne = Order.findOne;
  orderDoc = makeOrder();

  // Matches the controller's $or on refundId at either level.
  Order.findOne = vi.fn(async (filter) => {
    const wanted = (filter?.$or || []).map((c) => c.refundId || c['items.refundId']);
    if (wanted.includes(orderDoc.refundId)) return orderDoc;
    if (orderDoc.items.some((i) => wanted.includes(i.refundId))) return orderDoc;
    return null;
  });
});

afterEach(() => {
  Order.findOne = originals.orderFindOne;
});

describe('a refund that went through', () => {
  it('marks the order refunded instead of leaving it "processing" for ever', async () => {
    const res = await send(refundEvent('refund.processed', REFUND_ID));

    expect(res.status).toBe(200);
    expect(orderDoc.refundStatus).toBe('completed');
    expect(orderDoc.refundedAt).toBeTruthy();
    expect(orderDoc.save).toHaveBeenCalled();
  });
});

describe('a refund that failed', () => {
  it('records the failure - this is money the customer is owed', async () => {
    const res = await send(refundEvent('refund.failed', REFUND_ID));

    expect(res.status).toBe(200);
    expect(orderDoc.refundStatus).toBe('failed');
    // No date: nothing was refunded, and stamping one would be a lie.
    expect(orderDoc.refundedAt).toBeNull();
  });

  it('says so loudly, because no screen shows it yet', async () => {
    const shouted = vi.spyOn(console, 'error').mockImplementation(() => {});

    await send(refundEvent('refund.failed', REFUND_ID, 230000));

    const said = shouted.mock.calls.flat().join(' ');
    expect(said).toMatch(/REFUND FAILED/);
    expect(said).toMatch(/SMP-REFUND-1/);
    expect(said).toMatch(/NOT been paid/i);

    shouted.mockRestore();
  });
});

describe('a partial refund, for one cancelled line', () => {
  it('is matched on the ITEM, which is where its refund id lives', async () => {
    const res = await send(refundEvent('refund.processed', ITEM_REFUND_ID));

    expect(res.status).toBe(200);
    expect(orderDoc.items[0].refundStatus).toBe('completed');
    expect(orderDoc.items[0].refundedAt).toBeTruthy();

    // The ORDER's own refund is a different refund and must not be touched.
    expect(orderDoc.refundStatus).toBe('processing');
  });

  it('leaves the line that was never refunded alone', async () => {
    await send(refundEvent('refund.processed', ITEM_REFUND_ID));

    expect(orderDoc.items[1].refundStatus).toBeUndefined();
  });
});

describe('refunds that are not ours', () => {
  it('answers 200 for an unknown refund id rather than making Razorpay retry', async () => {
    const res = await send(refundEvent('refund.processed', 'rfnd_SOMEONE_ELSE'));

    /*
     * A non-2xx makes Razorpay retry for 24 hours and then DISABLE the webhook
     * - which would cost every future payment notification, over a refund we
     * never raised.
     */
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
  });

  it('ignores a refund event carrying no refund entity', async () => {
    const raw = JSON.stringify({ event: 'refund.processed', payload: {} });

    const res = await send(raw);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
    expect(orderDoc.refundStatus).toBe('processing');
  });
});

describe('the signature still guards this', () => {
  it('refuses an unsigned refund event', async () => {
    const res = await send(refundEvent('refund.failed', REFUND_ID), null);

    expect(res.status).not.toBe(200);
    expect(orderDoc.refundStatus).toBe('processing');
  });

  it('refuses a wrongly signed one', async () => {
    const res = await send(refundEvent('refund.failed', REFUND_ID), 'deadbeef');

    expect(res.status).not.toBe(200);
    expect(orderDoc.refundStatus).toBe('processing');
  });
});
