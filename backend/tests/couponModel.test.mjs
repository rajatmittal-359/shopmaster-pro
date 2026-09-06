/**
 * A coupon document that can actually be saved.
 *
 * WHY THIS EXISTS
 *   The validation rules were written as a pre('validate') hook taking `next`.
 *   Mongoose gives async middleware no `next`, so EVERY save threw "next is not
 *   a function" - and nothing caught it, because the other coupon tests pass
 *   plain objects to the evaluator and never construct a document.
 *
 *   The identical mistake had already been made on Product an hour earlier.
 *   Twice is a pattern, so this constructs the real thing.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Coupon = require('../models/Coupon');

const build = async (over = {}) => {
  const c = new Coupon({
    code: 'FESTIVE20',
    type: 'percent',
    value: 20,
    fundedBy: 'platform',
    ...over,
  });
  try {
    await c.validate();
    return null;
  } catch (err) {
    return err.message || Object.values(err.errors || {})[0]?.message || '';
  }
};

describe('a coupon that saves at all', () => {
  it('accepts an ordinary platform coupon', async () => {
    expect(await build()).toBeNull();
  });

  it('accepts a seller coupon that names its seller', async () => {
    expect(
      await build({ fundedBy: 'seller', sellerId: new mongoose.Types.ObjectId() })
    ).toBeNull();
  });

  it('uppercases the code, because nobody types it the way it was written', async () => {
    const c = new Coupon({ code: 'festive20', type: 'flat', value: 100, fundedBy: 'platform' });
    await c.validate();
    expect(c.code).toBe('FESTIVE20');
  });
});

describe('what it refuses', () => {
  /**
   * A seller-funded coupon with no seller would discount everybody's lines and
   * charge it to nobody.
   */
  it('a seller-funded coupon with no seller', async () => {
    expect(await build({ fundedBy: 'seller' })).toMatch(/belong to a seller/i);
  });

  it('a percentage over 100', async () => {
    expect(await build({ value: 120 })).toMatch(/more than 100/i);
  });

  it('a window that ends before it starts', async () => {
    const msg = await build({
      validFrom: new Date('2026-10-01'),
      validUntil: new Date('2026-09-01'),
    });
    expect(msg).toMatch(/after the start date/i);
  });

  it('a code with spaces or symbols, which nobody can type reliably', async () => {
    expect(await build({ code: 'FESTIVE 20!' })).toBeTruthy();
  });

  it('a negative discount', async () => {
    expect(await build({ value: -10 })).toBeTruthy();
  });
});
