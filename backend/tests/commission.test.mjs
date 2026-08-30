/**
 * Platform commission.
 *
 * The money split is the business model, so the rules that protect it are
 * tested directly:
 *
 *   1. the two halves always add back up to the line total (no rounding leak)
 *   2. the platform's own shop is charged nothing
 *   3. a missing seller profile falls back to the platform rate, never to zero
 *   4. the rate is SNAPSHOTTED on the order and does not follow later changes
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const Seller = require('../models/Seller');
const Order = require('../models/Order');
const {
  splitLine,
  applyCommission,
  getRatesBySeller,
  DEFAULT_COMMISSION_RATE,
} = require('../utils/commission');

const HOUSE = new mongoose.Types.ObjectId(); // own shop, 0%
const PARTNER = new mongoose.Types.ObjectId(); // marketplace tenant
const NEGOTIATED = new mongoose.Types.ObjectId(); // individually agreed rate
const ORPHAN = new mongoose.Types.ObjectId(); // seller with no profile row

let originalSellerFind;

beforeEach(() => {
  originalSellerFind = Seller.find;
  Seller.find = vi.fn(() =>
    chainableQuery([
      { userId: HOUSE, commissionRate: 0 },
      { userId: PARTNER, commissionRate: 8 },
      { userId: NEGOTIATED, commissionRate: 6 },
      // ORPHAN is deliberately absent.
    ])
  );
});

afterEach(() => {
  Seller.find = originalSellerFind;
});

describe('a line always splits without losing money', () => {
  // Prices chosen so the percentage does not divide cleanly.
  const awkward = [
    [1600, 2, 8],
    [2450, 1, 7.5],
    [999, 3, 6],
    [333, 7, 8],
    [1, 1, 8],
    [12500, 1, 8],
    [449, 11, 6],
    // These are the cases that actually separate "subtract the commission"
    // from "recompute the remainder": at 7.5% the two disagree by a paisa and
    // the halves stop adding up to the line total.
    [3, 1, 7.5],
    [7, 1, 7.5],
    [11, 1, 7.5],
    [13, 1, 7.5],
  ];

  it.each(awkward)(
    'price %i x %i at %i%% reconciles exactly',
    (price, quantity, rate) => {
      const { commissionAmount, sellerEarning } = splitLine(price, quantity, rate);
      const lineTotal = Math.round(price * quantity * 100) / 100;

      expect(Math.round((commissionAmount + sellerEarning) * 100) / 100).toBe(lineTotal);
      expect(commissionAmount).toBeGreaterThanOrEqual(0);
      expect(sellerEarning).toBeGreaterThanOrEqual(0);
    }
  );

  it('charges the own shop nothing and leaves the full amount with it', () => {
    const { commissionRate, commissionAmount, sellerEarning } = splitLine(1600, 2, 0);
    expect(commissionRate).toBe(0);
    expect(commissionAmount).toBe(0);
    expect(sellerEarning).toBe(3200);
  });

  it('never lets a nonsense rate take more than the line is worth', () => {
    for (const rate of [-5, NaN, undefined, 1000]) {
      const { commissionAmount, sellerEarning } = splitLine(500, 1, rate);
      expect(commissionAmount).toBeLessThanOrEqual(500);
      expect(sellerEarning).toBeGreaterThanOrEqual(0);
      expect(Math.round((commissionAmount + sellerEarning) * 100) / 100).toBe(500);
    }
  });
});

describe('rates are read per seller', () => {
  it('gives each seller their own rate in one lookup', async () => {
    const rates = await getRatesBySeller([HOUSE, PARTNER, NEGOTIATED]);

    expect(rates.get(String(HOUSE))).toBe(0);
    expect(rates.get(String(PARTNER))).toBe(8);
    expect(rates.get(String(NEGOTIATED))).toBe(6);
    // One query regardless of how many sellers are in the basket.
    expect(Seller.find).toHaveBeenCalledTimes(1);
  });

  it('falls back to the platform rate when a seller has no profile', async () => {
    const rates = await getRatesBySeller([ORPHAN]);

    // Falling back to 0 would silently hand the platform's cut away.
    expect(rates.get(String(ORPHAN))).toBe(DEFAULT_COMMISSION_RATE);
    expect(rates.get(String(ORPHAN))).toBeGreaterThan(0);
  });
});

describe('a mixed basket is split per seller, not per order', () => {
  it('applies each line its own seller rate', async () => {
    const items = await applyCommission([
      { sellerId: HOUSE, name: 'Ring', price: 1600, quantity: 2 },
      { sellerId: PARTNER, name: 'Saree', price: 5400, quantity: 1 },
      { sellerId: NEGOTIATED, name: 'Earbuds', price: 1999, quantity: 1 },
    ]);

    expect(items[0].commissionRate).toBe(0);
    expect(items[0].commissionAmount).toBe(0);

    expect(items[1].commissionRate).toBe(8);
    expect(items[1].commissionAmount).toBe(432);

    expect(items[2].commissionRate).toBe(6);
    expect(items[2].commissionAmount).toBeCloseTo(119.94, 2);

    const gross = items.reduce((n, i) => n + i.price * i.quantity, 0);
    const platform = items.reduce((n, i) => n + i.commissionAmount, 0);
    const sellers = items.reduce((n, i) => n + i.sellerEarning, 0);
    expect(Math.round((platform + sellers) * 100) / 100).toBe(gross);
  });

  it('does not mutate the caller\'s items', async () => {
    const input = [{ sellerId: PARTNER, name: 'Saree', price: 5400, quantity: 1 }];
    await applyCommission(input);

    expect(input[0].commissionAmount).toBeUndefined();
    expect(input[0].sellerEarning).toBeUndefined();
  });
});

describe('the snapshot does not follow a later rate change', () => {
  it('keeps what the seller was owed when the order was placed', async () => {
    const items = await applyCommission([
      { sellerId: PARTNER, name: 'Saree', price: 5400, quantity: 1 },
    ]);

    const order = new Order({
      customerId: new mongoose.Types.ObjectId(),
      shippingAddressId: new mongoose.Types.ObjectId(),
      items: items.map((i) => ({ ...i, productId: new mongoose.Types.ObjectId() })),
      totalAmount: 5500,
      paymentMethod: 'cod',
    });
    await order.validate();

    expect(order.items[0].commissionRate).toBe(8);
    expect(order.items[0].commissionAmount).toBe(432);
    expect(order.items[0].sellerEarning).toBe(4968);

    // The platform doubles its rate tomorrow.
    Seller.find = vi.fn(() => chainableQuery([{ userId: PARTNER, commissionRate: 16 }]));

    // A NEW order gets the new rate...
    const fresh = await applyCommission([
      { sellerId: PARTNER, name: 'Saree', price: 5400, quantity: 1 },
    ]);
    expect(fresh[0].commissionRate).toBe(16);

    // ...but the order already placed is untouched.
    expect(order.items[0].commissionRate).toBe(8);
    expect(order.items[0].sellerEarning).toBe(4968);
  });
});

describe('every order gets a readable reference', () => {
  const build = async () => {
    const order = new Order({
      customerId: new mongoose.Types.ObjectId(),
      shippingAddressId: new mongoose.Types.ObjectId(),
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          sellerId: PARTNER,
          name: 'Saree',
          quantity: 1,
          price: 5400,
        },
      ],
      totalAmount: 5500,
      paymentMethod: 'cod',
    });
    await order.validate();
    return order;
  };

  it('is human readable and dated', async () => {
    const order = await build();
    expect(order.orderNumber).toMatch(/^SMP-\d{6}-[0-9A-F]{6}$/);
  });

  it('is unique across orders', async () => {
    const numbers = new Set();
    for (let i = 0; i < 25; i++) numbers.add((await build()).orderNumber);
    expect(numbers.size).toBe(25);
  });

  it('starts with no delivery date, so a return window cannot be faked', async () => {
    const order = await build();
    expect(order.deliveredAt).toBeNull();
  });
});
