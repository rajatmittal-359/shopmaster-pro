/**
 * What the seller actually gets back when a product is filled in wrong.
 *
 * Two things had to change, and both are only visible from the outside:
 *
 *   1. THE ANSWER. A rejected product came back as HTTP 500 carrying the raw
 *      sentence "Product validation failed: name: Product name must be at
 *      least 3 characters, description: ...". A 500 says the server broke -
 *      it is what monitoring wakes you for - and the sentence is Mongoose
 *      talking to a developer. It is now a 400 with one readable line per
 *      field that is wrong.
 *
 *   2. THE ORDER OF WORK. Images were uploaded to Cloudinary BEFORE anything
 *      checked the product. So every rejected attempt left its pictures in
 *      paid storage, attached to a product that never existed, with nothing
 *      left pointing at them to clean them up.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../app');
const User = require('../models/User');
const Seller = require('../models/Seller');
const Product = require('../models/Product');
const Category = require('../models/Category');
const cloudinary = require('../utils/cloudinary');

const SELLER_USER = new mongoose.Types.ObjectId();
const CATEGORY_ID = new mongoose.Types.ObjectId();

const token = () =>
  jwt.sign({ userId: SELLER_USER.toString(), role: 'seller' }, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });

/** A product the shop would genuinely accept. */
const GOOD = {
  name: 'Rose Gold Ring',
  description: 'A hand-finished rose gold ring.',
  category: CATEGORY_ID.toString(),
  price: 1600,
  stock: 5,
};

const A_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const originals = {};

const post = (body) =>
  request(app).post('/api/seller/products').set('Authorization', `Bearer ${token()}`).send(body);

beforeEach(() => {
  originals.userFindById = User.findById;
  originals.sellerFindOne = Seller.findOne;
  originals.productSave = Product.prototype.save;
  originals.catFindById = Category.findById;
  originals.catExists = Category.exists;
  originals.uploadImage = cloudinary.uploadImage;

  User.findById = vi.fn(() =>
    chainableQuery({ _id: SELLER_USER, role: 'seller', isVerified: true, isActive: true })
  );
  Seller.findOne = vi.fn(() =>
    chainableQuery({ userId: SELLER_USER, isApproved: true, kycStatus: 'verified' })
  );
  Category.findById = vi.fn(() =>
    chainableQuery({ _id: CATEGORY_ID, name: 'Rings', isActive: true })
  );
  Category.exists = vi.fn(async () => null); // a leaf: no children

  Product.prototype.save = vi.fn(async function save() {
    this._id = new mongoose.Types.ObjectId();
    return this;
  });

  cloudinary.uploadImage = vi.fn(async () => ({ url: 'https://cdn.test/img.png' }));
});

afterEach(() => {
  User.findById = originals.userFindById;
  Seller.findOne = originals.sellerFindOne;
  Product.prototype.save = originals.productSave;
  Category.findById = originals.catFindById;
  Category.exists = originals.catExists;
  cloudinary.uploadImage = originals.uploadImage;
});

describe('a product filled in wrong', () => {
  it('is refused with 400, not reported as a server failure', async () => {
    const res = await post({ ...GOOD, name: 'ab' });

    expect(res.status).toBe(400);
    // 500 would say the server broke, and would page whoever is on call for a
    // seller who typed a short name.
    expect(res.status).not.toBe(500);
  });

  it('names every field that is wrong, not just the first', async () => {
    const res = await post({ ...GOOD, name: 'ab', description: 'short', price: -5 });

    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/at least 3 characters/),
        expect.stringMatching(/at least 10 characters/),
        expect.stringMatching(/cannot be negative/),
      ])
    );
  });

  it('leads with a sentence the seller can act on', async () => {
    const res = await post({ ...GOOD, name: 'ab' });

    expect(res.body.message).toBe('Product name must be at least 3 characters');
    expect(res.body.message).not.toMatch(/validation failed/i);
  });

  it('is never saved', async () => {
    await post({ ...GOOD, description: 'short' });

    expect(Product.prototype.save).not.toHaveBeenCalled();
  });

  it('refuses fractional stock', async () => {
    const res = await post({ ...GOOD, stock: 2.5 });

    expect(res.status).toBe(400);
    expect(Product.prototype.save).not.toHaveBeenCalled();
  });
});

describe('nothing is paid for before the product is checked', () => {
  it('uploads no images when the product is rejected', async () => {
    const res = await post({ ...GOOD, name: 'ab', images: [A_PIXEL, A_PIXEL] });

    expect(res.status).toBe(400);
    // Uploading first meant every rejected attempt left pictures sitting in
    // paid storage, attached to a product that never existed and with nothing
    // left pointing at them to find them again.
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('still uploads the images of a product that is fine', async () => {
    const res = await post({ ...GOOD, images: [A_PIXEL] });

    expect(res.status).toBe(201);
    expect(cloudinary.uploadImage).toHaveBeenCalledTimes(1);
    expect(res.body.product.images).toEqual(['https://cdn.test/img.png']);
  });

  it('accepts a good product with no images at all', async () => {
    const res = await post(GOOD);

    expect(res.status).toBe(201);
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    expect(Product.prototype.save).toHaveBeenCalledTimes(1);
  });
});
