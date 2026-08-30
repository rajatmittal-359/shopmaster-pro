/**
 * HTTP caching policy.
 *
 * The security property is the important one: a `public` cache header on an
 * authenticated response lets a shared cache hand one customer's cart or
 * orders to the next person who asks for that URL. So the tests assert not
 * just that the catalogue IS cacheable, but that everything personal is not.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const User = require('../models/User');

const CUSTOMER = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: String(CUSTOMER), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};

beforeEach(() => {
  originals.productFind = Product.find;
  originals.productCount = Product.countDocuments;
  originals.productAggregate = Product.aggregate;
  originals.categoryFind = Category.find;
  originals.categoryBrowsable = Category.getBrowsableIds;
  originals.cartFindOne = Cart.findOne;
  originals.orderFind = Order.find;
  originals.userFindById = User.findById;

  Product.find = vi.fn(() => chainableQuery([]));
  Product.countDocuments = vi.fn(async () => 0);
  Product.aggregate = vi.fn(async () => []);
  Category.find = vi.fn(() => chainableQuery([]));
  Category.getBrowsableIds = vi.fn(async () => []);
  Cart.findOne = vi.fn(() => chainableQuery({ userId: CUSTOMER, items: [], totalAmount: 0 }));
  Order.find = vi.fn(() => chainableQuery([]));
  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'c@test.local',
      name: 'C',
    })
  );
});

afterEach(() => {
  Product.find = originals.productFind;
  Product.countDocuments = originals.productCount;
  Product.aggregate = originals.productAggregate;
  Category.find = originals.categoryFind;
  Category.getBrowsableIds = originals.categoryBrowsable;
  Cart.findOne = originals.cartFindOne;
  Order.find = originals.orderFind;
  User.findById = originals.userFindById;
});

describe('the anonymous catalogue is cacheable', () => {
  it('lets the product list be held for a minute', async () => {
    const res = await request(app).get('/api/public/products');

    expect(res.headers['cache-control']).toContain('public');
    expect(res.headers['cache-control']).toContain('max-age=60');
  });

  it('allows a stale copy to be served while it refreshes', async () => {
    const res = await request(app).get('/api/public/products');

    // So a visitor never waits on a cold backend for catalogue data.
    expect(res.headers['cache-control']).toContain('stale-while-revalidate=300');
  });

  it('applies to the category tree as well', async () => {
    const res = await request(app).get('/api/public/products/categories/tree');
    expect(res.headers['cache-control']).toContain('public');
  });
});

describe('nothing personal is ever cacheable', () => {
  const privatePaths = [
    ['/api/customer/cart', 'a cart'],
    ['/api/customer/orders', 'an order list'],
    ['/api/auth/me', 'an identity'],
  ];

  it.each(privatePaths)('%s (%s) is no-store', async (path) => {
    const res = await request(app).get(path).set('Authorization', `Bearer ${token()}`);

    // If this ever says `public`, a shared cache may serve one customer's
    // data to another. That is a data leak, not a caching bug.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('an unauthenticated request to a private route is still no-store', async () => {
    const res = await request(app).get('/api/customer/cart');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('a route that does not exist is not cacheable either', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('writes are never cached', () => {
  it('a POST to a public route is no-store', async () => {
    // The catalogue prefix is public, but a write under it must not be held.
    const res = await request(app).post('/api/public/products').send({});
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
