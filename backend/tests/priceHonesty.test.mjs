/**
 * Prices that cannot lie.
 *
 * WHY THE MODEL REFUSES RATHER THAN WARNS
 *   MRP is the legal maximum, not a number to anchor against. Selling above it
 *   is an offence under s.36 of the Legal Metrology Act - RS 25,000 rising to
 *   RS 1,00,000, plus up to a year - and inflating it so a "70% off" looks
 *   bigger is the practice the CCPA's 2023 dark-pattern guidelines exist to
 *   stop. They fined FirstCry RS 2 lakh in September 2025 for a milder version.
 *
 *   On a marketplace the platform carries that, not the seller who typed the
 *   number. So the impossible combinations are refused where no controller can
 *   forget to check.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const Product = require('../models/Product');

/**
 * validate(), not validateSync(): the price rules live in a pre('validate')
 * hook, and the synchronous path skips those entirely. A test using
 * validateSync would pass while the guard never ran.
 */
const base = async (over = {}) => {
  const p = new Product({
    name: 'Kundan Choker',
    description: 'A hand-finished kundan choker in gold tone.',
    price: 1000,
    stock: 5,
    sellerId: new mongoose.Types.ObjectId(),
    category: new mongoose.Types.ObjectId(),
    ...over,
  });

  try {
    await p.validate();
    return null;
  } catch (err) {
    return err;
  }
};

const messageOf = (err) => {
  if (!err) return null;
  // A hook failure arrives as the error itself; a field rule sits inside
  // err.errors. Accept either, so the test asserts on meaning not on shape.
  return err.message || Object.values(err.errors || {})[0]?.message || '';
};

describe('MRP as a legal maximum', () => {
  it('accepts a price below the MRP', async () => {
    expect(await base({ price: 900, mrp: 1000 })).toBeNull();
  });

  it('accepts a price exactly at the MRP', async () => {
    expect(await base({ price: 1000, mrp: 1000 })).toBeNull();
  });

  /**
   * The offence. Nothing downstream would have questioned it.
   */
  it('refuses a price above the MRP', async () => {
    const err = await base({ price: 1200, mrp: 1000 });
    expect(messageOf(err)).toMatch(/cannot be above the MRP/i);
  });

  it('says WHY, because "invalid" teaches a seller nothing', async () => {
    const err = await base({ price: 1200, mrp: 1000 });
    expect(messageOf(err)).toMatch(/legal maximum/i);
  });

  it('leaves a product with no MRP alone', async () => {
    expect(await base({ price: 1200 })).toBeNull();
  });
});

describe('a sale price that means something', () => {
  it('accepts one below the normal price', async () => {
    expect(await base({ price: 1000, salePrice: 800 })).toBeNull();
  });

  /**
   * A "sale price" at or above the normal price is the anchor trick with the
   * fields swapped round.
   */
  it('refuses one that is not actually lower', async () => {
    expect(messageOf(await base({ price: 1000, salePrice: 1000 }))).toMatch(
      /lower than the normal price/i
    );
    expect(messageOf(await base({ price: 1000, salePrice: 1200 }))).toMatch(
      /lower than the normal price/i
    );
  });

  it('refuses a window that ends before it starts', async () => {
    const err = await base({
      price: 1000,
      salePrice: 800,
      saleStartsAt: new Date('2026-10-01'),
      saleEndsAt: new Date('2026-09-01'),
    });

    expect(messageOf(err)).toMatch(/end after it starts/i);
  });

  it('allows a sale with no end date, since some are open-ended', async () => {
    expect(
      await base({ price: 1000, salePrice: 800, saleStartsAt: new Date('2026-09-01') })
    ).toBeNull();
  });

  /**
   * All three together is the real shape: MRP 1500 printed on the pack, normally
   * sold at 1000, on offer at 800.
   */
  it('accepts MRP, price and sale price stacked correctly', async () => {
    expect(await base({ mrp: 1500, price: 1000, salePrice: 800 })).toBeNull();
  });
});
