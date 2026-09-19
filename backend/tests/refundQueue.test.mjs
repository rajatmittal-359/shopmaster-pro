/**
 * Queued refunds (19 Sep 2026): retried every two hours; raised → processing +
 * the customer mailed; balance still short → left queued, the admin reminded
 * after three days; any other gateway answer → failed + admin bell.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Order = require('../models/Order');
const refunds = require('../utils/refund');
const notifier = require('../utils/notify');
const rq = require('../utils/refundQueue');

const NOW = new Date('2026-09-23T06:45:00Z');
const doc = (over = {}) => ({ _id: 'o1', orderNumber: 'SMP-1', customerId: 'c1', razorpayPaymentId: 'pay_1', refundStatus: 'queued', refundAmount: 1, status: 'cancelled', paymentStatus: 'paid', refundQueuedAt: new Date('2026-09-19T18:00:00Z'), save: vi.fn(async function s() { return this; }), ...over });
const balance = { statusCode: 400, error: { description: 'Your account does not have enough balance to carry out the refund operation.' } };

afterEach(() => vi.restoreAllMocks());

describe('retryQueued', () => {
  it('raises the refund when the gateway now agrees, and tells the customer', async () => {
    const o = doc();
    vi.spyOn(Order, 'find').mockResolvedValue([o]);
    vi.spyOn(refunds, 'refundPayment').mockResolvedValue({ id: 'rfnd_9' });
    const notify = vi.spyOn(notifier, 'notify').mockResolvedValue({});
    expect(await rq.retryQueued({ now: NOW })).toEqual({ queued: 1, raised: 1, waiting: 0, failed: 0 });
    expect(o).toMatchObject({ refundId: 'rfnd_9', refundStatus: 'processing', paymentStatus: 'refunded', refundLastError: null });
    expect(o.save).toHaveBeenCalled();
    expect(notify.mock.calls[0][0]).toMatchObject({ userId: 'c1', category: 'orders', tag: 'refund-started-o1' });
    expect(notify.mock.calls[0][0].mail.subject).toMatch(/Refund of ₹1 started/);
  });

  it('balance still short: stays queued; the admin is reminded once a day after three days', async () => {
    const o = doc();
    vi.spyOn(Order, 'find').mockResolvedValue([o]);
    vi.spyOn(refunds, 'refundPayment').mockRejectedValue(balance);
    const admins = vi.spyOn(notifier, 'notifyAdmins').mockResolvedValue([]);
    expect(await rq.retryQueued({ now: NOW })).toEqual({ queued: 1, raised: 0, waiting: 1, failed: 0 });
    expect(o.refundStatus).toBe('queued');
    expect(admins.mock.calls[0][0].tag).toBe('refund-waiting-o1-2026-09-23');
    // one day in: no reminder yet
    admins.mockClear();
    vi.spyOn(Order, 'find').mockResolvedValue([doc({ refundQueuedAt: new Date('2026-09-22T18:00:00Z') })]);
    await rq.retryQueued({ now: NOW });
    expect(admins).not.toHaveBeenCalled();
  });

  it('any other answer is a failure the admin hears about, recorded on the order', async () => {
    const o = doc();
    vi.spyOn(Order, 'find').mockResolvedValue([o]);
    vi.spyOn(refunds, 'refundPayment').mockRejectedValue({ error: { description: 'The payment has been fully refunded already' } });
    const admins = vi.spyOn(notifier, 'notifyAdmins').mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await rq.retryQueued({ now: NOW })).toEqual({ queued: 1, raised: 0, waiting: 0, failed: 1 });
    expect(o.refundLastError).toMatch(/fully refunded/);
    expect(admins.mock.calls[0][0].title).toMatch(/Refund failed/);
  });

  it('knows a balance answer from the rest', () => {
    expect(rq.isBalanceError(balance)).toBe(true);
    expect(rq.isBalanceError(new Error('ECONNRESET'))).toBe(false);
  });
});
