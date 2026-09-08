/**
 * Who is allowed to leave a review.
 *
 * WHY IT MATTERS MORE ON A MARKETPLACE THAN ON A SHOP
 *   Every guide to building one says the same thing: trust is the hardest
 *   thing a new marketplace buys, and reviews are how it buys it - with
 *   verified-purchase flags named specifically. A review from somebody who
 *   never received the product is worth less than no review, because it
 *   teaches shoppers that none of them mean anything.
 *
 * THE BUG THIS LOCKS OUT
 *   The check used to fetch ONE arbitrary delivered order belonging to the
 *   customer and look for the product inside it. Somebody with several
 *   delivered orders was refused whenever Mongo returned a different one -
 *   told "you can only review products you have successfully received" while
 *   holding the product. It got worse the more they bought.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const Order = require('../models/Order');
const Product = require('../models/Product');

const PRODUCT = '6a93cf86fbb4f39f4a6d55dc';
const CUSTOMER = '6a93cf88fbb4f39f4a6d561a';

let lastQuery = null;
const originals = {};

beforeEach(() => {
  lastQuery = null;
  originals.order = Order.findOne;
  originals.product = Product.findOne;

  // The controller finds the product first; no test may reach a database.
  Product.findOne = vi.fn(async () => ({ _id: PRODUCT, isActive: true }));

  Order.findOne = vi.fn(async (query) => {
    lastQuery = query;
    return null;
  });
});

afterEach(() => {
  Order.findOne = originals.order;
  Product.findOne = originals.product;
});

/** Runs the controller far enough to capture the order query it builds. */
const askToReview = async () => {
  const { createOrUpdateReview } = require('../controllers/reviewController');

  const req = {
    user: { _id: CUSTOMER },
    params: { productId: PRODUCT },
    body: { rating: 5, comment: 'Good' },
  };

  let status = null;
  let body = null;
  const res = {
    status: (code) => {
      status = code;
      return res;
    },
    json: (payload) => {
      body = payload;
      return res;
    },
  };

  await createOrUpdateReview(req, res).catch(() => {});
  return { status, body };
};

describe('the order lookup behind a review', () => {
  it('searches for the order containing THIS product, not just any order', async () => {
    await askToReview();

    // The whole fix: the product is part of the query, so the right order is
    // found whichever one it is.
    expect(lastQuery).toBeTruthy();
    expect(JSON.stringify(lastQuery)).toContain(PRODUCT);
  });

  it('requires the product and its active status on the SAME item', async () => {
    await askToReview();

    // Without $elemMatch, an order containing this product AND some other
    // active item would pass - including one where this product was cancelled.
    expect(lastQuery.items?.$elemMatch).toBeTruthy();
    expect(String(lastQuery.items.$elemMatch.productId)).toContain(PRODUCT);
    expect(lastQuery.items.$elemMatch.status).toBe('active');
  });

  it('only counts orders that actually arrived', async () => {
    await askToReview();

    expect(lastQuery.status.$in).toEqual(['delivered', 'returned']);
  });

  it('is scoped to the person asking', async () => {
    await askToReview();

    expect(String(lastQuery.customerId)).toBe(CUSTOMER);
  });

  it('refuses when no such order exists', async () => {
    const { status, body } = await askToReview();

    expect(status).toBe(400);
    expect(body.message).toMatch(/successfully received/i);
  });
});
