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
const Seller = require('../models/Seller');
const shiprocket = require('../utils/shiprocketService');
const { fallbackPrice } = require('../utils/shipping');

const CUSTOMER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();
const SELLER_ID = new mongoose.Types.ObjectId();
const ADDRESS_ID = new mongoose.Types.ObjectId();

const ITEM_PRICE = 160;
const BASE_FREIGHT = 93;
const COD_FEE = 59;

// The fixture's customer is in Jaipur, the same city as the pickup warehouse,
// so the fallback should quote the cheaper local band.
const ADDRESS_PINCODE = '302019';
const ITEM_WEIGHT_KG = 0.5;

const token = () =>
  jwt.sign({ userId: CUSTOMER_ID.toString(), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let cartDoc;
let rateCalls;
let createdOrder;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.cartFindOne = Cart.findOne;
  originals.productFindById = Product.findById;
  originals.productFindOneAndUpdate = Product.findOneAndUpdate;
  originals.addressFindOne = Address.findOne;
  originals.orderCreate = Order.create;
  originals.inventoryCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;
  originals.sellerFind = Seller.find;
  originals.getShippingRate = shiprocket.getShippingRate;

  rateCalls = [];
  createdOrder = null;

  cartDoc = {
    userId: CUSTOMER_ID,
    items: [
      {
        productId: { _id: PRODUCT_ID, name: 'Ring', weight: 0.5, sellerId: SELLER_ID },
        quantity: 1,
        price: ITEM_PRICE,
      },
    ],
    totalAmount: ITEM_PRICE,
    save: vi.fn(async () => {}),
  };

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'c@test.local',
      name: 'C',
    })
  );
  // Checkout stamps the platform commission onto every line, which reads the
  // seller's rate. These tests assert shipping arithmetic, so a fixed rate
  // keeps them independent of whatever the platform default happens to be.
  Seller.find = vi.fn(() =>
    chainableQuery([{ userId: SELLER_ID, commissionRate: 10 }])
  );

  Cart.findOne = vi.fn(() => chainableQuery(cartDoc));
  Address.findOne = vi.fn(() =>
    chainableQuery({ _id: ADDRESS_ID, userId: CUSTOMER_ID, zipCode: '302019' })
  );
  Product.findById = vi.fn(() =>
    chainableQuery({
      _id: PRODUCT_ID, name: 'Ring', stock: 10, reserved: 0, isActive: true,
      save: vi.fn(async () => {}),
    })
  );
  // COD now decrements with a single conditional update rather than
  // read-then-write. It returns the pre-update document.
  Product.findOneAndUpdate = vi.fn(async () => ({
    _id: PRODUCT_ID, name: 'Ring', stock: 10, reserved: 0,
  }));
  InventoryLog.create = vi.fn(async () => [{}]);
  Order.create = vi.fn(async (docs) => {
    createdOrder = Array.isArray(docs) ? docs[0] : docs;
    return [{ ...createdOrder, _id: new mongoose.Types.ObjectId() }];
  });
  mongoose.startSession = vi.fn(async () => fakeSession());

  // Stub Shiprocket at the third-party boundary and record the cod flag it is
  // called with. A COD quote carries a cod_charges component; prepaid does not.
  shiprocket.getShippingRate = vi.fn(async (pincode, weight, isCod) => {
    rateCalls.push({ pincode, weight, isCod });
    return {
      data: {
        available_courier_companies: [
          {
            courier_name: 'DTDC Surface',
            freight_charge: BASE_FREIGHT,
            cod_charges: COD_FEE,
          },
        ],
      },
    };
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Cart.findOne = originals.cartFindOne;
  Product.findById = originals.productFindById;
  Product.findOneAndUpdate = originals.productFindOneAndUpdate;
  Address.findOne = originals.addressFindOne;
  Seller.find = originals.sellerFind;
  Order.create = originals.orderCreate;
  InventoryLog.create = originals.inventoryCreate;
  mongoose.startSession = originals.startSession;
  shiprocket.getShippingRate = originals.getShippingRate;
});

const preview = (paymentMethod) =>
  request(app)
    .post('/api/customer/checkout-preview')
    .set('Authorization', `Bearer ${token()}`)
    .send({ shippingAddressId: ADDRESS_ID.toString(), paymentMethod });

const codCheckout = (body = {}) =>
  request(app)
    .post('/api/customer/checkout-cod')
    .set('Authorization', `Bearer ${token()}`)
    .send({ shippingAddressId: ADDRESS_ID.toString(), ...body });

describe('COD checkout pricing consistency', () => {
  it('COD checkout requests a COD shipping rate', async () => {
    await codCheckout();

    expect(rateCalls).toHaveLength(1);
    expect(rateCalls[0].isCod).toBe(true);
  });

  it('the created COD order includes the COD fee', async () => {
    await codCheckout();

    expect(createdOrder.shippingCharges).toBe(BASE_FREIGHT + COD_FEE);
    expect(createdOrder.totalAmount).toBe(ITEM_PRICE + BASE_FREIGHT + COD_FEE);
    expect(createdOrder.paymentMethod).toBe('cod');
  });

  it('the quoted COD total matches the created COD order total', async () => {
    const quote = await preview('cod');
    const quotedTotal = quote.body.grandTotal;

    await codCheckout();

    expect(quote.status).toBe(200);
    expect(createdOrder.totalAmount).toBe(quotedTotal);
    expect(createdOrder.shippingCharges).toBe(quote.body.shippingCharges);
  });

  it('COD pricing ignores a client-supplied paymentMethod (backend is authoritative)', async () => {
    // The old code derived isCOD from req.body.paymentMethod. A client claiming
    // 'online' at the COD endpoint must not get the cheaper prepaid rate.
    await codCheckout({ paymentMethod: 'online' });

    expect(rateCalls[0].isCod).toBe(true);
    expect(createdOrder.shippingCharges).toBe(BASE_FREIGHT + COD_FEE);
  });

  it('a prepaid preview excludes the COD fee', async () => {
    const res = await preview('online');

    expect(rateCalls[0].isCod).toBe(false);
    expect(res.body.shippingCharges).toBe(BASE_FREIGHT);
    expect(res.body.grandTotal).toBe(ITEM_PRICE + BASE_FREIGHT);
  });

  it('the COD quote is more expensive than the prepaid quote by exactly the COD fee', async () => {
    const cod = await preview('cod');
    const online = await preview('online');

    expect(cod.body.grandTotal - online.body.grandTotal).toBe(COD_FEE);
  });

  it('falls back to the weight band when the courier API fails, for both paths', async () => {
    shiprocket.getShippingRate = vi.fn(async () => {
      throw new Error('shiprocket down');
    });

    const quote = await preview('cod');
    await codCheckout();

    expect(quote.body.shippingCharges).toBe(fallbackPrice(ITEM_WEIGHT_KG, ADDRESS_PINCODE));
    expect(createdOrder.shippingCharges).toBe(fallbackPrice(ITEM_WEIGHT_KG, ADDRESS_PINCODE));
    expect(createdOrder.totalAmount).toBe(quote.body.grandTotal);
  });
});

describe('COD respects inventory held for prepaid checkouts', () => {
  // A COD order must not take a unit that a paying customer is mid-checkout
  // for. If it did, that customer's payment would land on stock that no longer
  // exists - the exact failure the reservation work removes.
  it('refuses when every remaining unit is held by a prepaid checkout', async () => {
    Product.findById = vi.fn(() =>
      chainableQuery({
        _id: PRODUCT_ID, name: 'Ring', stock: 1, reserved: 1, isActive: true,
        save: vi.fn(async () => {}),
      })
    );

    const res = await codCheckout();

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insufficient stock/i);
  });

  it('reports availability net of holds, not raw stock', async () => {
    Product.findById = vi.fn(() =>
      chainableQuery({
        _id: PRODUCT_ID, name: 'Ring', stock: 5, reserved: 5, isActive: true,
        save: vi.fn(async () => {}),
      })
    );

    const res = await codCheckout();

    // Telling the customer "5 available" while all five are spoken for would
    // be a lie they cannot act on.
    expect(res.body.message).toContain('Available: 0');
  });

  it('allows a purchase from the units that are genuinely free', async () => {
    Product.findById = vi.fn(() =>
      chainableQuery({
        _id: PRODUCT_ID, name: 'Ring', stock: 5, reserved: 3, isActive: true,
        save: vi.fn(async () => {}),
      })
    );

    const res = await codCheckout();

    // 201: the order was created from the two units nobody is holding.
    expect(res.status).toBe(201);
  });

  it('decrements against availability so it cannot consume a held unit', async () => {
    const calls = [];
    Product.findOneAndUpdate = vi.fn(async (filter) => {
      calls.push(filter);
      return { _id: PRODUCT_ID, name: 'Ring', stock: 5, reserved: 3 };
    });
    Product.findById = vi.fn(() =>
      chainableQuery({
        _id: PRODUCT_ID, name: 'Ring', stock: 5, reserved: 3, isActive: true,
        save: vi.fn(async () => {}),
      })
    );

    await codCheckout();

    expect(calls).toHaveLength(1);
    // The condition must subtract reserved, not compare against stock alone.
    expect(JSON.stringify(calls[0])).toContain('$subtract');
    expect(JSON.stringify(calls[0])).toContain('reserved');
  });
});
