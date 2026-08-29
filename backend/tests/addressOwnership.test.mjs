import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery, fakeSession } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Address = require('../models/Address');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Order = require('../models/Order');

const ALICE = new mongoose.Types.ObjectId();   // owns the address
const MALLORY = new mongoose.Types.ObjectId(); // authenticated attacker
const ADDRESS_ID = new mongoose.Types.ObjectId();

const token = (userId) =>
  jwt.sign({ userId: userId.toString(), role: 'customer' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let queries;
let addressStore;

/** Honour the filter exactly as the controller supplies it. */
const matches = (filter) =>
  (!filter._id || String(filter._id) === String(ADDRESS_ID)) &&
  (filter.userId === undefined || String(filter.userId) === String(ALICE));

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.find = Address.find;
  originals.findOneAndUpdate = Address.findOneAndUpdate;
  originals.findOneAndDelete = Address.findOneAndDelete;
  originals.findByIdAndUpdate = Address.findByIdAndUpdate;
  originals.findByIdAndDelete = Address.findByIdAndDelete;
  originals.findOne = Address.findOne;
  originals.create = Address.create;
  originals.cartFindOne = Cart.findOne;
  originals.orderCreate = Order.create;
  originals.startSession = mongoose.startSession;

  queries = [];
  addressStore = { _id: ADDRESS_ID, userId: ALICE, street: '1 Alice Road', city: 'Jaipur', zipCode: '302019' };

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'customer',
      isVerified: true,
      email: 'u@test.local',
      name: 'U',
    })
  );

  Address.find = vi.fn((filter) => {
    queries.push({ op: 'find', filter });
    return chainableQuery(matches(filter) ? [addressStore] : []);
  });
  Address.findOne = vi.fn((filter) => {
    queries.push({ op: 'findOne', filter });
    return chainableQuery(matches(filter) ? addressStore : null);
  });
  Address.findOneAndUpdate = vi.fn((filter, update) => {
    queries.push({ op: 'findOneAndUpdate', filter, update });
    if (!matches(filter)) return chainableQuery(null);
    Object.assign(addressStore, update);
    return chainableQuery(addressStore);
  });
  Address.findOneAndDelete = vi.fn((filter) => {
    queries.push({ op: 'findOneAndDelete', filter });
    return chainableQuery(matches(filter) ? addressStore : null);
  });
  // If the controller ever regresses to the unscoped helpers, these record it
  // and would return the victim's document.
  Address.findByIdAndUpdate = vi.fn((id, update) => {
    queries.push({ op: 'findByIdAndUpdate', filter: { _id: id }, update });
    Object.assign(addressStore, update);
    return chainableQuery(addressStore);
  });
  Address.findByIdAndDelete = vi.fn((id) => {
    queries.push({ op: 'findByIdAndDelete', filter: { _id: id } });
    return chainableQuery(addressStore);
  });
  Address.create = vi.fn(async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc }));

  mongoose.startSession = vi.fn(async () => fakeSession());
});

afterEach(() => {
  User.findById = originals.userFindById;
  Address.find = originals.find;
  Address.findOne = originals.findOne;
  Address.findOneAndUpdate = originals.findOneAndUpdate;
  Address.findOneAndDelete = originals.findOneAndDelete;
  Address.findByIdAndUpdate = originals.findByIdAndUpdate;
  Address.findByIdAndDelete = originals.findByIdAndDelete;
  Address.create = originals.create;
  Cart.findOne = originals.cartFindOne;
  Order.create = originals.orderCreate;
  mongoose.startSession = originals.startSession;
});

const asUser = (userId) => ({
  patch: (body) =>
    request(app)
      .patch(`/api/customer/addresses/${ADDRESS_ID}`)
      .set('Authorization', `Bearer ${token(userId)}`)
      .send(body),
  del: () =>
    request(app)
      .delete(`/api/customer/addresses/${ADDRESS_ID}`)
      .set('Authorization', `Bearer ${token(userId)}`),
  list: () =>
    request(app)
      .get('/api/customer/addresses')
      .set('Authorization', `Bearer ${token(userId)}`),
  create: (body) =>
    request(app)
      .post('/api/customer/addresses')
      .set('Authorization', `Bearer ${token(userId)}`)
      .send(body),
});

describe('address ownership - negative boundaries', () => {
  it("Mallory cannot update Alice's address", async () => {
    const res = await asUser(MALLORY).patch({ street: 'HACKED' });

    expect(res.status).toBe(404);
    expect(addressStore.street).toBe('1 Alice Road');
  });

  it("Mallory cannot delete Alice's address", async () => {
    const res = await asUser(MALLORY).del();

    expect(res.status).toBe(404);
  });

  it("Mallory's address list never contains Alice's address", async () => {
    const res = await asUser(MALLORY).list();

    expect(res.status).toBe(200);
    expect(res.body.addresses).toHaveLength(0);
  });

  it('every address mutation is scoped by userId, not by _id alone', async () => {
    await asUser(MALLORY).patch({ street: 'x' });
    await asUser(MALLORY).del();

    // The unscoped Mongoose helpers must not be used at all.
    expect(Address.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(Address.findByIdAndDelete).not.toHaveBeenCalled();

    const mutations = queries.filter((q) => q.op !== 'find');
    expect(mutations.length).toBeGreaterThan(0);
    mutations.forEach((q) => expect(q.filter).toHaveProperty('userId'));
  });
});

describe('address ownership - mass assignment', () => {
  it('a client cannot assign a new address to another user', async () => {
    await asUser(MALLORY).create({
      street: '9 Mallory Lane',
      city: 'Delhi',
      state: 'DL',
      zipCode: '110001',
      phoneNumber: '9876543210',
      userId: ALICE.toString(), // attempted override
    });

    const created = Address.create.mock.calls[0][0];
    expect(String(created.userId)).toBe(String(MALLORY));
    expect(String(created.userId)).not.toBe(String(ALICE));
  });

  it('a client cannot reassign an existing address to another user', async () => {
    await asUser(ALICE).patch({ street: 'New Street', userId: MALLORY.toString() });

    const update = queries.find((q) => q.op === 'findOneAndUpdate').update;
    expect(update).not.toHaveProperty('userId');
    expect(String(addressStore.userId)).toBe(String(ALICE));
  });
});

describe('address ownership - legitimate access preserved', () => {
  it('Alice can update her own address', async () => {
    const res = await asUser(ALICE).patch({ street: '2 Alice Road' });

    expect(res.status).toBe(200);
    expect(addressStore.street).toBe('2 Alice Road');
  });

  it('Alice can delete her own address', async () => {
    const res = await asUser(ALICE).del();
    expect(res.status).toBe(200);
  });

  it('Alice can list her own addresses', async () => {
    const res = await asUser(ALICE).list();
    expect(res.body.addresses).toHaveLength(1);
  });

  it('rejects a malformed address id with 400 rather than a server error', async () => {
    const res = await request(app)
      .patch('/api/customer/addresses/not-an-id')
      .set('Authorization', `Bearer ${token(ALICE)}`)
      .send({ street: 'x' });

    expect(res.status).toBe(400);
  });
});

describe('address use during checkout is owner-scoped', () => {
  it("Mallory cannot check out against Alice's address", async () => {
    Cart.findOne = vi.fn(() =>
      chainableQuery({
        userId: MALLORY,
        items: [{ productId: { _id: new mongoose.Types.ObjectId(), name: 'X', weight: 0.5 }, quantity: 1, price: 100 }],
        totalAmount: 100,
        save: vi.fn(async () => {}),
      })
    );
    Order.create = vi.fn(async () => [{}]);

    const res = await request(app)
      .post('/api/customer/checkout-cod')
      .set('Authorization', `Bearer ${token(MALLORY)}`)
      .send({ shippingAddressId: ADDRESS_ID.toString() });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid shipping address/i);
    expect(Order.create).not.toHaveBeenCalled();
  });
});
