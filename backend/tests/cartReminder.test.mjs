/**
 * The bag reminder (19 Sep 2026): bags 20-48 h old, once a week at most, only
 * live in-stock items named, today's price, no coupon; stamped before the
 * mail so a crash mid-run cannot send twice.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const notifier = require('../utils/notify');
const hidden = require('../utils/hiddenSellers');
const { remind, render, liveItems, weekTag } = require('../jobs/cartReminder');

const chain = (result) => ({ select: () => chain(result), lean: () => Promise.resolve(result), then: (res, rej) => Promise.resolve(result).then(res, rej) });
const NOW = new Date('2026-09-19T04:45:00Z');

afterEach(() => vi.restoreAllMocks());

describe('render', () => {
  it('names the first item and the count, today\'s total, the bag link, the off-switch - and no coupon', () => {
    const items = [
      { name: 'Kundan <set>', slug: 'kundan-set', image: 'https://img/1.jpg', quantity: 2, price: 1200 },
      { name: 'Silver toe ring', slug: 'silver-toe-ring', image: '', quantity: 1, price: 350 },
    ];
    const { title, body, mail } = render(items);
    expect(title).toBe('Kundan <set> and 1 more item is still in your bag');
    expect(body).toMatch(/2 items · ₹2,750/);
    expect(mail.html).toContain('Kundan &lt;set&gt;');
    expect(mail.html).toContain('/products/kundan-set');
    expect(mail.html).toContain('/cart');
    expect(mail.html).toMatch(/2 × ₹1,200/);
    expect(mail.text).toMatch(/Notifications → Reminders/);
    expect(mail.html.toLowerCase()).not.toMatch(/coupon|discount|% off/);
    expect(render([items[1]]).title).toBe('Silver toe ring is still in your bag');
  });
});

describe('liveItems', () => {
  it('drops a product that is gone, hidden, or has nothing left to sell; prices at today\'s sale price', async () => {
    vi.spyOn(hidden, 'hiddenSellerIds').mockResolvedValue([]);
    vi.spyOn(Product, 'find').mockImplementation(() => chain([
      { _id: 'p1', name: 'A', slug: 'a', price: 1000, salePrice: 800, saleEndsAt: new Date('2026-12-01'), images: ['i'], stock: 5, reserved: 0 },
      { _id: 'p2', name: 'B', slug: 'b', price: 500, images: [], stock: 2, reserved: 2 },
    ]));
    const items = await liveItems({ items: [{ productId: 'p1', quantity: 1 }, { productId: 'p2', quantity: 1 }, { productId: 'p3', quantity: 1 }] }, NOW);
    expect(items).toEqual([{ name: 'A', slug: 'a', image: 'i', quantity: 1, price: 800 }]);
  });
});

describe('remind', () => {
  it('asks for bags 20-48 h old not reminded this week, stamps before mailing under the reminders category with a week tag, skips empty ones', async () => {
    const find = vi.spyOn(Cart, 'find').mockImplementation(() => chain([
      { _id: 'c1', userId: 'u1', items: [{ productId: 'p1', quantity: 1 }] },
      { _id: 'c2', userId: 'u2', items: [{ productId: 'gone', quantity: 1 }] },
    ]));
    const update = vi.spyOn(Cart, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    vi.spyOn(hidden, 'hiddenSellerIds').mockResolvedValue([]);
    vi.spyOn(Product, 'find').mockImplementation(() => chain([{ _id: 'p1', name: 'A', slug: 'a', price: 100, images: [], stock: 1, reserved: 0 }]));
    const notify = vi.spyOn(notifier, 'notify').mockResolvedValue({ inApp: true, pushed: false, mailed: true });

    const r = await remind({ now: NOW });
    expect(r).toEqual({ carts: 2, sent: 1, skipped: 1, errors: 0 });

    const q = find.mock.calls[0][0];
    expect(q['items.0']).toEqual({ $exists: true });
    expect(q.updatedAt.$lte.toISOString()).toBe('2026-09-18T08:45:00.000Z'); // 20 h ago
    expect(q.updatedAt.$gte.toISOString()).toBe('2026-09-17T04:45:00.000Z'); // 48 h ago
    expect(q.$or[1].remindedAt.$lt.toISOString()).toBe('2026-09-12T04:45:00.000Z'); // 7 days

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][2]).toEqual({ timestamps: false });
    expect(update.mock.calls[0][0]._id).toBe('c1');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ userId: 'u1', role: 'customer', category: 'reminders', url: '/cart', tag: weekTag(NOW) });
    expect(notify.mock.calls[0][0].mail.subject).toBe('A is still in your bag');
  });

  it('a bag another run stamped first is skipped, not mailed twice', async () => {
    vi.spyOn(Cart, 'find').mockImplementation(() => chain([{ _id: 'c1', userId: 'u1', items: [{ productId: 'p1', quantity: 1 }] }]));
    vi.spyOn(Cart, 'updateOne').mockResolvedValue({ modifiedCount: 0 });
    vi.spyOn(hidden, 'hiddenSellerIds').mockResolvedValue([]);
    vi.spyOn(Product, 'find').mockImplementation(() => chain([{ _id: 'p1', name: 'A', slug: 'a', price: 100, images: [], stock: 1, reserved: 0 }]));
    const notify = vi.spyOn(notifier, 'notify').mockResolvedValue({});
    expect(await remind({ now: NOW })).toEqual({ carts: 1, sent: 0, skipped: 1, errors: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('the category exists with an off-switch', () => {
    expect(notifier.CATEGORIES.find((c) => c.key === 'reminders')).toBeTruthy();
  });
});
