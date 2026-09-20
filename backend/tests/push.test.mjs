/**
 * Seller push notifications (plan 2.26): the seller's phone buzzes on a new
 * order, a return, a dispute - through the browser's own Web Push, no app.
 * No push service is ever reached from here; the transport is swapped.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const push = require('../utils/push');
const PushSubscription = require('../models/PushSubscription');

const sub = (endpoint, extra = {}) => ({ _id: endpoint, userId: 'u1', endpoint, keys: { p256dh: 'p', auth: 'a' }, ...extra });

describe('push.validateSubscription', () => {
  it('accepts a real browser subscription', () => {
    const v = push.validateSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPx…', auth: 'k' } });
    expect(v.ok).toBe(true);
  });
  it('refuses http, missing keys and junk', () => {
    expect(push.validateSubscription({ endpoint: 'http://x.com/1', keys: { p256dh: 'p', auth: 'a' } }).ok).toBe(false);
    expect(push.validateSubscription({ endpoint: 'https://x.com/1' }).ok).toBe(false);
    expect(push.validateSubscription(null).ok).toBe(false);
    expect(push.validateSubscription({ endpoint: 'https://x.com/' + 'a'.repeat(3000), keys: { p256dh: 'p', auth: 'a' } }).ok).toBe(false);
  });
});

describe('push.sendToUser', () => {
  const originals = { find: PushSubscription.find, deleteOne: PushSubscription.deleteOne, updateOne: PushSubscription.updateOne };
  let sent;
  beforeEach(() => {
    sent = [];
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
    push.transport.send = vi.fn(async (s, payload) => { sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) }); return { statusCode: 201 }; });
    PushSubscription.find = vi.fn(() => ({ lean: async () => [sub('https://a/1'), sub('https://a/2')] }));
    PushSubscription.deleteOne = vi.fn(async () => ({ deletedCount: 1 }));
    PushSubscription.updateOne = vi.fn(async () => ({}));
  });
  afterEach(() => {
    Object.assign(PushSubscription, originals);
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  it('does nothing without VAPID keys, and says so', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const r = await push.sendToUser('u1', { title: 'x', body: 'y', url: '/seller' });
    expect(r).toEqual({ sent: 0, reason: 'push not configured' });
    expect(push.transport.send).not.toHaveBeenCalled();
  });

  it('sends the same payload to every device the seller registered', async () => {
    const r = await push.sendToUser('u1', { title: 'नया ऑर्डर', body: 'Jhumka × 2', url: '/seller/orders/1', tag: 'order-1' });
    expect(r.sent).toBe(2);
    expect(sent.map((s) => s.endpoint)).toEqual(['https://a/1', 'https://a/2']);
    expect(sent[0].payload).toMatchObject({ title: 'नया ऑर्डर', body: 'Jhumka × 2', url: '/seller/orders/1', tag: 'order-1' });
  });

  it('forgets a device the push service says is gone (404/410), keeps the rest', async () => {
    push.transport.send = vi.fn(async (s) => {
      if (s.endpoint.endsWith('/1')) { const e = new Error('gone'); e.statusCode = 410; throw e; }
      return { statusCode: 201 };
    });
    const r = await push.sendToUser('u1', { title: 'x', body: 'y', url: '/seller' });
    expect(r.sent).toBe(1);
    expect(r.pruned).toBe(1);
    expect(PushSubscription.deleteOne).toHaveBeenCalledWith({ _id: 'https://a/1' });
  });

  it('never throws - a push failure must not fail the order', async () => {
    push.transport.send = vi.fn(async () => { throw new Error('network down'); });
    await expect(push.sendToUser('u1', { title: 'x', body: 'y', url: '/seller' })).resolves.toMatchObject({ sent: 0 });
  });
});

describe('notifySeller pushes beside the mail', () => {
  const Order = require('../models/Order');
  const User = require('../models/User');
  const notify = require('../utils/notifySeller');
  const Notification = require('../models/Notification');
  const originals = { orderFindById: Order.findById, userFindById: User.findById, find: PushSubscription.find, updateOne: PushSubscription.updateOne, nUpsert: Notification.findOneAndUpdate, nCreate: Notification.create };
  let sent;
  beforeEach(() => {
    sent = [];
    process.env.VAPID_PUBLIC_KEY = 'pub';
    process.env.VAPID_PRIVATE_KEY = 'priv';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
    push.transport.send = vi.fn(async (s, payload) => { sent.push({ to: s.userId, ...JSON.parse(payload) }); return { statusCode: 201 }; });
    PushSubscription.find = vi.fn(({ userId }) => ({ lean: async () => [sub(`https://a/${userId}`, { userId })] }));
    PushSubscription.updateOne = vi.fn(async () => ({}));
    // no email on file → the mail is skipped, the push must still go
    User.findById = vi.fn(() => ({ select: () => ({ lean: async () => null }) }));
    Notification.findOneAndUpdate = vi.fn(async () => ({ _id: 'n' }));
    Notification.create = vi.fn(async (d) => d);
    const order = {
      _id: 'o1', orderNumber: 'SMP-1', paymentMethod: 'cod', customerId: { name: 'Priya' },
      items: [{ sellerId: 's1', name: 'Jhumka', quantity: 2 }, { sellerId: 's2', name: 'Kurta', quantity: 1 }],
      fulfilments: [{ sellerId: 's1', disputeStatus: 'open', disputeReason: 'Broken' }],
    };
    Order.findById = vi.fn(() => {
      const leaf = { catch: async () => order };
      return { populate: () => ({ lean: () => leaf }), lean: () => leaf };
    });
  });
  afterEach(() => {
    Order.findById = originals.orderFindById;
    User.findById = originals.userFindById;
    PushSubscription.find = originals.find;
    PushSubscription.updateOne = originals.updateOne;
    Notification.findOneAndUpdate = originals.nUpsert;
    Notification.create = originals.nCreate;
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT;
  });

  it('new order: one push per seller, their own lines only, deep link to the order', async () => {
    await notify.newOrder('o1');
    expect(sent).toHaveLength(2);
    const s1 = sent.find((x) => x.to === 's1');
    expect(s1.title).toMatch(/New order/);
    expect(s1.body).toContain('Jhumka × 2');
    expect(s1.body).not.toContain('Kurta');
    expect(s1.body).toContain('COD');
    expect(s1.url).toBe('/seller/orders/o1');
    expect(s1.tag).toBe('order-o1');
  });

  it('dispute: pushes only the seller whose fulfilment is disputed, with the 72-hour title', async () => {
    await notify.disputeOpened('o1');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 's1', tag: 'dispute-o1-s1' });
    expect(sent[0].title).toMatch(/72/);
    expect(sent[0].body).toContain('Broken');
  });
});
