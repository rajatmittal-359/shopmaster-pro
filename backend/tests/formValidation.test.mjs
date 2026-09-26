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
 * There was a third promise here - that the browser's rules and the database's
 * rules agree - checked by importing the React app's own validators so a copy
 * could never drift. `frontend/` was deleted on 26 Sep 2026 and `web/` has no
 * shared validation module to import in its place, so that block went with it.
 * The gap is recorded in WHAT-IS-LEFT.md: the parity check is worth rebuilding
 * against `web/`, and until it is, client and server rules can drift unseen.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

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
