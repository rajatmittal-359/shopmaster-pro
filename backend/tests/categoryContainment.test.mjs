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
const Seller = require('../models/Seller');
const InventoryLog = require('../models/Inventory');

const MAIN = new mongoose.Types.ObjectId();      // Jewellery & Accessories
const SUB_RINGS = new mongoose.Types.ObjectId(); // leaf with products
const SUB_EMPTY = new mongoose.Types.ObjectId(); // leaf with none
const OTHER_MAIN = new mongoose.Types.ObjectId();
const OTHER_SUB = new mongoose.Types.ObjectId();

const SELLER = new mongoose.Types.ObjectId();

// Mirrors the real shape: products live on leaves, never on a main category.
const CATEGORIES = [
  { _id: MAIN, name: 'Jewellery', slug: 'jewellery', parentCategory: null, ancestors: [], isActive: true },
  { _id: SUB_RINGS, name: 'Rings', slug: 'rings', parentCategory: MAIN, ancestors: [MAIN], isActive: true },
  { _id: SUB_EMPTY, name: 'Anklets', slug: 'anklets', parentCategory: MAIN, ancestors: [MAIN], isActive: true },
  { _id: OTHER_MAIN, name: 'Footwear', slug: 'footwear', parentCategory: null, ancestors: [], isActive: true },
  { _id: OTHER_SUB, name: 'Sneakers', slug: 'sneakers', parentCategory: OTHER_MAIN, ancestors: [OTHER_MAIN], isActive: true },
];

const PRODUCTS = [
  { _id: new mongoose.Types.ObjectId(), name: 'Ruby Ring', category: SUB_RINGS, isActive: true, stock: 4 },
  { _id: new mongoose.Types.ObjectId(), name: 'Pearl Ring', category: SUB_RINGS, isActive: true, stock: 2 },
  { _id: new mongoose.Types.ObjectId(), name: 'Running Shoe', category: OTHER_SUB, isActive: true, stock: 5 },
];

const token = (userId, role) =>
  jwt.sign({ userId: String(userId), role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const originals = {};
let categories;
let productFilters;

/** Resolve an $in / equality filter against the fixture. */
const idsFrom = (v) => (v && v.$in ? v.$in.map(String) : v ? [String(v)] : null);

beforeEach(() => {
  originals.catFind = Category.find;
  originals.catFindById = Category.findById;
  originals.catExists = Category.exists;
  originals.catFindOne = Category.findOne;
  originals.prodFind = Product.find;
  originals.prodCount = Product.countDocuments;
  originals.prodAggregate = Product.aggregate;
  originals.prodSave = Product.prototype.save;
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.logCreate = InventoryLog.create;

  categories = CATEGORIES.map((c) => ({ ...c }));
  productFilters = [];

  Category.find = vi.fn((filter = {}) => {
    let rows = categories;
    const ids = filter._id ? idsFrom(filter._id) : null;
    if (ids) rows = rows.filter((c) => ids.includes(String(c._id)));
    return chainableQuery(rows);
  });
  Category.findById = vi.fn((id) =>
    chainableQuery(categories.find((c) => String(c._id) === String(id)) || null)
  );
  Category.exists = vi.fn(async (filter) =>
    categories.some((c) => String(c.parentCategory) === String(filter.parentCategory))
  );
  // The shop filter resolves a non-ObjectId query value as a category slug.
  Category.findOne = vi.fn((filter = {}) =>
    chainableQuery(categories.find((c) => c.slug === filter.slug) || null)
  );

  Product.find = vi.fn((filter = {}) => {
    productFilters.push(filter);
    const ids = filter.category ? idsFrom(filter.category) : null;
    const rows = PRODUCTS.filter(
      (p) => (!ids || ids.includes(String(p.category))) && p.isActive && p.stock > 0
    );
    return chainableQuery(rows);
  });
  Product.countDocuments = vi.fn(async (filter = {}) => {
    const ids = filter.category ? idsFrom(filter.category) : null;
    return PRODUCTS.filter((p) => !ids || ids.includes(String(p.category))).length;
  });
  Product.aggregate = vi.fn(async () => [
    { _id: SUB_RINGS, n: 2 },
    { _id: OTHER_SUB, n: 1 },
  ]);
  // The controller builds the document, checks it, and only then saves - so
  // saving is the seam that says "this product was accepted". Stubbing
  // Product.create instead would leave a real save reaching for a database.
  Product.prototype.save = vi.fn(async function save() {
    return this;
  });

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
  InventoryLog.create = vi.fn(async (d) => d);
});

afterEach(() => {
  Category.find = originals.catFind;
  Category.findById = originals.catFindById;
  Category.exists = originals.catExists;
  Category.findOne = originals.catFindOne;
  Product.find = originals.prodFind;
  Product.countDocuments = originals.prodCount;
  Product.aggregate = originals.prodAggregate;
  Product.prototype.save = originals.prodSave;
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  InventoryLog.create = originals.logCreate;
});

const shop = (qs = '') => request(app).get(`/api/public/products${qs}`);

describe('parent category rolls up its subtree', () => {
  it('selecting a MAIN category returns products from its subcategories', async () => {
    const res = await shop(`?category=${MAIN}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2); // both rings
    const names = res.body.products.map((p) => p.name);
    expect(names).toContain('Ruby Ring');
    expect(names).toContain('Pearl Ring');
  });

  it('the main-category query matches a set of ids, not one exact id', async () => {
    await shop(`?category=${MAIN}`);

    const ids = idsFrom(productFilters[0].category);
    expect(ids).toContain(String(MAIN));
    expect(ids).toContain(String(SUB_RINGS));
    expect(ids).toContain(String(SUB_EMPTY));
  });

  it('does not leak products from a different main category', async () => {
    const res = await shop(`?category=${MAIN}`);

    const names = res.body.products.map((p) => p.name);
    expect(names).not.toContain('Running Shoe');
  });

  it('selecting a LEAF category still returns only that leaf', async () => {
    const res = await shop(`?category=${SUB_RINGS}`);

    expect(res.body.products).toHaveLength(2);
    const ids = idsFrom(productFilters[0].category);
    expect(ids).toEqual([String(SUB_RINGS)]);
  });

  it('an empty leaf returns nothing without erroring', async () => {
    const res = await shop(`?category=${SUB_EMPTY}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  it('no category returns the whole browsable catalogue', async () => {
    const res = await shop();
    expect(res.body.products).toHaveLength(PRODUCTS.length);
  });

  // Behaviour changed deliberately when slugs were introduced: a non-ObjectId
  // is now a legitimate category identifier, so it is looked up as a slug.
  // An identifier that matches nothing is a 404 rather than an empty 200,
  // because a 200 with no products is a soft 404 that Google will index.
  it('returns 404 for a category identifier that matches nothing', async () => {
    const res = await shop('?category=not-an-id');
    expect(res.status).toBe(404);
  });

  it('accepts a category slug as well as an id', async () => {
    const bySlug = await shop('?category=rings');
    const byId = await shop(`?category=${SUB_RINGS}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.products).toHaveLength(byId.body.products.length);
  });
});

describe('deactivating a category cascades to its subtree', () => {
  it('deactivating a MAIN category hides its subcategories\' products', async () => {
    categories.find((c) => String(c._id) === String(MAIN)).isActive = false;

    const res = await shop(`?category=${MAIN}`);

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(0);
  });

  it('a deactivated parent also removes its products from the unfiltered shop', async () => {
    categories.find((c) => String(c._id) === String(MAIN)).isActive = false;

    const res = await shop();

    const names = res.body.products.map((p) => p.name);
    expect(names).not.toContain('Ruby Ring');
    expect(names).toContain('Running Shoe'); // other tree unaffected
  });

  it('deactivating one leaf does not affect its siblings', async () => {
    categories.find((c) => String(c._id) === String(SUB_RINGS)).isActive = false;

    const res = await shop(`?category=${OTHER_MAIN}`);
    expect(res.body.products.map((p) => p.name)).toContain('Running Shoe');
  });
});

describe('category tree reports rolled-up product counts', () => {
  it('a parent count includes everything beneath it', async () => {
    const res = await request(app).get('/api/public/products/categories/tree');

    expect(res.status).toBe(200);
    const jewellery = res.body.categories.find((c) => String(c._id) === String(MAIN));
    expect(jewellery.productCount).toBe(2); // rolled up from Rings
    expect(jewellery.children).toHaveLength(2);

    const rings = jewellery.children.find((c) => String(c._id) === String(SUB_RINGS));
    const anklets = jewellery.children.find((c) => String(c._id) === String(SUB_EMPTY));
    expect(rings.productCount).toBe(2);
    expect(anklets.productCount).toBe(0); // lets the UI hide empty nodes
  });

  it('exposes a slug for each category', async () => {
    const res = await request(app).get('/api/public/products/categories/tree');
    const jewellery = res.body.categories.find((c) => String(c._id) === String(MAIN));
    expect(jewellery.slug).toBe('jewellery');
  });
});

describe('products must be assigned to a leaf category', () => {
  const createProduct = (categoryId) =>
    request(app)
      .post('/api/seller/products')
      .set('Authorization', `Bearer ${token(SELLER, 'seller')}`)
      .send({
        name: 'Test Product',
        description: 'A description long enough',
        category: String(categoryId),
        price: 100,
        stock: 5,
      });

  it('rejects a product assigned to a MAIN category', async () => {
    const res = await createProduct(MAIN);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/main category.*subcategor/i);
    expect(Product.prototype.save).not.toHaveBeenCalled();
  });

  it('accepts a product assigned to a leaf category', async () => {
    const res = await createProduct(SUB_RINGS);

    expect(res.status).toBe(201);
    expect(Product.prototype.save).toHaveBeenCalled();
  });

  it('rejects an inactive category', async () => {
    categories.find((c) => String(c._id) === String(SUB_RINGS)).isActive = false;

    const res = await createProduct(SUB_RINGS);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not active/i);
    expect(Product.prototype.save).not.toHaveBeenCalled();
  });

  it('rejects a category that does not exist', async () => {
    const res = await createProduct(new mongoose.Types.ObjectId());

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found/i);
  });
});

describe('Category model helpers', () => {
  it('buildAncestors chains a child onto its parent path', async () => {
    const ancestors = await Category.buildAncestors(SUB_RINGS);
    expect(ancestors.map(String)).toEqual([String(MAIN), String(SUB_RINGS)]);
  });

  it('buildAncestors returns [] for a root category', async () => {
    expect(await Category.buildAncestors(null)).toEqual([]);
  });

  it('slugify produces URL-safe slugs', () => {
    expect(Category.slugify('Jewellery & Accessories')).toBe('jewellery-and-accessories');
    expect(Category.slugify('  Nose Pins & Nath ')).toBe('nose-pins-and-nath');
  });

  it('getBrowsableIds excludes a subtree under an inactive parent', async () => {
    categories.find((c) => String(c._id) === String(MAIN)).isActive = false;

    const ids = (await Category.getBrowsableIds()).map(String);

    expect(ids).not.toContain(String(MAIN));
    expect(ids).not.toContain(String(SUB_RINGS));
    expect(ids).toContain(String(OTHER_SUB));
  });
});
