/**
 * Inventory reservation for prepaid checkout.
 *
 * THE INVARIANT UNDER TEST
 *
 *     available = stock - reserved
 *
 *   reserve : reserved += qty            (stock untouched)
 *   sale    : stock -= qty, reserved -= qty
 *   release : reserved -= qty            (stock untouched)
 *
 * so `stock` falls exactly once per unit sold and a double-decrement is not
 * expressible.
 *
 * These run against an in-memory double whose conditional updates are atomic in
 * one synchronous step, the way MongoDB applies them to a single document. A
 * read-then-write implementation interleaves at its `await` and loses these
 * tests; a single conditional update does not. See helpers/inMemoryStore.mjs
 * for why that is a meaningful test and what it assumes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

import { InMemoryCollection, attach } from './helpers/inMemoryStore.mjs';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const Product = require('../models/Product');
const Order = require('../models/Order');
const {
  reserveForItems,
  releaseReservation,
  releaseExpiredForProduct,
  holdsInventory,
  RESERVATION_WINDOW_MS,
} = require('../utils/reservation');

const RING = new mongoose.Types.ObjectId();
const BANGLE = new mongoose.Types.ObjectId();
const SELLER = new mongoose.Types.ObjectId();

let products;
let orders;
let detach;

const productDoc = (id, name, stock) => ({
  _id: id,
  name,
  stock,
  reserved: 0,
  isActive: true,
  sellerId: SELLER,
});

const heldOrder = (id, lines, expiresAt) => ({
  _id: id,
  customerId: new mongoose.Types.ObjectId(),
  items: lines.map((l) => ({
    productId: l.productId,
    sellerId: SELLER,
    name: l.name,
    quantity: l.quantity,
    price: 1000,
    status: 'active',
  })),
  paymentMethod: 'razorpay',
  paymentStatus: 'pending',
  reservationStatus: 'held',
  reservationExpiresAt: expiresAt || new Date(Date.now() + RESERVATION_WINDOW_MS),
});

const state = (id) => {
  const p = products.raw(id);
  return { stock: p.stock, reserved: p.reserved, available: p.stock - p.reserved };
};

const line = (productId, quantity, name) => ({ productId, quantity, name });

beforeEach(() => {
  products = new InMemoryCollection([
    productDoc(RING, 'Last Unit Ring', 1),
    productDoc(BANGLE, 'Bangle Set', 5),
  ]);
  orders = new InMemoryCollection([]);

  const detachProduct = attach(Product, products, [
    'findById',
    'findOne',
    'find',
    'findOneAndUpdate',
    'updateOne',
  ]);
  const detachOrder = attach(Order, orders, ['findById', 'findOne', 'find', 'updateOne', 'create']);
  detach = () => {
    detachProduct();
    detachOrder();
  };
});

afterEach(() => detach());

// ---------------------------------------------------- 1. last-unit contention
describe('the last unit cannot be held twice', () => {
  it('a hold raises reserved and leaves stock alone', async () => {
    const result = await reserveForItems([line(RING, 1, 'Last Unit Ring')]);

    expect(result.ok).toBe(true);
    expect(state(RING)).toEqual({ stock: 1, reserved: 1, available: 0 });
  });

  it('a second customer is refused the same final unit', async () => {
    const first = await reserveForItems([line(RING, 1, 'Last Unit Ring')]);
    const second = await reserveForItems([line(RING, 1, 'Last Unit Ring')]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.shortfall.available).toBe(0);
    expect(state(RING)).toEqual({ stock: 1, reserved: 1, available: 0 });
  });

  it('exactly one of ten simultaneous attempts wins', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveForItems([line(RING, 1, 'Last Unit Ring')]))
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(state(RING)).toEqual({ stock: 1, reserved: 1, available: 0 });
  });

  it('concurrent holds on a stock of five never exceed five', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => reserveForItems([line(BANGLE, 1, 'Bangle Set')]))
    );

    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(state(BANGLE)).toEqual({ stock: 5, reserved: 5, available: 0 });
  });
});

// ------------------------------------------------- 2. all-or-nothing baskets
describe('a basket is held all or nothing', () => {
  it('holds every line when all are available', async () => {
    const result = await reserveForItems([
      line(RING, 1, 'Last Unit Ring'),
      line(BANGLE, 2, 'Bangle Set'),
    ]);

    expect(result.ok).toBe(true);
    expect(state(RING).reserved).toBe(1);
    expect(state(BANGLE).reserved).toBe(2);
  });

  it('hands back earlier lines when a later one cannot be held', async () => {
    await reserveForItems([line(RING, 1, 'Last Unit Ring')]); // take the ring first

    const result = await reserveForItems([
      line(BANGLE, 2, 'Bangle Set'), // would succeed
      line(RING, 1, 'Last Unit Ring'), // cannot
    ]);

    expect(result.ok).toBe(false);
    // A refused basket must leave nothing behind.
    expect(state(BANGLE)).toEqual({ stock: 5, reserved: 0, available: 5 });
  });

  it('names the line that could not be held', async () => {
    await reserveForItems([line(RING, 1, 'Last Unit Ring')]);

    const result = await reserveForItems([
      line(BANGLE, 1, 'Bangle Set'),
      line(RING, 1, 'Last Unit Ring'),
    ]);

    expect(result.shortfall.name).toBe('Last Unit Ring');
    expect(result.shortfall.requested).toBe(1);
  });
});

// ------------------------------------------ 3. quantity beyond availability
describe('asking for more than exists fails before any payment', () => {
  it('refuses a quantity above stock', async () => {
    const result = await reserveForItems([line(BANGLE, 6, 'Bangle Set')]);

    expect(result.ok).toBe(false);
    expect(result.shortfall.requested).toBe(6);
    expect(result.shortfall.available).toBe(5);
    expect(state(BANGLE).reserved).toBe(0);
  });

  it('counts existing holds against the request', async () => {
    await reserveForItems([line(BANGLE, 4, 'Bangle Set')]);

    const result = await reserveForItems([line(BANGLE, 2, 'Bangle Set')]);

    expect(result.ok).toBe(false);
    expect(result.shortfall.available).toBe(1);
  });

  it('an inactive product cannot be held at all', async () => {
    products.raw(RING).isActive = false;

    const result = await reserveForItems([line(RING, 1, 'Last Unit Ring')]);

    expect(result.ok).toBe(false);
    expect(state(RING).reserved).toBe(0);
  });
});

// ------------------------------------------------------------- 4. releasing
describe('a released hold goes back on sale', () => {
  const takeAndRecord = async (id) => {
    await reserveForItems([line(RING, 1, 'Last Unit Ring')]);
    const order = heldOrder(id, [{ productId: RING, quantity: 1, name: 'Last Unit Ring' }]);
    await orders.create(order);
    return order;
  };

  it('lowers reserved and never touches stock', async () => {
    const order = await takeAndRecord(new mongoose.Types.ObjectId());

    expect(await releaseReservation(order)).toBe(true);
    expect(state(RING)).toEqual({ stock: 1, reserved: 0, available: 1 });
  });

  it('lets the next customer take the freed unit', async () => {
    const order = await takeAndRecord(new mongoose.Types.ObjectId());
    await releaseReservation(order);

    expect((await reserveForItems([line(RING, 1, 'Last Unit Ring')])).ok).toBe(true);
  });

  it('cannot be released twice', async () => {
    const id = new mongoose.Types.ObjectId();
    const order = await takeAndRecord(id);

    const first = await releaseReservation(order);
    const second = await releaseReservation({ ...order, reservationStatus: 'held' });

    expect(first).toBe(true);
    // The second caller is refused by the compare-and-set, so the unit is not
    // handed back twice and reserved cannot go negative.
    expect(second).toBe(false);
    expect(state(RING)).toEqual({ stock: 1, reserved: 0, available: 1 });
  });

  it('only one of three concurrent releases performs the work', async () => {
    const id = new mongoose.Types.ObjectId();
    await reserveForItems([line(BANGLE, 3, 'Bangle Set')]);
    const order = heldOrder(id, [{ productId: BANGLE, quantity: 3, name: 'Bangle Set' }]);
    await orders.create(order);

    const results = await Promise.all([
      releaseReservation({ ...order, reservationStatus: 'held' }),
      releaseReservation({ ...order, reservationStatus: 'held' }),
      releaseReservation({ ...order, reservationStatus: 'held' }),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(state(BANGLE)).toEqual({ stock: 5, reserved: 0, available: 5 });
  });

  it('refuses to release an order that already became a sale', async () => {
    const order = heldOrder(new mongoose.Types.ObjectId(), [
      { productId: RING, quantity: 1, name: 'Last Unit Ring' },
    ]);
    order.reservationStatus = 'consumed';
    await orders.create(order);

    expect(await releaseReservation(order)).toBe(false);
  });

  it('skips cancelled lines when handing units back', async () => {
    await reserveForItems([line(BANGLE, 2, 'Bangle Set')]);
    const order = heldOrder(new mongoose.Types.ObjectId(), [
      { productId: BANGLE, quantity: 2, name: 'Bangle Set' },
    ]);
    order.items[0].status = 'cancelled';
    await orders.create(order);

    await releaseReservation(order);

    // A cancelled line released its units when it was cancelled; releasing it
    // again here would free stock that is not held.
    expect(state(BANGLE).reserved).toBe(2);
  });
});

// -------------------------------------------------------------- 5. expiry
describe('an abandoned checkout stops blocking stock', () => {
  it('an expired hold is swept when someone else wants the unit', async () => {
    await reserveForItems([line(RING, 1, 'Last Unit Ring')]);
    await orders.create(
      heldOrder(
        new mongoose.Types.ObjectId(),
        [{ productId: RING, quantity: 1, name: 'Last Unit Ring' }],
        new Date(Date.now() - 1000)
      )
    );

    expect(state(RING).available).toBe(0);

    const next = await reserveForItems([line(RING, 1, 'Last Unit Ring')]);

    expect(next.ok).toBe(true);
    expect(state(RING)).toEqual({ stock: 1, reserved: 1, available: 0 });
  });

  it('a hold still inside its window is NOT swept', async () => {
    await reserveForItems([line(RING, 1, 'Last Unit Ring')]);
    await orders.create(
      heldOrder(new mongoose.Types.ObjectId(), [
        { productId: RING, quantity: 1, name: 'Last Unit Ring' },
      ])
    );

    expect((await reserveForItems([line(RING, 1, 'Last Unit Ring')])).ok).toBe(false);
  });

  it('marks a swept order released rather than leaving it held', async () => {
    await reserveForItems([line(RING, 1, 'Last Unit Ring')]);
    const id = new mongoose.Types.ObjectId();
    await orders.create(
      heldOrder(id, [{ productId: RING, quantity: 1, name: 'Last Unit Ring' }], new Date(Date.now() - 1000))
    );

    const released = await releaseExpiredForProduct(RING);

    expect(released).toBe(1);
    expect(orders.raw(id).reservationStatus).toBe('released');
    expect(orders.raw(id).reservationExpiresAt).toBeNull();
  });

  it('sweeps only orders touching the product being reserved', async () => {
    await reserveForItems([line(RING, 1, 'Last Unit Ring'), line(BANGLE, 1, 'Bangle Set')]);
    const bangleOrderId = new mongoose.Types.ObjectId();
    await orders.create(
      heldOrder(
        bangleOrderId,
        [{ productId: BANGLE, quantity: 1, name: 'Bangle Set' }],
        new Date(Date.now() - 1000)
      )
    );

    await releaseExpiredForProduct(RING);

    // The bangle's stale hold is not this product's business.
    expect(orders.raw(bangleOrderId).reservationStatus).toBe('held');
  });
});

// ------------------------------------------------------- 6. the invariant
describe('the invariant survives every path', () => {
  it('hold then release leaves the product exactly as it began', async () => {
    const before = state(BANGLE);

    await reserveForItems([line(BANGLE, 2, 'Bangle Set')]);
    const order = heldOrder(new mongoose.Types.ObjectId(), [
      { productId: BANGLE, quantity: 2, name: 'Bangle Set' },
    ]);
    await orders.create(order);
    await releaseReservation(order);

    expect(state(BANGLE)).toEqual(before);
  });

  it('a hold alone never changes sellable stock', async () => {
    await reserveForItems([line(BANGLE, 3, 'Bangle Set')]);

    // stock is the physical count; only a sale may move it.
    expect(state(BANGLE).stock).toBe(5);
    expect(state(BANGLE).available).toBe(2);
  });

  it('reports whether an order is holding inventory', () => {
    expect(holdsInventory({ reservationStatus: 'held' })).toBe(true);
    expect(holdsInventory({ reservationStatus: 'consumed' })).toBe(false);
    expect(holdsInventory({ reservationStatus: 'released' })).toBe(false);
    expect(holdsInventory({ reservationStatus: 'none' })).toBe(false);
    expect(holdsInventory(null)).toBe(false);
  });
});
