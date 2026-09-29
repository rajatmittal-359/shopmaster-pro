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
