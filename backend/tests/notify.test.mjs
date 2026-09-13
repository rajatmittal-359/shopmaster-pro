/**
 * The one notification dispatcher (plan 2.30): every event writes the
 * in-app row, and the person's own preferences decide whether it also
 * pushes to the phone or mails. No push service, no mail, no database.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const notify = require('../utils/notify');
const Notification = require('../models/Notification');
const User = require('../models/User');
const push = require('../utils/push');

describe('CATEGORIES', () => {
  it('names the Amazon-style categories a person can route per channel', () => {
    expect(notify.CATEGORIES.map((c) => c.key)).toEqual(['orders', 'returns', 'disputes', 'payouts', 'account', 'trust']);
    for (const c of notify.CATEGORIES) expect(c.label.length).toBeGreaterThan(2);
  });
  it('fills defaults: everything on, per channel', () => {
    const p = notify.prefsOf({});
    expect(p.push.orders).toBe(true);
    expect(p.email.disputes).toBe(true);
    const q = notify.prefsOf({ notificationPrefs: { push: { orders: false } } });
    expect(q.push.orders).toBe(false);
    expect(q.push.returns).toBe(true);
    expect(q.email.orders).toBe(true);
  });
});

describe('notify()', () => {
  const originals = { upsert: Notification.findOneAndUpdate, create: Notification.create, userFind: User.findById, send: push.sendToUser };
  let rows, pushes, mails;
  beforeEach(() => {
    rows = []; pushes = []; mails = [];
    Notification.findOneAndUpdate = vi.fn(async (filter, update) => { rows.push({ filter, update }); return { _id: 'n1' }; });
    Notification.create = vi.fn(async (doc) => { rows.push({ doc }); return { _id: 'n2', ...doc }; });
    User.findById = vi.fn(() => ({ select: () => ({ lean: async () => ({ _id: 'u1', email: 'x@y.z', notificationPrefs: { push: { returns: false }, email: { orders: false } } }) }) }));
    push.sendToUser = vi.fn(async (userId, note) => { pushes.push({ userId, ...note }); return { sent: 1 }; });
    notify.transport.mail = vi.fn(async (m) => { mails.push(m); });
  });
  afterEach(() => {
    Notification.findOneAndUpdate = originals.upsert;
    Notification.create = originals.create;
    User.findById = originals.userFind;
    push.sendToUser = originals.send;
  });

  it('always writes the in-app row, pushes when that category is on', async () => {
    const r = await notify.notify({ userId: 'u1', role: 'seller', category: 'orders', title: 'नया ऑर्डर', body: 'Jhumka × 2', url: '/seller/orders/o1', tag: 'order-o1' });
    expect(rows).toHaveLength(1);
    expect(rows[0].filter).toEqual({ userId: 'u1', tag: 'order-o1' });
    expect(rows[0].update.$set).toMatchObject({ role: 'seller', category: 'orders', title: 'नया ऑर्डर', url: '/seller/orders/o1', readAt: null });
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ userId: 'u1', title: 'नया ऑर्डर', url: '/seller/orders/o1', tag: 'order-o1' });
    expect(r.inApp).toBe(true);
    expect(r.pushed).toBe(true);
  });

  it('skips the push when the person turned that category off, row still written', async () => {
    const r = await notify.notify({ userId: 'u1', role: 'seller', category: 'returns', title: 'वापसी', body: 'x', url: '/seller/orders/o1' });
    expect(rows).toHaveLength(1);
    expect(pushes).toHaveLength(0);
    expect(r.pushed).toBe(false);
  });

  it('mails only when a mail is given and that category is on for email', async () => {
    await notify.notify({ userId: 'u1', role: 'customer', category: 'orders', title: 'Order confirmed', body: 'x', url: '/orders/o1', mail: { subject: 'Order confirmed', html: '<b>hi</b>', text: 'hi' } });
    expect(mails).toHaveLength(0); // email.orders is off for this person
    await notify.notify({ userId: 'u1', role: 'customer', category: 'disputes', title: 'Decided', body: 'x', url: '/orders/o1', mail: { subject: 'Decided', html: '<b>hi</b>', text: 'hi' } });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ toUserId: 'u1', subject: 'Decided' });
  });

  it('without a tag it appends a fresh row instead of upserting', async () => {
    await notify.notify({ userId: 'u1', role: 'admin', category: 'trust', title: 'Review held', body: 'x', url: '/admin/trust' });
    expect(Notification.create).toHaveBeenCalledTimes(1);
    expect(Notification.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses an unknown category and never throws on a broken store', async () => {
    await expect(notify.notify({ userId: 'u1', role: 'seller', category: 'weird', title: 't', body: 'b', url: '/' })).resolves.toMatchObject({ inApp: false, reason: expect.stringMatching(/category/) });
    Notification.create = vi.fn(async () => { throw new Error('db down'); });
    await expect(notify.notify({ userId: 'u1', role: 'seller', category: 'orders', title: 't', body: 'b', url: '/' })).resolves.toMatchObject({ inApp: false });
  });
});
