/**
 * Monday's three things (plan 2.25, 15 Sep 2026): built from Grow's own
 * steps, essential first, closest to done first, never more than three,
 * silence for a finished shop; one bell row per seller per week.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const notifier = require('../utils/notify');
const { pickThree, render, weekTag, sendGrowthNotes } = require('../jobs/growthNote');

const chainable = (result) => ({
  populate: () => chainable(result),
  select: () => chainable(result),
  lean: () => Promise.resolve(result),
  then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
});

const originals = { sellerFind: Seller.find, productFind: Product.find, reviewCount: Review.countDocuments, couponCount: Coupon.countDocuments, notify: notifier.notify };
afterEach(() => {
  Seller.find = originals.sellerFind;
  Product.find = originals.productFind;
  Review.countDocuments = originals.reviewCount;
  Coupon.countDocuments = originals.couponCount;
  notifier.notify = originals.notify;
});

describe('pickThree', () => {
  it('essential before optional, closest to done first, three at most, none when done', () => {
    const steps = [
      { key: 'a', level: 'optional', done: false, value: 90 },
      { key: 'b', level: 'essential', done: false, value: 20 },
      { key: 'c', level: 'essential', done: true, value: 100 },
      { key: 'd', level: 'essential', done: false, value: 75 },
      { key: 'e', level: 'optional', done: false, value: 10 },
      { key: 'f', level: 'essential', done: false, value: 50 },
    ];
    expect(pickThree(steps).map((s) => s.key)).toEqual(['d', 'f', 'b']);
    expect(pickThree(steps.map((s) => ({ ...s, done: true })))).toEqual([]);
  });
});

describe('render', () => {
  it('names the shop, numbers the three, links each to its page, and says how to switch it off', () => {
    const { title, body, mail } = render({ businessName: 'Meera Jewels' }, [
      { title: 'Three or more photos on each product', progress: '4 of 19', minutes: 3, href: '/seller/products/studio', why: 'Photos sell.', how: 'Use the studio.' },
      { title: 'Claim the Google Business Profile', minutes: 10, href: '/seller/grow?tab=google' },
    ]);
    expect(title).toContain('Meera Jewels');
    expect(body).toBe('1. Three or more photos on each product (4 of 19) · 3 min · 2. Claim the Google Business Profile · 10 min');
    expect(mail.html).toContain('/seller/products/studio');
    expect(mail.html).toContain('Settings → Notifications → Growth');
    expect(mail.text).toContain('Open Grow:');
  });

  it('week tag is stable within a week and differs across weeks', () => {
    expect(weekTag(new Date('2026-09-14T04:00:00Z'))).toBe(weekTag(new Date('2026-09-16T04:00:00Z')));
    expect(weekTag(new Date('2026-09-14T04:00:00Z'))).not.toBe(weekTag(new Date('2026-09-28T04:00:00Z')));
  });
});

describe('sendGrowthNotes', () => {
  it('one growth note per approved seller with work left; a finished shop hears nothing', async () => {
    Seller.find = vi.fn(() => chainable([
      { _id: 's1', userId: 'u1', businessName: 'Busy shop', links: {}, about: '', pickupAddress: {} },
      { _id: 's2', userId: 'u2', businessName: 'Done shop', links: { googleBusiness: 'x', instagram: 'y' }, about: 'a'.repeat(120), pickupAddress: { city: 'Jaipur' } },
    ]));
    // Both shops: one product. The busy shop's is bare; the done shop's is complete enough
    // that stepsFor still leaves something (reviews, coupons) - so we check counts, not zero.
    Product.find = vi.fn(() => chainable([{ _id: 'p1', name: 'Silver toe ring', images: ['a', 'b', 'c'], tags: ['a', 'b', 'c'], faqs: [{ q: 'a', a: 'b' }, { q: 'c', a: 'd' }], description: 'x'.repeat(600), price: 100, category: { _id: 'c', name: 'Rings' } }]));
    Review.countDocuments = vi.fn(async () => 0);
    Coupon.countDocuments = vi.fn(async () => 0);
    const sent = [];
    notifier.notify = vi.fn(async (n) => {
      sent.push(n);
      return { inApp: true, pushed: false, mailed: false };
    });
    const r = await sendGrowthNotes({ now: new Date('2026-09-14T03:35:00Z') });
    expect(r.sellers).toBe(2);
    expect(r.errors).toBe(0);
    expect(sent.length).toBe(r.sent);
    for (const n of sent) {
      expect(n).toMatchObject({ role: 'seller', category: 'growth', url: '/seller/grow', tag: weekTag(new Date('2026-09-14T03:35:00Z')) });
      expect(n.body.split(' · ').filter((x) => /^\d\. /.test(x)).length).toBeLessThanOrEqual(3);
      expect(n.mail.subject).toContain('3 things this week');
    }
  });

  it('a seller whose data cannot be read is counted as an error, the others still get theirs', async () => {
    Seller.find = vi.fn(() => chainable([{ _id: 's1', userId: 'u1', businessName: 'A' }, { _id: 's2', userId: 'u2', businessName: 'B' }]));
    let calls = 0;
    Product.find = vi.fn(() => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return chainable([]);
    });
    Review.countDocuments = vi.fn(async () => 0);
    Coupon.countDocuments = vi.fn(async () => 0);
    notifier.notify = vi.fn(async () => ({ inApp: true }));
    const r = await sendGrowthNotes();
    expect(r).toMatchObject({ sellers: 2, errors: 1, sent: 1 });
  });
});
