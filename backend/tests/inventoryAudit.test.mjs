import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Product = require('../models/Product');
const InventoryLog = require('../models/Inventory');
const User = require('../models/User');
const Seller = require('../models/Seller');

const SELLER = new mongoose.Types.ObjectId();
const PRODUCT_ID = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: String(SELLER), role: 'seller' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let productDoc;
let logs;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.productFindOne = Product.findOne;
  originals.logCreate = InventoryLog.create;

  logs = [];

  productDoc = {
    _id: PRODUCT_ID,
    sellerId: SELLER,
    name: 'Ruby Necklace',
    stock: 10,
    lowStockThreshold: 5,
    isActive: true,
    save: vi.fn(async () => productDoc),
    populate: vi.fn(async () => productDoc),
  };

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'seller',
      isVerified: true,
      email: 's@test.local',
      name: 'S',
    })
  );
  Seller.findOne = vi.fn(() =>
    chainableQuery({ userId: SELLER, status: 'active', isApproved: true })
  );
  Product.findOne = vi.fn(() => chainableQuery(productDoc));
  InventoryLog.create = vi.fn(async (doc) => {
    logs.push(doc);
    return doc;
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Product.findOne = originals.productFindOne;
  InventoryLog.create = originals.logCreate;
});

const setStock = (body) =>
  request(app)
    .patch(`/api/seller/products/${PRODUCT_ID}/stock`)
    .set('Authorization', `Bearer ${token()}`)
    .send(body);

const editProduct = (body) =>
  request(app)
    .patch(`/api/seller/products/${PRODUCT_ID}`)
    .set('Authorization', `Bearer ${token()}`)
    .send(body);

describe('manual stock update is audited', () => {
  it('writes exactly one inventory log for a stock change', async () => {
    const res = await setStock({ stock: 3 });

    expect(res.status).toBe(200);
    expect(logs).toHaveLength(1);
    expect(productDoc.stock).toBe(3);
  });

  it('the log accurately reflects the change', async () => {
    await setStock({ stock: 3, reason: 'Damaged units removed' });

    const log = logs[0];
    expect(String(log.productId)).toBe(String(PRODUCT_ID));
    expect(log.type).toBe('adjustment');
    expect(log.stockBefore).toBe(10);
    expect(log.stockAfter).toBe(3);
    expect(log.quantity).toBe(-7); // delta, matching sale/return convention
    expect(String(log.performedBy)).toBe(String(SELLER));
    expect(log.reason).toBe('Damaged units removed');
  });

  it('records a positive delta when restocking', async () => {
    await setStock({ stock: 25 });

    expect(logs[0].quantity).toBe(15);
    expect(logs[0].stockAfter).toBe(25);
  });

  it('supplies a default reason when none is given', async () => {
    await setStock({ stock: 8 });
    expect(logs[0].reason).toMatch(/manual stock update/i);
  });

  it('writes no log when the stock value is unchanged', async () => {
    const res = await setStock({ stock: 10 });

    expect(res.status).toBe(200);
    expect(logs).toHaveLength(0);
  });

  it('still updates stock successfully (existing behaviour preserved)', async () => {
    const res = await setStock({ stock: 2 });

    expect(res.body.message).toMatch(/stock updated successfully/i);
    expect(res.body.lowStockAlert).toBe(true);
    expect(productDoc.save).toHaveBeenCalled();
  });

  it('rejects invalid stock without writing a log', async () => {
    for (const bad of [{ stock: -1 }, { stock: 'abc' }, { stock: 1.5 }, {}]) {
      const res = await setStock(bad);
      expect(res.status).toBe(400);
    }
    expect(logs).toHaveLength(0);
    expect(productDoc.stock).toBe(10);
  });
});

describe('stock changed through the product edit form is audited', () => {
  it('writes one log when the edit changes stock', async () => {
    const res = await editProduct({ stock: 4, price: 999 });

    expect(res.status).toBe(200);
    expect(logs).toHaveLength(1);
    expect(logs[0].stockBefore).toBe(10);
    expect(logs[0].stockAfter).toBe(4);
    expect(logs[0].quantity).toBe(-6);
  });

  it('writes no log when the edit leaves stock alone', async () => {
    const res = await editProduct({ price: 555, brand: 'X' });

    expect(res.status).toBe(200);
    expect(logs).toHaveLength(0);
  });

  it('writes no log when stock is re-submitted unchanged', async () => {
    await editProduct({ stock: 10, price: 123 });
    expect(logs).toHaveLength(0);
  });

  it('a single edit never produces duplicate logs', async () => {
    await editProduct({ stock: 1 });
    expect(InventoryLog.create).toHaveBeenCalledTimes(1);
  });
});
