import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const InventoryLog = require('../models/Inventory');
const Product = require('../models/Product');
const User = require('../models/User');
const Seller = require('../models/Seller');

const SELLER_A = new mongoose.Types.ObjectId();
const SELLER_B = new mongoose.Types.ObjectId();
const ADMIN = new mongoose.Types.ObjectId();

const PROD_A = new mongoose.Types.ObjectId();
const PROD_B = new mongoose.Types.ObjectId();

// The two-tenant fixture the live database could not provide: two sellers,
// each owning one product, each with one inventory log.
const PRODUCTS = [
  { _id: PROD_A, name: 'A-Necklace', sellerId: SELLER_A },
  { _id: PROD_B, name: 'B-Bracelet', sellerId: SELLER_B },
];

const LOGS = [
  { _id: new mongoose.Types.ObjectId(), productId: PROD_A, type: 'sale', quantity: -1 },
  { _id: new mongoose.Types.ObjectId(), productId: PROD_B, type: 'sale', quantity: -2 },
];

const token = (userId, role) =>
  jwt.sign({ userId: userId.toString(), role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const originals = {};
let logFilters;

const idsIn = (filter) => {
  if (!filter.productId) return null;
  return (filter.productId.$in || []).map(String);
};

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.productFind = Product.find;
  originals.logFind = InventoryLog.find;

  logFilters = [];

  User.findById = vi.fn((id) => {
    const sid = String(id);
    const role = sid === String(ADMIN) ? 'admin' : 'seller';
    return chainableQuery({
      _id: new mongoose.Types.ObjectId(sid),
      role,
      isVerified: true,
      email: `${role}@test.local`,
      name: role,
    });
  });

  Seller.findOne = vi.fn((filter) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(),
      userId: filter.userId,
      status: 'active',
      isApproved: true,
      kycStatus: 'verified',
    })
  );

  // Product.find(...).distinct('_id') -> ids owned by that seller
  Product.find = vi.fn((filter = {}) => {
    const owned = PRODUCTS.filter(
      (p) => !filter.sellerId || String(p.sellerId) === String(filter.sellerId)
    );
    const q = chainableQuery(owned);
    q.distinct = vi.fn(async () => owned.map((p) => p._id));
    return q;
  });

  InventoryLog.find = vi.fn((filter = {}) => {
    logFilters.push(filter);
    const allowed = idsIn(filter);
    const rows = allowed
      ? LOGS.filter((l) => allowed.includes(String(l.productId)))
      : LOGS;
    return chainableQuery(rows);
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Product.find = originals.productFind;
  InventoryLog.find = originals.logFind;
});

const logsAs = (userId, role) =>
  request(app).get('/api/inventory').set('Authorization', `Bearer ${token(userId, role)}`);

describe('inventory log tenant isolation', () => {
  it("Seller A cannot retrieve Seller B's inventory logs", async () => {
    const res = await logsAs(SELLER_A, 'seller');

    expect(res.status).toBe(200);
    const productIds = res.body.logs.map((l) => String(l.productId));
    expect(productIds).toContain(String(PROD_A));
    expect(productIds).not.toContain(String(PROD_B));
  });

  it('Seller A receives only logs for products Seller A owns', async () => {
    const res = await logsAs(SELLER_A, 'seller');

    expect(res.body.logs).toHaveLength(1);
    expect(String(res.body.logs[0].productId)).toBe(String(PROD_A));
  });

  it('Seller B symmetrically sees only their own logs', async () => {
    const res = await logsAs(SELLER_B, 'seller');

    expect(res.body.logs).toHaveLength(1);
    expect(String(res.body.logs[0].productId)).toBe(String(PROD_B));
  });

  it('the seller query is scoped by owned product ids, never unscoped', async () => {
    await logsAs(SELLER_A, 'seller');

    expect(logFilters).toHaveLength(1);
    expect(logFilters[0]).toHaveProperty('productId');
    expect(idsIn(logFilters[0])).toEqual([String(PROD_A)]);
  });

  it('a seller who owns no products receives no logs, not every log', async () => {
    Product.find = vi.fn(() => {
      const q = chainableQuery([]);
      q.distinct = vi.fn(async () => []);
      return q;
    });

    const res = await logsAs(new mongoose.Types.ObjectId(), 'seller');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(0);
  });

  it('admin retains the platform-wide view (existing intended role model)', async () => {
    const res = await logsAs(ADMIN, 'admin');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(LOGS.length);
    expect(logFilters[0]).not.toHaveProperty('productId');
  });
});
