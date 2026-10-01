/**
 * Available-to-promise, in one place.
 *
 * WHY THIS FILE EXISTS
 *   `stock - reserved` was written out by hand in five components and never
 *   on the server. On 30 Sep 2026 that cost us a live bug: the shop page's
 *   query asked the database for neither field, every card read 0, and seven
 *   products that had two units each said "Out of stock" with no buy buttons
 *   for eight days. Nothing threw, because a missing field is `undefined` and
 *   `undefined || 0` is 0, and nothing went red, because no test asked.
 *
 *   The trade calls this available-to-promise: on hand minus what is already
 *   committed. Shopify's Storefront API sends the ANSWER (`availableForSale`,
 *   `quantityAvailable`) and never the raw inputs, so a client cannot compute
 *   it differently from the server. This is our version of that.
 *
 * WHY THE SERVER MUST OWN IT
 *   The number is a promise to a shopper and, under the CCPA's dark-pattern
 *   guidelines, one we carry the burden of proving was true. A promise made
 *   by whichever component happened to have the right two fields is not one
 *   we can stand behind.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { availabilityOf, LOW_STOCK_DEFAULT } = require('../utils/availability');

describe('what is actually available to promise', () => {
  it('takes what is held for unpaid checkouts off the shelf', () => {
    expect(availabilityOf({ stock: 5, reserved: 2 }).available).toBe(3);
  });

  it('never goes below zero, however the numbers arrive', () => {
    // Reserved above stock is possible for a moment while a checkout expires.
    expect(availabilityOf({ stock: 2, reserved: 5 }).available).toBe(0);
  });

  it('treats a missing field as missing, not as zero stock', () => {
    // THE BUG THIS FILE EXISTS FOR. A product whose `reserved` was never
    // selected has nothing held; it does not have nothing left.
    expect(availabilityOf({ stock: 4 }).available).toBe(4);
  });

  it('says out, low or in - a word, so nothing decides by colour alone', () => {
    expect(availabilityOf({ stock: 0 }).state).toBe('out');
    expect(availabilityOf({ stock: 2, lowStockThreshold: 3 }).state).toBe('low');
    expect(availabilityOf({ stock: 50, lowStockThreshold: 3 }).state).toBe('in');
  });

  it('uses the seller-set threshold, and one default when they have not set one', () => {
    // Three different fallbacks were in the code: 10 on the model, 3 on the
    // product page, 10 on the seller table. One number now.
    expect(availabilityOf({ stock: LOW_STOCK_DEFAULT }).state).toBe('low');
    expect(availabilityOf({ stock: LOW_STOCK_DEFAULT + 1 }).state).toBe('in');
  });

  it('counts the low line against what is promisable, not what is on the shelf', () => {
    // 12 on hand with 10 held is two to sell - a low-stock shop, not a full one.
    expect(availabilityOf({ stock: 12, reserved: 10, lowStockThreshold: 3 }).state).toBe('low');
  });
});

describe('attaching it to a list on the way out', () => {
  const { withAvailability } = require('../utils/availability');

  it('answers for every product without touching what was already there', () => {
    const [ring] = withAvailability([{ _id: 'p1', name: 'A ring', stock: 4, reserved: 1 }]);

    expect(ring.name).toBe('A ring');
    expect(ring.availability).toEqual({ available: 3, state: 'low', inStock: true });
  });

  it('survives an endpoint that returned nothing', () => {
    expect(withAvailability([])).toEqual([]);
    expect(withAvailability(undefined)).toEqual([]);
  });
});

/**
 * ZERO MEANS NEVER (30 Sep 2026)
 *
 *   Rajat: some sellers stock exactly one of everything. For them a warning at
 *   10 fires on every product they own, for ever - and a warning that is always
 *   on is not a warning, it is the background.
 *
 *   Shopify has no built-in low-stock flag at all; its apps set a threshold per
 *   product and its reports default to "less than 10 units". Nobody ships a
 *   separate off switch, because the threshold already has one: zero. Nothing
 *   with stock can be at or below zero, so the warning simply never fires.
 *
 *   The catch is that `Number(x) || 10` turns a deliberate 0 back into 10 -
 *   the same falsy-coercion that cost us the shop page. Missing and zero are
 *   different answers and have to stay different.
 */
describe('zero means never warn', () => {
  it('never says low when the seller asked for no warning', () => {
    expect(availabilityOf({ stock: 1, lowStockThreshold: 0 }).state).toBe('in');
    expect(availabilityOf({ stock: 99, lowStockThreshold: 0 }).state).toBe('in');
  });

  it('still says out at zero stock, because that is a fact and not a warning', () => {
    expect(availabilityOf({ stock: 0, lowStockThreshold: 0 }).state).toBe('out');
  });

  it('tells a deliberate zero apart from a missing value', () => {
    // The bug this guards: `Number(0) || 10` is 10.
    expect(availabilityOf({ stock: 5, lowStockThreshold: 0 }).state).toBe('in');
    expect(availabilityOf({ stock: 5 }).state).toBe('low');
    expect(availabilityOf({ stock: 5, lowStockThreshold: null }).state).toBe('low');
  });
});

/**
 * The Mongo side of the same rule.
 *
 *   Tests never connect to a database here (the project's rule), so the thing
 *   worth asserting is the SHAPE of the expression: that it counts against
 *   stock minus reserved rather than the raw shelf, and that a threshold of 0
 *   is read as "no warning" rather than as a threshold of zero. Those are the
 *   two things the three hand-written copies got wrong.
 */
describe('asking the database the same question', () => {
  const { lowStockMatch } = require('../utils/availability');

  it('counts against what can be promised, not the shelf', () => {
    const json = JSON.stringify(lowStockMatch());

    expect(json).toContain('$subtract');
    expect(json).toContain('$reserved');
  });

  it('skips the sellers who asked for no warning', () => {
    const [guard] = lowStockMatch().$expr.$and;

    expect(guard).toEqual({ $gt: [{ $ifNull: ['$lowStockThreshold', 10] }, 0] });
  });
});
