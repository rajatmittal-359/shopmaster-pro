/**
 * What happens when someone fills a form in wrong.
 *
 * There are three separate promises here, and each one used to be broken in a
 * different way:
 *
 *   1. A rejected input is answered 400, not 500. A 500 says the SERVER broke.
 *      It is what monitoring pages you about at night, and it tells the seller
 *      nothing about the two-letter name they typed.
 *
 *   2. EVERY broken field comes back, not just the first. A form with three
 *      problems that reports one makes the rest a guessing game.
 *
 *   3. The browser's rules and the database's rules agree. The browser is only
 *      there to save a round-trip - the model is the authority - so the danger
 *      is drift: a rule the browser lets through and the server still refuses
 *      gives a form that submits and then fails for no visible reason.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

// The very same rules the browser runs. Imported, not copied - a copy would
// pass this suite forever while the real form drifted away underneath it.
import {
  validateRegister,
  validateAddress,
  validateProduct,
} from '../../frontend/src/utils/validate.js';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');

const { describeError } = require('../utils/apiError');
const Product = require('../models/Product');
const Address = require('../models/Address');
const User = require('../models/User');

const oid = () => new mongoose.Types.ObjectId();

const productDoc = (over = {}) =>
  new Product({
    sellerId: oid(),
    name: 'Rose Gold Ring',
    description: 'A hand-finished rose gold ring.',
    category: oid(),
    price: 1600,
    stock: 5,
    ...over,
  });

const addressDoc = (over = {}) =>
  new Address({
    userId: oid(),
    phoneNumber: '9829012345',
    street: '12 Katewa Nagar',
    city: 'Jaipur',
    state: 'Rajasthan',
    zipCode: '302019',
    ...over,
  });

describe('a rejected input is the caller problem, not a server failure', () => {
  it('answers a failed validation with 400', () => {
    const { status } = describeError(productDoc({ name: 'ab' }).validateSync());

    // Not 500. The server did exactly what it was built to do.
    expect(status).toBe(400);
  });

  it('returns every broken field, not just the first', () => {
    const err = productDoc({ name: 'ab', description: 'short', price: -1 }).validateSync();
    const { body } = describeError(err);

    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/at least 3 characters/),
        expect.stringMatching(/at least 10 characters/),
        expect.stringMatching(/cannot be negative/),
      ])
    );
  });

  it('leads with a sentence a person can read', () => {
    const { body } = describeError(productDoc({ name: 'ab' }).validateSync());

    // Not the joined "Product validation failed: name: ..." string Mongoose
    // produces, which is a developer being addressed, not a seller.
    expect(body.message).toBe('Product name must be at least 3 characters');
    expect(body.message).not.toMatch(/validation failed/i);
  });

  it('names the field when a unique index refuses the write', () => {
    const { status, body } = describeError({ code: 11000, keyPattern: { email: 1 } });

    expect(status).toBe(400);
    expect(body.message).toBe('email already exists');
  });

  it('answers a malformed id with 400', () => {
    expect(describeError({ name: 'CastError' }).status).toBe(400);
  });

  it('still reports a genuine failure as 500', () => {
    const { status } = describeError(new Error('Cloudinary is unreachable'));

    // The point was never to stop returning 500s - it was to stop returning
    // them for things that are not server failures.
    expect(status).toBe(500);
  });

  it('honours a status a controller chose deliberately', () => {
    const forbidden = Object.assign(new Error('Not your order'), { statusCode: 403 });
    expect(describeError(forbidden).status).toBe(403);
  });
});

describe('stock is counted in whole units', () => {
  it('refuses half a ring', () => {
    const invalid = productDoc({ stock: 2.5 }).validateSync();

    // available = stock - reserved stops being an answer the moment either
    // side is fractional, and half a ring cannot be reserved or shipped.
    expect(invalid.errors.stock.message).toMatch(/whole number/i);
  });

  it('accepts a real count', () => {
    expect(productDoc({ stock: 0 }).validateSync()).toBeUndefined();
    expect(productDoc({ stock: 12 }).validateSync()).toBeUndefined();
  });
});

describe('a PIN code decides where the parcel goes', () => {
  it('refuses one that is too short', () => {
    expect(addressDoc({ zipCode: '30201' }).validateSync().errors.zipCode).toBeTruthy();
  });

  it('refuses one that starts at zero', () => {
    // No Indian PIN code does.
    expect(addressDoc({ zipCode: '002019' }).validateSync().errors.zipCode).toBeTruthy();
  });

  it('refuses letters', () => {
    expect(addressDoc({ zipCode: '3020AB' }).validateSync().errors.zipCode).toBeTruthy();
  });

  it('accepts a real one', () => {
    expect(addressDoc({ zipCode: '302019' }).validateSync()).toBeUndefined();
  });
});

describe('the browser and the database agree', () => {
  const GOOD_DESCRIPTION = 'A hand-finished rose gold ring.';

  const cases = [
    [
      'a two-letter product name',
      validateProduct,
      { name: 'ab', description: GOOD_DESCRIPTION, category: 'c', price: 1600, stock: 5 },
      () => productDoc({ name: 'ab' }),
      'name',
    ],
    [
      'a description under ten characters',
      validateProduct,
      { name: 'Rose Gold Ring', description: 'short', category: 'c', price: 1600, stock: 5 },
      () => productDoc({ description: 'short' }),
      'description',
    ],
    [
      'fractional stock',
      validateProduct,
      { name: 'Rose Gold Ring', description: GOOD_DESCRIPTION, category: 'c', price: 1600, stock: '2.5' },
      () => productDoc({ stock: 2.5 }),
      'stock',
    ],
    [
      'negative stock',
      validateProduct,
      { name: 'Rose Gold Ring', description: GOOD_DESCRIPTION, category: 'c', price: 1600, stock: '-1' },
      () => productDoc({ stock: -1 }),
      'stock',
    ],
    [
      'a five-digit PIN code',
      validateAddress,
      { phoneNumber: '9829012345', street: 's', city: 'c', state: 'st', zipCode: '30201' },
      () => addressDoc({ zipCode: '30201' }),
      'zipCode',
    ],
    [
      'a landline in the mobile field',
      validateAddress,
      { phoneNumber: '1412345678', street: 's', city: 'c', state: 'st', zipCode: '302019' },
      () => addressDoc({ phoneNumber: '1412345678' }),
      'phoneNumber',
    ],
  ];

  it.each(cases)('both refuse %s', (_label, browserFn, form, makeDoc, field) => {
    expect(Boolean(makeDoc().validateSync()?.errors?.[field])).toBe(true);

    // If this fails, the form lets something through that the server will
    // refuse: the customer presses submit and nothing visibly happens.
    expect(Boolean(browserFn(form)[field])).toBe(true);
  });

  it('both accept a product that is genuinely fine', () => {
    const form = {
      name: 'Rose Gold Ring',
      description: GOOD_DESCRIPTION,
      category: 'c',
      price: '1600',
      stock: '5',
      mrp: '2000',
      weight: '0.02',
    };

    // Just as important as agreeing on refusals: a browser rule STRICTER than
    // the server blocks a listing the shop would have been happy to take.
    expect(validateProduct(form)).toEqual({});
    expect(productDoc().validateSync()).toBeUndefined();
  });

  it('both accept an address that is genuinely fine', () => {
    const form = {
      phoneNumber: '9829012345',
      street: '12 Katewa Nagar',
      city: 'Jaipur',
      state: 'Rajasthan',
      zipCode: '302019',
    };

    expect(validateAddress(form)).toEqual({});
    expect(addressDoc().validateSync()).toBeUndefined();
  });

  it('both refuse a password under six characters', () => {
    const browser = validateRegister({
      name: 'Rajat',
      email: 'r@example.com',
      password: 'abc12',
      role: 'customer',
    });
    const server = new User({
      name: 'Rajat',
      email: 'r@example.com',
      password: 'abc12',
      role: 'customer',
    }).validateSync();

    expect(browser.password).toBeTruthy();
    expect(server.errors.password).toBeTruthy();
  });
});

describe('MRP, which the server does not police', () => {
  const GOOD_DESCRIPTION = 'A hand-finished rose gold ring.';

  it('refuses an MRP at or below the selling price', () => {
    // The listing only strikes through an MRP HIGHER than the price. Set it
    // lower and it silently vanishes, leaving the seller to wonder why their
    // discount never showed up.
    const errors = validateProduct({
      name: 'Rose Gold Ring',
      description: GOOD_DESCRIPTION,
      category: 'c',
      price: '1600',
      stock: '5',
      mrp: '1500',
    });

    expect(errors.mrp).toMatch(/higher than the selling price/i);
  });

  it('is happy with no MRP at all', () => {
    expect(
      validateProduct({
        name: 'Rose Gold Ring',
        description: GOOD_DESCRIPTION,
        category: 'c',
        price: '1600',
        stock: '5',
        mrp: '',
      })
    ).toEqual({});
  });
});
