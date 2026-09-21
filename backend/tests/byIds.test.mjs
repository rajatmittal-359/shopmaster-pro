/**
 * GET /public/products/by-ids (E4, 22 Sep 2026) - the "Recently viewed"
 * strip's source. Defends: the order asked for is the order returned; bad
 * ids are ignored; the list is capped at twelve; only live, in-stock
 * listings come back (the filter, not the browser, decides).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import express from 'express';
import request from 'supertest';
import { chainableQuery } from './helpers/testDouble.mjs';

const require = createRequire(import.meta.url);
const Product = require('../models/Product');
const productRoutes = require('../routes/productRoutes');

const app = express();
app.use('/api/public/products', productRoutes);

const A = '6a93cf86fbb4f39f4a6d55d1';
const B = '6a93cf86fbb4f39f4a6d55d2';
const C = '6a93cf86fbb4f39f4a6d55d3';

describe('products by ids', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the live ones in the order asked, ignores junk ids, caps at twelve', async () => {
    let filter;
    vi.spyOn(Product, 'find').mockImplementation((f) => {
      filter = f;
      // The database answers in its own order; the endpoint restores ours.
      return chainableQuery([{ _id: C, name: 'c' }, { _id: A, name: 'a' }]);
    });
    const many = Array.from({ length: 15 }, (_, i) => `6a93cf86fbb4f39f4a6d55${String(i + 10).padStart(2, '0')}`);
    const res = await request(app).get(`/api/public/products/by-ids?ids=${[A, 'nope', B, C, ...many].join(',')}`);
    expect(res.status).toBe(200);
    expect(res.body.products.map((p) => p.name)).toEqual(['a', 'c']);
    expect(filter._id.$in).toHaveLength(12);
    expect(filter._id.$in.slice(0, 3)).toEqual([A, B, C]);
    expect(filter).toMatchObject({ isActive: true, stock: { $gt: 0 } });
  });

  it('answers an empty or all-junk list without a database call', async () => {
    const find = vi.spyOn(Product, 'find');
    const res = await request(app).get('/api/public/products/by-ids?ids=,x,y');
    expect(res.body.products).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
