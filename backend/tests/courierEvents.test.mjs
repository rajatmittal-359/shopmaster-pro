/**
 * Shiprocket's whole vocabulary against ours (20 Sep 2026): RTO is a fact
 * until the parcel is back, then a refund and stock; lost and failed pickups
 * are heard; the customer's return leg never reads as a forward delivery.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normaliseCourierStatus } = require('../utils/courierStatus');
const { applyCourierUpdate } = require('../utils/applyCourierUpdate');
const notifier = require('../utils/notify');
const refunds = require('../utils/refund');
const inventory = require('../controllers/inventoryController');
const events = require('../utils/courierEvents');

afterEach(() => vi.restoreAllMocks());

const parcel = (over = {}) => ({ sellerId: 's1', status: 'shipped', shippedAt: new Date('2026-09-10'), ...over });
const order = (over = {}) => ({ _id: 'o1', orderNumber: 'SMP-9', customerId: 'c1', paymentMethod: 'razorpay', paymentStatus: 'paid', razorpayPaymentId: 'pay_1', totalAmount: 500, items: [{ productId: 'p1', sellerId: 's1', quantity: 2, price: 250, status: 'active' }], fulfilments: [], save: vi.fn(async function s() { return this; }), ...over });

describe('the map', () => {
  it("reads Shiprocket's words the way Shiprocket means them", () => {
    const table = { 'RTO INITIATED': 'rto', 'RTO In Transit': 'rto', 'RTO Rejected': 'rto', 'RTO Delivered': 'returned', 'RTO Acknowledged': 'returned', 'Return Delivered': 'return_leg', 'Return Picked Up': 'return_leg', 'Pickup Exception': 'pickup_failed', 'Pickup Rescheduled': 'pickup_failed', Lost: 'lost', Damaged: 'lost', 'Disposed Of': 'lost', Misrouted: 'ndr', Undelivered: 'ndr', Delivered: 'delivered', 'Out For Delivery': 'out_for_delivery', 'Reached at Destination Hub': 'shipped', 'Picked Up': 'shipped', Cancelled: 'cancelled' };
    for (const [w, want] of Object.entries(table)) expect([w, normaliseCourierStatus(w)]).toEqual([w, want]);
  });
});

describe('applyCourierUpdate facts', () => {
  it('RTO initiated: a fact + event, the parcel stays shipped; RTO delivered: returned + rto_back', () => {
    const f = parcel();
    const o = order({ fulfilments: [f] });
    let r = applyCourierUpdate(o, f, { status: 'RTO INITIATED', reason: 'Consignee refused', at: '2026-09-12T10:00:00Z' });
    expect(f.status).toBe('shipped');
    expect(f.rtoAt).toBeInstanceOf(Date);
    expect(f.rtoReason).toBe('Consignee refused');
    expect(r.events).toEqual(['rto_started']);
    expect(applyCourierUpdate(o, f, { status: 'RTO IN TRANSIT', at: '2026-09-13T10:00:00Z' }).events).toEqual([]);
    r = applyCourierUpdate(o, f, { status: 'RTO Delivered', at: '2026-09-15T10:00:00Z' });
    expect(f.status).toBe('returned');
    expect(r.events).toEqual(['rto_back']);
  });
  it("a customer return's 'Return Delivered' is not a forward delivery; lost and failed pickup are recorded once", () => {
    const f = parcel();
    const o = order({ fulfilments: [f] });
    applyCourierUpdate(o, f, { status: 'Return Delivered', at: '2026-09-15T10:00:00Z' });
    expect(f.status).toBe('shipped');
    expect(f.deliveredAt).toBeUndefined();
    expect(applyCourierUpdate(o, f, { status: 'Lost', at: '2026-09-16T10:00:00Z' }).events).toEqual(['lost']);
    expect(applyCourierUpdate(o, f, { status: 'Lost', at: '2026-09-17T10:00:00Z' }).events).toEqual([]);
    expect(applyCourierUpdate(o, f, { status: 'Pickup Exception', reason: 'Shop closed', at: '2026-09-11T10:00:00Z' }).events).toEqual(['pickup_failed']);
    expect(f.pickupIssue).toBe('Shop closed');
  });
  it('the first NDR is an event, the second is not', () => {
    const f = parcel();
    const o = order({ fulfilments: [f] });
    expect(applyCourierUpdate(o, f, { status: 'Undelivered', reason: 'Customer not available', at: '2026-09-14T10:00:00Z' }).events).toEqual(['ndr']);
    expect(applyCourierUpdate(o, f, { status: 'Undelivered', reason: 'Customer not available', at: '2026-09-15T10:00:00Z' }).events).toEqual([]);
  });
});

describe('courier events', () => {
  it('rto_back: stock comes back, the prepaid customer is refunded (queued when the gateway will not), everyone told', async () => {
    const f = parcel({ status: 'returned' });
    const o = order({ fulfilments: [f] });
    const stock = vi.spyOn(inventory, 'applyInventoryChange').mockResolvedValue({});
    vi.spyOn(refunds, 'refundPayment').mockRejectedValue({ error: { description: 'Your account does not have enough balance' } });
    const notify = vi.spyOn(notifier, 'notify').mockResolvedValue({});
    vi.spyOn(notifier, 'notifyAdmins').mockResolvedValue([]);
    await events.notifyCourierEvents(o, f, ['rto_back']);
    expect(stock).toHaveBeenCalledWith(expect.objectContaining({ productId: 'p1', quantity: 2, type: 'return' }));
    expect(o.items[0].status).toBe('cancelled');
    expect(o.refundStatus).toBe('queued');
    expect(o.refundAmount).toBe(500);
    expect(o.cancellationReason).toMatch(/Returned to origin/);
    expect(o.save).toHaveBeenCalled();
    const customer = notify.mock.calls.find((c) => c[0].role === 'customer')[0];
    expect(customer.title).toMatch(/Refund of ₹500 raised/);
    expect(customer.body).toMatch(/queued/);
    expect(notify.mock.calls.find((c) => c[0].role === 'seller')[0].title).toMatch(/RTO parcel is back/);
  });
  it('rto_back on COD: stock back, nothing refunded, "nothing was charged"', async () => {
    const f = parcel({ status: 'returned' });
    const o = order({ paymentMethod: 'cod', paymentStatus: 'pending', razorpayPaymentId: null, fulfilments: [f] });
    vi.spyOn(inventory, 'applyInventoryChange').mockResolvedValue({});
    const refund = vi.spyOn(refunds, 'refundPayment');
    const notify = vi.spyOn(notifier, 'notify').mockResolvedValue({});
    await events.notifyCourierEvents(o, f, ['rto_back']);
    expect(refund).not.toHaveBeenCalled();
    expect(notify.mock.calls.find((c) => c[0].role === 'customer')[0].body).toMatch(/Nothing was charged/);
  });
  it('lost: the admin hears about the claim, the customer hears within-two-days, the seller hears nothing-to-do', async () => {
    const f = parcel({ lostReason: 'Lost in transit' });
    const o = order({ fulfilments: [f] });
    const notify = vi.spyOn(notifier, 'notify').mockResolvedValue({});
    const admins = vi.spyOn(notifier, 'notifyAdmins').mockResolvedValue([]);
    await events.notifyCourierEvents(o, f, ['lost']);
    expect(admins.mock.calls[0][0].body).toMatch(/Raise the claim in Shiprocket/);
    expect(notify.mock.calls.map((c) => c[0].role).sort()).toEqual(['customer', 'seller']);
  });
});
