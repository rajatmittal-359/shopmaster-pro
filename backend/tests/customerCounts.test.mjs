/**
 * The two numbers on the header (21 Sep 2026): how many pieces sit in the
 * cart and how many items are saved. One cheap call, no population - the
 * header asks it on every page, so it must not populate anything.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../app');
const Cart = require('../models/Cart');
const Wishlist = require('../models/Wishlist');
const User = require('../models/User');

const CUSTOMER_ID = new mongoose.Types.ObjectId();
const token = () => jwt.sign({ userId: CUSTOMER_ID.toString(), role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const originals = {};

beforeEach(() => {
  originals.user = User.findById;
  originals.cart = Cart.findOne;
  originals.wish = Wishlist.findOne;
  User.findById = vi.fn(() => chainableQuery({ _id: CUSTOMER_ID, role: 'customer', isVerified: true, email: 'c@test.local', name: 'Customer' }));
});
afterEach(() => {
  User.findById = originals.user;
  Cart.findOne = originals.cart;
  Wishlist.findOne = originals.wish;
});

describe('GET /customer/counts', () => {
  it('sums cart quantities and counts saved items', async () => {
    Cart.findOne = vi.fn(() => chainableQuery({ items: [{ quantity: 2 }, { quantity: 1 }] }));
    Wishlist.findOne = vi.fn(() => chainableQuery({ items: [{}, {}, {}, {}] }));
    const r = await request(app).get('/api/customer/counts').set('Authorization', `Bearer ${token()}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ cart: 3, wishlist: 4 });
  });

  it('is zeros for an account with no cart or list yet', async () => {
    Cart.findOne = vi.fn(() => chainableQuery(null));
    Wishlist.findOne = vi.fn(() => chainableQuery(null));
    const r = await request(app).get('/api/customer/counts').set('Authorization', `Bearer ${token()}`);
    expect(r.body).toEqual({ cart: 0, wishlist: 0 });
  });
});
