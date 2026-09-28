/**
 * Removing a coupon.
 *
 * WHY THE TWO CASES (28 Sep 2026)
 *   An order records `couponCode` as TEXT, not a reference - a deliberate
 *   choice in models/Order, and the thing that makes a real delete safe
 *   here. So a coupon nobody ever used can simply go.
 *
 *   One that HAS been used is archived instead. The orders keep the code
 *   either way, but this row is the only record of what the code MEANT -
 *   the percentage, the cap, who made it. Throwing that away makes an old
 *   order unexplainable.
 *
 *   Archiving sets isActive false, and utils/applyCoupon refuses an
 *   inactive coupon, so an archived code cannot be redeemed again without
 *   any further guard. The last test pins that, because it is the only
 *   thing standing between "archived" and "still spendable".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Coupon = require('../models/Coupon.js');
const { removeCoupon } = require('../controllers/adminController.js');

const res = () => {
  const r = { code: 200, body: null };
  r.status = (c) => {
    r.code = c;
    return r;
  };
  r.json = (b) => {
    r.body = b;
    return r;
  };
  return r;
};

let original;
beforeEach(() => {
  original = Coupon.findOne;
});
afterEach(() => {
  Coupon.findOne = original;
});

describe('a coupon nobody ever used', () => {
  it('is deleted outright', async () => {
    const doc = { code: 'NEW10', usedCount: 0, deleteOne: vi.fn(async () => {}), save: vi.fn() };
    Coupon.findOne = vi.fn(async () => doc);

    const r = res();
    await removeCoupon({ _id: 'c1' }, r);

    expect(doc.deleteOne).toHaveBeenCalled();
    expect(doc.save).not.toHaveBeenCalled();
    expect(r.body.deleted).toBe(true);
  });
});

describe('a coupon that has been spent', () => {
  it('is archived, and can never be redeemed again', async () => {
    const doc = { code: 'DIWALI', usedCount: 7, isActive: true, deleteOne: vi.fn(), save: vi.fn(async () => {}) };
    Coupon.findOne = vi.fn(async () => doc);

    const r = res();
    await removeCoupon({ _id: 'c1' }, r);

    expect(doc.deleteOne).not.toHaveBeenCalled();
    expect(doc.archivedAt).toBeInstanceOf(Date);
    // utils/applyCoupon refuses an inactive coupon - this one line is what
    // makes an archived code unspendable.
    expect(doc.isActive).toBe(false);
    expect(r.body.archived).toBe(true);
    expect(r.body.message).toContain('7 times');
  });
});

describe('what the caller is allowed to touch', () => {
  it('passes the caller\'s own filter through, and never finds an archived one', async () => {
    Coupon.findOne = vi.fn(async () => ({ usedCount: 0, deleteOne: async () => {} }));
    await removeCoupon({ _id: 'c1', fundedBy: 'seller', sellerId: 's1' }, res());

    expect(Coupon.findOne).toHaveBeenCalledWith({ _id: 'c1', fundedBy: 'seller', sellerId: 's1', archivedAt: null });
  });

  it('answers 404 when the filter matches nothing - a seller reaching for another shop\'s coupon', async () => {
    Coupon.findOne = vi.fn(async () => null);
    const r = res();
    await removeCoupon({ _id: 'c1', sellerId: 'someone-else' }, r);
    expect(r.code).toBe(404);
  });
});
