/**
 * The shape of the category tree.
 *
 * Products are listed on leaves - sellerController.validateLeafCategory refuses
 * to put one on a category that has children. Two things follow from that, and
 * neither was enforced:
 *
 *   A main category with no subcategories is a heading nothing can go under.
 *   It appears in the shop filter and stays permanently empty.
 *
 *   A category holding products must not become a parent. Nothing stopped it:
 *   adding a subcategory to a category that already had products put those
 *   products on a non-leaf - the exact state the leaf rule exists to prevent -
 *   and the seller could no longer save an edit to them without moving them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const Category = require('../models/Category');
const Product = require('../models/Product');
const User = require('../models/User');

const ADMIN = new mongoose.Types.ObjectId();
const MAIN = new mongoose.Types.ObjectId();
const SUB = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: String(ADMIN), role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

const originals = {};
let created;
let productsIn;

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.categoryFindById = Category.findById;
  originals.categoryCreate = Category.create;
  originals.productCount = Product.countDocuments;

  User.findById = vi.fn((id) =>
    chainableQuery({
      _id: new mongoose.Types.ObjectId(String(id)),
      role: 'admin',
      isVerified: true,
      email: 'a@test.local',
      name: 'Admin',
    })
  );

  // MAIN is a root; SUB already sits under it.
  Category.findById = vi.fn(async (id) => {
    if (String(id) === String(MAIN)) {
      return { _id: MAIN, name: 'Jewellery', parentCategory: null };
    }
    if (String(id) === String(SUB)) {
      return { _id: SUB, name: 'Rings', parentCategory: MAIN };
    }
    return null;
  });

  // How many products sit directly in the category being made a parent.
  productsIn = 0;
  Product.countDocuments = vi.fn(async () => productsIn);

  created = [];
  Category.create = vi.fn(async (doc) => {
    created.push(doc);
    return {
      ...doc,
      _id: new mongoose.Types.ObjectId(),
      populate: async () => {},
    };
  });
});

afterEach(() => {
  User.findById = originals.userFindById;
  Category.findById = originals.categoryFindById;
  Category.create = originals.categoryCreate;
  Product.countDocuments = originals.productCount;
});

const create = (body) =>
  request(app)
    .post('/api/admin/categories')
    .set('Authorization', `Bearer ${token()}`)
    .send(body);

describe('creating a main category', () => {
  it('refuses one with no subcategories', async () => {
    const res = await create({ name: 'Furniture' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least one subcategory/i);
    // Nothing is written, so there is no half-made category to clean up.
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('creates it together with its subcategories', async () => {
    const res = await create({
      name: 'Furniture',
      subcategories: ['Chairs', 'Tables'],
    });

    expect(res.status).toBe(201);
    expect(created.map((c) => c.name)).toEqual(['Furniture', 'Chairs', 'Tables']);
    // The parent is written first so the children inherit its ancestors.
    expect(created[0].parentCategory).toBeNull();
    expect(res.body.subcategories).toHaveLength(2);
  });

  it('ignores blank subcategory boxes rather than creating unnamed ones', async () => {
    const res = await create({
      name: 'Furniture',
      subcategories: ['Chairs', '   ', ''],
    });

    expect(res.status).toBe(201);
    expect(created.map((c) => c.name)).toEqual(['Furniture', 'Chairs']);
  });
});

describe('adding a subcategory', () => {
  it('is allowed under a main category that holds no products', async () => {
    const res = await create({ name: 'Earrings', parentCategory: String(MAIN) });

    expect(res.status).toBe(201);
    expect(created[0].parentCategory).toBe(String(MAIN));
  });

  /**
   * The trap: those products would be sitting on a non-leaf the moment this
   * succeeded, and their seller could no longer save an edit to them.
   */
  it('is refused when the parent already holds products directly', async () => {
    productsIn = 4;

    const res = await create({ name: 'Earrings', parentCategory: String(MAIN) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already has 4 product/i);
    expect(res.body.message).toMatch(/move them/i);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('is refused under another subcategory, keeping the tree two deep', async () => {
    const res = await create({ name: 'Studs', parentCategory: String(SUB) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/maximum 2 levels/i);
    expect(Category.create).not.toHaveBeenCalled();
  });

  it('is refused under a parent that does not exist', async () => {
    const res = await create({
      name: 'Studs',
      parentCategory: String(new mongoose.Types.ObjectId()),
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid parent/i);
  });
});
