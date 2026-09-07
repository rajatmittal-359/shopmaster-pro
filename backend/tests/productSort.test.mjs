/**
 * Sorting the catalogue.
 *
 * TWO BUGS THIS DEFENDS AGAINST
 *
 *   1. `?sort=` arrives from the URL bar. Handed straight to Mongoose it lets a
 *      stranger order by any field in the document, and lets query-string
 *      objects through into the sort. Only the five named orders are allowed.
 *
 *   2. Every order must end in a tiebreaker. Two products at the same price
 *      have no defined order between them, so Mongo may return them in a
 *      different order on each query - and then page 2 repeats something page 1
 *      already showed and skips something else. It reads as "a product
 *      disappeared", which is impossible to reproduce and expensive to find.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';

const require = createRequire(import.meta.url);

const Product = require('../models/Product');
const Category = require('../models/Category');
const productRoutes = require('../routes/productRoutes');

const app = express();
app.use('/api/public/products', productRoutes);

let sortSeen;
const originals = {};

/** Product.find(...).populate().populate().sort().limit().skip() */
const chain = () => {
  const link = {
    populate: () => link,
    sort: (arg) => {
      sortSeen = arg;
      return link;
    },
    limit: () => link,
    skip: async () => [],
  };
  return link;
};

beforeEach(() => {
  sortSeen = undefined;
  originals.find = Product.find;
  originals.count = Product.countDocuments;
  originals.browsable = Category.getBrowsableIds;

  Product.find = vi.fn(chain);
  Product.countDocuments = vi.fn(async () => 0);
  Category.getBrowsableIds = vi.fn(async () => ['c1']);
});

afterEach(() => {
  Product.find = originals.find;
  Product.countDocuments = originals.count;
  Category.getBrowsableIds = originals.browsable;
});

const listWith = async (query) => {
  const res = await request(app).get(`/api/public/products${query}`);
  expect(res.status).toBe(200);
  return sortSeen;
};

describe('the five orders a shopper may ask for', () => {
  it('defaults to newest', async () => {
    expect(await listWith('')).toEqual({ createdAt: -1, _id: 1 });
  });

  it('sorts by price, both ways', async () => {
    expect(await listWith('?sort=price-asc')).toEqual({ price: 1, _id: 1 });
    expect(await listWith('?sort=price-desc')).toEqual({ price: -1, _id: 1 });
  });

  it('breaks a rating tie on the number of reviews, not the id', async () => {
    // One five-star review must not outrank fifty at 4.6.
    expect(await listWith('?sort=rating')).toEqual({
      avgRating: -1,
      totalReviews: -1,
      _id: 1,
    });
  });
});

describe('what it refuses', () => {
  it('ignores a field name it was not offered', async () => {
    expect(await listWith('?sort=costPrice')).toEqual({ createdAt: -1, _id: 1 });
  });

  it('ignores an object smuggled in through the query string', async () => {
    // ?sort[price]=-1 arrives as an OBJECT, not a string.
    expect(await listWith('?sort[price]=-1')).toEqual({ createdAt: -1, _id: 1 });
  });

  it('answers 200 and a normal page rather than an error', async () => {
    const res = await request(app).get('/api/public/products?sort=nonsense');
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
  });
});

describe('every order is stable', () => {
  it('ends in _id, whichever one is asked for', async () => {
    for (const name of ['newest', 'price-asc', 'price-desc', 'rating', 'popular']) {
      const sort = await listWith(`?sort=${name}`);
      const keys = Object.keys(sort);
      expect(keys[keys.length - 1]).toBe('_id');
    }
  });
});
