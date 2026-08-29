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
const shiprocket = require('../utils/shiprocketService');

const CUSTOMER_ID = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();
const SELLER_ID = new mongoose.Types.ObjectId();
const ADDRESS_ID = new mongoose.Types.ObjectId();

const ITEM_PRICE = 160;
const BASE_FREIGHT = 93;
const COD_FEE = 59;

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
  originals.addressFindOne = Address.findOne;
  originals.orderCreate = Order.create;
  originals.inventoryCreate = InventoryLog.create;
  originals.startSession = mongoose.startSession;
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
  Cart.findOne = vi.fn(() => chainableQuery(cartDoc));
  Address.findOne = vi.fn(() =>
    chainableQuery({ _id: ADDRESS_ID, userId: CUSTOMER_ID, zipCode: '302019' })
  );
  Product.findById = vi.fn(() =>
    chainableQuery({ _id: PRODUCT_ID, name: 'Ring', stock: 10, isActive: true, save: vi.fn(async () => {}) })
  );
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
  Address.findOne = originals.addressFindOne;
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

  it('falls back to a flat rate when the courier API fails, for both paths', async () => {
    shiprocket.getShippingRate = vi.fn(async () => {
      throw new Error('shiprocket down');
    });

    const quote = await preview('cod');
    await codCheckout();

    expect(quote.body.shippingCharges).toBe(100);
    expect(createdOrder.shippingCharges).toBe(100);
    expect(createdOrder.totalAmount).toBe(quote.body.grandTotal);
  });
});
