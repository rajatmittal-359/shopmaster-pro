/**
 * Whether the product page may offer THIS customer a review form.
 *
 * The rule is the server's ("only somebody who received it"), so the page
 * must not guess it: a form that the API then refuses is a promise broken at
 * the last step. `GET /reviews/product/:id/mine` answers can-review and
 * returns the customer's existing review, and it uses the SAME order lookup
 * as creating a review - one helper, so the two cannot drift apart.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Order = require('../models/Order');
const Product = require('../models/Product');
const Review = require('../models/Review');

const PRODUCT = '6a93cf86fbb4f39f4a6d55dc';
const CUSTOMER = '6a93cf88fbb4f39f4a6d561a';

const originals = {};
let orderAnswer = null;
let reviewAnswer = null;
let lastOrderQuery = null;

beforeEach(() => {
  originals.order = Order.findOne;
  originals.product = Product.findOne;
  originals.review = Review.findOne;
  lastOrderQuery = null;
  Product.findOne = vi.fn(() => ({ select: () => ({ lean: async () => ({ _id: PRODUCT }) }) }));
  Order.findOne = vi.fn(async (q) => {
    lastOrderQuery = q;
    return orderAnswer;
  });
  Review.findOne = vi.fn(() => ({ lean: async () => reviewAnswer }));
});

afterEach(() => {
  Order.findOne = originals.order;
  Product.findOne = originals.product;
  Review.findOne = originals.review;
});

const ask = async () => {
  const { myReviewStatus } = require('../controllers/reviewController');
  let status = 200;
  let body = null;
  const res = {
    status: (c) => {
      status = c;
      return res;
    },
    json: (p) => {
      body = p;
      return res;
    },
  };
  await myReviewStatus({ user: { _id: CUSTOMER }, params: { productId: PRODUCT } }, res);
  return { status, body };
};

describe('GET /reviews/product/:id/mine', () => {
  it('says no, with the reason, when no delivered order contains the product', async () => {
    orderAnswer = null;
    reviewAnswer = null;
    const { status, body } = await ask();
    expect(status).toBe(200);
    expect(body).toMatchObject({ canReview: false, reason: 'not_received', review: null });
  });

  it('says yes once a delivered order holds an active line for this product', async () => {
    orderAnswer = { _id: 'order1' };
    reviewAnswer = null;
    const { body } = await ask();
    expect(body).toMatchObject({ canReview: true, reason: null, review: null });
  });

  it('returns the existing review so the page can offer edit instead of write', async () => {
    orderAnswer = { _id: 'order1' };
    reviewAnswer = { _id: 'r1', rating: 4, title: 'Nice', comment: 'Good finish' };
    const { body } = await ask();
    expect(body.canReview).toBe(true);
    expect(body.review).toMatchObject({ rating: 4, title: 'Nice' });
  });

  it('uses the same order lookup as creating a review - product inside the query, active line, delivered or returned', async () => {
    orderAnswer = null;
    await ask();
    expect(lastOrderQuery.customerId).toBe(CUSTOMER);
    expect(lastOrderQuery.status).toEqual({ $in: ['delivered', 'returned'] });
    expect(lastOrderQuery.items.$elemMatch).toMatchObject({ status: 'active' });
    expect(String(lastOrderQuery.items.$elemMatch.productId)).toBe(PRODUCT);
  });
});

describe('deliveredOrderWith', () => {
  it('is one helper, exported, so create and eligibility cannot disagree', () => {
    const { deliveredOrderWith } = require('../utils/reviewEligibility');
    expect(typeof deliveredOrderWith).toBe('function');
  });
});
