/**
 * The rules a form enforces, in one place, so the server's rules and the
 * browser's rules can be CHECKED against each other rather than hoped about.
 *
 * WHY THIS FILE EXISTS (28 Sep 2026)
 *   The old React app had validators of its own, and `backend/tests/
 *   formValidation.test.mjs` imported them - imported, never copied - and
 *   asserted that every rule the browser enforces the database enforces too.
 *   A drift could not hide, because the test read both sides.
 *
 *   `frontend/` was deleted on 26 Sep and the Next forms validate inline with
 *   `required`, `pattern` and `minLength` attributes scattered across six
 *   components. There was nothing left to import, so the parity block was
 *   removed and the promise quietly lapsed: a rule could pass in the browser
 *   and be refused by the server with no line under the field explaining it.
 *
 *   This is the module that block reads again. It is deliberately data first
 *   (`RULES`) and functions second: the test compares the NUMBERS and the
 *   REGEXES here against the Mongoose schema's own options, so a change to
 *   either side has to be made on both or the suite goes red.
 *
 * THE MESSAGES ARE THE SERVER'S MESSAGES, WORD FOR WORD
 *   Not for tidiness. If the browser says one thing and the API says another
 *   for the same mistake, a person who fixes the field and submits again sees
 *   a second, different sentence about the same problem and stops trusting
 *   either. Same rule, same words, whichever side catches it.
 */

/*
 * Every shared constraint, exactly as models/User.js, models/Address.js and
 * models/Product.js state it. Nothing invented here: if a rule is not on the
 * server, it does not belong in this file, because the browser refusing what
 * the database would accept is its own kind of lie.
 */
export const RULES = {
  // models/User.js
  name: { min: 2, max: 50 },
  email: { pattern: /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/ },
  password: { min: 6 },

  // models/Address.js
  phone: { pattern: /^[6-9]\d{9}$/ },
  pin: { pattern: /^[1-9]\d{5}$/ },
  landmark: { max: 80 },

  // models/Product.js
  productName: { min: 3, max: 100 },
  productDescription: { min: 10, max: 1000 },
  weight: { min: 0.001, max: 30 },
};

export const MESSAGES = {
  nameRequired: 'Name is required',
  nameShort: 'Name must be at least 2 characters',
  nameLong: 'Name cannot exceed 50 characters',
  emailRequired: 'Email is required',
  emailInvalid: 'Please provide a valid email',
  passwordRequired: 'Password is required',
  passwordShort: 'Password must be at least 6 characters',

  phoneRequired: 'Phone number required for delivery',
  phoneInvalid: 'Enter valid 10-digit mobile number',
  pinRequired: 'PIN code is required',
  pinInvalid: 'Enter a valid 6-digit PIN code',
  streetRequired: 'House, flat or street is required',
  cityRequired: 'City is required',
  stateRequired: 'State is required',

  productNameRequired: 'Product name is required',
  productNameShort: 'Product name must be at least 3 characters',
  productNameLong: 'Product name cannot exceed 100 characters',
  descriptionRequired: 'Product description is required',
  descriptionShort: 'Description must be at least 10 characters',
  descriptionLong: 'Description cannot exceed 1000 characters',
  categoryRequired: 'Category is required',
  priceRequired: 'Price is required',
  priceNegative: 'Price cannot be negative',
  priceAboveMrp:
    'The selling price cannot be above the MRP - MRP is the legal maximum, not a comparison price',
  stockRequired: 'Stock is required',
  stockNegative: 'Stock cannot be negative',
  stockFraction: 'Stock must be a whole number',
  saleNotLower: 'A sale price has to be lower than the normal price, or it is not a sale',
  weightLight: 'Weight must be at least 0.001 kg (1 g)',
  weightHeavy: 'Weight cannot exceed 30 kg',
};

const text = (v) => String(v ?? '').trim();

/**
 * A number the way a form gives it: '' means the person left the box empty,
 * which is a different thing from 0 and must not be validated as one.
 */
const num = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** @returns {Object<string,string>} field → the one sentence to show under it */
export function validateRegister({ name, email, password } = {}) {
  const errors = {};
  const n = text(name);
  if (!n) errors.name = MESSAGES.nameRequired;
  else if (n.length < RULES.name.min) errors.name = MESSAGES.nameShort;
  else if (n.length > RULES.name.max) errors.name = MESSAGES.nameLong;

  const e = text(email);
  if (!e) errors.email = MESSAGES.emailRequired;
  else if (!RULES.email.pattern.test(e)) errors.email = MESSAGES.emailInvalid;

  // Not trimmed: a space is a character of the password, and silently
  // dropping it here would mean the browser counts six where the server
  // counts five.
  const p = String(password ?? '');
  if (!p) errors.password = MESSAGES.passwordRequired;
  else if (p.length < RULES.password.min) errors.password = MESSAGES.passwordShort;

  return errors;
}

export function validateAddress({ phoneNumber, street, city, state, zipCode, landmark } = {}) {
  const errors = {};

  const phone = text(phoneNumber);
  if (!phone) errors.phoneNumber = MESSAGES.phoneRequired;
  else if (!RULES.phone.pattern.test(phone)) errors.phoneNumber = MESSAGES.phoneInvalid;

  const pin = text(zipCode);
  if (!pin) errors.zipCode = MESSAGES.pinRequired;
  else if (!RULES.pin.pattern.test(pin)) errors.zipCode = MESSAGES.pinInvalid;

  if (!text(street)) errors.street = MESSAGES.streetRequired;
  if (!text(city)) errors.city = MESSAGES.cityRequired;
  if (!text(state)) errors.state = MESSAGES.stateRequired;

  // The only optional field with a limit. The server truncates nothing - it
  // refuses - so the form has to say so before the request goes.
  if (text(landmark).length > RULES.landmark.max) {
    errors.landmark = `Landmark cannot exceed ${RULES.landmark.max} characters`;
  }

  return errors;
}

/**
 * A product, with the draft escape the server also makes.
 *
 * `models/Product.js` requires description, category, price and stock only
 * `notWhileDraft` - a draft is allowed to be half-thought-through, and the
 * rules bite when it is listed. The form has to make the same exception or
 * "Save as draft" becomes impossible to press.
 */
export function validateProduct(product = {}, { draft = false } = {}) {
  const errors = {};

  const name = text(product.name);
  if (!name) errors.name = MESSAGES.productNameRequired;
  else if (name.length < RULES.productName.min) errors.name = MESSAGES.productNameShort;
  else if (name.length > RULES.productName.max) errors.name = MESSAGES.productNameLong;

  const description = text(product.description);
  if (!description) {
    if (!draft) errors.description = MESSAGES.descriptionRequired;
  } else if (description.length < RULES.productDescription.min) {
    errors.description = MESSAGES.descriptionShort;
  } else if (description.length > RULES.productDescription.max) {
    errors.description = MESSAGES.descriptionLong;
  }

  if (!text(product.category) && !draft) errors.category = MESSAGES.categoryRequired;

  const price = num(product.price);
  if (price === null) {
    if (!draft) errors.price = MESSAGES.priceRequired;
  } else if (Number.isNaN(price) || price < 0) {
    errors.price = MESSAGES.priceNegative;
  }

  const stock = num(product.stock);
  if (stock === null) {
    if (!draft) errors.stock = MESSAGES.stockRequired;
  } else if (Number.isNaN(stock) || stock < 0) {
    errors.stock = MESSAGES.stockNegative;
  } else if (!Number.isInteger(stock)) {
    errors.stock = MESSAGES.stockFraction;
  }

  const weight = num(product.weight);
  if (weight !== null && !Number.isNaN(weight)) {
    if (weight < RULES.weight.min) errors.weight = MESSAGES.weightLight;
    else if (weight > RULES.weight.max) errors.weight = MESSAGES.weightHeavy;
  }

  /*
   * The cross-field pair, both of them `pre('validate')` hooks on the server
   * and both skipped for a draft there, so skipped here too.
   */
  if (!draft) {
    const mrp = num(product.mrp);
    if (mrp && price !== null && !Number.isNaN(price) && price > mrp) {
      errors.price = MESSAGES.priceAboveMrp;
    }

    const salePrice = num(product.salePrice);
    if (salePrice && price !== null && !Number.isNaN(price) && salePrice >= price) {
      errors.salePrice = MESSAGES.saleNotLower;
    }
  }

  return errors;
}

/** True when nothing is wrong - the shape every caller wants to branch on. */
export const isValid = (errors) => Object.keys(errors).length === 0;

/** The first sentence, for a form that shows one line rather than many. */
export const firstError = (errors) => Object.values(errors)[0] || '';
