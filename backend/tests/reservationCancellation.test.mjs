/**
 * Undoing an order without inventing or destroying stock.
 *
 * The bug this locks down: cancelling a line on an UNPAID prepaid order used to
 * run `product.stock += quantity`. But an unpaid prepaid order never
 * decremented stock - it only held it. So the "restore" created units out of
 * nothing: a product with one unit became two after a single abandoned
 * checkout, and the audit trail recorded a `return` that never happened.
 *
 * Reproduced on a scratch database before the fix:
 *     stock before cancel: 1
 *     stock after cancel : 2
 *
 * The rule now is simply: give back only what was actually taken.
 *
 *   COD order            -> stock was decremented at creation  -> restock + log
 *   prepaid, paid        -> the hold became a sale             -> restock + log
 *   prepaid, still held  -> nothing was ever taken             -> release, no log
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery, fakeSession } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Order = require('../models/Order');
const User = require('../models/User');
const Product = require('../models/Product');
const InventoryLog = require('../models/Inventory');

const CUSTOMER = new mongoose.Types.ObjectId();
const ORDER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();
const ITEM_ID = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: String(CUSTOMER), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let orderDoc;
let stock;
let reserved;
let logs;
let productSaves;

/** Builds an order whose single line can be cancelled. */
const buildOrder = (overrides) => {
  const item = {
    _id: ITEM_ID,
    productId: PRODUCT_ID,
    sellerId: new mongoose.Types.ObjectId(),
    name: 'Ruby Ring',
    quantity: 1,
    price: 1000,
    status: 'active',
  };

  return {
    _id: ORDER_ID,
    customerId: CUSTOMER,
    status: 'pending',
    totalAmount: 1100,
    paymentMethod: 'razorpay',
    paymentStatus: 'pending',
    reservationStatus: 'held',
    items: Object.assign([item], { id: (id) => (String(id) === String(ITEM_ID) ? item : null) }),
    save: vi.fn(async () => {}),
    ...overrides,
  };
};

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.orderFindOne = Order.findOne;
  originals.orderUpdateOne = Order.updateOne;
  originals.productFindById = Product.findById;
  originals.productUpdateOne = Product.updateOne;
  originals.logCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;

  stock = 1;
  reserved = 1;
  logs = [];
  productSaves = [];

  mongoose.startSession = vi.fn(async () => fakeSession());

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'c@test.local',
      name: 'C',
    })
  );

  orderDoc = buildOrder();
  Order.findOne = vi.fn(() => chainableQuery(orderDoc));

  Order.updateOne = vi.fn(async (filter, update) => {
    if (filter.reservationStatus === 'held' && orderDoc.reservationStatus !== 'held') {
      return { modifiedCount: 0, matchedCount: 0 };
    }
    if (update.$set) Object.assign(orderDoc, update.$set);
    return { modifiedCount: 1, matchedCount: 1 };
  });

  Product.findById = vi.fn(() =>
    chainableQuery({
      _id: PRODUCT_ID,
      name: 'Ruby Ring',
      get stock() {
        return stock;
      },
      set stock(v) {
        stock = v;
      },
      reserved,
      save: vi.fn(async () => {
        productSaves.push(stock);
      }),
    })
  );

  Product.updateOne = vi.fn(async (filter, update) => {
    if (update.$inc && update.$inc.reserved !== undefined) {
      if (filter.reserved && reserved < filter.reserved.$gte) {
        return { modifiedCount: 0 };
      }
      reserved += update.$inc.reserved;
    }
    return { modifiedCount: 1 };
  });

  InventoryLog.create = vi.fn(async (docs) => {
    logs.push(Array.isArray(docs) ? docs[0] : docs);
    return docs;
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Order.findOne = originals.orderFindOne;
  Order.updateOne = originals.orderUpdateOne;
  Product.findById = originals.productFindById;
  Product.updateOne = originals.productUpdateOne;
  InventoryLog.create = originals.logCreate;
  mongoose.startSession = originals.startSession;
});

const cancelItem = () =>
  request(app)
    .patch(`/api/customer/orders/${ORDER_ID}/items/${ITEM_ID}/cancel`)
    .set('Authorization', `Bearer ${token()}`);

describe('cancelling an unpaid prepaid order', () => {
  it('does not invent stock that was never taken', async () => {
    await cancelItem();

    // Before the fix this became 2 from a single abandoned checkout.
    expect(stock).toBe(1);
    expect(productSaves).toHaveLength(0);
  });

  it('gives the held unit back so someone else can buy it', async () => {
    await cancelItem();

    expect(reserved).toBe(0);
    expect(orderDoc.reservationStatus).toBe('released');
  });

  it('writes no return log, because nothing was returned', async () => {
    await cancelItem();

    // A `return` entry here would claim a physical movement that never
    // happened and make the audit trail untrue.
    expect(logs).toHaveLength(0);
  });
});

describe('cancelling an order that really did consume stock', () => {
  it('restocks a COD order and logs the return', async () => {
    orderDoc = buildOrder({
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      reservationStatus: 'none',
    });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    await cancelItem();

    expect(stock).toBe(2); // COD decremented at creation, so this is a real restore
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('return');
    expect(logs[0].quantity).toBe(1);
  });

  it('restocks a prepaid order whose hold already became a sale', async () => {
    orderDoc = buildOrder({ paymentStatus: 'paid', reservationStatus: 'consumed' });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    await cancelItem();

    expect(stock).toBe(2);
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('return');
  });

  it('never touches reserved when restocking a consumed order', async () => {
    orderDoc = buildOrder({ paymentStatus: 'paid', reservationStatus: 'consumed' });
    Order.findOne = vi.fn(() => chainableQuery(orderDoc));

    await cancelItem();

    // The hold was already spent; releasing it again would free a unit twice.
    expect(reserved).toBe(1);
  });
});
