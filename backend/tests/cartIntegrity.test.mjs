import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery, fakeSession } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Cart = require('../models/Cart');
const User = require('../models/User');
const Product = require('../models/Product');
const Address = require('../models/Address');
const Order = require('../models/Order');
const InventoryLog = require('../models/Inventory');

const CUSTOMER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();
const SELLER_ID = new mongoose.Types.ObjectId();

const STOCK = 3;
const PRICE = 450;

const token = () =>
  jwt.sign({ userId: CUSTOMER_ID.toString(), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let cartDoc;
let productStock;

/** Cart document double: a real array of items plus a recording save(). */
const makeCart = (items = []) => {
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    userId: CUSTOMER_ID,
    items,
    totalAmount: items.reduce((s, i) => s + i.price * i.quantity, 0),
    save: vi.fn(async () => doc),
  };
  return doc;
};

const makeProduct = () => ({
  _id: PRODUCT_ID,
  name: 'Traditional Ruby Pearl Long Necklace Set',
  price: PRICE,
  stock: productStock,
  isActive: true,
  sellerId: SELLER_ID,
  weight: 0.5,
  save: vi.fn(async () => {}),
});

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.cartFindOne = Cart.findOne;
  originals.cartCreate = Cart.create;
  originals.productFindById = Product.findById;
  originals.addressFindOne = Address.findOne;
  originals.orderCreate = Order.create;
  originals.inventoryCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;

  productStock = STOCK;
  cartDoc = makeCart();

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'c@test.local',
      name: 'Customer',
    })
  );
  Cart.findOne = vi.fn(() => chainableQuery(cartDoc));
  Cart.create = vi.fn(async () => cartDoc);
  Product.findById = vi.fn(() => chainableQuery(makeProduct()));
  mongoose.startSession = vi.fn(async () => fakeSession());
});

afterEach(() => {
  User.findById = originals.userFindById;
  Cart.findOne = originals.cartFindOne;
  Cart.create = originals.cartCreate;
  Product.findById = originals.productFindById;
  Address.findOne = originals.addressFindOne;
  Order.create = originals.orderCreate;
  InventoryLog.create = originals.inventoryCreate;
  mongoose.startSession = originals.startSession;
});

const addToCart = (body) =>
  request(app)
    .post('/api/customer/cart')
    .set('Authorization', `Bearer ${token()}`)
    .send(body);

const updateCart = (body) =>
  request(app)
    .patch('/api/customer/cart')
    .set('Authorization', `Bearer ${token()}`)
    .send(body);

describe('cart stock ceiling', () => {
  it('rejects a quantity greater than available stock', async () => {
    const res = await addToCart({ productId: PRODUCT_ID.toString(), quantity: 99999 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only 3 unit/i);
    expect(res.body.availableStock).toBe(STOCK);
    expect(cartDoc.items).toHaveLength(0);
    expect(cartDoc.save).not.toHaveBeenCalled();
  });

  it('accepts a quantity exactly equal to available stock', async () => {
    const res = await addToCart({ productId: PRODUCT_ID.toString(), quantity: STOCK });

    expect(res.status).toBe(200);
    expect(cartDoc.items[0].quantity).toBe(STOCK);
  });

  it('repeated additions cannot silently compound past stock', async () => {
    // Two units already in the cart, stock is 3.
    cartDoc = makeCart([{ productId: PRODUCT_ID, quantity: 2, price: PRICE }]);

    const res = await addToCart({ productId: PRODUCT_ID.toString(), quantity: 2 });

    expect(res.status).toBe(400);
    expect(res.body.inCart).toBe(2);
    // Quantity is unchanged - the old code did items[i].quantity += quantity.
    expect(cartDoc.items[0].quantity).toBe(2);
  });

  it('allows a repeat addition that stays within stock', async () => {
    cartDoc = makeCart([{ productId: PRODUCT_ID, quantity: 1, price: PRICE }]);

    const res = await addToCart({ productId: PRODUCT_ID.toString(), quantity: 2 });

    expect(res.status).toBe(200);
    expect(cartDoc.items[0].quantity).toBe(3);
  });

  it('rejects adding an out-of-stock product', async () => {
    productStock = 0;

    const res = await addToCart({ productId: PRODUCT_ID.toString(), quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/out of stock/i);
  });

  it('rejects updating quantity above stock', async () => {
    cartDoc = makeCart([{ productId: PRODUCT_ID, quantity: 1, price: PRICE }]);

    const res = await updateCart({ productId: PRODUCT_ID.toString(), quantity: 50 });

    expect(res.status).toBe(400);
    expect(res.body.availableStock).toBe(STOCK);
    expect(cartDoc.items[0].quantity).toBe(1);
  });
});

describe('cart input validation returns 4xx, never 500', () => {
  const invalid = [
    ['zero', 0],
    ['negative', -5],
    ['non-numeric string', 'abc'],
    ['fractional', 1.5],
    ['boolean', true],
    ['object', { n: 1 }],
    ['null', null],
    ['missing', undefined],
  ];

  for (const [label, quantity] of invalid) {
    it(`rejects ${label} quantity with 400`, async () => {
      const body = { productId: PRODUCT_ID.toString() };
      if (quantity !== undefined) body.quantity = quantity;

      const res = await addToCart(body);

      expect(res.status).toBe(400);
      // No raw Mongoose internals leaked to the client.
      expect(res.body.message).not.toMatch(/Cast to Number|validation failed|items\.0\./i);
      expect(cartDoc.save).not.toHaveBeenCalled();
    });
  }

  it('never persists a NaN cart total', async () => {
    await addToCart({ productId: PRODUCT_ID.toString() }); // quantity missing
    expect(Number.isNaN(cartDoc.totalAmount)).toBe(false);
    expect(cartDoc.totalAmount).toBe(0);
  });

  it('rejects a malformed productId with 400', async () => {
    const res = await addToCart({ productId: 'not-an-id', quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid productid/i);
  });

  it('applies the same validation to quantity updates', async () => {
    cartDoc = makeCart([{ productId: PRODUCT_ID, quantity: 1, price: PRICE }]);
    const res = await updateCart({ productId: PRODUCT_ID.toString(), quantity: -3 });

    expect(res.status).toBe(400);
    expect(res.body.message).not.toMatch(/Cast to Number|validation failed/i);
  });
});

describe('checkout independently revalidates stock', () => {
  it('rejects checkout when cart quantity now exceeds live stock', async () => {
    // Cart was built when stock allowed 3; stock has since dropped to 1.
    cartDoc = makeCart([{ productId: { _id: PRODUCT_ID, name: 'X', weight: 0.5, sellerId: SELLER_ID }, quantity: 3, price: PRICE }]);
    productStock = 1;

    Address.findOne = vi.fn(() =>
      chainableQuery({ _id: new mongoose.Types.ObjectId(), userId: CUSTOMER_ID, zipCode: '302019' })
    );
    Order.create = vi.fn(async () => [{}]);

    const res = await request(app)
      .post('/api/customer/checkout-cod')
      .set('Authorization', `Bearer ${token()}`)
      .send({ shippingAddressId: new mongoose.Types.ObjectId().toString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient stock/i);
    expect(Order.create).not.toHaveBeenCalled();
  });
});
