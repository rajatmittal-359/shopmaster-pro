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
 *   3. The browser's rules and the database's rules AGREE. This block was lost
 *      on 26 Sep 2026 when `frontend/` was deleted - it used to import the
 *      React app's own validators, so a copy could never drift, and there was
 *      nothing left in `web/` to import. Restored 28 Sep against
 *      `web/src/lib/validate.js`, which the Next forms now use: the rules are
 *      IMPORTED from the same module the browser runs, never retyped here, so
 *      a change on one side and not the other turns this suite red.
 *
 *      What a drift costs: a rule the browser accepts and the server refuses
 *      shows the person a 400 with no line under any field, and they cannot
 *      tell which box to fix. A rule the browser refuses and the server would
 *      accept is worse in the other direction - a listing nobody can save for
 *      a reason that does not really exist.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

import { RULES, validateRegister, validateAddress, validateProduct, isValid } from '../../web/src/lib/validate.js';

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

/* ------------------------------------------------------------------ parity
 *
 * Both halves of the promise, and they fail differently:
 *
 *   - the NUMBERS block reads the constraint off the Mongoose path itself, so
 *     changing `minlength` in a model without changing `RULES` is caught even
 *     when no input happens to sit between the old value and the new one;
 *   - the BEHAVIOUR block runs the same filled-in form through both sides and
 *     demands the same verdict, which is what actually reaches a person.
 */

const userDoc = (over = {}) =>
  new User({ name: 'Priya Sharma', email: 'priya@example.com', password: 'sixsix', ...over });

/** The constraint as the schema itself states it - never retyped from memory. */
const limit = (Model, path, key) => {
  const opt = Model.schema.path(path).options[key];
  return Array.isArray(opt) ? opt[0] : opt;
};

/** The regex a `match:` or `validate:` option tests with, for comparing sources. */
const patternOf = (Model, path) => {
  const { match, validate } = Model.schema.path(path).options;
  if (match) return Array.isArray(match) ? match[0] : match;
  // An Address field states its rule as a validator FUNCTION over a literal
  // regex, so the source has to be read out of the function's own text.
  const fn = (validate && (validate.validator || validate)) || null;
  const found = fn && String(fn).match(/\/(\^[^/]+\$)\//);
  return found ? new RegExp(found[1]) : null;
};

describe('the browser and the database enforce the same numbers', () => {
  it('a person name', () => {
    expect(RULES.name.min).toBe(limit(User, 'name', 'minlength'));
    expect(RULES.name.max).toBe(limit(User, 'name', 'maxlength'));
  });

  it('a password', () => {
    expect(RULES.password.min).toBe(limit(User, 'password', 'minlength'));
  });

  it('an email address', () => {
    expect(RULES.email.pattern.source).toBe(patternOf(User, 'email').source);
  });

  it('a mobile number, a PIN code and a landmark', () => {
    expect(RULES.phone.pattern.source).toBe(patternOf(Address, 'phoneNumber').source);
    expect(RULES.pin.pattern.source).toBe(patternOf(Address, 'zipCode').source);
    expect(RULES.landmark.max).toBe(limit(Address, 'landmark', 'maxlength'));
  });

  it('a product name, its description and its weight', () => {
    expect(RULES.productName.min).toBe(limit(Product, 'name', 'minlength'));
    expect(RULES.productName.max).toBe(limit(Product, 'name', 'maxlength'));
    expect(RULES.productDescription.min).toBe(limit(Product, 'description', 'minlength'));
    expect(RULES.productDescription.max).toBe(limit(Product, 'description', 'maxlength'));
    expect(RULES.weight.min).toBe(limit(Product, 'weight', 'min'));
    expect(RULES.weight.max).toBe(limit(Product, 'weight', 'max'));
  });
});

describe('the browser and the database reach the same verdict', () => {
  /*
   * Each row is one filled-in form. `ok` is what BOTH sides have to say, so a
   * row that one accepts and the other refuses fails whichever way round the
   * disagreement is - the silent 400 and the unsaveable listing alike.
   */
  const people = [
    ['a real signup', { name: 'Priya Sharma', email: 'priya@example.com', password: 'sixsix' }, true],
    ['a one-letter name', { name: 'P', email: 'p@example.com', password: 'sixsix' }, false],
    ['a five-character password', { name: 'Priya', email: 'p@example.com', password: 'five5' }, false],
    ['an address with no dot', { name: 'Priya', email: 'priya@example', password: 'sixsix' }, false],
    ['a long modern TLD', { name: 'Priya', email: 'priya@charming.jewelry', password: 'sixsix' }, true],
    ['a space for a name', { name: '   ', email: 'p@example.com', password: 'sixsix' }, false],
  ];

  it.each(people)('%s', (_label, input, ok) => {
    expect(isValid(validateRegister(input))).toBe(ok);
    expect(userDoc(input).validateSync() === undefined).toBe(ok);
  });

  const places = [
    ['a Jaipur address', { phoneNumber: '9829012345', street: '12 Katewa Nagar', city: 'Jaipur', state: 'Rajasthan', zipCode: '302019' }, true],
    ['a landline', { phoneNumber: '1412345678', street: 'A', city: 'Jaipur', state: 'Rajasthan', zipCode: '302019' }, false],
    ['nine digits', { phoneNumber: '982901234', street: 'A', city: 'Jaipur', state: 'Rajasthan', zipCode: '302019' }, false],
    ['a PIN starting at zero', { phoneNumber: '9829012345', street: 'A', city: 'Jaipur', state: 'Rajasthan', zipCode: '002019' }, false],
    ['no street at all', { phoneNumber: '9829012345', street: '', city: 'Jaipur', state: 'Rajasthan', zipCode: '302019' }, false],
    ['an 81-character landmark', { phoneNumber: '9829012345', street: 'A', city: 'Jaipur', state: 'Rajasthan', zipCode: '302019', landmark: 'x'.repeat(81) }, false],
  ];

  it.each(places)('%s', (_label, input, ok) => {
    expect(isValid(validateAddress(input))).toBe(ok);
    expect(addressDoc(input).validateSync() === undefined).toBe(ok);
  });

  const listings = [
    ['a listing that is ready', { name: 'Rose Gold Ring', description: 'A hand-finished rose gold ring.', price: 1600, stock: 5 }, true],
    ['a two-letter name', { name: 'ab', description: 'A hand-finished rose gold ring.', price: 1600, stock: 5 }, false],
    ['a one-word description', { name: 'Rose Gold Ring', description: 'short', price: 1600, stock: 5 }, false],
    ['half a ring in stock', { name: 'Rose Gold Ring', description: 'A hand-finished rose gold ring.', price: 1600, stock: 2.5 }, false],
    ['a negative price', { name: 'Rose Gold Ring', description: 'A hand-finished rose gold ring.', price: -1, stock: 5 }, false],
    ['a price above the MRP', { name: 'Rose Gold Ring', description: 'A hand-finished rose gold ring.', price: 1600, mrp: 1200, stock: 5 }, false],
    ['a "sale" price above the price', { name: 'Rose Gold Ring', description: 'A hand-finished rose gold ring.', price: 1600, salePrice: 1800, stock: 5 }, false],
    ['half a gram', { name: 'Rose Gold Ring', description: 'A hand-finished rose gold ring.', price: 1600, stock: 5, weight: 0.0005 }, false],
    ['a 31 kg parcel', { name: 'Rose Gold Ring', description: 'A hand-finished rose gold ring.', price: 1600, stock: 5, weight: 31 }, false],
  ];

  it.each(listings)('%s', async (_label, input, ok) => {
    // The form always knows the category by then; only the model needs an id.
    expect(isValid(validateProduct({ ...input, category: 'chosen' }))).toBe(ok);

    // `price > mrp` and the sale rule live in a pre('validate') hook, so the
    // model has to be validated the async way to see them at all.
    const refused = await productDoc(input).validate().then(() => false, () => true);
    expect(refused).toBe(!ok);
  });

  it('lets a draft be half-thought-through, exactly as the server does', async () => {
    const halfDone = { name: 'Rose Gold Ring' };

    expect(isValid(validateProduct(halfDone, { draft: true }))).toBe(true);
    const draft = new Product({ sellerId: oid(), status: 'draft', ...halfDone });
    await expect(draft.validate()).resolves.toBeUndefined();

    // And the same half-filled form is refused the moment it is listed.
    expect(isValid(validateProduct(halfDone))).toBe(false);
  });
});
